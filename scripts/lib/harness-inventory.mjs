// One map of the AgentChef harness on this machine: every skill, agent role,
// and MCP server, where it comes from, and its state on each target. The same
// function feeds `chef --inventory`, and its totals are what the docs and the
// status surfaces count, so the numbers can only disagree with the catalog,
// never with each other.
//
// Classification of a name found on disk (first match wins):
//   1. in the plugin            -> harness
//   2. cataloged, install:false -> optional
//   3. retired in the catalog   -> retired
//   4. an alias key or a former AgentChef name -> legacy-name
//   5. anything else            -> user
// and these states on top: shadowed (another definition outranks the
// harness one), drifted (a cache differs from its source), migration-pending
// (a 1.0-1.2 copy is still in place), broken-link, missing.
import fs from "node:fs";
import path from "node:path";
import { inspectClaudePluginCache } from "./claude-plugin-cache.mjs";
import { identity, retiredPluginNames } from "./identity.mjs";
import { inspectPinnedSkillOwnership } from "./skill-provenance.mjs";
import { cacheContentDrift } from "../refresh-installed-plugin.mjs";

const directSkillMarkers = [".agentchef-managed.json", ".codex-chef-managed.json"];

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return fallback;
  }
}

function kebab(name) {
  return name.replace(/_/g, "-");
}

function listEntries(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
  } catch {
    return [];
  }
}

// A directory, a symlink, or a junction; a link whose target is gone is broken.
function entryState(dir, entry) {
  const full = path.join(dir, entry.name);
  let stat;
  try {
    stat = fs.lstatSync(full);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) return fs.existsSync(full) ? "link" : "broken-link";
  return stat.isDirectory() ? "directory" : "file";
}

