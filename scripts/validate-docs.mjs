#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];
const ignoredDirs = new Set([".git", ".serena", "node_modules", "dist", "build", "coverage", ".next", "tmp", "temp"]);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const installPlan = JSON.parse(fs.readFileSync(path.join(root, "manifests", "install-plan.json"), "utf8"));
const routingProfiles = JSON.parse(fs.readFileSync(path.join(root, "catalog", "routing-profiles.json"), "utf8"));
const mcpCatalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "mcp-servers.json"), "utf8"));
const routingPolicyLine =
  "Policy: task-shape routing names matching specialists, selects matching skills when applicable, and may spawn bounded local subagents when the current runtime permits delegation; risky actions remain approval-gated.";

function posix(filePath) {
  return filePath.split(path.sep).join("/");
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function stripAnchor(target) {
  return target.split("#")[0];
}

function stripTitle(target) {
  const trimmed = target.trim();
  if (trimmed.startsWith("<") && trimmed.includes(">")) {
    return trimmed.slice(1, trimmed.indexOf(">"));
  }
  return trimmed.split(/\s+["']/)[0];
}

function isExternal(target) {
  return /^(?:https?:|mailto:|tel:)/i.test(target);
}

function validateMarkdownLinks(file) {
  const rel = posix(path.relative(root, file));
  const text = fs.readFileSync(file, "utf8");
  const linkPattern = /!?\[[^\]\n]+\]\(([^)\n]+)\)/g;
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const rawTarget = match[1].trim();
    if (!rawTarget || rawTarget.startsWith("#") || isExternal(rawTarget)) continue;
    const withoutTitle = stripTitle(rawTarget);
    const withoutAnchor = stripAnchor(withoutTitle);
    if (!withoutAnchor) continue;
    const decoded = decodeURI(withoutAnchor);
    const resolved = decoded.startsWith("/")
      ? path.join(root, decoded.slice(1))
      : path.resolve(path.dirname(file), decoded);
    if (!resolved.startsWith(root)) {
      failures.push(`Markdown link leaves repository in ${rel}: ${rawTarget}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      failures.push(`Broken markdown link in ${rel}: ${rawTarget}`);
    }
  }
}

function validateWorkflow(file) {
  const rel = posix(path.relative(root, file));
  const text = fs.readFileSync(file, "utf8");
  if (/\t/.test(text)) failures.push(`YAML workflow contains tab indentation: ${rel}`);
  if (/permissions:\s*write-all/.test(text)) failures.push(`Workflow uses broad write-all permissions: ${rel}`);
  if (rel === ".github/workflows/validate.yml") {
    for (const required of [
      "permissions:",
      "contents: read",
      "persist-credentials: false",
      "npm run check",
      "bash -n scripts/install.sh",
      "bash scripts/install.sh --all --dry-run",
      "./scripts/install.ps1 -All -WhatIf"
    ]) {
      if (!text.includes(required)) failures.push(`validate workflow missing ${required}`);
    }
  }
}

function validateDocText(file) {
  const rel = posix(path.relative(root, file));
  const text = fs.readFileSync(file, "utf8");
  if (/npx\s+run\s+chef/i.test(text)) {
    failures.push(`Documentation must not suggest the unrelated npx run watcher command: ${rel}`);
  }
  if (rel === "docs/install.md" || rel === "docs/install.tr.md") {
    const portableRequirements = rel === "docs/install.md"
      ? ["Portable Workspace OS", "CODEX_HOME", "AGENTS_HOME", "installs only its own managed surfaces"]
      : ["Portable Workspace OS", "CODEX_HOME", "AGENTS_HOME", "yalnızca kendi yönettiği yüzeyleri kurar"];
    for (const required of portableRequirements) {
      if (!text.includes(required)) {
        failures.push(`${rel} must retain the portable Workspace OS boundary: ${required}`);
      }
    }
  }
  if (/^docs\/expected-output(?:\.(?:de|es|pt-BR|tr|fr))?\.md$/.test(rel)) {
    const versionPattern = /agentchef@(\d+\.\d+\.\d+)/g;
    let match;
    while ((match = versionPattern.exec(text)) !== null) {
      if (match[1] !== packageJson.version) {
        failures.push(`${rel} has stale package example agentchef@${match[1]}; expected agentchef@${packageJson.version}`);
      }
    }
    if (!text.includes(routingPolicyLine)) {
      failures.push(`${rel} has stale routing policy expected-output; expected the runtime-bounded delegation policy line`);
    }
    if (rel === "docs/expected-output.md" || rel === "docs/expected-output.tr.md") {
      for (const requiredExpectedOutput of [
        "PowerShell Non-Interactive Dry Run",
        "PowerShell Interactive Dry Run",
        "[*] AgentChef installer",
        "Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled."
      ]) {
        if (!text.includes(requiredExpectedOutput)) failures.push(`${rel} missing current expected-output snippet: ${requiredExpectedOutput}`);
      }
      const enabledMcpCount = mcpCatalog.servers.filter((server) => server.defaultEnabled === true).length;
      const disabledMcpCount = mcpCatalog.servers.length - enabledMcpCount;
      for (const derivedSnippet of [
        `all | ${installPlan.profiles.all.length} |`,
        `default | ${installPlan.profiles.default.length} |`,
        `Profiles: ${routingProfiles.profiles.length}`,
        `MCP ready by default (${enabledMcpCount})`,
        `MCP opt-in / disabled by default (${disabledMcpCount})`
      ]) {
        if (!text.includes(derivedSnippet)) {
          failures.push(`${rel} has stale derived expected-output; missing ${derivedSnippet}`);
        }
      }
    }
    if (text.includes("Authenticated/account MCP connectors remain disabled by default")) {
      failures.push(`${rel} has stale narrow MCP connector boundary text`);
    }
  }
}

for (const file of walk(root)) {
  const rel = posix(path.relative(root, file));
  if (rel.endsWith(".md")) {
    validateMarkdownLinks(file);
    validateDocText(file);
  }
  if (rel.endsWith(".yml") || rel.endsWith(".yaml")) validateWorkflow(file);
}

if (failures.length > 0) {
  console.error("Documentation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Documentation validation passed.");
