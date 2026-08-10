#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectGlobalGitGuards } from "./global-git-guards.mjs";
import { resolveInstallContract } from "./install-contract.mjs";
import { assertManagedTargetPath, isPathInside } from "./managed-path-safety.mjs";
import { refreshInstalledPlugin } from "../refresh-installed-plugin.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
function pathEntryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function inspectInstallerSafety({
  codexHome,
  agentsHome,
  home,
  noBackup = false,
  dryRun = false,
  installSkills = false,
  installGitGuards = false,
  adoptionRequested = false,
  adoptGitIgnore = false,
  adoptGitHook = false,
  adoptGitExcludesFile = false,
  adoptGitHooksPath = false
}) {
  const codexRoot = path.resolve(codexHome);
  const agentsRoot = path.resolve(agentsHome);
  const homeRoot = home ? path.resolve(home) : path.dirname(codexRoot);
  const contract = resolveInstallContract({
    root: repoRoot,
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome: codexRoot,
    agentsHome: agentsRoot,
    home: homeRoot,
    installSkills,
    installGitGuards,
    noBackup
  });
  const codexTargets = [];
  const agentsTargets = [];
  const homeTargets = [];
  for (const target of contract.preflightTargets.map((entry) => path.resolve(entry))) {
    if (isPathInside(target, codexRoot)) {
      assertManagedTargetPath(target, [codexRoot]);
      codexTargets.push(target);
    } else if (isPathInside(target, agentsRoot)) {
      assertManagedTargetPath(target, [agentsRoot]);
      agentsTargets.push(target);
    } else if (installGitGuards && isPathInside(target, homeRoot)) {
      assertManagedTargetPath(target, [homeRoot]);
      homeTargets.push(target);
    } else {
      throw new Error(`Resolved install target is outside the selected managed roots: ${target}`);
    }
  }

  const inspection = {
    targetCounts: {
      codex: codexTargets.length,
      agents: agentsTargets.length,
      home: homeTargets.length
    },
    contract: {
      profile: contract.profileName,
      components: contract.selectedComponents.map((operation) => operation.id),
      actions: contract.operations.map((operation) => ({
        id: operation.id,
        kind: operation.kind,
        destination: operation.destination ?? null,
        key: operation.key ?? null,
        backup: operation.backup
      }))
    },
    noBackup: { requested: noBackup, dryRun, status: "not-requested", conflicts: [] },
    gitGuards: { requested: installGitGuards, status: "not-requested", files: [], config: [] }
  };

  if (installGitGuards) {
    const gitGuards = inspectGlobalGitGuards({
      home: homeRoot,
      gitConfigGlobal: process.env.GIT_CONFIG_GLOBAL || undefined,
      ignoreSource: path.join(repoRoot, "templates", "git", ".gitignore_global"),
      hookSource: path.join(repoRoot, "templates", "git", "pre-commit"),
      adoptFiles: [
        ...(adoptGitIgnore ? ["gitignore-global"] : []),
        ...(adoptGitHook ? ["pre-commit-hook"] : [])
      ],
      adoptKeys: [
        ...(adoptGitExcludesFile ? ["core.excludesfile"] : []),
        ...(adoptGitHooksPath ? ["core.hooksPath"] : [])
      ]
    });
    inspection.gitGuards = {
      requested: true,
      status: gitGuards.ok ? "safe" : "conflict",
      ...gitGuards
    };
    if (!gitGuards.ok) {
      const detail = gitGuards.conflicts.map((item) => item.message).join(" ");
      const error = new Error(`Git guard ownership conflict; refusing all installer writes. ${detail}`);
      error.inspection = inspection;
      throw error;
    }
  }

  if (noBackup && !dryRun) {
    const existingTargets = [
      ...codexTargets,
      ...agentsTargets,
      ...homeTargets,
      path.join(codexRoot, "plugins", "cache"),
      path.join(agentsRoot, "plugins", "cache")
    ].filter(pathEntryExists);
    const expectedPluginVersion = JSON.parse(fs.readFileSync(
      path.join(repoRoot, "plugins", "codex-chef-workflows", ".codex-plugin", "plugin.json"),
      "utf8"
    )).version;
    const pluginRefresh = refreshInstalledPlugin({
      apply: false,
      codexHome: codexRoot,
      expectedVersion: expectedPluginVersion,
      platform: process.platform === "win32" ? "windows" : "unix"
    });
    const conflicts = [];
    if (existingTargets.length > 0) conflicts.push({ kind: "existing-target", targets: existingTargets });
    if (installSkills) conflicts.push({ kind: "curated-skill-mutation" });
    if (installGitGuards) conflicts.push({ kind: "global-git-setting" });
    if (adoptionRequested) conflicts.push({ kind: "adoption-request" });
    if (pluginRefresh.status === "planned") conflicts.push({ kind: "installed-plugin-cache-refresh" });
    inspection.noBackup = {
      requested: true,
      dryRun: false,
      status: conflicts.length === 0 ? "creation-only" : "rejected",
      conflicts
    };
    if (conflicts.length > 0) {
      const error = new Error("No-backup mode is creation-only; an existing target, cache/global setting change, curated-skill mutation, or adoption request requires a backup-backed install.");
      error.inspection = inspection;
      throw error;
    }
  } else if (noBackup) {
    inspection.noBackup = { requested: true, dryRun: true, status: "preview-only", conflicts: [] };
  }

  return inspection;
}

function parseArgs(argv) {
  const options = {
    codexHome: null,
    agentsHome: null,
    home: null,
    noBackup: false,
    dryRun: false,
    installSkills: false,
    installGitGuards: false,
    adoptionRequested: false,
    adoptGitIgnore: false,
    adoptGitHook: false,
    adoptGitExcludesFile: false,
    adoptGitHooksPath: false,
    json: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--codex-home", "--agents-home", "--home"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--codex-home") options.codexHome = value;
      else if (arg === "--agents-home") options.agentsHome = value;
      else options.home = value;
      index += 1;
    } else if (arg === "--no-backup") options.noBackup = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--install-skills") options.installSkills = true;
    else if (arg === "--install-git-guards") options.installGitGuards = true;
    else if (arg === "--adoption-requested") options.adoptionRequested = true;
    else if (arg === "--adopt-git-ignore") options.adoptGitIgnore = true;
    else if (arg === "--adopt-git-hook") options.adoptGitHook = true;
    else if (arg === "--adopt-git-excludes-file") options.adoptGitExcludesFile = true;
    else if (arg === "--adopt-git-hooks-path") options.adoptGitHooksPath = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.codexHome || !options.agentsHome) {
    throw new Error("--codex-home and --agents-home are required.");
  }
  if (options.installGitGuards && !options.home) throw new Error("--home is required with --install-git-guards.");
  if (
    options.adoptGitIgnore
    || options.adoptGitHook
    || options.adoptGitExcludesFile
    || options.adoptGitHooksPath
  ) {
    if (!options.installGitGuards) throw new Error("Git guard adoption flags require --install-git-guards.");
    options.adoptionRequested = true;
  }
  return options;
}

function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
    const inspection = inspectInstallerSafety(options);
    if (options.json) console.log(JSON.stringify({ ok: true, inspection }, null, 2));
  } catch (error) {
    if (options?.json) {
      console.error(JSON.stringify({ ok: false, error: error.message, inspection: error.inspection || null }, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2));
}
