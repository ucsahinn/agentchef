#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CliUsageError,
  emitCliError,
  requireCliValue
} from "./lib/cli-error-contract.mjs";
import {
  repositoryRoot,
  resolveInstallContract
} from "./lib/install-contract.mjs";

const root = repositoryRoot;
const manifestPath = path.join(root, "manifests", "install-plan.json");

function parseArgs(argv) {
  const parsed = {
    all: false,
    installSkills: false,
    installGitGuards: false,
    json: false,
    summary: false,
    listProfiles: false,
    listOperations: false,
    force: false,
    noBackup: false,
    redactPaths: false,
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    agentsHome: process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"),
    home: os.homedir()
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") parsed.all = true;
    else if (arg === "--install-skills") parsed.installSkills = true;
    else if (arg === "--install-git-guards") parsed.installGitGuards = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--summary") parsed.summary = true;
    else if (arg === "--list-profiles") parsed.listProfiles = true;
    else if (arg === "--list-operations" || arg === "--list-components") parsed.listOperations = true;
    else if (arg === "--force") parsed.force = true;
    else if (arg === "--no-backup") parsed.noBackup = true;
    else if (arg === "--redact-paths") parsed.redactPaths = true;
    else if (arg === "--platform") {
      parsed.platform = requireCliValue(argv, index, "--platform");
      index += 1;
    } else if (arg === "--codex-home") {
      parsed.codexHome = requireCliValue(argv, index, "--codex-home");
      index += 1;
    } else if (arg === "--agents-home") {
      parsed.agentsHome = requireCliValue(argv, index, "--agents-home");
      index += 1;
    } else if (arg === "--home") {
      parsed.home = requireCliValue(argv, index, "--home");
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new CliUsageError(`Unknown argument: ${arg}`);
    }
  }

  if (!["windows", "unix"].includes(parsed.platform)) {
    throw new CliUsageError("--platform must be windows or unix");
  }

  if (parsed.all) {
    parsed.installSkills = true;
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/plan-install.mjs [options]

Options:
  --all                  Include the recommended full setup and curated skills
  --install-skills       Include reviewed curated skill installation operations
  --install-git-guards   Include optional global Git guard operations
  --list-profiles        List manifest profiles without planning writes
  --list-operations      List manifest operations without planning writes
  --list-components      Alias for --list-operations
  --summary              Emit a concise human summary instead of every operation
  --force                Reflect force/replace behavior in the plan metadata
  --no-backup            Reflect no-backup behavior in the plan metadata
  --redact-paths         Replace local home paths with placeholders in output
  --platform <name>      windows or unix (defaults to current platform)
  --codex-home <path>    Override CODEX_HOME for planning only
  --agents-home <path>   Override AGENTS_HOME for planning only
  --home <path>          Override HOME for planning only
  --json                 Emit machine-readable JSON
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function manifestOperations(manifest, options) {
  return manifest.operations
    .filter((operation) => operation.platforms.includes(options.platform))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function createDiscovery(options) {
  const manifest = readJson(manifestPath);
  const packageJson = readJson(path.join(root, "package.json"));
  const operationsById = new Map(manifest.operations.map((operation) => [operation.id, operation]));
  const operations = manifestOperations(manifest, options).map((operation) => ({
    id: operation.id,
    kind: operation.kind,
    summary: operation.summary,
    platforms: operation.platforms,
    requiresFlag: operation.requiresFlag || null,
    risk: operation.risk,
    backup: Boolean(operation.backup),
    collision: operation.collision
  }));
  const profiles = Object.entries(manifest.profiles || {}).map(([id, operationIds]) => {
    const knownOperations = operationIds
      .map((operationId) => operationsById.get(operationId))
      .filter(Boolean)
      .filter((operation) => operation.platforms.includes(options.platform));
    return {
      id,
      operationIds: knownOperations.map((operation) => operation.id),
      operationCount: knownOperations.length,
      optionalFlags: sortedUnique(knownOperations.map((operation) => operation.requiresFlag)),
      highRiskOperationCount: knownOperations.filter((operation) => operation.risk === "high").length
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion: "codex-chef.install-plan-discovery.v1",
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    source: {
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      manifest: "manifests/install-plan.json",
      manifestVersion: manifest.schemaVersion
    },
    target: {
      platform: options.platform
    },
    profiles,
    operations
  };
}

function createPlan(options) {
  const manifest = readJson(manifestPath);
  const packageJson = readJson(path.join(root, "package.json"));
  const outputOptions = options.redactPaths
    ? {
        ...options,
        codexHome: "${HOME}/.codex",
        agentsHome: "${HOME}/.agents",
        home: "${HOME}"
      }
    : options;
  const contract = resolveInstallContract({
    ...options,
    ...outputOptions,
    manifest,
    root
  });
  const selected = contract.selectedComponents;
  const skipped = contract.skippedComponents;
  const operations = contract.operations;

  return {
    schemaVersion: "codex-chef.install-state-preview.v1",
    generatedAt: new Date().toISOString(),
    dryRunOnly: true,
    source: {
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      manifest: "manifests/install-plan.json",
      manifestVersion: manifest.schemaVersion
    },
    target: {
      platform: options.platform,
      codexHome: outputOptions.codexHome,
      agentsHome: outputOptions.agentsHome,
      home: outputOptions.home
    },
    options: {
      all: options.all,
      installSkills: options.installSkills,
      installGitGuards: options.installGitGuards,
      force: options.force,
      noBackup: options.noBackup,
      redactPaths: options.redactPaths
    },
    selectedComponentIds: selected.map((operation) => operation.id),
    skippedComponentIds: skipped.map((operation) => operation.id),
    operations
  };
}

function printPlan(plan) {
  console.log("Codex Chef install plan\n");
  console.log(`Package: ${plan.source.packageName}@${plan.source.packageVersion}`);
  console.log(`Platform: ${plan.target.platform}`);
  console.log(`Codex home: ${plan.target.codexHome}`);
  console.log(`Agents home: ${plan.target.agentsHome}`);
  console.log(`Selected components: ${plan.selectedComponentIds.join(", ")}`);
  console.log(`Skipped components: ${plan.skippedComponentIds.join(", ") || "(none)"}`);
  console.log(`Operations: ${plan.operations.length}`);
  console.log("");

  for (const operation of plan.operations) {
    console.log(`[${operation.kind}] ${operation.id}`);
    if (operation.kind === "git-config") {
      console.log(`  command: git config --global ${operation.key} ${operation.value}`);
    } else if (operation.kind === "chmod") {
      console.log(`  command: chmod ${operation.mode} ${operation.destination}`);
    } else if (operation.kind === "skill-install") {
      console.log(`  command: ${operation.command}`);
      console.log(`  source: ${operation.source}`);
    } else if (operation.kind === "write-marketplace") {
      console.log(`  target: ${operation.destination}`);
      console.log(`  plugin target: ${operation.pluginTarget}`);
    } else if (operation.kind === "refresh-plugin-cache") {
      console.log(`  plugin: ${operation.pluginId}`);
      console.log(`  source: ${operation.source}`);
      console.log(`  cache root: ${operation.destination}`);
    } else if (operation.kind === "generate-mcp-profile") {
      console.log(`  template: ${operation.source}`);
      console.log(`  config source: ${operation.configSource}`);
      console.log(`  target: ${operation.destination}`);
    } else if (operation.kind === "write-ownership-marker") {
      console.log(`  source skill: ${operation.source}`);
      console.log(`  marker: ${operation.destination}`);
    } else {
      console.log(`  source: ${operation.source}`);
      console.log(`  target: ${operation.destination}`);
    }
    console.log(`  collision: ${operation.collision}`);
    console.log(`  backup: ${operation.backup ? "yes" : "no"}`);
    console.log(`  no-backup policy: ${operation.noBackupPolicy}`);
    console.log(`  force: ${operation.force ? "yes" : "no"}`);
    console.log(`  risk: ${operation.risk}`);
    console.log(`  selected by: ${operation.selectedBy}`);
    console.log("");
  }
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = key(item);
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, count]) => `${name}: ${count}`)
    .join(", ");
}

function printPlanSummary(plan) {
  const highRisk = plan.operations.filter((operation) => operation.risk === "high").length;
  const backupBacked = plan.operations.filter((operation) => operation.backup).length;
  console.log("Codex Chef install plan summary\n");
  console.log(`Package: ${plan.source.packageName}@${plan.source.packageVersion}`);
  console.log(`Platform: ${plan.target.platform}`);
  console.log(`Codex home: ${plan.target.codexHome}`);
  console.log(`Agents home: ${plan.target.agentsHome}`);
  console.log(`Selected components (${plan.selectedComponentIds.length}): ${plan.selectedComponentIds.join(", ")}`);
  console.log(`Skipped components (${plan.skippedComponentIds.length}): ${plan.skippedComponentIds.join(", ") || "(none)"}`);
  console.log(`Operations: ${plan.operations.length}; high risk: ${highRisk}; backup-backed: ${backupBacked}; force: ${plan.options.force ? "yes" : "no"}`);
  console.log(`Kinds: ${countBy(plan.operations, (operation) => operation.kind)}`);
  console.log(`Risks: ${countBy(plan.operations, (operation) => operation.risk)}`);
  console.log("");
  console.log("No files are changed by this plan command. Use --json for the machine-readable contract or omit --summary for the full operation list.");
}

function printProfiles(discovery) {
  console.log("Codex Chef install profiles\n");
  console.log(`Package: ${discovery.source.packageName}@${discovery.source.packageVersion}`);
  console.log(`Platform: ${discovery.target.platform}`);
  console.log("");
  console.log("Profile | Operations | High risk | Optional flags");
  console.log("--- | ---: | ---: | ---");
  for (const profile of discovery.profiles) {
    console.log(`${profile.id} | ${profile.operationCount} | ${profile.highRiskOperationCount} | ${profile.optionalFlags.join(", ") || "none"}`);
  }
}

function printOperations(discovery) {
  console.log("Codex Chef install operations\n");
  console.log(`Package: ${discovery.source.packageName}@${discovery.source.packageVersion}`);
  console.log(`Platform: ${discovery.target.platform}`);
  console.log("");
  console.log("Operation | Kind | Risk | Requires | Backup | Collision");
  console.log("--- | --- | --- | --- | --- | ---");
  for (const operation of discovery.operations) {
    console.log(`${operation.id} | ${operation.kind} | ${operation.risk} | ${operation.requiresFlag || "default"} | ${operation.backup ? "yes" : "no"} | ${operation.collision}`);
  }
}

try {
  const options = parseArgs(process.argv);
  if (options.listProfiles || options.listOperations) {
    const discovery = createDiscovery(options);
    if (options.json) {
      console.log(JSON.stringify(discovery, null, 2));
    } else {
      if (options.listProfiles) printProfiles(discovery);
      if (options.listProfiles && options.listOperations) console.log("");
      if (options.listOperations) printOperations(discovery);
    }
    process.exit(0);
  }
  const plan = createPlan(options);
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else if (options.summary) {
    printPlanSummary(plan);
  } else {
    printPlan(plan);
  }
} catch (error) {
  process.exitCode = emitCliError({
    tool: "plan-install",
    error,
    argv: process.argv.slice(2),
    root,
    prefix: "Install planning failed"
  });
}
