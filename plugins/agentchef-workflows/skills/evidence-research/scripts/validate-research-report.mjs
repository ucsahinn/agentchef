#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const statuses = new Set(["complete", "partial", "blocked"]);
const classifications = new Set(["fact", "inference", "recommendation"]);
const confidences = new Set(["high", "medium", "low", "context-only"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function validDate(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function collectStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, output);
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) collectStrings(entry, output);
  }
  return output;
}

function secretCategory(value) {
  const text = JSON.stringify(value);
  const patterns = [
    ["authorization credential", /\bauthorization\s*[:=]\s*["']?(?:bearer|basic)\s+[A-Za-z0-9+/_=-]{12,}/i],
    ["bearer credential", /\bbearer\s+[A-Za-z0-9+/_=-]{20,}/i],
    ["cookie credential", /\b(?:cookie|set-cookie)\s*[:=]\s*["']?[^"'\s,;]{12,}/i],
    ["private key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
    ["provider token", /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/],
    ["URL userinfo", /https?:\/\/[^/\s:@]+:[^/\s@]+@/i],
    ["secret assignment", /\b(?:api[_-]?key|access[_-]?token|password|private[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^"'\s,}]{12,}/i]
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] || null;
}

function parseArgs(argv) {
  let reportPath = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report" && argv[index + 1]) {
      reportPath = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${arg}`);
    }
  }
  if (!reportPath) throw new Error("Usage: validate-research-report.mjs --report <report.json>");
  return { reportPath: path.resolve(reportPath) };
}

function readReport(reportPath) {
  const stat = fs.lstatSync(reportPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("research report must be a regular, non-symlink file.");
  }
  if (stat.size > MAX_REPORT_BYTES) {
    throw new Error(`research report exceeds ${MAX_REPORT_BYTES} bytes.`);
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, ""));
}

export function validateResearchReport(report) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!isPlainObject(report)) return ["report root must be an object."];
  if (report.schemaVersion !== "agentchef.evidence-research.v1") {
    fail("schemaVersion must be agentchef.evidence-research.v1.");
  }
  if (!validDate(report.generatedAt)) fail("generatedAt must be an ISO-compatible date.");
  if (!statuses.has(report.status)) fail("status must be complete, partial, or blocked.");

  if (!isPlainObject(report.charter)) {
    fail("charter must be an object.");
  } else {
    for (const field of ["decision", "primaryQuestion", "scope", "audience", "deadline"]) {
      if (!nonEmptyString(report.charter[field])) fail(`charter.${field} is required.`);
    }
    if (!nonEmptyStringArray(report.charter.subQuestions)) {
      fail("charter.subQuestions must contain at least one question.");
    }
    if (!Array.isArray(report.charter.exclusions)) fail("charter.exclusions must be an array.");
  }

  if (!isPlainObject(report.methods)) {
    fail("methods must be an object.");
  } else {
    if (!nonEmptyString(report.methods.approach)) fail("methods.approach is required.");
    for (const field of ["inclusionCriteria", "exclusionCriteria", "searchLog"]) {
      if (!nonEmptyStringArray(report.methods[field])) {
        fail(`methods.${field} must contain at least one item.`);
      }
    }
  }

  const sourceIds = new Set();
  const sourceSupportLinks = [];
  if (!Array.isArray(report.sources) || report.sources.length === 0) {
    fail("sources must contain at least one source.");
  } else {
    for (const [index, source] of report.sources.entries()) {
      if (!isPlainObject(source)) {
        fail(`sources[${index}] must be an object.`);
        continue;
      }
      if (!nonEmptyString(source.id)) fail(`sources[${index}].id is required.`);
      else if (sourceIds.has(source.id)) fail(`duplicate source id: ${source.id}.`);
      else sourceIds.add(source.id);
      for (const field of ["title", "sourceType", "outdatedRisk"]) {
        if (!nonEmptyString(source[field])) fail(`sources[${index}].${field} is required.`);
      }
      if (!nonEmptyString(source.url) || !/^https:\/\//i.test(source.url)) {
        fail(`sources[${index}].url must be an https URL.`);
      }
      if (!validDate(source.checkedAt)) fail(`sources[${index}].checkedAt is invalid.`);
      if (!confidences.has(source.confidence)) fail(`sources[${index}].confidence is invalid.`);
      if (!nonEmptyStringArray(source.supports)) fail(`sources[${index}].supports must not be empty.`);
      else {
        for (const claimId of source.supports) {
          sourceSupportLinks.push({ sourceId: source.id, claimId, index });
        }
      }
    }
  }

  const claimIds = new Set();
  const claimSourceLinks = new Map();
  if (!Array.isArray(report.claims) || report.claims.length === 0) {
    fail("claims must contain at least one traceable claim.");
  } else {
    for (const [index, claim] of report.claims.entries()) {
      if (!isPlainObject(claim)) {
        fail(`claims[${index}] must be an object.`);
        continue;
      }
      if (!nonEmptyString(claim.id)) fail(`claims[${index}].id is required.`);
      else if (claimIds.has(claim.id)) fail(`duplicate claim id: ${claim.id}.`);
      else claimIds.add(claim.id);
      if (!nonEmptyString(claim.statement)) fail(`claims[${index}].statement is required.`);
      if (!classifications.has(claim.classification)) fail(`claims[${index}].classification is invalid.`);
      if (!confidences.has(claim.confidence)) fail(`claims[${index}].confidence is invalid.`);
      if (!nonEmptyString(claim.uncertainty)) fail(`claims[${index}].uncertainty is required.`);
      if (!nonEmptyStringArray(claim.sourceRefs)) {
        fail(`claims[${index}].sourceRefs must not be empty.`);
      } else {
        claimSourceLinks.set(claim.id, new Set(claim.sourceRefs));
        for (const reference of claim.sourceRefs) {
          if (!sourceIds.has(reference)) {
            fail(`claims[${index}] references unknown source: ${reference}.`);
          }
        }
      }
    }
  }
  for (const link of sourceSupportLinks) {
    if (!claimIds.has(link.claimId)) {
      fail(`sources[${link.index}] references unknown claim: ${link.claimId}.`);
    } else if (!claimSourceLinks.get(link.claimId)?.has(link.sourceId)) {
      fail(`source ${link.sourceId} and claim ${link.claimId} must reference each other.`);
    }
  }
  const sourceSupportEdges = new Set(
    sourceSupportLinks.map((link) => `${link.sourceId}\u0000${link.claimId}`)
  );
  for (const [claimId, sourceRefs] of claimSourceLinks.entries()) {
    for (const sourceId of sourceRefs) {
      if (sourceIds.has(sourceId) && !sourceSupportEdges.has(`${sourceId}\u0000${claimId}`)) {
        fail(`source ${sourceId} and claim ${claimId} must reference each other.`);
      }
    }
  }

  if (!isPlainObject(report.synthesis)) {
    fail("synthesis must be an object.");
  } else {
    for (const field of ["findings", "disagreements", "limitations", "recommendations"]) {
      if (!Array.isArray(report.synthesis[field])) fail(`synthesis.${field} must be an array.`);
    }
    if (!nonEmptyStringArray(report.synthesis.findings)) {
      fail("synthesis.findings must contain at least one finding.");
    }
  }
  if (!Array.isArray(report.gaps)) fail("gaps must be an array.");
  if (!Array.isArray(report.approvalGates)) fail("approvalGates must be an array.");
  if (report.status === "complete" && Array.isArray(report.gaps) && report.gaps.length > 0) {
    fail("complete evidence research reports cannot retain unresolved gaps.");
  }

  const combinedText = collectStrings(report).join("\n");
  const detectedSecretCategory = secretCategory(report);
  if (detectedSecretCategory) {
    fail(`secret-like material is not allowed in research reports (${detectedSecretCategory}).`);
  }
  const certaintyOverclaim = /\b(?:proves beyond doubt|guarantees?|mathematically certain)\b/i;
  if (certaintyOverclaim.test(combinedText)) {
    fail("unsupported certainty language is not allowed in evidence research reports.");
  }

  return failures;
}

function main() {
  try {
    const { reportPath } = parseArgs(process.argv.slice(2));
    const failures = validateResearchReport(readReport(reportPath));
    if (failures.length > 0) {
      console.error("Evidence research report validation failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log("Evidence research report validation passed.");
  } catch (error) {
    console.error(`Evidence research report validation failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
