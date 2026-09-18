#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readTomlString(block, key) {
  const match = block.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"\\s*$`, "m"));
  return match ? match[1] : null;
}

for (const rel of [
  "scripts/analyze-token-surfaces.mjs",
  "scripts/validate-token-surfaces.mjs",
  "templates/codex/profiles/token-safe.config.toml"
]) {
  if (!exists(rel)) fail(`Missing token optimization surface: ${rel}`);
}

if (exists("package.json")) {
  const packageJson = JSON.parse(read("package.json"));
  const scripts = packageJson.scripts || {};
  if (scripts["token:audit"] !== "node scripts/analyze-token-surfaces.mjs") {
    fail("package.json must expose token:audit as node scripts/analyze-token-surfaces.mjs.");
  }
  if (scripts["token:audit:json"] !== "node scripts/analyze-token-surfaces.mjs --json") {
    fail("package.json must expose token:audit:json as node scripts/analyze-token-surfaces.mjs --json.");
  }
  if (scripts["validate:tokens"] !== "node scripts/validate-token-surfaces.mjs") {
    fail("package.json must expose validate:tokens as node scripts/validate-token-surfaces.mjs.");
  }
  if (!String(scripts.check || "").includes("node scripts/validate-token-surfaces.mjs")) {
    fail("package.json check script must include node scripts/validate-token-surfaces.mjs.");
  }
}

if (exists(".github/workflows/validate.yml")) {
  const workflow = read(".github/workflows/validate.yml");
  for (const required of [
    "node --check scripts/analyze-token-surfaces.mjs",
    "node --check scripts/validate-token-surfaces.mjs"
  ]) {
    if (!workflow.includes(required)) fail(`validate workflow must include ${required}.`);
  }
}

if (exists("templates/codex/profiles/token-safe.config.toml")) {
  const profile = read("templates/codex/profiles/token-safe.config.toml");
  for (const required of [
    'model_reasoning_effort = "low"',
    'model_reasoning_summary = "none"',
    'model_verbosity = "low"',
    "model_auto_compact_token_limit = 64000",
    "tool_output_token_limit = 6000"
  ]) {
    if (!profile.includes(required)) fail(`token-safe profile must include ${required}`);
  }
  for (const forbidden of [
    /approval_policy\s*=\s*"never"/,
    /sandbox_mode\s*=\s*"danger-full-access"/,
    /multi_agent\s*=\s*false/,
    /apps\s*=\s*false/,
    /memories\s*=\s*false/,
    /hooks\s*=\s*false/,
    /\[mcp_servers\.[^\]]+\][\s\S]*?enabled\s*=\s*false/
  ]) {
    if (forbidden.test(profile)) fail(`token-safe profile must not disable core capability: ${forbidden}`);
  }
}

if (exists("templates/codex/AGENTS.md")) {
  const agents = read("templates/codex/AGENTS.md");
  for (const required of [
    "## Token Budget Discipline",
    "context-budget-planner",
    "Do not disable agents, skills, MCPs, memory, hooks, or apps",
    "Close completed agent threads"
  ]) {
    if (!agents.includes(required)) fail(`templates/codex/AGENTS.md missing token guidance: ${required}`);
  }
}

if (exists("plugins/agentchef-workflows/skills/context-budget-planner/references/context-strategy.md")) {
  const strategy = read("plugins/agentchef-workflows/skills/context-budget-planner/references/context-strategy.md");
  for (const required of ["npm run token:audit", "token-safe.config.toml", "model/reasoning pin"]) {
    if (!strategy.includes(required)) fail(`context-budget strategy missing: ${required}`);
  }
}

for (const rel of [
  "docs/verification.md",
  "docs/verification.tr.md"
]) {
  if (exists(rel) && !read(rel).includes("npm run token:audit")) {
    fail(`${rel} must document npm run token:audit.`);
  }
}

for (const rel of ["docs/verification.md", "docs/verification.tr.md"]) {
  if (exists(rel) && !read(rel).includes("scripts/validate-token-surfaces.mjs")) {
    fail(`${rel} must document scripts/validate-token-surfaces.mjs.`);
  }
}

for (const rel of [
  "docs/how-to.md",
  "docs/how-to.tr.md",
  "docs/install.md",
  "docs/install.tr.md",
  "docs/security-model.md",
  "docs/security-model.tr.md",
  "docs/upgrade.md",
  "docs/upgrade.tr.md"
]) {
  if (exists(rel) && !read(rel).includes("token-safe.config.toml")) {
    fail(`${rel} must document token-safe.config.toml.`);
  }
}

for (const rel of ["docs/how-to.md", "docs/how-to.tr.md", "docs/install.md", "docs/install.tr.md"]) {
  const text = exists(rel) ? read(rel) : "";
  if (!text.includes("model/reasoning")) {
    fail(`${rel} must document automatic agent model/reasoning selection.`);
  }
}

