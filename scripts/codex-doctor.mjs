#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CliUsageError,
  installCliErrorBoundary
} from "./lib/cli-error-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "codex-doctor",
  argv: args,
  root,
  prefix: "AgentChef doctor error"
});

let jsonOutput = false;
let redactPaths = false;
let includeGlobal = false;
for (const arg of args) {
  if (arg === "--json") jsonOutput = true;
  else if (arg === "--redact-paths") redactPaths = true;
  else if (arg === "--include-global") includeGlobal = true;
  else if (arg === "--help" || arg === "-h") {
    console.log(`Usage: node scripts/codex-doctor.mjs [options]

Options:
  --json             Emit machine-readable JSON
  --redact-paths     Redact repository and home paths
  --include-global   Inspect installed global targets
`);
    process.exit(0);
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

const localeCodes = ["tr"];
const agentConfigFiles = [
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml"
];

function posix(filePath) {
  return filePath.split(path.sep).join("/");
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function redact(value) {
  if (!redactPaths || typeof value !== "string") return value;
  const home = os.homedir();
  return value
    .replaceAll(home, "${HOME}")
    .replaceAll(home.replaceAll("\\", "/"), "${HOME}")
    .replaceAll(root, "${REPO}")
    .replaceAll(root.replaceAll("\\", "/"), "${REPO}");
}

function parseAgentBlocks(text) {
  const blocks = new Set();
  for (const match of text.matchAll(/^\[agents\.([A-Za-z0-9_.-]+)\]\s*$/gm)) {
    blocks.add(match[1]);
  }
  return blocks;
}

function parseMcpBlocks(text) {
  const blocks = new Set();
  for (const match of text.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm)) {
    blocks.add(match[1]);
  }
  return blocks;
}

function isLocalizedDoc(file) {
  return /\.tr\.md$/.test(file);
}

function inspectAgents(failures) {
  const catalog = readJson("catalog/agents.json");
  const specialistNames = catalog.agents.map((agent) => agent.name);
  const coordinatorNames = (catalog.coordinators || []).map((coordinator) => coordinator.name);
  const catalogNames = new Set([...specialistNames, ...coordinatorNames]);
  const templateDir = path.join(root, "templates", "codex", "agents");
  const templateNames = new Set(
    fs.readdirSync(templateDir)
      .filter((file) => file.endsWith(".toml"))
      .map((file) => path.basename(file, ".toml"))
  );

  for (const name of catalogNames) {
    if (!templateNames.has(name)) failures.push(`Agent ${name} is missing templates/codex/agents/${name}.toml`);
  }
  for (const name of templateNames) {
    if (!catalogNames.has(name)) failures.push(`Agent template ${name}.toml is missing from catalog/agents.json`);
  }

  const configs = agentConfigFiles.map((rel) => {
    const blocks = parseAgentBlocks(readText(rel));
    for (const name of catalogNames) {
      if (!blocks.has(name)) failures.push(`${rel} is missing [agents.${name}]`);
    }
    for (const name of blocks) {
      if (!catalogNames.has(name)) failures.push(`${rel} has unmanaged agent block [agents.${name}]`);
    }
    return { file: rel, blockCount: blocks.size };
  });

  return {
    count: catalogNames.size,
    specialistCount: specialistNames.length,
    coordinatorCount: coordinatorNames.length,
    categories: [...new Set(catalog.agents.map((agent) => agent.category))].sort(),
    readOnlyCount: catalog.agents.filter((agent) => agent.sandboxMode === "read-only").length,
    workspaceWriteCount: catalog.agents.filter((agent) => agent.sandboxMode === "workspace-write").length,
    liveResearchCount: catalog.agents.filter((agent) => agent.webSearch === true).length,
    configs
  };
}

function inspectMcp(failures) {
  const catalog = readJson("catalog/mcp-servers.json");
  const catalogNames = new Set(catalog.servers.map((server) => server.name));
  const configs = agentConfigFiles.map((rel) => {
    const blocks = parseMcpBlocks(readText(rel));
    for (const name of catalogNames) {
      if (!blocks.has(name)) failures.push(`${rel} is missing [mcp_servers.${name}]`);
    }
    for (const name of blocks) {
      if (!catalogNames.has(name)) failures.push(`${rel} has unmanaged MCP block [mcp_servers.${name}]`);
    }
    return { file: rel, blockCount: blocks.size };
  });

  return {
    count: catalog.servers.length,
    enabledByDefault: catalog.servers.filter((server) => server.defaultEnabled === true).length,
    disabledByDefault: catalog.servers.filter((server) => server.defaultEnabled === false).length,
    highRiskCount: catalog.servers.filter((server) => server.risk === "high").length,
    configs
  };
}

function inspectDocs(failures) {
  const docsDir = path.join(root, "docs");
  const files = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md")).sort();
  const fileSet = new Set(files);
  const baseDocs = files.filter((file) => !isLocalizedDoc(file));
  const missing = [];

  for (const file of baseDocs) {
    const slug = file.replace(/\.md$/, "");
    for (const locale of localeCodes) {
      const localized = `${slug}.${locale}.md`;
      if (!fileSet.has(localized)) {
        missing.push(`docs/${localized}`);
      }
    }
  }

  if (missing.length > 0) {
    failures.push(`Docs locale matrix is missing ${missing.length} file(s)`);
  }

  return {
    baseGuides: baseDocs.length,
    languages: localeCodes.length + 1,
    localizedFiles: files.length - baseDocs.length,
    missing
  };
}

function inspectInstallPlan(failures) {
  const plan = readJson("manifests/install-plan.json");
  const operationIds = new Set((plan.operations || []).map((operation) => operation.id));
  const globalWriteOperations = plan.operations.filter((operation) => {
    if (typeof operation.wouldMutateGlobalState === "boolean") return operation.wouldMutateGlobalState;
    if (["git-config", "skill-install", "write-marketplace"].includes(operation.kind)) return true;
    const targets = [operation.destination, operation.destinationDir, operation.value].filter(Boolean).join("\n");
    return /\$\{(?:CODEX_HOME|AGENTS_HOME|HOME)\}/.test(targets);
  });
  for (const [profileName, operationNames] of Object.entries(plan.profiles || {})) {
    for (const operationName of operationNames) {
      if (!operationIds.has(operationName)) {
        failures.push(`Install plan profile ${profileName} references unknown operation ${operationName}`);
      }
    }
  }

  return {
    manifestVersion: plan.manifestVersion || plan.schemaVersion,
    operations: plan.operations.length,
    defaultProfileOperations: plan.profiles.default?.length || 0,
    allProfileOperations: plan.profiles.all?.length || 0,
    globalWriteOperations: globalWriteOperations.length,
    backupOperations: plan.operations.filter((operation) => operation.backup === true).length
  };
}

function inspectSkills() {
  const catalog = readJson("catalog/skills.json");
  const lock = readJson("catalog/skills-lock.json");
  const skills = catalog.skills || [];
  return {
    catalogCount: skills.length,
    installableCount: skills.filter((skill) => skill.install === true).length,
    directInstallCount: skills.filter((skill) => skill.directInstall === true).length,
    lockEntries: Array.isArray(lock.entries) ? lock.entries.length : 0,
    highRiskInstallableCount: skills.filter((skill) => skill.install === true && skill.risk === "high").length
  };
}

function inspectGlobalTargets() {
  if (!includeGlobal) {
    return {
      inspected: false,
      note: "Global Codex, Agents, and Git targets were not inspected. Use --include-global for no-write existence checks."
    };
  }

  const home = os.homedir();
  const targets = [
    path.join(home, ".codex", "AGENTS.md"),
    path.join(home, ".codex", "config.toml"),
    path.join(home, ".codex", "rules", "default.rules"),
    path.join(home, ".agents", "plugins", "marketplace.json"),
    path.join(home, ".gitignore_global"),
    path.join(home, ".githooks", "pre-commit")
  ];

  return {
    inspected: true,
    targets: targets.map((target) => ({
      path: redact(target),
      exists: fs.existsSync(target)
    }))
  };
}

const failures = [];
const warnings = [];

for (const required of [
  "catalog/agents.json",
  "catalog/mcp-servers.json",
  "catalog/skills.json",
  "catalog/skills-lock.json",
  "manifests/install-plan.json",
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml",
  "scripts/plan-install.mjs"
]) {
  if (!exists(required)) failures.push(`Missing required source file: ${required}`);
}

let report;
try {
  const packageJson = readJson("package.json");
  report = {
    schemaVersion: "codex-chef.doctor.v1",
    generatedAt: new Date().toISOString(),
    repo: {
      root: redact(root),
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      private: packageJson.private === true
    },
    sources: {
      codexManual: "https://developers.openai.com/codex/codex-manual.md",
      subagents: "https://developers.openai.com/codex/subagents",
      customization: "https://developers.openai.com/codex/concepts/customization",
      mcpConnectors: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp",
      mcpSpec: "https://modelcontextprotocol.io/specification"
    },
    agents: inspectAgents(failures),
    mcp: inspectMcp(failures),
    skills: inspectSkills(),
    docs: inspectDocs(failures),
    installPlan: inspectInstallPlan(failures),
    globalTargets: inspectGlobalTargets(),
    warnings,
    failures
  };
} catch (error) {
  failures.push(error.message);
  report = {
    schemaVersion: "codex-chef.doctor.v1",
    generatedAt: new Date().toISOString(),
    repo: { root: redact(root) },
    warnings,
    failures
  };
}

if (!includeGlobal) warnings.push("Global installed-state checks are skipped by default to keep doctor no-write and privacy-preserving.");

report.status = failures.length === 0 ? "ok" : "fail";

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AgentChef doctor");
  console.log(`Status: ${report.status}`);
  console.log(`Version: ${report.repo.packageVersion || "unknown"}`);
  if (report.agents) {
    console.log(`Agents: ${report.agents.count} (${report.agents.readOnlyCount} read-only, ${report.agents.workspaceWriteCount} workspace-write)`);
  }
  if (report.mcp) {
    console.log(`MCP servers: ${report.mcp.count} (${report.mcp.enabledByDefault} enabled, ${report.mcp.disabledByDefault} disabled)`);
  }
  if (report.skills) {
    console.log(`Skills: ${report.skills.catalogCount} cataloged, ${report.skills.installableCount} installable`);
  }
  if (report.docs) {
    console.log(`Docs: ${report.docs.baseGuides} guides x ${report.docs.languages} languages`);
  }
  if (report.installPlan) {
    console.log(`Install plan: ${report.installPlan.operations} operations, ${report.installPlan.globalWriteOperations} global-write operations`);
  }
  console.log(`Global targets: ${report.globalTargets?.inspected ? "inspected without writes" : "skipped"}`);
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  for (const failure of failures) console.error(`Failure: ${failure}`);
}

if (failures.length > 0) {
  process.exit(1);
}
