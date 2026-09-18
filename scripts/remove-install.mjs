#!/usr/bin/env node
// Codex-side removal. Preview-first and ownership-scoped: only files that are
// still byte-identical to their repository source, directories that carry an
// AgentChef ownership marker, the AgentChef marketplace entry, and the
// installed plugin cache entry are removed. User-changed managed files, extra
// files inside managed directories, merged config.toml blocks, generated MCP
// profiles, Git guards, and backups are never touched by this command.
//   node scripts/remove-install.mjs [--codex-home <p>] [--agents-home <p>] [--apply] [--json] [--redact-paths]
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliUsageError, emitCliError, requireCliValue } from "./lib/cli-error-contract.mjs";
import { resolveInstallContract } from "./lib/install-contract.mjs";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { acquireOperationLockSet } from "./lib/operation-lock.mjs";
import { createOperationJournal } from "./lib/operation-journal.mjs";
import { managedMarkerNames } from "./lib/identity.mjs";
import { pinnedSkillProvenanceFileName, pinnedSkillSchemaVersion } from "./lib/skill-provenance.mjs";
import { PLUGIN_ID } from "./refresh-installed-plugin.mjs";
import { platformCommand } from "./lib/platform-command.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
export const removePlanSchemaVersion = "agentchef.remove-plan.v1";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function listRegularFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(path.relative(directory, full));
    }
  };
  if (fs.existsSync(directory)) walk(directory);
  return files.sort();
}

function fileDecision(destination, sourceBuffer) {
  const stat = lstatOrNull(destination);
  if (!stat) return "absent";
  if (stat.isSymbolicLink() || !stat.isFile()) return "foreign";
  return fs.readFileSync(destination).equals(sourceBuffer) ? "remove" : "user-changed";
}

function directoryPlan(sourceRoot, destination, { requireMarker }) {
  const stat = lstatOrNull(destination);
  if (!stat) return { decision: "absent", files: [] };
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { decision: "foreign", files: [] };
  // requireMarker lists the accepted ownership marker spellings; every marker that
  // is present is AgentChef-owned and leaves with the files (a partially migrated
  // home can carry both spellings).
  const presentMarkers = requireMarker ? requireMarker.filter((name) => fs.existsSync(path.join(destination, name))) : [];
  if (requireMarker && presentMarkers.length === 0) return { decision: "foreign", files: [] };
  const files = listRegularFiles(sourceRoot).map((relative) => {
    const target = path.join(destination, relative);
    const decision = fileDecision(target, fs.readFileSync(path.join(sourceRoot, relative)));
    return { relative, target, decision };
  });
  for (const marker of presentMarkers) files.push({ relative: marker, target: path.join(destination, marker), decision: "remove" });
  const extras = listRegularFiles(destination).filter((relative) => !files.some((file) => file.relative === relative));
  return { decision: files.some((file) => file.decision === "remove") ? "remove-owned" : "nothing-owned", files, extras };
}

export function planCodexRemoval(options) {
  const { codexHome, agentsHome, platform } = options;
  const contract = resolveInstallContract({
    root: repoRoot,
    platform,
    codexHome,
    agentsHome,
    home: options.home,
    all: true,
    installSkills: true,
    targets: "codex"
  });
  const items = [];
  for (const action of contract.operations) {
    if (action.kind === "copy-file") {
      const sourceBuffer = fs.readFileSync(path.join(repoRoot, action.source));
      items.push({ id: action.id, kind: "file", target: action.destination, decision: fileDecision(action.destination, sourceBuffer) });
      continue;
    }
    if (action.kind === "generate-mcp-profile") {
      items.push({ id: action.id, kind: "generated-config", target: action.destination, decision: fs.existsSync(action.destination) ? "kept-generated" : "absent" });
      continue;
    }
    if (action.kind === "copy-directory") {
      const sourceRoot = path.join(repoRoot, action.source);
      const requireMarker = action.componentId.endsWith("-direct-skill") ? [...managedMarkerNames] : null;
      const plan = directoryPlan(sourceRoot, action.destination, { requireMarker });
      items.push({ id: action.id, kind: "directory", target: action.destination, decision: plan.decision, files: plan.files, extras: plan.extras || [] });
      continue;
    }
    if (action.kind === "write-ownership-marker") continue;
    if (action.kind === "write-marketplace") {
      let decision = "absent";
      if (fs.existsSync(action.destination)) {
        try {
          const document = JSON.parse(fs.readFileSync(action.destination, "utf8").replace(/^\uFEFF/, ""));
          decision = (document.plugins || []).some((plugin) => plugin?.name === "agentchef-workflows") ? "remove-entry" : "no-entry";
        } catch {
          decision = "foreign";
        }
      }
      items.push({ id: action.id, kind: "marketplace", target: action.destination, decision });
      continue;
    }
    if (action.kind === "refresh-plugin-cache") {
      items.push({ id: action.id, kind: "plugin-cache", target: action.destination, decision: "cli-remove", pluginId: action.pluginId });
      continue;
    }
    if (action.kind === "skill-install") {
      const provenance = path.join(action.destination, pinnedSkillProvenanceFileName);
      let decision = "absent";
      if (lstatOrNull(action.destination)) {
        decision = "foreign";
        try {
          const record = JSON.parse(fs.readFileSync(provenance, "utf8"));
          if (record?.schemaVersion === pinnedSkillSchemaVersion) decision = "remove";
        } catch {
          decision = "foreign";
        }
      }
      items.push({ id: action.id, kind: "curated-skill", target: action.destination, decision });
      continue;
    }
    if (action.kind === "git-config" || action.kind === "chmod") continue;
  }
  const gitGuardNote = "Global Git guards are not removed here; restore them with the receipt printed at install time: node scripts/manage-global-git-guards.mjs restore --home <home> --receipt <receipt> --json";
  const configNote = "config.toml keeps its merged AgentChef blocks and generated MCP profiles stay in place; restore a backup or edit them by hand.";
  return { items, notes: [configNote, gitGuardNote] };
}

