#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_REPORT_BYTES = 2 * 1024 * 1024;
const statuses = new Set(["complete", "partial", "blocked"]);
const modes = new Set(["local-source", "local-rendered", "deployed-public", "authorized-private"]);
const authorizationModes = new Set([
  "local-only",
  "public-read-only",
  "authorized-private-read-only"
]);
const evidenceKinds = new Set([
  "source-code",
  "local-browser",
  "rendered-browser",
  "http-response",
  "robots",
  "sitemap",
  "rich-results-test",
  "schema-validator",
  "lighthouse-lab",
  "pagespeed-field",
  "crux-field",
  "search-console",
  "url-inspection",
  "analytics",
  "official-guidance"
]);
const evidenceGrades = new Set([
  "technical-local",
  "local-rendered",
  "deployed-public",
  "account-verified",
  "official-current"
]);
const allowedGradesByKind = new Map([
  ["source-code", new Set(["technical-local"])],
  ["local-browser", new Set(["local-rendered"])],
  ["rendered-browser", new Set(["local-rendered", "deployed-public", "account-verified"])],
  ["http-response", new Set(["technical-local", "deployed-public", "account-verified"])],
  ["robots", new Set(["technical-local", "deployed-public", "account-verified"])],
  ["sitemap", new Set(["technical-local", "deployed-public", "account-verified"])],
  ["rich-results-test", new Set(["local-rendered", "deployed-public", "account-verified"])],
  ["schema-validator", new Set(["local-rendered", "deployed-public", "account-verified"])],
  ["lighthouse-lab", new Set(["local-rendered", "deployed-public", "account-verified"])],
  ["pagespeed-field", new Set(["deployed-public"])],
  ["crux-field", new Set(["deployed-public"])],
  ["search-console", new Set(["account-verified"])],
  ["url-inspection", new Set(["account-verified"])],
  ["analytics", new Set(["account-verified"])],
  ["official-guidance", new Set(["official-current"])]
]);
const allowedGradesByMode = new Map([
  ["local-source", new Set(["technical-local", "official-current"])],
  ["local-rendered", new Set(["technical-local", "local-rendered", "official-current"])],
  ["deployed-public", new Set(["technical-local", "local-rendered", "deployed-public", "official-current"])],
  ["authorized-private", new Set([
    "technical-local",
    "local-rendered",
    "deployed-public",
    "account-verified",
    "official-current"
  ])]
]);
const buckets = new Set([
  "crawlability",
  "indexability",
  "canonicalization",
  "rendering",
  "structured-data",
  "content-intent",
  "internal-linking",
  "international",
  "local-seo",
  "page-experience",
  "monitoring",
  "spam-policy"
]);
const severities = new Set(["critical", "high", "medium", "low", "info"]);
const classifications = new Set(["proven", "inferred", "hypothesis", "not-checked"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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
  if (!reportPath) throw new Error("Usage: validate-seo-report.mjs --report <report.json>");
  return { reportPath: path.resolve(reportPath) };
}

function readReport(reportPath) {
  const stat = fs.lstatSync(reportPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("SEO report must be a regular, non-symlink file.");
  }
  if (stat.size > MAX_REPORT_BYTES) {
    throw new Error(`SEO report exceeds ${MAX_REPORT_BYTES} bytes.`);
  }
  return JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, ""));
}

