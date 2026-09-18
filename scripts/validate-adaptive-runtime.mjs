#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function fail(message) {
  failures.push(message);
}

const agentsRel = "templates/codex/AGENTS.md";
const routingSkillRel = "plugins/codex-chef-workflows/skills/adaptive-agent-routing/SKILL.md";
const routingReferenceRel = "plugins/codex-chef-workflows/skills/adaptive-agent-routing/references/global-working-agreements.md";
const routingOpenAiRel = "plugins/codex-chef-workflows/skills/adaptive-agent-routing/agents/openai.yaml";

for (const rel of [agentsRel, routingSkillRel, routingReferenceRel, routingOpenAiRel]) {
  if (!exists(rel)) fail(`Missing adaptive routing surface: ${rel}`);
}

if (exists(agentsRel)) {
  const text = read(agentsRel);
  const lineCount = text.split(/\r?\n/).length;
  if (lineCount < 100 || lineCount > 160) {
    fail(`Compact global AGENTS.md must stay between 100 and 160 lines, got ${lineCount}.`);
  }
  for (const required of [
    "independent parallel work",
    "noisy logs or research",
    "the user explicitly requests delegation",
    "Routing plan:",
    "Routing result:",
    "adaptive-agent-routing",
    "preserve the active profile's model and reasoning choices"
  ]) {
    if (!text.includes(required)) fail(`Compact global AGENTS.md missing: ${required}`);
  }
  for (const forbidden of ["Agent started", "Skill selected", "MCP selected", "Routing Profile Summary"]) {
    if (text.includes(forbidden)) fail(`Compact global AGENTS.md must defer repeated routing narration: ${forbidden}`);
  }
}

if (exists(routingReferenceRel)) {
  const reference = read(routingReferenceRel);
  for (const required of [
    "repo-map-before-change",
    "current-docs-research",
    "bounded-feature",
    "frontend-ui",
    "security-sensitive",
    "release-or-publish",
    "code_mapper",
    "release_verifier",
    "context-engineering-project-starter -> ai-project-starter",
    "codex-skill-forge -> ai-skill-create",
    "codex-enterprise-prompt-architect -> prompt-architect"
  ]) {
    if (!reference.includes(required)) fail(`Deferred routing reference missing: ${required}`);
  }
}

if (exists("catalog/routing-profiles.json")) {
  const routing = JSON.parse(read("catalog/routing-profiles.json"));
  if (routing.version !== "0.3.0") fail("Routing catalog must use schema version 0.3.0.");
  if (routing.delegationPolicy?.mode !== "conditional") fail("Routing catalog must define conditional delegation.");
  if (routing.delegationPolicy?.capacityCeiling !== 10) fail("Routing capacity ceiling must preserve max_threads=10.");
  if (routing.delegationPolicy?.recommendedParallelism?.max !== 4) fail("Recommended parallelism must cap normal routing at four agents.");
  if (routing.agentRuntimePolicy?.modelSelection !== "inherit-profile-adaptive") {
    fail("Routing catalog must preserve profile-inherited adaptive agent model selection.");
  }
  for (const profile of routing.profiles || []) {
    if (profile.delegationMode !== "conditional") fail(`Route must use conditional delegation: ${profile.id}`);
    if (profile.skillMode !== "narrowest-owner") fail(`Route must select one owning skill by default: ${profile.id}`);
  }
}

if (exists("catalog/skills.json")) {
  const catalog = JSON.parse(read("catalog/skills.json"));
  const aliases = catalog.compatibilityAliases || {};
  const expected = {
    "context-engineering-project-starter": "ai-project-starter",
    "codex-skill-forge": "ai-skill-create",
    "codex-enterprise-prompt-architect": "prompt-architect"
  };
  for (const [alias, canonical] of Object.entries(expected)) {
    if (aliases[alias] !== canonical) fail(`Skill alias ${alias} must resolve to ${canonical}.`);
  }
}

if (exists("catalog/agents.json")) {
  const catalog = JSON.parse(read("catalog/agents.json"));
  for (const agent of catalog.agents || []) {
    if (agent.modelSelection !== "auto" || agent.modelReasoningEffort !== "auto") {
      fail(`Agent must retain automatic inherited model/reasoning selection: ${agent.name}`);
    }
    if (agent.neverOverrideUserProfile !== true) fail(`Agent must preserve user profile choice: ${agent.name}`);
  }
}

if (exists("catalog/mcp-servers.json")) {
  const catalog = JSON.parse(read("catalog/mcp-servers.json"));
  for (const server of catalog.servers || []) {
    if (server.enabledTools && !server.toolApprovals) fail(`MCP ${server.name} must catalog per-tool approvals.`);
  }
}

if (exists("scripts/analyze-token-surfaces.mjs")) {
  const analyzer = read("scripts/analyze-token-surfaces.mjs");
  for (const required of [
    "codex-chef.token-surfaces.v2",
    "always_loaded_instruction_estimate",
    "registered_conditional_surface",
    "invoked_or_deferred_surface",
    "repository_maintenance_size",
    "not provider billing or measured session usage"
  ]) {
    if (!analyzer.includes(required)) fail(`Layered token audit missing: ${required}`);
  }
}

if (exists("scripts/verify-install-runtime.mjs")) {
  const verifier = read("scripts/verify-install-runtime.mjs");
  for (const required of [
    "--probe-timeout-ms",
    "--doctor-timeout-ms",
    "--mcp-timeout-ms",
    "--offline",
    "--no-mcp-probe",
    "--require-live-runtime",
    "probes"
  ]) {
    if (!verifier.includes(required)) fail(`Runtime verifier missing bounded probe control: ${required}`);
  }
}

if (!exists("scripts/lib/platform-command.mjs")) {
  fail("Missing shared Windows-aware command resolver: scripts/lib/platform-command.mjs");
} else {
  const helper = read("scripts/lib/platform-command.mjs");
  for (const required of ["npm.cmd", "npx.cmd", "codex.cmd"]) {
    if (!helper.includes(required)) fail(`Platform command resolver missing ${required}.`);
  }
}

if (exists("scripts/repair-install.mjs") && !read("scripts/repair-install.mjs").includes("--migrate-legacy-profile-pins")) {
  fail("Repair must expose a backup-backed legacy profile pin migration flag.");
}

if (exists("manifests/install-plan.json")) {
  const manifest = read("manifests/install-plan.json");
  for (const required of ["user-owned overlay", "project trust", "preserved outside Force"]) {
    if (!manifest.includes(required)) fail(`Install ownership contract missing: ${required}`);
  }
}

if (failures.length > 0) {
  console.error("Adaptive runtime validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Adaptive runtime validation passed.");
