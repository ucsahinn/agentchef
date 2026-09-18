#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);

function profileHeader(text) {
  const firstTable = /^\s*\[/m.exec(normalizeNewlines(text));
  return (firstTable ? text.slice(0, firstTable.index) : text).trimEnd();
}

function mcpProfileTargetStates(templateTables) {
  const states = [];
  for (const [name, block] of templateTables) {
    const match = /^mcp_servers\.([A-Za-z0-9_-]+)$/.exec(name);
    if (!match) continue;
    const enabled = /^\s*enabled\s*=\s*(true|false)\s*$/m.exec(block);
    if (!enabled) throw new Error(`Profile template is missing enabled state: ${name}`);
    states.push({ server: match[1], enabled: enabled[1] === "true" });
  }
  if (states.length === 0) throw new Error("Profile template does not declare any MCP server states.");
  return states;
}

function withMcpProfileEnabledState(block, enabled) {
  const replacement = `enabled = ${enabled}`;
  if (/^\s*enabled\s*=\s*(true|false)\s*$/m.test(block)) {
    return block.replace(/^\s*enabled\s*=\s*(true|false)\s*$/m, replacement);
  }
  const lines = block.split("\n");
  lines.splice(1, 0, replacement);
  return lines.join("\n");
}

function renderMcpProfile(source, template) {
  const sourceTables = parseTables(source);
  const templateTables = parseTables(template);
  const sections = [];
  const header = profileHeader(template);
  if (header) sections.push(header);
  for (const { server, enabled } of mcpProfileTargetStates(templateTables)) {
    const rootName = `mcp_servers.${server}`;
    const rootBlock = sourceTables.get(rootName);
    if (!rootBlock) throw new Error(`Installed config is missing transport details for ${server}.`);
    sections.push(withMcpProfileEnabledState(rootBlock, enabled));
    for (const [name, block] of sourceTables) {
      if (name.startsWith(`${rootName}.`)) sections.push(block);
    }
  }
  return `${sections.join("\n\n").trimEnd()}\n`;
}

function runMcpProfileRenderer() {
  const takeValue = (flag) => {
    const index = args.indexOf(flag);
    return index < 0 || !args[index + 1] ? null : args[index + 1];
  };
  const sourcePath = takeValue("--source");
  const templatePath = takeValue("--template");
  const outputPath = takeValue("--output");
  const known = new Set(["--render-mcp-profile", "--source", "--template", "--output", "--dry-run"]);
  const unknown = args.filter((arg, index) => !known.has(arg) && !known.has(args[index - 1]));
  if (!sourcePath || !templatePath || !outputPath || unknown.length > 0) {
    throw new Error("Usage: node scripts/merge-codex-config.mjs --render-mcp-profile --source <config.toml> --template <profile.toml> --output <profile.toml> [--dry-run]");
  }
  const rendered = renderMcpProfile(fs.readFileSync(path.resolve(sourcePath), "utf8"), fs.readFileSync(path.resolve(templatePath), "utf8"));
  if (args.includes("--dry-run")) process.stdout.write(rendered);
  else fs.writeFileSync(path.resolve(outputPath), rendered, "utf8");
}

if (args.includes("--render-mcp-profile")) {
  try {
    runMcpProfileRenderer();
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const options = {
  dryRun: false,
  json: false,
  syncManagedTables: false
};

const positional = [];
for (const arg of args) {
  if (arg === "--dry-run") options.dryRun = true;
  else if (arg === "--json") options.json = true;
  else if (arg === "--sync-managed-tables") options.syncManagedTables = true;
  else positional.push(arg);
}

const [templatePath, destinationPath] = positional;
if (!templatePath || !destinationPath) {
  console.error("Usage: node scripts/merge-codex-config.mjs <template.toml> <destination.toml> [--dry-run] [--sync-managed-tables] [--json]");
  process.exit(2);
}

const managedTablePatterns = [
  /^features$/,
  /^shell_environment_policy$/,
  /^memories$/,
  /^apps\._default$/,
  /^agents$/,
  /^agents\.[A-Za-z0-9_.-]+$/,
  /^sandbox_workspace_write$/,
  /^windows$/,
  /^mcp_servers\.[A-Za-z0-9_-]+(?:\.tools\.[A-Za-z0-9_-]+)?$/
];
const managedRootKeys = new Set([
  "model",
  "review_model",
  "model_reasoning_effort",
  "model_reasoning_summary",
  "model_verbosity",
  "personality",
  "approval_policy",
  "approvals_reviewer",
  "sandbox_mode"
]);

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parseRootAssignments(text) {
  const normalized = normalizeNewlines(text);
  const assignments = new Map();
  const lines = normalized.split("\n");
  for (const line of lines) {
    if (/^\s*\[/.test(line)) break;
    const match = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line);
    if (match) assignments.set(match[1], line);
  }
  return assignments;
}

function insertBeforeFirstTable(text, insertion) {
  const normalized = normalizeNewlines(text).trimEnd();
  if (!insertion) return normalized;
  const firstTableMatch = /^\s*\[/m.exec(normalized);
  if (!firstTableMatch) {
    return `${normalized}${normalized ? "\n\n" : ""}${insertion}`;
  }

  const before = normalized.slice(0, firstTableMatch.index).trimEnd();
  const after = normalized.slice(firstTableMatch.index).trimStart();
  return `${before}${before ? "\n\n" : ""}${insertion}\n\n${after}`;
}

function parseTables(text) {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split("\n");
  const tables = new Map();
  let current = null;
  let currentLines = [];

  function flush() {
    if (!current) return;
    tables.set(current, currentLines.join("\n").trimEnd());
  }

  for (const line of lines) {
    const match = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (match) {
      flush();
      current = match[1].trim();
      currentLines = [line];
      continue;
    }
    if (current) currentLines.push(line);
  }
  flush();
  return tables;
}

function isManagedTable(tableName) {
  return managedTablePatterns.some((pattern) => pattern.test(tableName));
}

const template = normalizeNewlines(fs.readFileSync(templatePath, "utf8"));
const destinationExists = fs.existsSync(destinationPath);
const destination = destinationExists ? normalizeNewlines(fs.readFileSync(destinationPath, "utf8")) : "";
const templateRootAssignments = parseRootAssignments(template);
const destinationRootAssignments = parseRootAssignments(destination);
const templateTables = parseTables(template);
const destinationTables = parseTables(destination);
const missing = [];
const missingRootAssignments = [];
const removedDeprecatedFields = [];
const updatedManagedFields = [];
const updatedManagedTables = [];
const driftedManagedTables = [];
const fullTemplateInstall = !destinationExists;

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function normalizeManagedFields(text) {
  const lines = normalizeNewlines(text).split("\n");
  let currentTable = null;
  let appsSeen = null;
  const next = [];

  function flushAppsDefaults() {
    if (!appsSeen) return;
    if (!appsSeen.enabled) {
      addUnique(updatedManagedFields, "apps._default.enabled");
      next.push("enabled = false");
    }
    if (!appsSeen.destructive_enabled) {
      addUnique(updatedManagedFields, "apps._default.destructive_enabled");
      next.push("destructive_enabled = false");
    }
    if (!appsSeen.open_world_enabled) {
      addUnique(updatedManagedFields, "apps._default.open_world_enabled");
      next.push("open_world_enabled = false");
    }
    if (!appsSeen.default_tools_approval_mode) {
      addUnique(updatedManagedFields, "apps._default.default_tools_approval_mode");
      next.push('default_tools_approval_mode = "prompt"');
    }
    appsSeen = null;
  }

  for (const line of lines) {
    const tableMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (tableMatch) {
      flushAppsDefaults();
      currentTable = tableMatch[1].trim();
      if (currentTable === "apps._default") {
        appsSeen = {
          enabled: false,
          destructive_enabled: false,
          open_world_enabled: false,
          default_tools_approval_mode: false
        };
      }
      next.push(line);
      continue;
    }
    if (appsSeen && /^\s*default_tools_enabled\s*=/.test(line)) {
      addUnique(removedDeprecatedFields, "apps._default.default_tools_enabled");
      continue;
    }
    const approvalModeMatch = /^(\s*)default_tools_approval_mode(\s*=\s*)"([^"]+)"(\s*(?:#.*)?)$/.exec(line);
    if (appsSeen && approvalModeMatch) {
      const [, indent, separator, value, suffix] = approvalModeMatch;
      appsSeen.default_tools_approval_mode = true;
      if (value !== "prompt") {
        addUnique(updatedManagedFields, "apps._default.default_tools_approval_mode");
        next.push(`${indent}default_tools_approval_mode${separator}"prompt"${suffix}`);
      } else {
        next.push(line);
      }
      continue;
    }
    const safetyMatch = /^(\s*)(enabled|destructive_enabled|open_world_enabled)(\s*=\s*)(true|false)(\s*(?:#.*)?)$/.exec(line);
    if (appsSeen && safetyMatch) {
      const [, indent, key, separator, value, suffix] = safetyMatch;
      appsSeen[key] = true;
      if (value === "true") {
        addUnique(updatedManagedFields, `apps._default.${key}`);
        next.push(`${indent}${key}${separator}false${suffix}`);
      } else {
        next.push(line);
      }
      continue;
    }
    next.push(line);
  }

  flushAppsDefaults();
  return next.join("\n");
}

function templateBlockForDestination(tableName) {
  const templateBlock = templateTables.get(tableName);
  if (!templateBlock) return templateBlock;
  if (!/^mcp_servers\.[A-Za-z0-9_-]+$/.test(tableName)) return templateBlock;
  if (!destinationTables.has(`${tableName}.env`)) return templateBlock;

  return templateBlock
    .split("\n")
    .filter((line) => !/^\s*env\s*=/.test(line))
    .join("\n");
}

function syncManagedTables(text) {
  const normalized = normalizeNewlines(text);
  const lines = normalized.split("\n");
  const next = [];
  let currentTable = null;
  let currentLines = [];

  function flush() {
    if (!currentTable) {
      if (currentLines.length > 0) next.push(...currentLines);
      currentLines = [];
      return;
    }

    const currentBlock = currentLines.join("\n").trimEnd();
    const templateBlock = templateBlockForDestination(currentTable);
    if (currentTable === "apps._default") {
      next.push(...currentLines);
      currentTable = null;
      currentLines = [];
      return;
    }
    if (templateBlock && isManagedTable(currentTable)) {
      if (currentBlock !== templateBlock) {
        if (options.syncManagedTables) {
          addUnique(updatedManagedTables, currentTable);
          next.push(...templateBlock.split("\n"));
        } else {
          addUnique(driftedManagedTables, currentTable);
          next.push(...currentLines);
        }
      } else {
        next.push(...currentLines);
      }
    } else {
      next.push(...currentLines);
    }
    currentTable = null;
    currentLines = [];
  }

  for (const line of lines) {
    const tableMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (tableMatch) {
      flush();
      currentTable = tableMatch[1].trim();
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return next.join("\n");
}

for (const [tableName, tableText] of templateTables.entries()) {
  if (!isManagedTable(tableName)) continue;
  if (destinationTables.has(tableName)) continue;
  missing.push({ tableName, tableText });
}

for (const [key, line] of templateRootAssignments.entries()) {
  if (!managedRootKeys.has(key)) continue;
  if (destinationRootAssignments.has(key)) continue;
  missingRootAssignments.push({ key, line });
}

const sanitizedDestination = syncManagedTables(normalizeManagedFields(destination));

const report = {
  schemaVersion: "codex-chef.config-merge.v1",
  template: path.resolve(templatePath),
  destination: path.resolve(destinationPath),
  destinationExists,
  fullTemplateInstall,
  syncManagedTables: options.syncManagedTables,
  dryRun: options.dryRun,
  addedRootKeys: missingRootAssignments.map((entry) => entry.key),
  addedRootKeyCount: missingRootAssignments.length,
  addedTables: missing.map((entry) => entry.tableName),
  addedTableCount: missing.length,
  removedDeprecatedFields,
  updatedManagedFields,
  updatedManagedTables,
  driftedManagedTables
};

if (fullTemplateInstall && !options.dryRun) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, `${template.trimEnd()}\n`, "utf8");
} else if ((missingRootAssignments.length > 0 || missing.length > 0 || removedDeprecatedFields.length > 0 || updatedManagedFields.length > 0 || updatedManagedTables.length > 0) && !options.dryRun) {
  const base = sanitizedDestination.trimEnd();
  const rootAddition = missingRootAssignments.map((entry) => entry.line).join("\n");
  const addition = missing.map((entry) => entry.tableText).join("\n\n");
  const withRootDefaults = rootAddition
    ? insertBeforeFirstTable(
        base,
        `# Codex Chef merged root defaults. Existing user-defined root settings were preserved.\n${rootAddition}`
      )
    : base;
  const next = addition
    ? `${withRootDefaults}${withRootDefaults ? "\n\n" : ""}# Codex Chef merged config blocks. Existing user-defined tables were preserved.\n${addition}\n`
    : `${withRootDefaults}\n`;
  fs.writeFileSync(destinationPath, next, "utf8");
}

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else if (fullTemplateInstall && options.dryRun) {
  console.log("Would install full AgentChef config template.");
} else if (fullTemplateInstall) {
  console.log("Installed full AgentChef config template.");
} else if (missingRootAssignments.length === 0 && missing.length === 0 && removedDeprecatedFields.length === 0 && updatedManagedFields.length === 0 && updatedManagedTables.length === 0) {
  console.log("Codex config already contains all managed AgentChef blocks.");
} else if (options.dryRun) {
  const parts = [];
  if (missingRootAssignments.length > 0) parts.push(`merge ${missingRootAssignments.length} missing AgentChef root default(s): ${missingRootAssignments.map((entry) => entry.key).join(", ")}`);
  if (missing.length > 0) parts.push(`merge ${missing.length} missing AgentChef config block(s): ${missing.map((entry) => entry.tableName).join(", ")}`);
  if (removedDeprecatedFields.length > 0) parts.push(`remove deprecated managed field(s): ${removedDeprecatedFields.join(", ")}`);
  if (updatedManagedFields.length > 0) parts.push(`update managed field(s): ${updatedManagedFields.join(", ")}`);
  if (updatedManagedTables.length > 0) parts.push(`sync managed table(s): ${updatedManagedTables.join(", ")}`);
  console.log(`Would ${parts.join("; ")}`);
} else {
  const parts = [];
  if (missingRootAssignments.length > 0) parts.push(`merged ${missingRootAssignments.length} missing AgentChef root default(s): ${missingRootAssignments.map((entry) => entry.key).join(", ")}`);
  if (missing.length > 0) parts.push(`merged ${missing.length} missing AgentChef config block(s): ${missing.map((entry) => entry.tableName).join(", ")}`);
  if (removedDeprecatedFields.length > 0) parts.push(`removed deprecated managed field(s): ${removedDeprecatedFields.join(", ")}`);
  if (updatedManagedFields.length > 0) parts.push(`updated managed field(s): ${updatedManagedFields.join(", ")}`);
  if (updatedManagedTables.length > 0) parts.push(`synced managed table(s): ${updatedManagedTables.join(", ")}`);
  console.log(parts.join("; "));
}
