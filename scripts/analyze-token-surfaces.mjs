#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  CliUsageError,
  installCliErrorBoundary
} from "./lib/cli-error-contract.mjs";

const root = path.resolve(process.cwd());
const rawArgs = process.argv.slice(2);
installCliErrorBoundary({
  tool: "token-audit",
  argv: rawArgs,
  root,
  prefix: "Codex Chef token audit error"
});
let asJson = false;
let allowFilesystemFallback = false;
let topCount = 12;
for (const arg of rawArgs) {
  if (arg === "--json") asJson = true;
  else if (arg === "--allow-filesystem-fallback") allowFilesystemFallback = true;
  else if (arg.startsWith("--top=")) {
    topCount = Number.parseInt(arg.slice(6), 10);
    if (!Number.isInteger(topCount) || topCount < 1 || topCount > 1000) {
      throw new CliUsageError("--top must be an integer between 1 and 1000.");
    }
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const categoryBudgets = {
  "runtime-startup": 14000,
  "runtime-config": 18000,
  "agent-role": 130000,
  "skill-discovery-metadata": 2000,
  "skill-instructions": 12000,
  "skill-references": 30000,
  "skill-agent-metadata": 3000,
  "skill-executable-source": 30000,
  "catalog-index": 70000,
  "catalog-corpus": 30000,
  "docs": 180000,
  "docs-release": 50000,
  "script-large": 90000,
  "scripts-tests": 80000,
  "scripts-validators": 180000,
  "other-source": 20000
};
const ignoredDirs = new Set([
  ".git",
  ".serena",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  "tmp",
  "temp",
  ".playwright-mcp"
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      throw new Error(`Token audit refuses a linked filesystem-fallback path: ${toPosix(path.relative(root, full))}`);
    }
    if (stat.isDirectory()) files.push(...walk(full));
    else if (stat.isFile()) files.push(full);
  }
  return files;
}

function isInsideRoot(filePath) {
  const relative = path.relative(fs.realpathSync.native(root), fs.realpathSync.native(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSecretLikePath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const name = path.posix.basename(normalized).toLowerCase();
  if (name === ".env.example") return false;
  return /^\.env(?:\.|$)/.test(name)
    || /\.(?:pem|key|p12|pfx|kdbx|sqlite|db|dump)$/i.test(name)
    || /(?:^|\/)(?:auth|credentials?|cookies?|secrets?)(?:\/|(?:\.[^/]+)?$)/i.test(normalized);
}

function validateSourceFile(file) {
  const relativePath = toPosix(path.relative(root, file));
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`Token audit refuses linked source: ${relativePath}`);
  if (!stat.isFile()) return null;
  if (!isInsideRoot(file)) throw new Error(`Token audit source escapes the repository: ${relativePath}`);
  if (isSecretLikePath(relativePath)) throw new Error(`Token audit refuses a secret-like source path: ${relativePath}`);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`Token audit source exceeds the ${MAX_FILE_BYTES}-byte per-file limit: ${relativePath}`);
  }
  return { file, relativePath, size: stat.size };
}

function sourceFilePaths() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8", windowsHide: true }
  );
  if (result.status === 0) {
    return {
      mode: "git-source-set",
      files: result.stdout
        .split("\0")
        .filter(Boolean)
        .map((rel) => path.join(root, rel))
    };
  }
  if (!allowFilesystemFallback) {
    throw new Error("Git source enumeration failed; rerun inside a Git worktree or pass --allow-filesystem-fallback after reviewing the directory.");
  }
  return {
    mode: "explicit-filesystem-fallback",
    files: walk(root)
  };
}

