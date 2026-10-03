#!/usr/bin/env node
// Cross-catalog correlation checks. Each catalog has its own validator; this
// one checks that the names one catalog uses resolve in another:
//
//   1. Every routing-profile skill is a harness skill (bundled or pinned) and
//      every routing-profile MCP server is cataloged.
//   2. Every compatibility alias targets a harness skill.
//   3. Every retired skill names replacements that resolve to a harness skill
//      or an agent role.
//   4. No catalog skill reason or bundled SKILL.md description exceeds 400
//      characters.
//   5. Every coordinator worker is a defined specialist.
//   6. The Codex and Claude plugin manifests agree on name, version, and
//      description.
//
// Usage: node scripts/validate-catalog-correlation.mjs [--root <dir>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_DESCRIPTION_LENGTH = 400;

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

export function frontmatterDescription(text) {
  const match = String(text).match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return "";
  const line = match[1].match(/^description:\s*(.*)$/m);
  if (!line) return "";
  let value = line[1].trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

export function collectCorrelationFailures(root) {
  const failures = [];
  const fail = (message) => failures.push(message);

  const skillCatalog = readJson(root, "catalog/skills.json");
  const routing = readJson(root, "catalog/routing-profiles.json");
  const agents = readJson(root, "catalog/agents.json");
  const mcp = readJson(root, "catalog/mcp-servers.json");
  const skills = skillCatalog.skills || [];

  const harnessSkills = new Set(
    skills.filter((skill) => skill.install === true || skill.directInstall === true).map((skill) => skill.name)
  );
  const specialists = new Set((agents.agents || []).map((agent) => agent.name));
  const coordinators = new Set((agents.coordinators || []).map((coordinator) => coordinator.name));
  const roles = new Set([...specialists, ...coordinators]);
  const mcpServers = new Set((mcp.servers || []).map((server) => server.name));

  // 1. Routing profiles.
  for (const profile of routing.profiles || []) {
    for (const skill of profile.skills || []) {
      if (!harnessSkills.has(skill)) {
        fail(`routing profile ${profile.id} names ${skill}, which is not a harness skill (bundled or pinned)`);
      }
    }
    for (const server of profile.mcp || []) {
      if (!mcpServers.has(server)) {
        fail(`routing profile ${profile.id} names MCP server ${server}, which is not cataloged`);
      }
    }
  }

  // 2. Compatibility aliases.
  const catalogNames = new Set(skills.map((skill) => skill.name));
  for (const [alias, target] of Object.entries(skillCatalog.compatibilityAliases || {})) {
    if (!harnessSkills.has(target)) {
      fail(`compatibility alias ${alias} targets ${target}, which is not a harness skill`);
    }
    if (catalogNames.has(alias)) {
      fail(`compatibility alias ${alias} is also a catalog entry; an alias replaces the entry`);
    }
  }

  // 3. Retired entries.
  for (const skill of skills) {
    if (skill.retired !== true) continue;
    if (skill.install === true || skill.directInstall === true) {
      fail(`retired skill ${skill.name} must not be installable`);
    }
    if (!Array.isArray(skill.replacedBy) || skill.replacedBy.length === 0) {
      fail(`retired skill ${skill.name} must name replacedBy`);
      continue;
    }
    for (const replacement of skill.replacedBy) {
      if (!harnessSkills.has(replacement) && !roles.has(replacement)) {
        fail(`retired skill ${skill.name} is replaced by ${replacement}, which is neither a harness skill nor an agent role`);
      }
    }
  }

  // 4. Description length.
  for (const skill of skills) {
    if (String(skill.reason || "").length > MAX_DESCRIPTION_LENGTH) {
      fail(`catalog skill ${skill.name} reason is ${skill.reason.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}`);
    }
  }
  const bundledRoot = path.join(root, "plugins", "agentchef", "skills");
  if (fs.existsSync(bundledRoot)) {
    for (const entry of fs.readdirSync(bundledRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(bundledRoot, entry.name, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const description = frontmatterDescription(fs.readFileSync(skillFile, "utf8"));
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        fail(`bundled skill ${entry.name} description is ${description.length} characters; the limit is ${MAX_DESCRIPTION_LENGTH}`);
      }
    }
  }

  // 5. Coordinator workers.
  for (const coordinator of agents.coordinators || []) {
    for (const worker of coordinator.workers || []) {
      if (!specialists.has(worker)) {
        fail(`coordinator ${coordinator.name} lists worker ${worker}, which is not a defined specialist`);
      }
    }
  }

  // 6. Plugin manifests.
  const codexManifestPath = "plugins/agentchef/.codex-plugin/plugin.json";
  const claudeManifestPath = "plugins/agentchef/.claude-plugin/plugin.json";
  if (!fs.existsSync(path.join(root, codexManifestPath)) || !fs.existsSync(path.join(root, claudeManifestPath))) {
    fail("both plugin manifests must exist (.codex-plugin and .claude-plugin)");
  } else {
    const codexManifest = readJson(root, codexManifestPath);
    const claudeManifest = readJson(root, claudeManifestPath);
    for (const key of ["name", "version", "description"]) {
      if (codexManifest[key] !== claudeManifest[key]) {
        fail(`plugin manifests disagree on ${key}: codex=${JSON.stringify(codexManifest[key])} claude=${JSON.stringify(claudeManifest[key])}`);
      }
    }
  }

  return failures;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const rootIndex = process.argv.indexOf("--root");
  const root = path.resolve(rootIndex > 0 ? process.argv[rootIndex + 1] : process.cwd());
  const failures = collectCorrelationFailures(root);
  if (failures.length > 0) {
    console.error("Catalog correlation validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Catalog correlation validation passed.");
}
