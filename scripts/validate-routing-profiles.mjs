#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function normalizedIdentity(value) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function validateNamedCatalog(items, label) {
  if (!Array.isArray(items)) {
    fail(`${label} catalog must be an array.`);
    return new Set();
  }
  const names = new Set();
  for (const item of items) {
    if (typeof item?.name !== "string" || !item.name.trim()) {
      fail(`${label} catalog entries must declare non-empty names.`);
      continue;
    }
    const normalized = normalizedIdentity(item.name);
    if (names.has(normalized)) fail(`duplicate ${label} catalog name: ${item.name}`);
    names.add(normalized);
  }
  return names;
}

function validatedProfileList(profile, field, label) {
  const value = profile[field];
  if (!Array.isArray(value)) {
    fail(`routing profile ${field} must be an array: ${profile.id || "<unknown>"}`);
    return [];
  }
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) {
      fail(`routing profile ${profile.id || "<unknown>"} ${field} must contain non-empty strings.`);
      continue;
    }
    const normalized = normalizedIdentity(entry);
    if (seen.has(normalized)) fail(`routing profile ${profile.id || "<unknown>"} has duplicate ${label}: ${entry}`);
    seen.add(normalized);
  }
  return value;
}

const routing = readJson("catalog/routing-profiles.json");
const agents = readJson("catalog/agents.json");
const mcp = readJson("catalog/mcp-servers.json");
const skills = readJson("catalog/skills.json");
const agentsTemplate = fs.readFileSync(path.join(root, "templates/codex/AGENTS.md"), "utf8");
const routingBoardScript = fs.readFileSync(path.join(root, "scripts/codex-routing-board.mjs"), "utf8");
const routingReference = fs.readFileSync(path.join(root, "plugins/codex-chef-workflows/skills/adaptive-agent-routing/references/global-working-agreements.md"), "utf8");

const agentNames = validateNamedCatalog(agents.agents, "agent");
const mcpNames = new Set((mcp.servers || []).map((server) => server.name));
const catalogSkillNames = validateNamedCatalog(skills.skills, "skill");
const localSkillRoot = path.join(root, "plugins", "codex-chef-workflows", "skills");
const localSkillNames = fs.existsSync(localSkillRoot)
  ? new Set(fs.readdirSync(localSkillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name))
  : new Set();
const allowedSkills = new Set([...catalogSkillNames, ...localSkillNames]);
const allowedDelegationModes = new Set(["conditional"]);
const allowedSkillModes = new Set(["narrowest-owner"]);
const allowedMcpModes = new Set(["use-when-available-and-approved", "optional", "none"]);

if (routing.version !== "0.3.0") fail("routing profile catalog version must be 0.3.0.");
if (!Array.isArray(routing.profiles) || routing.profiles.length < 10) {
  fail("routing profile catalog must define at least 10 enterprise task-shape profiles.");
}
if (routing.delegationPolicy?.mode !== "conditional" || routing.delegationPolicy?.capacityCeiling !== 10) {
  fail("routing catalog must define conditional delegation with capacity ceiling 10.");
}
if (routing.delegationPolicy?.recommendedParallelism?.max !== 4) {
  fail("routing catalog must normally cap one task at four agents.");
}
if (routing.agentRuntimePolicy?.modelSelection !== "inherit-profile-adaptive"
  || routing.agentRuntimePolicy?.neverOverrideUserProfile !== true) {
  fail("routing catalog must preserve adaptive profile-inherited model selection.");
}

for (const required of [
  "independent parallel work",
  "noisy logs or research",
  "the user explicitly requests delegation",
  "Routing plan:",
  "Routing result:",
  "adaptive-agent-routing"
]) {
  const normalizedTemplate = agentsTemplate.replace(/\s+/g, " ");
  const normalizedRequired = required.replace(/\s+/g, " ");
  if (!agentsTemplate.includes(required) && !normalizedTemplate.includes(normalizedRequired)) {
    fail(`templates/codex/AGENTS.md missing subagent visibility contract snippet: ${required}`);
  }
}

for (const required of [
  "Routing plan",
  "Routing result",
  "Delegation mode",
  "Skill mode",
  "MCP mode",
  "Privilege delta",
  "Validation",
  "Rollback"
]) {
  if (!routingBoardScript.includes(required)) {
    fail(`scripts/codex-routing-board.mjs missing routing visibility output snippet: ${required}`);
  }
}