function codexMcpTables(configText) {
  const tables = new Map();
  let current = null;
  for (const line of String(configText || "").replace(/\r\n/g, "\n").split("\n")) {
    const header = /^\s*\[\s*mcp_servers\.([A-Za-z0-9_-]+)\s*\]\s*(#.*)?$/.exec(line);
    if (header) {
      current = header[1];
      tables.set(current, { enabled: true });
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = null;
      continue;
    }
    const enabled = current && /^\s*enabled\s*=\s*(true|false)\s*(#.*)?$/.exec(line);
    if (enabled) tables.get(current).enabled = enabled[1] === "true";
  }
  return tables;
}

export function loadHarnessCatalog(repoRoot) {
  const skills = readJson(path.join(repoRoot, "catalog", "skills.json"), { skills: [] });
  const agents = readJson(path.join(repoRoot, "catalog", "agents.json"), { agents: [], coordinators: [] });
  const mcp = readJson(path.join(repoRoot, "catalog", "mcp-servers.json"), { servers: [] });
  const retiredTables = readJson(path.join(repoRoot, "templates", "codex", "retired-tables.json"), { tables: {} });
  const retiredFiles = readJson(path.join(repoRoot, "templates", "codex", "retired-files.json"), { files: {} });
  const bundled = skills.skills.filter((skill) => skill.directInstall === true).map((skill) => skill.name);
  const pinned = skills.skills.filter((skill) => skill.install === true).map((skill) => skill.name);
  return {
    harnessSkills: new Set([...bundled, ...pinned]),
    bundledSkills: new Set(bundled),
    pinnedSkills: new Set(pinned),
    pinnedSkillEntries: new Map(skills.skills.filter((skill) => skill.install === true).map((skill) => [skill.name, skill])),
    optionalSkills: new Set(skills.skills.filter((skill) => skill.install === false && skill.directInstall !== true && skill.retired !== true).map((skill) => skill.name)),
    retiredSkills: new Set(skills.skills.filter((skill) => skill.retired === true).map((skill) => skill.name)),
    legacySkillNames: new Set([...Object.keys(skills.compatibilityAliases || {}), identity.legacyOperatorSkill].filter(Boolean)),
    roles: [...agents.agents.map((agent) => ({ name: agent.name, type: "specialist" })), ...(agents.coordinators || []).map((coordinator) => ({ name: coordinator.name, type: "coordinator" }))],
    mcpServers: mcp.servers,
    retiredMcpServers: new Set(Object.keys(retiredTables.tables || {}).filter((name) => /^mcp_servers\.[^.]+$/.test(name)).map((name) => name.slice("mcp_servers.".length))),
    retiredRoleFiles: new Set(Object.keys(retiredFiles.files || {}).map((relative) => path.basename(relative, ".toml")))
  };
}

function classifyName(name, catalog) {
  if (catalog.harnessSkills.has(name)) return "harness";
  if (catalog.optionalSkills.has(name)) return "optional";
  if (catalog.retiredSkills.has(name)) return "retired";
  if (catalog.legacySkillNames.has(name) || retiredPluginNames.includes(name)) return "legacy-name";
  return "user";
}

// AgentChef's own 1.0-1.2 copy: a direct-skill marker or pinned provenance.
function isAgentChefCopy(dir, name, catalog) {
  if (directSkillMarkers.some((marker) => fs.existsSync(path.join(dir, marker)))) return true;
  const pinned = catalog.pinnedSkillEntries.get(name);
  return Boolean(pinned) && inspectPinnedSkillOwnership(dir, { package: pinned.package, skill: pinned.skill || pinned.name }).valid;
}

function inventorySkills(catalog, homes, targets) {
  const rows = new Map();
  const row = (name) => {
    if (!rows.has(name)) rows.set(name, { kind: "skill", name, source: classifyName(name, catalog), codex: "-", claude: "-", notes: [] });
    return rows.get(name);
  };
  const pluginSkills = path.join(homes.pluginSource, "skills");
  const inPlugin = new Set(listEntries(pluginSkills).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const name of catalog.harnessSkills) {
    const entry = row(name);
    entry.source = catalog.bundledSkills.has(name) ? "plugin (bundled)" : "plugin (pinned)";
    const state = inPlugin.has(name) ? "installed" : "missing";
    if (targets.includes("codex")) entry.codex = state;
    if (targets.includes("claude")) entry.claude = state;
  }
  for (const name of inPlugin) {
    if (!catalog.harnessSkills.has(name)) {
      const entry = row(name);
      entry.notes.push("extra file in the plugin source");
    }
  }
  const roots = [
    ...(targets.includes("codex") ? [["codex", path.join(homes.agentsHome, "skills")], ["codex", path.join(homes.codexHome, "skills")]] : []),
    ...(targets.includes("claude") ? [["claude", path.join(homes.claudeHome, "skills")]] : [])
  ];
  for (const [target, dir] of roots) {
    for (const dirent of listEntries(dir)) {
      const state = entryState(dir, dirent);
      if (!state || state === "file") continue;
      const entry = row(dirent.name);
      let value;
      if (state === "broken-link") value = "broken-link";
      else if (entry.source.startsWith("plugin")) {
        value = isAgentChefCopy(path.join(dir, dirent.name), dirent.name, catalog) || state === "link" ? "migration-pending" : "shadowed";
      } else value = entry.source === "user" ? "user" : entry.source;
      // A harness skill keeps its worst state; a second root only adds a note.
      if (["-", "installed", "missing"].includes(entry[target])) entry[target] = value;
      entry.notes.push(`${target}: ${path.basename(path.dirname(dir))}/${path.basename(dir)}/${dirent.name}`);
    }
  }
  return [...rows.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function inventoryAgents(catalog, homes, targets) {
  const rows = [];
  const codexAgents = path.join(homes.codexHome, "agents");
  const pluginAgents = path.join(homes.pluginSource, "agents");
  const claudeUserAgents = path.join(homes.claudeHome, "agents");
  const known = new Set();
  for (const role of catalog.roles) {
    known.add(role.name);
    const entry = { kind: "agent", name: role.name, source: `plugin (${role.type})`, codex: "-", claude: "-", notes: [] };
    if (targets.includes("codex")) entry.codex = fs.existsSync(path.join(codexAgents, `${role.name}.toml`)) ? "installed" : "missing";
    if (targets.includes("claude")) {
      const fromPlugin = fs.existsSync(path.join(pluginAgents, `${kebab(role.name)}.md`));
      entry.claude = fs.existsSync(path.join(claudeUserAgents, `${kebab(role.name)}.md`)) ? "shadowed" : fromPlugin ? "installed" : "missing";
    }
    rows.push(entry);
  }
  if (targets.includes("codex")) {
    for (const dirent of listEntries(codexAgents)) {
      const name = dirent.name.replace(/\.toml$/, "");
      if (!dirent.name.endsWith(".toml") || known.has(name)) continue;
      rows.push({ kind: "agent", name, source: catalog.retiredRoleFiles.has(name) ? "retired" : "user", codex: catalog.retiredRoleFiles.has(name) ? "migration-pending" : "user", claude: "-", notes: [] });
    }
  }
  if (targets.includes("claude")) {
    const knownKebab = new Set([...known].map(kebab));
    for (const dirent of listEntries(claudeUserAgents)) {
      const name = dirent.name.replace(/\.md$/, "");
      if (!dirent.name.endsWith(".md") || knownKebab.has(name)) continue;
      rows.push({ kind: "agent", name, source: "user", codex: "-", claude: "user", notes: [] });
    }
  }
  return rows;
}

function inventoryMcp(catalog, homes, targets) {
  const rows = new Map();
  const codexTables = codexMcpTables((() => { try { return fs.readFileSync(path.join(homes.codexHome, "config.toml"), "utf8"); } catch { return ""; } })());
  const claudeDocument = readJson(homes.claudeJson, {}) || {};
  const claudeUser = claudeDocument.mcpServers && typeof claudeDocument.mcpServers === "object" ? claudeDocument.mcpServers : {};
  const pluginMcp = readJson(path.join(homes.pluginSource, "mcp", "claude.mcp.json"), { mcpServers: {} })?.mcpServers || {};
  for (const server of catalog.mcpServers) {
    const entry = { kind: "mcp", name: server.name, source: server.claudeSource === "plugin" ? "catalog + plugin" : "catalog", codex: "-", claude: "-", notes: [] };
    if (targets.includes("codex")) {
      const table = codexTables.get(server.name);
      entry.codex = !table ? "not-configured" : table.enabled ? "enabled" : "disabled";
    }
    if (targets.includes("claude")) {
      if (server.claudeSource === "plugin") {
        entry.claude = Object.hasOwn(claudeUser, server.name) ? "shadowed" : Object.hasOwn(pluginMcp, server.name) ? "plugin" : "missing";
      } else {
        entry.claude = Object.hasOwn(claudeUser, server.name) ? "user-added" : "not-configured";
      }
    }
    rows.set(server.name, entry);
  }
  const extra = (name, target, value) => {
    if (!rows.has(name)) rows.set(name, { kind: "mcp", name, source: catalog.retiredMcpServers.has(name) ? "retired" : "user", codex: "-", claude: "-", notes: [] });
    rows.get(name)[target] = value;
  };
  if (targets.includes("codex")) {
    for (const [name, table] of codexTables) {
      if (!rows.has(name) || rows.get(name).source === "user" || rows.get(name).source === "retired") {
        extra(name, "codex", catalog.retiredMcpServers.has(name) ? "migration-pending" : table.enabled ? "user (enabled)" : "user (disabled)");
      }
    }
  }
  if (targets.includes("claude")) {
    for (const name of Object.keys(claudeUser)) {
      if (!catalog.mcpServers.some((server) => server.name === name)) extra(name, "claude", catalog.retiredMcpServers.has(name) ? "retired" : "user");
    }
  }
  return [...rows.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function pluginDrift(homes, targets) {
  const drift = {};
  const source = homes.pluginSource;
  const version = readJson(path.join(source, ".codex-plugin", "plugin.json"), {})?.version || null;
  if (targets.includes("codex") && version) {
    const files = cacheContentDrift({ source: { source: "local", path: source }, marketplaceName: identity.marketplaceName, name: path.basename(source), version }, homes.codexHome);
    drift.codex = files.length;
  }
  if (targets.includes("claude")) {
    const claude = inspectClaudePluginCache(homes.claudeHome, homes.agentsHome);
    drift.claude = claude.inspected ? claude.stale.reduce((sum, item) => sum + item.differing, 0) + (claude.versionMismatch ? 1 : 0) : null;
  }
  return drift;
}

const issueStates = new Set(["missing", "shadowed", "migration-pending", "broken-link"]);

// The plugin's marketplace source; a 1.0-1.2 install still has it under a
// former name until --migrate-identity runs.
function resolvePluginSource(agentsHome) {
  for (const name of [identity.pluginName, ...retiredPluginNames]) {
    const candidate = path.join(agentsHome, "plugins", "sources", name);
    if (fs.existsSync(candidate)) return { path: candidate, legacy: name !== identity.pluginName };
  }
  return { path: path.join(agentsHome, "plugins", "sources", identity.pluginName), legacy: false };
}

export function buildHarnessInventory({ repoRoot, homes: givenHomes, targets = ["codex", "claude"] }) {
  const catalog = loadHarnessCatalog(repoRoot);
  const pluginSource = resolvePluginSource(givenHomes.agentsHome);
  const homes = { ...givenHomes, pluginSource: pluginSource.path };
  const rows = [
    ...inventorySkills(catalog, homes, targets),
    ...inventoryAgents(catalog, homes, targets),
    ...inventoryMcp(catalog, homes, targets)
  ];
  const expected = {
    skills: catalog.harnessSkills.size,
    bundledSkills: catalog.bundledSkills.size,
    pinnedSkills: catalog.pinnedSkills.size,
    agents: catalog.roles.length,
    specialists: catalog.roles.filter((role) => role.type === "specialist").length,
    coordinators: catalog.roles.filter((role) => role.type === "coordinator").length,
    mcp: catalog.mcpServers.length,
    codexMcpDefault: catalog.mcpServers.filter((server) => server.defaultEnabled === true).length,
    claudePluginMcp: catalog.mcpServers.filter((server) => server.claudeSource === "plugin").length
  };
  const harnessRows = rows.filter((row) => row.source.startsWith("plugin") || row.source.startsWith("catalog"));
  const found = {};
  for (const target of targets) {
    found[target] = {
      skills: rows.filter((row) => row.kind === "skill" && row.source.startsWith("plugin") && row[target] !== "missing").length,
      agents: rows.filter((row) => row.kind === "agent" && row.source.startsWith("plugin") && row[target] !== "missing").length,
      mcp: rows.filter((row) => row.kind === "mcp" && row.source.startsWith("catalog") && (target === "codex" ? row.codex !== "not-configured" : row.claude === "plugin" || row.claude === "shadowed" || row.claude === "user-added")).length
    };
  }
  const issues = {};
  for (const state of issueStates) {
    issues[state] = rows.reduce((count, row) => count + targets.filter((target) => row[target] === state).length, 0);
  }
  const drift = pluginDrift(homes, targets);
  issues.drifted = Object.values(drift).reduce((sum, value) => sum + (value || 0), 0);
  const installed = fs.existsSync(pluginSource.path);
  if (pluginSource.legacy) issues["legacy-plugin-name"] = 1;
  const complete = installed && targets.every((target) => found[target].skills === expected.skills && found[target].agents === expected.agents);
  return {
    schemaVersion: "agentchef.harness-inventory.v1",
    targets,
    installed,
    legacyPluginSource: pluginSource.legacy ? path.basename(pluginSource.path) : null,
    complete,
    expected,
    found,
    issues,
    drift,
    harnessRowCount: harnessRows.length,
    rows
  };
}
