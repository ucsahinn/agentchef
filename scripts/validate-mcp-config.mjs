#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];

const catalogPath = path.join(root, "catalog", "mcp-servers.json");
const configFiles = [
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml"
];
const ignoredDirs = new Set([".git", ".serena", "node_modules", "dist", "build", "coverage", ".next", "tmp", "temp"]);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function parseMcpBlocks(text) {
  const blocks = new Map();
  const lines = text.split(/\r?\n/);
  let currentName = null;
  let currentLines = [];

  function flush() {
    if (currentName) {
      blocks.set(currentName, `${currentLines.join("\n")}\n`);
    }
  }

  for (const line of lines) {
    const heading = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/);
    if (heading) {
      flush();
      currentName = heading[1];
      currentLines = [];
      continue;
    }
    if (currentName && /^\[/.test(line)) {
      flush();
      currentName = null;
      currentLines = [];
      continue;
    }
    if (currentName) currentLines.push(line);
  }
  flush();

  return blocks;
}

function parseToolApprovalBlocks(text) {
  const approvals = new Map();
  const pattern = /^\[mcp_servers\.([A-Za-z0-9_-]+)\.tools\.([A-Za-z0-9_.-]+)\]\s*\r?\napproval_mode\s*=\s*"(approve|prompt)"/gm;
  for (const match of text.matchAll(pattern)) {
    const serverApprovals = approvals.get(match[1]) || new Map();
    serverApprovals.set(match[2], match[3]);
    approvals.set(match[1], serverApprovals);
  }
  return approvals;
}