const seenIds = new Set();
for (const profile of routing.profiles || []) {
  for (const key of ["id", "title", "trigger", "match", "agents", "skills", "mcp", "flags", "delegationMode", "skillMode", "mcpMode", "evidence", "boundary", "owner", "primarySurface", "durability", "privilegeDelta", "validationGate", "rollback"]) {
    if (!Object.prototype.hasOwnProperty.call(profile, key)) {
      fail(`routing profile missing ${key}: ${profile.id || "<unknown>"}`);
    }
  }
  if (!/^[a-z0-9-]+$/.test(profile.id || "")) fail(`routing profile id must be kebab-case: ${profile.id}`);
  if (seenIds.has(profile.id)) fail(`duplicate routing profile id: ${profile.id}`);
  seenIds.add(profile.id);

  const profileAgents = validatedProfileList(profile, "agents", "agent");
  const profileSkills = validatedProfileList(profile, "skills", "skill");
  const profileMcp = validatedProfileList(profile, "mcp", "MCP server");
  const profileFlags = validatedProfileList(profile, "flags", "flag");

  if (!Number.isInteger(profile.match?.priority) || profile.match.priority < 0 || profile.match.priority > 100) {
    fail(`routing profile match.priority must be an integer from 0 to 100: ${profile.id}`);
  }
  for (const key of ["phrases", "terms", "excludeTerms"]) {
    if (!Array.isArray(profile.match?.[key])) fail(`routing profile match.${key} must be an array: ${profile.id}`);
  }
  if ((profile.match?.phrases?.length || 0) + (profile.match?.terms?.length || 0) < 3) {
    fail(`routing profile match needs at least three positive signals: ${profile.id}`);
  }
  for (const [kind, signals] of [["phrases", profile.match?.phrases], ["terms", profile.match?.terms]]) {
    const seenSignals = new Set();
    for (const signal of signals || []) {
      if (!Array.isArray(signal) || signal.length !== 2 || typeof signal[0] !== "string" || !signal[0].trim() || !Number.isInteger(signal[1]) || signal[1] <= 0) {
        fail(`routing profile match.${kind} entries must be [non-empty string, positive integer]: ${profile.id}`);
        continue;
      }
      const normalized = signal[0].normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
      if (seenSignals.has(normalized)) fail(`routing profile match.${kind} has duplicate signal: ${profile.id} (${signal[0]})`);
      seenSignals.add(normalized);
    }
  }
  for (const term of profile.match?.excludeTerms || []) {
    if (typeof term !== "string" || !term.trim()) fail(`routing profile match.excludeTerms must contain non-empty strings: ${profile.id}`);
  }

  if (profileAgents.length === 0) {
    fail(`routing profile must name at least one agent: ${profile.id}`);
  }
  for (const agent of profileAgents) {
    if (!agentNames.has(normalizedIdentity(agent))) fail(`routing profile ${profile.id} references unknown agent: ${agent}`);
  }

  for (const skill of profileSkills) {
    if (!allowedSkills.has(skill)) fail(`routing profile ${profile.id} references unknown skill: ${skill}`);
  }

  for (const server of profileMcp) {
    if (!mcpNames.has(server)) fail(`routing profile ${profile.id} references unknown MCP server: ${server}`);
  }

  if (profileFlags.length === 0) {
    fail(`routing profile must name at least one flag/config mode: ${profile.id}`);
  }
  const flags = new Set(profileFlags);
  if (flags.has("sandbox:read-only") && flags.has("workspace-write")) {
    fail(`${profile.id} cannot combine read-only routing with workspace-write.`);
  }
  if (flags.has("profile:review") && flags.has("approval:on-request")) {
    fail(`${profile.id} cannot combine profile:review with approval:on-request.`);
  }
  if (!allowedDelegationModes.has(profile.delegationMode)) {
    fail(`routing profile ${profile.id} has invalid delegationMode: ${profile.delegationMode}`);
  }
  if (profileAgents.length > 0 && profile.delegationMode === "none") {
    fail(`routing profile ${profile.id} names agents but sets delegationMode=none`);
  }
  if (profileAgents.length > 0 && profile.delegationMode !== "conditional") {
    fail(`routing profile ${profile.id} must use conditional specialist delegation.`);
  }
  if (!allowedSkillModes.has(profile.skillMode)) {
    fail(`routing profile ${profile.id} has invalid skillMode: ${profile.skillMode}`);
  }
  if (profileSkills.length > 0 && profile.skillMode === "none") {
    fail(`routing profile ${profile.id} names skills but sets skillMode=none`);
  }
  if (!allowedMcpModes.has(profile.mcpMode)) {
    fail(`routing profile ${profile.id} has invalid mcpMode: ${profile.mcpMode}`);
  }
  if (profileMcp.length > 0 && profile.mcpMode === "none") {
    fail(`routing profile ${profile.id} names MCP servers but sets mcpMode=none`);
  }
  if (!Array.isArray(profile.evidence) || profile.evidence.length < 2) {
    fail(`routing profile must include at least two evidence signals: ${profile.id}`);
  }
  if (!profile.boundary || profile.boundary.length < 40) {
    fail(`routing profile boundary must be explicit: ${profile.id}`);
  }
  for (const key of ["owner", "primarySurface", "durability", "privilegeDelta", "validationGate", "rollback"]) {
    if (typeof profile[key] !== "string" || profile[key].length < 12) {
      fail(`routing profile ${key} must be explicit: ${profile.id}`);
    }
  }
  if (!routingReference.includes(`\`${profile.id}\``)) {
    fail(`deferred routing reference must expose routing profile id: ${profile.id}`);
  }
  if (profile.id === "data-systems") {
    const handoffs = profile.crossDomainHandoffs;
    if (!Array.isArray(handoffs) || handoffs.length !== 1
      || handoffs[0]?.toCoordinator !== "backend_coordinator"
      || handoffs[0]?.via !== "parent-routed-handoff"
      || typeof handoffs[0]?.when !== "string" || handoffs[0].when.length < 24
      || typeof handoffs[0]?.action !== "string" || handoffs[0].action.length < 48) {
      fail("data-systems must expose one explicit parent-routed cross-domain handoff.");
    }
  }
}

for (const required of [
  "current-docs-research",
  "evidence-backed-research",
  "context-surface-decision",
  "bug-root-cause",
  "frontend-ui",
  "security-sensitive",
  "mcp-connector-change",
  "release-or-publish",
  "starter-health"
]) {
  if (!seenIds.has(required)) fail(`routing profile catalog missing required profile: ${required}`);
}

if (failures.length > 0) {
  console.error("Routing profile validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Routing profile validation passed. Checked ${routing.profiles.length} profiles.`);