for (const rel of ["docs/install.md", "docs/install.tr.md"]) {
  const text = exists(rel) ? read(rel) : "";
  if (!text.includes("npm run chef -- --backups --backup <id> --restore --apply")) {
    fail(`${rel} must document backup restore through the Chef CLI.`);
  }
}

if (exists("catalog/agents.json")) {
  const catalog = JSON.parse(read("catalog/agents.json"));
  for (const agent of catalog.agents || []) {
    if (agent.modelSelection !== "auto") fail(`Agent ${agent.name} must declare modelSelection auto.`);
    if (agent.modelReasoningEffort !== "auto") fail(`Agent ${agent.name} must declare modelReasoningEffort auto.`);
    const templatePath = `templates/codex/${agent.configFile}`;
    if (!exists(templatePath)) continue;
    const template = read(templatePath);
    if (readTomlString(template, "model")) fail(`Agent template must not pin model when catalog modelSelection is auto: ${agent.name}`);
    if (readTomlString(template, "model_reasoning_effort")) {
      fail(`Agent template must not pin model_reasoning_effort when catalog modelReasoningEffort is auto: ${agent.name}`);
    }
  }
}

if (exists("scripts/analyze-token-surfaces.mjs")) {
  const analyzer = read("scripts/analyze-token-surfaces.mjs");
  for (const required of ["agentchef.token-surfaces.v2", "always_loaded_instruction_estimate", "registered_conditional_surface", "invoked_or_deferred_surface", "repository_maintenance_size", "real_session_telemetry", "tool_schema_context", "per_agent_runtime_cost", "runtime-startup", "agent-role", "skill-discovery-metadata", "skill-instructions", "skill-references", "skill-agent-metadata", "skill-executable-source", "docs-release", "catalog-corpus", "script-large", "scripts-tests", "chars/4", "categoryBudgets", "budgetFindings", "git-source-set", "allow-filesystem-fallback"]) {
    if (!analyzer.includes(required)) fail(`Token analyzer missing expected category or note: ${required}`);
  }
  if (!analyzer.includes('if (/^scripts\\/(?:chef-cli|codex-status)\\.mjs$/.test(rel)) return "script-large";')) {
    fail("Token analyzer must keep only runtime operator scripts in script-large.");
  }
  if (!analyzer.includes('if (/^scripts\\/tests\\//.test(rel)) return "scripts-tests";')) {
    fail("Token analyzer must classify executable test suites separately from validators.");
  }
  if (!analyzer.includes('if (/^scripts\\//.test(rel)) return "scripts-validators";')) {
    fail("Token analyzer must classify validator and helper scripts as scripts-validators.");
  }
}