function parseTomlTable(text, tableName) {
  const lines = text.split(/\r?\n/);
  const heading = `[${tableName}]`;
  const values = [];
  let collecting = false;

  for (const line of lines) {
    if (line.trim() === heading) {
      collecting = true;
      continue;
    }
    if (collecting && /^\s*\[/.test(line)) break;
    if (collecting) values.push(line);
  }

  return collecting ? `${values.join("\n")}\n` : null;
}

function readTomlValue(block, key) {
  const match = block.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"));
  if (!match) return null;
  return match[1].trim();
}

function unquote(value) {
  if (!value) return value;
  return value.replace(/^"|"$/g, "");
}

function parseInlineStringArray(value) {
  if (!value || !/^\[.*\]$/.test(value)) return [];
  return [...value.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function fail(message) {
  failures.push(message);
}

function isPinnedPackageSpec(spec) {
  return /^@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9][A-Za-z0-9_.+~-]*$/.test(spec)
    || /^[A-Za-z0-9_.-]+@[0-9][A-Za-z0-9_.+~-]*$/.test(spec);
}

function isPinnedGitSpec(spec) {
  return /^git\+https:\/\/[^@\s]+@[a-f0-9]{40}$/i.test(spec);
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

function validateLauncherArgs(label, args) {
  for (const value of args || []) {
    const arg = String(value);
    if (/@latest\b/.test(arg)) fail(`${label} must not use @latest MCP package specs: ${arg}`);
    if (arg.startsWith("git+https://") && !isPinnedGitSpec(arg)) {
      fail(`${label} git MCP launcher source must be pinned to a full commit SHA: ${arg}`);
    }
  }
  for (let index = 0; index < (args || []).length; index += 1) {
    if (args[index] === "-y") {
      const packageSpec = args[index + 1];
      if (!isPinnedPackageSpec(String(packageSpec || ""))) {
        fail(`${label} npx MCP package must be pinned to an exact npm version: ${packageSpec}`);
      }
    }
  }
}

function validateMcpJsonFile(filePath) {
  const rel = filePath.split(path.sep).join("/").replace(`${root.split(path.sep).join("/")}/`, "");
  let json;
  try {
    json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${rel} must be parseable JSON: ${error.message}`);
    return;
  }
  const servers = json.mcpServers || json.servers || {};
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    fail(`${rel} must define an object mcpServers or servers map`);
    return;
  }
  for (const [name, server] of Object.entries(servers)) {
    validateLauncherArgs(`${rel}:${name}`, Array.isArray(server?.args) ? server.args : []);
  }
}
function validateUniqueTomlAssignments(configFile, text) {
  let currentTable = "<root>";
  const seen = new Map();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tableMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (tableMatch) {
      currentTable = tableMatch[1].trim();
      continue;
    }

    const assignmentMatch = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line);
    if (!assignmentMatch) continue;

    const key = `${currentTable}.${assignmentMatch[1]}`;
    if (seen.has(key)) {
      fail(`${configFile} duplicate TOML assignment for ${key} on lines ${seen.get(key)} and ${index + 1}.`);
    } else {
      seen.set(key, index + 1);
    }
  }
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const catalogNames = new Set((catalog.servers || []).map((server) => server.name));
const codebaseMemoryDisabledTools = ["delete_project", "manage_adr", "ingest_traces", "index_repository"];
const codebaseMemory = (catalog.servers || []).find((server) => server.name === "codebase-memory");
const supabase = (catalog.servers || []).find((server) => server.name === "supabase");
const codebaseMemoryCacheLaunchers = {
  "templates/codex/config.windows.toml": "set npm_config_cache=%LOCALAPPDATA%\\\\agentchef\\\\npm-cache\\\\codebase-memory && npx.cmd -y codebase-memory-mcp@0.8.1",
  "templates/codex/config.unix.toml": 'npm_config_cache=\\"${XDG_CACHE_HOME:-$HOME/.cache}/agentchef/codebase-memory\\" exec npx -y codebase-memory-mcp@0.8.1'
};
const serenaPoolScript = "templates/codex/serena-pool.mjs";

if (!codebaseMemory) {
  fail("MCP catalog must include codebase-memory.");
} else {
  if (codebaseMemory.category !== "code-intelligence") fail("codebase-memory catalog category must stay code-intelligence.");
  if (codebaseMemory.setupKind !== "local-state") fail("codebase-memory catalog setupKind must stay local-state.");
  if (codebaseMemory.defaultEnabled !== false) fail("codebase-memory must stay available but disabled in the balanced default to avoid duplicate code-intelligence processes.");
  if (codebaseMemory.approval !== "prompt") fail("codebase-memory default approval must stay prompt so indexing is not silently approved.");
  if (codebaseMemory.risk !== "medium") fail("codebase-memory catalog risk must stay medium while destructive/admin tools are disabled.");
}

const localProcessMcpNames = (catalog.servers || [])
  .filter((server) => server.transport === "stdio" && server.name !== "filesystem")
  .map((server) => server.name);
const balancedEnabledNames = (catalog.servers || [])
  .filter((server) => server.transport === "stdio" && server.defaultEnabled === true)
  .map((server) => server.name)
  .sort();
if (JSON.stringify(balancedEnabledNames) !== JSON.stringify(["serena"])) {
  fail(`Balanced default must enable only the managed Serena bridge; remote npx MCPs remain disabled, found: ${balancedEnabledNames.join(", ") || "none"}`);
}

for (const [profileFile, expectedEnabled] of [
  ["templates/codex/profiles/full.config.toml", true],
  ["templates/codex/profiles/multi-session.config.toml", false]
]) {
  const profileBlocks = parseMcpBlocks(read(profileFile));
  for (const name of localProcessMcpNames) {
    const block = profileBlocks.get(name);
    if (!block) {
      fail(`${profileFile} is missing [mcp_servers.${name}]`);
      continue;
    }
    const expectedForServer = name === "serena" ? true : expectedEnabled;
    const enabled = readTomlValue(block, "enabled");
    if (enabled !== String(expectedForServer)) {
      fail(`${profileFile} must set ${name} enabled=${expectedForServer}`);
    }
  }
}

const offlineBlocks = parseMcpBlocks(read("templates/codex/profiles/offline.config.toml"));
for (const server of catalog.servers || []) {
  const block = offlineBlocks.get(server.name);
  if (!block) fail(`offline.config.toml is missing [mcp_servers.${server.name}]`);
  else if (readTomlValue(block, "enabled") !== "false") fail(`offline.config.toml must set ${server.name} enabled=false`);
}

if (!fs.existsSync(path.join(root, serenaPoolScript))) {
  fail(`${serenaPoolScript} must exist for the managed Serena bridge.`);
} else {
  const poolSource = read(serenaPoolScript);
  if (!poolSource.includes("22c135a881aaf17485e54ef0ccaedeaf51a202c0")) {
    fail(`${serenaPoolScript} must keep the Serena source pinned to the catalog commit.`);
  }
  if (!poolSource.includes('host: "127.0.0.1"')) {
    fail(`${serenaPoolScript} must bind its manager and child endpoints to loopback.`);
  }
}

if (!supabase) {
  fail("MCP catalog must include supabase.");
} else {
  if (supabase.transport !== "remote") fail("Supabase MCP must use the official hosted remote transport.");
  if (supabase.setupKind !== "oauth" || supabase.auth !== "oauth") {
    fail("Supabase MCP must use the hosted OAuth credential boundary.");
  }
  if (!String(supabase.url || "").startsWith("https://mcp.supabase.com/mcp?")) {
    fail("Supabase MCP must use the official mcp.supabase.com endpoint.");
  }
  if (!String(supabase.url || "").includes("read_only=true")) {
    fail("Supabase MCP must keep read_only=true in the disabled template.");
  }
  if (!String(supabase.url || "").includes("features=database,docs")) {
    fail("Supabase MCP must minimize the default feature groups.");
  }
  if (supabase.package || String(supabase.auth || "").includes("SUPABASE_DB_URL")) {
    fail("Supabase MCP must not retain the deprecated Postgres launcher or database URL credential path.");
  }
}

const gitignore = read(".gitignore");
if (!gitignore.split(/\r?\n/).includes(".codebase-memory/")) {
  fail(".gitignore must exclude generated .codebase-memory/ graph artifacts.");
}

for (const server of catalog.servers || []) {
  if (server.package?.includes("@latest")) {
    fail(`MCP catalog package must not float on @latest: ${server.name}`);
  }
  if (server.package && !isPinnedPackageSpec(server.package)) {
    fail(`MCP catalog package must be pinned to an exact npm version: ${server.name} (${server.package})`);
  }
  if (server.command === "uvx" && !/^[a-f0-9]{40}$/i.test(String(server.sourceRef || ""))) {
    fail(`MCP catalog uvx/git server must declare sourceRef as a full commit SHA: ${server.name}`);
  }
  if (!["approve", "prompt", "auto"].includes(server.approval)) {
    fail(`MCP catalog has invalid approval mode for ${server.name}: ${server.approval}`);
  }
  if (!["none", "tooling", "local-state", "path", "oauth", "env"].includes(server.setupKind)) {
    fail(`MCP catalog has invalid setupKind for ${server.name}: ${server.setupKind}`);
  }
  if (!server.setupHint || typeof server.setupHint !== "string" || server.setupHint.length < 20) {
    fail(`MCP catalog must explain setupHint for ${server.name}`);
  }
  if (server.auth && server.auth !== "none" && server.defaultEnabled !== false) {
    fail(`Authenticated MCP must be disabled by default in catalog: ${server.name}`);
  }
  if (server.setupKind === "oauth" && server.auth !== "oauth") {
    fail(`OAuth MCP setupKind must use auth=oauth: ${server.name}`);
  }
  if (server.setupKind === "env" && !String(server.auth || "").startsWith("env:")) {
    fail(`Environment MCP setupKind must use auth=env:<NAME>: ${server.name}`);
  }
  if (["external-account", "database", "filesystem"].includes(server.category) && server.defaultEnabled !== false) {
    fail(`Sensitive MCP category must be disabled by default in catalog: ${server.name}`);
  }
  if (server.enabledTools) {
    const approvalNames = Object.keys(server.toolApprovals || {});
    if (approvalNames.length !== server.enabledTools.length
      || server.enabledTools.some((tool) => !approvalNames.includes(tool))) {
      fail(`MCP catalog enabledTools/toolApprovals parity drift for ${server.name}`);
    }
  }
}

for (const configFile of configFiles) {
  const text = read(configFile);
  validateUniqueTomlAssignments(configFile, text);
  const blocks = parseMcpBlocks(text);
  const toolApprovalBlocks = parseToolApprovalBlocks(text);
  const configNames = new Set(blocks.keys());

  for (const match of text.matchAll(/"-y",\s*"([^"]+)"/g)) {
    const packageSpec = match[1];
    if (!isPinnedPackageSpec(packageSpec)) {
      fail(`${configFile} npx MCP package must be pinned to an exact npm version: ${packageSpec}`);
    }
  }

  for (const match of text.matchAll(/"git\+https:\/\/[^"]+"/g)) {
    const gitSpec = match[0].slice(1, -1);
    if (!isPinnedGitSpec(gitSpec)) {
      fail(`${configFile} git MCP launcher source must be pinned to a full commit SHA: ${gitSpec}`);
    }
  }

  const appsDefault = parseTomlTable(text, "apps._default");
  if (!appsDefault) {
    fail(`${configFile} must define [apps._default].`);
  } else {
    for (const [key, expected] of [
      ["enabled", "false"],
      ["destructive_enabled", "false"],
      ["open_world_enabled", "false"],
      ["default_tools_approval_mode", '"prompt"']
    ]) {
      if (readTomlValue(appsDefault, key) !== expected) {
        fail(`${configFile} apps._default must set ${key} = ${expected}.`);
      }
    }
  }

  for (const name of catalogNames) {
    if (!configNames.has(name)) fail(`${configFile} missing MCP config block for ${name}`);
  }

  for (const name of configNames) {
    if (!catalogNames.has(name)) fail(`${configFile} has MCP block not present in catalog: ${name}`);
  }

  for (const server of catalog.servers || []) {
    const block = blocks.get(server.name);
    if (!block) continue;

    const enabled = readTomlValue(block, "enabled");
    const approval = unquote(readTomlValue(block, "default_tools_approval_mode"));
    if (configFile.endsWith("config.windows.toml") && unquote(readTomlValue(block, "command")) === "cmd.exe") {
      const launcherArgs = parseInlineStringArray(readTomlValue(block, "args"));
      const launcherArgsRaw = readTomlValue(block, "args") || "";
      const isSerenaBridge = server.name === "serena";
      if (
        launcherArgs[0] !== "/d"
        || launcherArgs[1] !== "/s"
        || launcherArgs[2] !== "/c"
        || (!isSerenaBridge && server.name !== "codebase-memory" && launcherArgs[3] !== "npx.cmd")
        || (isSerenaBridge && (!launcherArgsRaw.includes("serena-pool.mjs") || !launcherArgsRaw.includes("bridge")))
      ) {
        fail(`${configFile} ${server.name} must use the approved /d /s /c launcher shape.`);
      }
      const launcherEnv = readTomlValue(block, "env") || "";
      if (!/NoDefaultCurrentDirectoryInExePath\s*=\s*"1"/.test(launcherEnv)) {
        fail(
          `${configFile} ${server.name} must disable current-directory executable lookup for npx.cmd.`
        );
      }
    }
    if (enabled !== String(server.defaultEnabled)) {
      fail(`${configFile} enabled drift for ${server.name}: expected ${server.defaultEnabled}, found ${enabled}`);
    }
    if (approval !== server.approval) {
      fail(`${configFile} approval drift for ${server.name}: expected ${server.approval}, found ${approval}`);
    }
    if (server.enabledTools) {
      const enabledTools = parseInlineStringArray(readTomlValue(block, "enabled_tools"));
      const expected = server.enabledTools;
      for (const expectedTool of expected) {
        if (!enabledTools.includes(expectedTool)) {
          fail(`${configFile} ${server.name} must allowlist ${expectedTool}.`);
        }
      }
      if (enabledTools.length !== expected.length) {
        fail(`${configFile} ${server.name} enabled_tools must stay exact: ${expected.join(", ")}`);
      }
      const actualApprovals = toolApprovalBlocks.get(server.name) || new Map();
      const expectedApprovals = server.toolApprovals || {};
      for (const [tool, mode] of Object.entries(expectedApprovals)) {
        if (actualApprovals.get(tool) !== mode) {
          fail(`${configFile} ${server.name}.${tool} approval drift: expected ${mode}, found ${actualApprovals.get(tool) || "missing"}`);
        }
      }
      for (const tool of actualApprovals.keys()) {
        if (!Object.prototype.hasOwnProperty.call(expectedApprovals, tool)) {
          fail(`${configFile} ${server.name}.${tool} has a dead approval block outside enabled_tools.`);
        }
      }
    }
    if (server.url && !block.includes(`url = "${server.url}"`)) {
      fail(`${configFile} URL drift for ${server.name}`);
    }
    if (server.package && !block.includes(server.package)) {
      fail(`${configFile} package drift for ${server.name}: expected ${server.package}`);
    }
      if (server.sourceRef && server.name !== "serena" && !block.includes(server.sourceRef)) {
        fail(`${configFile} sourceRef drift for ${server.name}: expected ${server.sourceRef}`);
      }
      if (server.name === "serena" && !block.includes("serena-pool.mjs")) {
        fail(`${configFile} Serena must use the managed serena-pool bridge.`);
      }
    if (server.risk === "critical" && enabled !== "false") {
      fail(`${configFile} must keep critical MCP disabled: ${server.name}`);
    }
    if (["high", "critical"].includes(server.risk)) {
      const startupTimeout = readTomlValue(block, "startup_timeout_sec") || readTomlValue(block, "startup_timeout_ms");
      const toolTimeout = readTomlValue(block, "tool_timeout_sec");
      if (!startupTimeout) fail(`${configFile} high-risk MCP must declare startup_timeout_sec: ${server.name}`);
      if (!toolTimeout) fail(`${configFile} high-risk MCP must declare tool_timeout_sec: ${server.name}`);
      if (server.risk === "critical" && approval !== "prompt") {
        fail(`${configFile} critical MCP must use prompt approval mode: ${server.name}`);
      }
      if (server.risk === "high" && approval !== "prompt") {
        fail(`${configFile} high-risk MCP must use prompt approval mode even while disabled: ${server.name}`);
      }
    }
    if (server.setupKind === "env") {
      const envName = String(server.auth || "").split(":")[1];
      if (!envName) {
        fail(`${configFile} env MCP must declare auth=env:<NAME>: ${server.name}`);
      } else {
        if (!block.includes(`env_vars = ["${envName}"]`)) {
          fail(`${configFile} env MCP must whitelist ${envName} with env_vars: ${server.name}`);
        }
        const argsLine = readTomlValue(block, "args") || "";
        if (argsLine.includes(`%${envName}%`) || argsLine.includes(`$${envName}`)) {
          fail(`${configFile} env MCP must not expand ${envName} directly in launcher args: ${server.name}`);
        }
      }
    }
    if (server.name === "codebase-memory") {
      const expectedLauncher = codebaseMemoryCacheLaunchers[configFile];
      if (!block.includes(expectedLauncher)) {
        fail(`${configFile} codebase-memory must use its isolated per-user npm cache launcher.`);
      }
      if (readTomlValue(block, "startup_timeout_sec") !== "90") {
        fail(`${configFile} codebase-memory must allow a 90-second cold-start window.`);
      }
      const disabledTools = parseInlineStringArray(readTomlValue(block, "disabled_tools"));
      for (const expectedTool of codebaseMemoryDisabledTools) {
        if (!disabledTools.includes(expectedTool)) {
          fail(`${configFile} codebase-memory must disable ${expectedTool}.`);
        }
      }
      if (disabledTools.length !== codebaseMemoryDisabledTools.length) {
        fail(`${configFile} codebase-memory disabled_tools must stay exact: ${codebaseMemoryDisabledTools.join(", ")}`);
      }
    }
  }
}

for (const file of walk(root)) {
  const rel = file.split(path.sep).join("/").replace(`${root.split(path.sep).join("/")}/`, "");
  if (/^plugins\/.*\/\.mcp\.json$/i.test(rel) || /^plugins\/.*\/\.codex-plugin\/.*\.mcp\.json$/i.test(rel)) {
    validateMcpJsonFile(file);
  }
}

if (failures.length > 0) {
  console.error("MCP config validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`MCP config validation passed. Checked ${catalog.servers.length} servers across ${configFiles.length} configs.`);