function redact(value, options) {
  if (!options.redactPaths || typeof value !== "string") return value;
  return value
    .replaceAll(options.codexHome, "${CODEX_HOME}")
    .replaceAll(options.agentsHome, "${AGENTS_HOME}")
    .replaceAll(options.home, "${HOME}")
    .replaceAll(repoRoot, "${REPO_ROOT}");
}

function backupInto(backupRoot, roots, target) {
  const stat = lstatOrNull(target);
  if (!stat) return null;
  const root = roots.find((candidate) => target === candidate || target.startsWith(`${candidate}${path.sep}`));
  if (!root) throw new Error(`Refusing to back up a target outside the managed roots: ${target}`);
  const destination = path.join(backupRoot, path.basename(root), path.relative(root, target));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(target, destination, { recursive: true, force: true });
  return destination;
}

function removeEmptyParents(directory, stopAt) {
  let current = directory;
  while (current !== stopAt && current.startsWith(stopAt) && fs.existsSync(current) && fs.readdirSync(current).length === 0) {
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

export function applyCodexRemoval(options, plan) {
  const { codexHome, agentsHome } = options;
  const roots = [codexHome, agentsHome];
  for (const item of plan.items) {
    if (["file", "directory", "marketplace", "curated-skill"].includes(item.kind)) assertManagedTargetPath(item.target, roots);
  }
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")}-${process.pid}`;
  const backupRoot = path.join(codexHome, "backups", `agentchef-remove-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const lockSet = acquireOperationLockSet({ roots, operation: "remove" });
  const journal = createOperationJournal({ backupRoot, operation: "remove" });
  const results = [];
  const removeFile = (target) => {
    const backup = backupInto(backupRoot, roots, target);
    if (backup) journal.recordBackup(backup);
    journal.prepareMutation({ target, backup });
    fs.rmSync(target, { force: true });
    journal.markApplied(target);
  };
  try {
    for (const item of plan.items) {
      if (item.kind === "file") {
        if (item.decision !== "remove") {
          results.push({ id: item.id, status: item.decision });
          continue;
        }
        removeFile(item.target);
        removeEmptyParents(path.dirname(item.target), codexHome);
        results.push({ id: item.id, status: "removed" });
        continue;
      }
      if (item.kind === "directory" || item.kind === "curated-skill") {
        if (!["remove-owned", "remove"].includes(item.decision)) {
          results.push({ id: item.id, status: item.decision });
          continue;
        }
        if (item.kind === "curated-skill") {
          const backup = backupInto(backupRoot, roots, item.target);
          journal.recordBackup(backup);
          journal.prepareMutation({ target: item.target, backup });
          fs.rmSync(item.target, { recursive: true, force: true });
          journal.markApplied(item.target);
          results.push({ id: item.id, status: "removed" });
          continue;
        }
        let removed = 0;
        for (const file of item.files.filter((entry) => entry.decision === "remove")) {
          removeFile(file.target);
          removed += 1;
        }
        // Empty directories left behind by owned files are pruned; extras keep their directory.
        for (const file of item.files) removeEmptyParents(path.dirname(file.target), path.dirname(item.target));
        results.push({ id: item.id, status: removed > 0 ? "removed-owned-files" : "nothing-owned", removed, kept: item.files.filter((entry) => entry.decision === "user-changed").length, extras: item.extras.length });
        continue;
      }
      if (item.kind === "marketplace") {
        if (item.decision !== "remove-entry") {
          results.push({ id: item.id, status: item.decision });
          continue;
        }
        const document = JSON.parse(fs.readFileSync(item.target, "utf8").replace(/^\uFEFF/, ""));
        document.plugins = (document.plugins || []).filter((plugin) => plugin?.name !== "agentchef-workflows");
        const backup = backupInto(backupRoot, roots, item.target);
        journal.recordBackup(backup);
        journal.prepareMutation({ target: item.target, backup });
        fs.writeFileSync(item.target, `${JSON.stringify(document, null, 2)}\n`);
        journal.markApplied(item.target);
        results.push({ id: item.id, status: "entry-removed" });
        continue;
      }
      if (item.kind === "plugin-cache") {
        const codex = platformCommand("codex", options.platform);
        const probe = spawnSync(codex, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30000, shell: false });
        if (probe.error || probe.status !== 0) {
          results.push({ id: item.id, status: "skipped", reason: `codex CLI not available; run: codex plugin remove ${item.pluginId}` });
          continue;
        }
        const run = spawnSync(codex, ["plugin", "remove", item.pluginId], { encoding: "utf8", windowsHide: true, timeout: 120000, shell: false, env: { ...process.env, CODEX_HOME: codexHome } });
        results.push({ id: item.id, status: run.status === 0 ? "cli-removed" : "attention", output: `${run.stdout || ""}${run.stderr || ""}`.trim().slice(0, 400) });
        continue;
      }
      results.push({ id: item.id, status: item.decision });
    }
    journal.finish("complete");
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "write-backup-manifest.mjs"), "--backup-root", backupRoot, "--operation", "remove"], { stdio: "ignore", windowsHide: true });
    return { backupRoot, results };
  } catch (error) {
    try {
      journal.finish("failed");
    } catch {
      // rollback below reads the journal from disk
    }
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "lib", "operation-journal.mjs"), "rollback", backupRoot, "-", codexHome, agentsHome], { stdio: "ignore", windowsHide: true });
    throw error;
  } finally {
    lockSet.release();
  }
}

function parseArgs(argv) {
  const options = {
    platform: process.platform === "win32" ? "windows" : "unix",
    home: os.homedir(),
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    agentsHome: process.env.AGENTS_HOME || path.join(os.homedir(), ".agents"),
    apply: false,
    json: false,
    redactPaths: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--redact-paths") options.redactPaths = true;
    else if (arg === "--codex-home") { options.codexHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--agents-home") { options.agentsHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--home") { options.home = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--platform") { options.platform = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/remove-install.mjs [--dry-run|--apply] [--codex-home <path>] [--agents-home <path>] [--home <path>] [--platform windows|unix] [--redact-paths] [--json]

Removes only AgentChef-owned Codex-side files: byte-identical managed files,
marker-carrying direct and curated skills, source-owned plugin files, the
marketplace entry, and the installed plugin cache entry. Everything else is
reported and kept. Backups land under CODEX_HOME/backups.`);
      process.exit(0);
    } else throw new CliUsageError(`Unknown argument: ${arg}`);
  }
  if (!["windows", "unix"].includes(options.platform)) throw new CliUsageError("--platform must be windows or unix");
  options.codexHome = path.resolve(options.codexHome);
  options.agentsHome = path.resolve(options.agentsHome);
  options.home = path.resolve(options.home);
  return options;
}