function isProbablyBinary(buffer) {
  if (buffer.includes(0)) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  let control = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) control += 1;
  }
  return sample.length > 0 && control / sample.length > 0.05;
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function categoryFor(rel) {
  if (rel === "templates/codex/AGENTS.md") return "runtime-startup";
  if (/^templates\/codex\/(?:config\.(?:windows|unix)\.toml|profiles\/.*\.toml|rules\/.*)$/.test(rel)) return "runtime-config";
  if (/^templates\/codex\/agents\/.*\.toml$/.test(rel)) return "agent-role";
  if (/^plugins\/[^/]+\/skills\/[^/]+\/references\//.test(rel)) return "skill-references";
  if (/^plugins\/[^/]+\/skills\/[^/]+\/scripts\//.test(rel)) return "skill-executable-source";
  if (/^plugins\/[^/]+\/skills\/[^/]+\/agents\//.test(rel)) return "skill-agent-metadata";
  if (rel === "catalog/agent-research-corpus.json") return "catalog-corpus";
  if (/^(?:catalog|manifests|schemas)\//.test(rel) || rel === "llms.txt") return "catalog-index";
  if (/^(?:CHANGELOG\.md|docs\/release-notes(?:\.[A-Za-z-]+)?\.md)$/.test(rel)) return "docs-release";
  if (/^(?:README|CHANGELOG|docs\/|kb\/|SECURITY|SUPPORT|PRIVACY|CONTRIBUTING|CODE_OF_CONDUCT)/.test(rel)) return "docs";
  if (/^scripts\/(?:chef-cli|codex-status)\.mjs$/.test(rel)) return "script-large";
  if (/^scripts\/tests\//.test(rel)) return "scripts-tests";
  if (/^scripts\//.test(rel)) return "scripts-validators";
  return "other-source";
}

function layerFor(category) {
  if (category === "runtime-startup") return "always_loaded_instruction_estimate";
  if (["runtime-config", "skill-discovery-metadata"].includes(category)) return "registered_conditional_surface";
  if (["agent-role", "skill-instructions", "skill-references", "skill-agent-metadata"].includes(category)) {
    return "invoked_or_deferred_surface";
  }
  return "repository_maintenance_size";
}

function skillDocumentSurfaces(rel, text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) {
    return [{
      path: rel,
      surface: "instructions",
      category: "skill-instructions",
      text
    }];
  }
  const frontmatter = match[1];
  const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() || "";
  const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
  const discovery = `path: ${rel}\nname: ${name}\ndescription: ${description}\n`;
  return [
    {
      path: rel,
      surface: "discovery-metadata",
      category: "skill-discovery-metadata",
      text: discovery
    },
    {
      path: rel,
      surface: "instruction-body",
      category: "skill-instructions",
      text: text.slice(match[0].length)
    }
  ];
}

const files = [];
const physicalTextFiles = new Set();
const sourceSet = sourceFilePaths();
let totalSourceBytes = 0;
for (const candidate of sourceSet.files) {
  const source = validateSourceFile(candidate);
  if (!source) continue;
  totalSourceBytes += source.size;
  if (totalSourceBytes > MAX_TOTAL_BYTES) {
    throw new Error(`Token audit source set exceeds the ${MAX_TOTAL_BYTES}-byte total limit.`);
  }
  const { file, relativePath: rel } = source;
  const buffer = fs.readFileSync(file);
  if (isProbablyBinary(buffer)) continue;
  physicalTextFiles.add(rel);
  const text = buffer.toString("utf8");
  const surfaces = /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(rel)
    ? skillDocumentSurfaces(rel, text)
    : [{ path: rel, surface: "file", category: categoryFor(rel), text }];
  for (const surface of surfaces) {
    files.push({
      path: surface.path,
      surface: surface.surface,
      category: surface.category,
      chars: surface.text.length,
      estimatedTokens: estimateTokens(surface.text),
      layer: layerFor(surface.category)
    });
  }
}

const categories = new Map();
for (const file of files) {
  const entry = categories.get(file.category) || { category: file.category, surfaces: 0, chars: 0, estimatedTokens: 0 };
  entry.surfaces += 1;
  entry.chars += file.chars;
  entry.estimatedTokens += file.estimatedTokens;
  categories.set(file.category, entry);
}

const categoryRows = [...categories.values()].sort((a, b) => b.estimatedTokens - a.estimatedTokens);
const layers = new Map();
for (const file of files) {
  const entry = layers.get(file.layer) || { layer: file.layer, surfaces: 0, chars: 0, estimatedTokens: 0 };
  entry.surfaces += 1;
  entry.chars += file.chars;
  entry.estimatedTokens += file.estimatedTokens;
  layers.set(file.layer, entry);
}
const layerRows = [...layers.values()].sort((a, b) => b.estimatedTokens - a.estimatedTokens);
function recommendationFor(category, status) {
  if (status === "ok" || status === "unbudgeted") return "No action needed.";
  if (status === "near") {
    return "Watch this surface in release review and prefer summaries, generated indexes, or deferred references for future growth.";
  }
  if (category === "skill-discovery-metadata") {
    return "Tighten only ambiguous name/description metadata; keep complete procedures in the selected skill body or references.";
  }
  if (["skill-instructions", "skill-references", "agent-role"].includes(category)) {
    return "Split large selected-context procedures into focused deferred references when that improves retrieval; preserve capability.";
  }
  if (category === "skill-executable-source") {
    return "Treat this as repository maintenance code; refactor only for maintainability, not to reduce prompt context.";
  }
  if (category === "other-source") {
    return "Check source classification and ignored local artifacts before changing repository content.";
  }
  return "Review this repository surface for maintainability; do not remove capabilities solely to reduce the estimate.";
}

const budgetFindings = categoryRows.map((category) => {
  const budget = categoryBudgets[category.category] || null;
  const ratio = budget ? category.estimatedTokens / budget : null;
  const status = !budget
    ? "unbudgeted"
    : ratio > 1.2
      ? "over"
      : ratio > 0.9
        ? "near"
        : "ok";
  return {
    category: category.category,
    estimatedTokens: category.estimatedTokens,
    budget,
    status,
    ratio: ratio === null ? null : Number(ratio.toFixed(2)),
    recommendation: recommendationFor(category.category, status)
  };
});

const report = {
  schemaVersion: "codex-chef.token-surfaces.v2",
  note: "Token estimates use a coarse chars/4 heuristic for repository surfaces. They are not provider billing or measured session usage.",
  telemetry: {
    layer: "real_session_telemetry",
    available: false,
    note: "Provider/session telemetry is not available to this repository-native audit; compare it separately when the runtime exposes it."
  },
  toolSchemaContext: {
    layer: "tool_schema_context",
    available: false,
    note: "Live tool schemas are runtime-owned and are not inferred from repository file size."
  },
  agentCost: {
    layer: "per_agent_runtime_cost",
    available: false,
    note: "Per-agent cost depends on invocation, inherited profile, runtime context, and returned evidence; role-file size is only a deferred-surface estimate."
  },
  generatedAt: new Date().toISOString(),
  sourceEnumeration: {
    mode: sourceSet.mode,
    ignoredFilesExcluded: sourceSet.mode === "git-source-set",
    note: sourceSet.mode === "git-source-set"
      ? "Tracked and non-ignored untracked source files only."
      : "Explicit filesystem fallback selected; linked, secret-like, special, and oversized files were rejected."
  },
  totals: {
    files: physicalTextFiles.size,
    physicalFiles: physicalTextFiles.size,
    analysisSurfaces: files.length,
    chars: files.reduce((sum, file) => sum + file.chars, 0),
    estimatedTokens: files.reduce((sum, file) => sum + file.estimatedTokens, 0)
  },
  categoryBudgets,
  layers: layerRows,
  categories: categoryRows,
  budgetFindings,
  topFiles: [...files].sort((a, b) => b.estimatedTokens - a.estimatedTokens).slice(0, Number.isFinite(topCount) ? topCount : 12),
  guidance: [
    "Do not delete docs, skills, agents, or MCP definitions to save tokens; most are deferred surfaces until selected.",
    "Keep SKILL.md triggers concise and move heavy procedures into references or scripts.",
    "Use context-budget-planner for broad work, then load catalogs/manifests before full files.",
    "Use token-safe profile knobs for verbosity, compaction, and tool-output ceilings without disabling features.",
    "Leave subagent model and reasoning unpinned when the agent should adapt to task context."
  ]
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Codex Chef token surface audit");
  console.log(report.note);
  console.log("");
  console.log(`Total: ${report.totals.physicalFiles} physical text files, ${report.totals.analysisSurfaces} analysis surfaces, ~${report.totals.estimatedTokens.toLocaleString("en-US")} tokens`);
  console.log("");
  console.log("By category:");
  for (const category of report.categories) {
    const finding = report.budgetFindings.find((item) => item.category === category.category);
    const budgetText = finding?.budget ? ` / budget ~${finding.budget.toLocaleString("en-US")}` : "";
    const statusText = finding ? ` [${finding.status}]` : "";
    console.log(`- ${category.category}: ${category.surfaces} surface(s), ~${category.estimatedTokens.toLocaleString("en-US")} tokens${budgetText}${statusText}`);
  }
  console.log("");
  console.log("By loading layer:");
  for (const layer of report.layers) {
    console.log(`- ${layer.layer}: ${layer.surfaces} surface(s), ~${layer.estimatedTokens.toLocaleString("en-US")} tokens`);
  }
  console.log("");
  console.log("Budget findings:");
  for (const finding of report.budgetFindings.filter((item) => item.status !== "ok")) {
    console.log(`- ${finding.category}: ${finding.status}, ~${finding.estimatedTokens.toLocaleString("en-US")} tokens${finding.budget ? ` vs ~${finding.budget.toLocaleString("en-US")}` : ""}. ${finding.recommendation}`);
  }
  console.log("");
  console.log("Largest files:");
  for (const file of report.topFiles) {
    console.log(`- ${file.path}: ~${file.estimatedTokens.toLocaleString("en-US")} tokens (${file.category})`);
  }
  console.log("");
  console.log("Guidance:");
  for (const item of report.guidance) console.log(`- ${item}`);
}