export function validateSeoReport(report) {
  const failures = [];
  const fail = (message) => failures.push(message);

  if (!isPlainObject(report)) return ["report root must be an object."];
  if (report.schemaVersion !== "agentchef.seo-audit.v1") {
    fail("schemaVersion must be agentchef.seo-audit.v1.");
  }
  if (!validDate(report.generatedAt)) fail("generatedAt must be an ISO-compatible date.");
  if (!statuses.has(report.status)) fail("status must be complete, partial, or blocked.");

  if (!isPlainObject(report.scope)) {
    fail("scope must be an object.");
  } else {
    if (!modes.has(report.scope.mode)) fail("scope.mode is invalid.");
    if (!authorizationModes.has(report.scope.authorization)) fail("scope.authorization is invalid.");
    if (
      report.scope.mode === "authorized-private"
      && report.scope.authorization !== "authorized-private-read-only"
    ) {
      fail("scope.mode authorized-private requires authorized-private-read-only authorization.");
    }
    if (
      ["deployed-public", "authorized-private"].includes(report.scope.mode)
      && (!nonEmptyString(report.scope.targetUrl) || !/^https:\/\//i.test(report.scope.targetUrl))
    ) {
      fail("deployed SEO scopes require an https targetUrl.");
    }
    if (!Array.isArray(report.scope.locales) || report.scope.locales.some((entry) => !nonEmptyString(entry))) {
      fail("scope.locales must be an array of locale identifiers.");
    }
  }

  const claimFlags = [
    "rankingsVerified",
    "indexingVerified",
    "searchConsoleVerified",
    "fieldDataVerified"
  ];
  if (!isPlainObject(report.claims)) {
    fail("claims must be an object.");
  } else {
    for (const flag of claimFlags) {
      if (typeof report.claims[flag] !== "boolean") fail(`claims.${flag} must be boolean.`);
    }
  }

  const evidenceIds = new Set();
  const evidenceKindSet = new Set();
  const evidenceById = new Map();
  if (!Array.isArray(report.evidence) || report.evidence.length === 0) {
    fail("evidence must contain at least one item.");
  } else {
    for (const [index, item] of report.evidence.entries()) {
      if (!isPlainObject(item)) {
        fail(`evidence[${index}] must be an object.`);
        continue;
      }
      if (!nonEmptyString(item.id)) fail(`evidence[${index}].id is required.`);
      else if (evidenceIds.has(item.id)) fail(`duplicate evidence id: ${item.id}.`);
      else {
        evidenceIds.add(item.id);
        evidenceById.set(item.id, item);
      }
      if (!evidenceKinds.has(item.kind)) fail(`evidence[${index}].kind is invalid.`);
      else evidenceKindSet.add(item.kind);
      if (!nonEmptyString(item.location)) fail(`evidence[${index}].location is required.`);
      if (!validDate(item.checkedAt)) fail(`evidence[${index}].checkedAt is invalid.`);
      if (!evidenceGrades.has(item.grade)) fail(`evidence[${index}].grade is invalid.`);
      else {
        const kindGrades = allowedGradesByKind.get(item.kind);
        if (kindGrades && !kindGrades.has(item.grade)) {
          fail(`evidence[${index}] kind ${item.kind} cannot use the ${item.grade} grade.`);
        }
        const modeGrades = allowedGradesByMode.get(report.scope?.mode);
        if (modeGrades && !modeGrades.has(item.grade)) {
          fail(`evidence[${index}] grade ${item.grade} exceeds scope.mode ${report.scope.mode}.`);
        }
      }
      if (["search-console", "url-inspection", "analytics"].includes(item.kind)) {
        if (item.grade !== "account-verified") {
          fail(`evidence[${index}] account evidence must use the account-verified grade.`);
        }
        if (report.scope?.authorization !== "authorized-private-read-only") {
          fail(`evidence[${index}] account evidence requires authorized-private-read-only authorization.`);
        }
      }
      if (
        item.grade === "account-verified"
        && report.scope?.authorization !== "authorized-private-read-only"
      ) {
        fail(`evidence[${index}] account-verified evidence requires authorized-private-read-only authorization.`);
      }
    }
  }

  const findingIds = new Set();
  if (!Array.isArray(report.findings)) {
    fail("findings must be an array.");
  } else {
    for (const [index, finding] of report.findings.entries()) {
      if (!isPlainObject(finding)) {
        fail(`findings[${index}] must be an object.`);
        continue;
      }
      if (!nonEmptyString(finding.id)) fail(`findings[${index}].id is required.`);
      else if (findingIds.has(finding.id)) fail(`duplicate finding id: ${finding.id}.`);
      else findingIds.add(finding.id);
      if (!buckets.has(finding.bucket)) fail(`findings[${index}].bucket is invalid.`);
      if (!severities.has(finding.severity)) fail(`findings[${index}].severity is invalid.`);
      if (!classifications.has(finding.classification)) {
        fail(`findings[${index}].classification is invalid.`);
      }
      for (const field of ["summary", "impact", "recommendation", "validation"]) {
        if (!nonEmptyString(finding[field])) fail(`findings[${index}].${field} is required.`);
      }
      if (!Array.isArray(finding.evidenceRefs) || finding.evidenceRefs.length === 0) {
        fail(`findings[${index}].evidenceRefs must not be empty.`);
      } else {
        for (const reference of finding.evidenceRefs) {
          if (!evidenceIds.has(reference)) {
            fail(`findings[${index}] references unknown evidence: ${reference}.`);
          }
        }
      }
      if (typeof finding.approvalRequired !== "boolean") {
        fail(`findings[${index}].approvalRequired must be boolean.`);
      }
    }
  }

  if (!isPlainObject(report.metrics) || !Array.isArray(report.metrics.lab) || !Array.isArray(report.metrics.field)) {
    fail("metrics must contain separate lab and field arrays.");
  } else {
    const validateMetric = (metric, label, allowedKinds) => {
      if (!isPlainObject(metric)) {
        fail(`${label} must be an object.`);
        return;
      }
      if (!nonEmptyString(metric.name)) fail(`${label}.name is required.`);
      if (!(nonEmptyString(metric.value) || (typeof metric.value === "number" && Number.isFinite(metric.value)))) {
        fail(`${label}.value must be a non-empty string or number.`);
      }
      if (!nonEmptyString(metric.unit)) fail(`${label}.unit is required.`);
      if (!nonEmptyString(metric.evidenceRef) || !evidenceIds.has(metric.evidenceRef)) {
        fail(`${label}.evidenceRef must name declared evidence.`);
        return;
      }
      const evidence = evidenceById.get(metric.evidenceRef);
      if (!allowedKinds.has(evidence?.kind)) {
        fail(`${label}.evidenceRef must point to ${[...allowedKinds].join(" or ")} evidence.`);
      }
    };
    report.metrics.lab.forEach((metric, index) =>
      validateMetric(metric, `metrics.lab[${index}]`, new Set(["lighthouse-lab"]))
    );
    report.metrics.field.forEach((metric, index) =>
      validateMetric(metric, `metrics.field[${index}]`, new Set(["crux-field", "pagespeed-field"]))
    );
  }
  if (!Array.isArray(report.gaps)) fail("gaps must be an array.");
  if (!Array.isArray(report.approvalGates)) fail("approvalGates must be an array.");
  if (!Array.isArray(report.nextActions)) fail("nextActions must be an array.");

  if (report.status === "complete" && Array.isArray(report.gaps) && report.gaps.length > 0) {
    fail("complete SEO audit reports cannot retain unresolved gaps.");
  }
  const hasEvidence = (kinds, grade = null) => Array.isArray(report.evidence)
    && report.evidence.some((item) => kinds.includes(item?.kind) && (!grade || item?.grade === grade));
  if (report.claims?.indexingVerified && !hasEvidence(["search-console", "url-inspection"], "account-verified")) {
    fail("claims.indexingVerified requires Search Console or URL Inspection evidence.");
  }
  if (report.claims?.searchConsoleVerified && !hasEvidence(["search-console"], "account-verified")) {
    fail("claims.searchConsoleVerified requires search-console evidence.");
  }
  if (
    report.claims?.fieldDataVerified
    && (
      !["crux-field", "pagespeed-field"].some((kind) => evidenceKindSet.has(kind))
      || !Array.isArray(report.metrics?.field)
      || report.metrics.field.length === 0
    )
  ) {
    fail("claims.fieldDataVerified requires CrUX or PageSpeed field evidence and at least one cited field metric.");
  }
  if (Array.isArray(report.metrics?.field) && report.metrics.field.length > 0 && !report.claims?.fieldDataVerified) {
    fail("Field metrics require claims.fieldDataVerified=true.");
  }
  if (report.claims?.rankingsVerified && !hasEvidence(["search-console"], "account-verified")) {
    fail("claims.rankingsVerified requires property-specific Search Console evidence.");
  }

  const combinedText = collectStrings(report).join("\n");
  const rankingGuarantee = /(?:guarantee(?:d|s)?|garanti(?:li|si|ler)?).{0,50}(?:first place|number one|#\s*1|top position|birinci sıra)|(?:first place|number one|#\s*1|birinci sıra).{0,50}(?:guarantee(?:d|s)?|garanti)/i;
  if (rankingGuarantee.test(combinedText)) {
    fail("ranking guarantee language is not allowed in an evidence-backed SEO report.");
  }
  const detectedSecretCategory = secretCategory(report);
  if (detectedSecretCategory) {
    fail(`secret-like material is not allowed in SEO reports (${detectedSecretCategory}).`);
  }

  return failures;
}

function main() {
  try {
    const { reportPath } = parseArgs(process.argv.slice(2));
    const failures = validateSeoReport(readReport(reportPath));
    if (failures.length > 0) {
      console.error("SEO report validation failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log("SEO report validation passed.");
  } catch (error) {
    console.error(`SEO report validation failed: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