function runAnalyzer(cwd) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "analyze-token-surfaces.mjs"), "--json"],
    { cwd, encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  if (result.error || result.status !== 0) {
    fail(`Token analyzer fixture failed: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`Token analyzer fixture did not emit JSON: ${error.message}`);
    return null;
  }
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-token-audit-"));
try {
  fs.mkdirSync(path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "references"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "agents"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, ".gitignore"), "ignored/\n", "utf8");
  fs.writeFileSync(
    path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "SKILL.md"),
    "---\nname: sample\ndescription: Small discovery description.\n---\n\n# Large selected instructions\n\nOnly loaded after selection.\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "scripts", "tool.mjs"),
    "export const implementation = true;\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "references", "guide.md"),
    "# Deferred guide\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "plugins", "demo", "skills", "sample", "agents", "openai.yaml"),
    "interface:\n  display_name: Sample\n",
    "utf8"
  );
  const gitInit = spawnSync("git", ["init", "--quiet"], {
    cwd: fixtureRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000
  });
  if (gitInit.error || gitInit.status !== 0) {
    fail(`Token analyzer fixture Git initialization failed: ${gitInit.error?.message || gitInit.stderr || gitInit.stdout}`);
  } else {
    const baseline = runAnalyzer(fixtureRoot);
    fs.mkdirSync(path.join(fixtureRoot, "ignored"), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "ignored", "large-local.log"), "x".repeat(100000), "utf8");
    const withIgnored = runAnalyzer(fixtureRoot);
    if (baseline && withIgnored) {
      if (baseline.totals?.estimatedTokens !== withIgnored.totals?.estimatedTokens) {
        fail("Token analyzer totals changed after adding a Git-ignored local artifact.");
      }
      if (baseline.sourceEnumeration?.mode !== "git-source-set") {
        fail("Token analyzer fixture must use the Git tracked/non-ignored source set.");
      }
      if (baseline.totals?.physicalFiles !== 5 || baseline.totals?.analysisSurfaces !== 6) {
        fail("Token analyzer must distinguish five physical fixture files from six analysis surfaces.");
      }
      const categories = new Map((baseline.categories || []).map((entry) => [entry.category, entry]));
      if ((categories.get("skill-discovery-metadata")?.estimatedTokens || 0) === 0) {
        fail("Token analyzer did not count skill discovery metadata.");
      }
      if ((categories.get("skill-instructions")?.estimatedTokens || 0) === 0) {
        fail("Token analyzer did not defer the selected SKILL.md instruction body.");
      }
      if ((categories.get("skill-executable-source")?.estimatedTokens || 0) === 0) {
        fail("Token analyzer did not separate executable skill source.");
      }
      if ((categories.get("skill-agent-metadata")?.estimatedTokens || 0) === 0) {
        fail("Token analyzer did not separate deferred skill agent metadata.");
      }
      const executableLayer = (baseline.topFiles || []).find((entry) => entry.category === "skill-executable-source")?.layer;
      if (executableLayer !== "repository_maintenance_size") {
        fail("Executable skill source must remain repository-maintenance size, not model context.");
      }
      const agentMetadataLayer = (baseline.topFiles || []).find((entry) => entry.category === "skill-agent-metadata")?.layer;
      if (agentMetadataLayer !== "invoked_or_deferred_surface") {
        fail("Skill agent metadata must remain an invoked/deferred context surface.");
      }
      const categoryTotal = (baseline.categories || []).reduce((sum, entry) => sum + entry.estimatedTokens, 0);
      const layerTotal = (baseline.layers || []).reduce((sum, entry) => sum + entry.estimatedTokens, 0);
      if (categoryTotal !== baseline.totals?.estimatedTokens || layerTotal !== baseline.totals?.estimatedTokens) {
        fail("Token analyzer category/layer totals do not reconcile with the overall estimate.");
      }
    }

    const trackedMissing = path.join(fixtureRoot, "tracked-missing.md");
    fs.writeFileSync(trackedMissing, "# Must remain visible to the audit\n", "utf8");
    const addMissing = spawnSync("git", ["add", "tracked-missing.md"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000
    });
    if (addMissing.error || addMissing.status !== 0) {
      fail(`Token analyzer missing-source fixture setup failed: ${addMissing.error?.message || addMissing.stderr || addMissing.stdout}`);
    } else {
      fs.unlinkSync(trackedMissing);
      const missingResult = spawnSync(
        process.execPath,
        [path.join(root, "scripts", "analyze-token-surfaces.mjs"), "--json"],
        { cwd: fixtureRoot, encoding: "utf8", windowsHide: true, timeout: 30000 }
      );
      if (missingResult.status === 0) {
        fail("Token analyzer must fail closed for a Git-enumerated source missing from the worktree.");
      } else {
        try {
          const report = JSON.parse(missingResult.stdout);
          if (report.schemaVersion !== "agentchef.cli-error.v1" || !report.error?.message?.includes("tracked-missing.md")) {
            fail("Token analyzer missing-source failure must identify the redacted Git-enumerated path.");
          }
          if (String(missingResult.stdout).includes(fixtureRoot)) {
            fail("Token analyzer missing-source failure must not disclose the absolute fixture root.");
          }
        } catch (error) {
          fail(`Token analyzer missing-source failure did not emit parseable JSON: ${error.message}`);
        }
      }
    }
  }
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

const noGitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-token-no-git-"));
try {
  fs.writeFileSync(path.join(noGitRoot, "README.md"), "# Fixture\n", "utf8");
  const failClosed = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "analyze-token-surfaces.mjs"), "--json"],
    { cwd: noGitRoot, encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  if (failClosed.status === 0) {
    fail("Token analyzer must fail closed when Git source enumeration is unavailable.");
  } else {
    try {
      const report = JSON.parse(failClosed.stdout);
      if (report.schemaVersion !== "agentchef.cli-error.v1" || report.tool !== "token-audit") {
        fail("Token analyzer Git failure must use the shared JSON error contract.");
      }
    } catch (error) {
      fail(`Token analyzer Git failure did not emit parseable JSON: ${error.message}`);
    }
  }

  const explicitFallback = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "analyze-token-surfaces.mjs"), "--json", "--allow-filesystem-fallback"],
    { cwd: noGitRoot, encoding: "utf8", windowsHide: true, timeout: 30000 }
  );
  if (explicitFallback.error || explicitFallback.status !== 0) {
    fail(`Token analyzer explicit filesystem fallback failed: ${explicitFallback.error?.message || explicitFallback.stderr || explicitFallback.stdout}`);
  } else {
    try {
      const report = JSON.parse(explicitFallback.stdout);
      if (report.sourceEnumeration?.mode !== "explicit-filesystem-fallback") {
        fail("Token analyzer must label explicit filesystem fallback mode.");
      }
    } catch (error) {
      fail(`Token analyzer explicit fallback did not emit JSON: ${error.message}`);
    }
  }
} finally {
  fs.rmSync(noGitRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Token surface validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Token surface validation passed.");