function printPlan(plan, options) {
  console.log(`AgentChef Codex target ${options.apply ? "removal" : "removal plan"}`);
  console.log(`Codex home: ${redact(options.codexHome, options)}`);
  console.log(`Agents home: ${redact(options.agentsHome, options)}`);
  console.log("");
  for (const item of plan.items) {
    const detail = item.kind === "directory" && item.files
      ? ` (${item.files.filter((file) => file.decision === "remove").length} owned, ${item.files.filter((file) => file.decision === "user-changed").length} user-changed, ${item.extras.length} extras kept)`
      : "";
    console.log(`  ${item.decision.padEnd(18)} ${item.kind.padEnd(16)} ${redact(item.target, options)}${detail}`);
  }
  console.log("");
  for (const note of plan.notes) console.log(`Note: ${note}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = planCodexRemoval(options);
  const outcome = options.apply ? applyCodexRemoval(options, plan) : null;
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: removePlanSchemaVersion,
      dryRunOnly: !options.apply,
      target: { platform: options.platform, codexHome: redact(options.codexHome, options), agentsHome: redact(options.agentsHome, options) },
      items: plan.items.map((item) => ({ ...item, target: redact(item.target, options), files: item.files?.map((file) => ({ ...file, target: redact(file.target, options) })) })),
      notes: plan.notes,
      outcome: outcome ? { ...outcome, backupRoot: redact(outcome.backupRoot, options) } : null
    }, null, 2));
    return;
  }
  printPlan(plan, options);
  if (outcome) {
    for (const result of outcome.results) console.log(`  - ${result.id}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    console.log(`Backup root: ${redact(outcome.backupRoot, options)}`);
  } else {
    console.log("No files were changed. Add --apply to run this removal.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.exitCode = emitCliError({ tool: "remove-install", error, argv: process.argv.slice(2), root: repoRoot, prefix: "Codex target removal failed" });
  }
}
