#!/usr/bin/env node
// 1.0.0 identity migration. Converts the on-disk `codex-chef` spellings of an
// installed home to `agentchef` in one preview-first, journaled transaction:
// direct-skill and curated-skill ownership markers, the operator skill folder,
// the plugin directories, the personal marketplace entry and name, the Codex
// plugin cache entry, a still-legacy Git hook, and (with --target claude or
// both) the Claude install/merge receipts, marketplace entry, and skill links.
// Backups, user content, and anything not carrying a known legacy spelling
// are never touched. Old backup folders keep their names; the CLI lists both.
//   node scripts/migrate-identity.mjs [--dry-run|--apply] [--target codex|claude|both] [options]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliUsageError, emitCliError, requireCliValue } from "./lib/cli-error-contract.mjs";
import { acceptsSchema, identity, isLegacySchema, legacyProductName, modernSchema } from "./lib/identity.mjs";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { acquireOperationLockSet } from "./lib/operation-lock.mjs";
import { createOperationJournal } from "./lib/operation-journal.mjs";
import { parseTargetSelection } from "./lib/targets/index.mjs";
import { resolveClaudeHomes } from "./lib/targets/claude.mjs";
import { inspectDirectSkillTarget, markerFileName, writeDirectSkillMarker } from "./manage-direct-skill-target.mjs";
import { platformCommand } from "./lib/platform-command.mjs";
import { writeMarketplaceEntry } from "./upsert-marketplace-entry.mjs";
import { KNOWN_LEGACY_FILE_SHA256, inspectGlobalGitGuards } from "./lib/global-git-guards.mjs";
import { inspectSkillLink, createSkillLink, removeSkillLink } from "./lib/skill-links.mjs";
import { claudeInstallReceiptName } from "./install-claude-target.mjs";
import crypto from "node:crypto";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
export const migrationSchemaVersion = "agentchef.identity-migration.v1";

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isRealDirectory(target) {
  const stat = lstatOrNull(target);
  return Boolean(stat && stat.isDirectory() && !stat.isSymbolicLink());
}

function directSkillNames() {
  const catalog = readJson(path.join(repoRoot, "catalog", "skills.json"), { skills: [] });
  return catalog.skills.filter((skill) => skill.directInstall === true).map((skill) => skill.name);
}

function curatedSkillNames() {
  const catalog = readJson(path.join(repoRoot, "catalog", "skills.json"), { skills: [] });
  return catalog.skills.filter((skill) => skill.install === true).map((skill) => skill.name);
}

// ------------------------------------------------------------------ planning
export function planIdentityMigration(options) {
  const { codexHome, agentsHome, claudeHome, claudeJson, home, targets } = options;
  const steps = [];
  const note = (id, kind, target, decision, detail = {}) => steps.push({ id, kind, target, decision, ...detail });
  const withCodex = targets.has("codex");
  const withClaude = targets.has("claude");
  const skillsRoot = path.join(agentsHome, "skills");

  // 1. Operator skill folder rename, then every direct-skill marker.
  const legacyOperator = path.join(skillsRoot, identity.legacyOperatorSkill);
  const currentOperator = path.join(skillsRoot, identity.operatorSkill);
  if (isRealDirectory(legacyOperator)) {
    note("operator-skill-folder", "rename-directory", legacyOperator, isRealDirectory(currentOperator) ? "remove-legacy" : "rename", { destination: currentOperator });
  } else {
    note("operator-skill-folder", "rename-directory", legacyOperator, "absent", { destination: currentOperator });
  }
  for (const name of directSkillNames()) {
    const target = path.join(skillsRoot, name);
    const legacyMarker = path.join(target, identity.legacyManagedMarker);
    const sourceRoot = path.join(repoRoot, "plugins", identity.pluginName, "skills", name);
    const effectiveTarget = name === identity.operatorSkill && !isRealDirectory(target) && isRealDirectory(legacyOperator) ? legacyOperator : target;
    if (!isRealDirectory(effectiveTarget)) {
      note(`direct-skill-marker:${name}`, "rewrite-marker", legacyMarker, "absent");
      continue;
    }
    if (!fs.existsSync(path.join(effectiveTarget, identity.legacyManagedMarker))) {
      note(`direct-skill-marker:${name}`, "rewrite-marker", legacyMarker, fs.existsSync(path.join(effectiveTarget, markerFileName)) ? "current" : "no-marker");
      continue;
    }
    let status;
    if (effectiveTarget === legacyOperator) {
      // The folder is renamed first; until then the legacy marker itself is the evidence.
      const marker = readJson(path.join(effectiveTarget, identity.legacyManagedMarker));
      status = acceptsSchema(marker?.schemaVersion, "managed-direct-skill", 1)
        && [identity.operatorSkill, identity.legacyOperatorSkill].includes(marker?.name)
        ? "managed"
        : "foreign";
    } else {
      try {
        status = inspectDirectSkillTarget(sourceRoot, effectiveTarget).status;
      } catch {
        status = "foreign";
      }
    }
    note(`direct-skill-marker:${name}`, "rewrite-marker", path.join(effectiveTarget, identity.legacyManagedMarker), status.startsWith("managed") || status === "legacy-match" ? "rewrite" : "foreign", { state: status });
  }

  // 2. Curated skill provenance markers.
  for (const name of curatedSkillNames()) {
    const target = path.join(skillsRoot, name);
    const legacyMarker = path.join(target, identity.legacySourceMarker);
    if (!isRealDirectory(target) || !fs.existsSync(legacyMarker)) {
      note(`curated-skill-marker:${name}`, "rewrite-marker", legacyMarker, fs.existsSync(path.join(target, identity.sourceMarker)) ? "current" : "absent");
      continue;
    }
    const marker = readJson(legacyMarker);
    note(`curated-skill-marker:${name}`, "rewrite-marker", legacyMarker, acceptsSchema(marker?.schemaVersion, "pinned-skill", 1) ? "rewrite" : "foreign");
  }

  // 3. Plugin directories and the personal marketplace.
  const pluginDirectories = [
    ...(withCodex ? [["codex-plugin-directory", path.join(codexHome, "plugins", identity.legacyPluginName), path.join(codexHome, "plugins", identity.pluginName)]] : []),
    ["marketplace-source-directory", path.join(agentsHome, "plugins", "sources", identity.legacyPluginName), path.join(agentsHome, "plugins", "sources", identity.pluginName)]
  ];
  for (const [id, legacy, current] of pluginDirectories) {
    if (!isRealDirectory(legacy)) {
      note(id, "rename-directory", legacy, "absent", { destination: current });
      continue;
    }
    note(id, "rename-directory", legacy, isRealDirectory(current) ? "remove-legacy" : "rename", { destination: current });
  }
  if (withCodex) {
    const marketplacePath = path.join(agentsHome, "plugins", "marketplace.json");
    const marketplace = readJson(marketplacePath);
    if (!marketplace) {
      note("marketplace", "rewrite-marketplace", marketplacePath, "absent");
    } else {
      const hasLegacyEntry = (marketplace.plugins || []).some((plugin) => plugin?.name === identity.legacyPluginName);
      const legacyName = marketplace.name === identity.legacyMarketplaceName;
      note("marketplace", "rewrite-marketplace", marketplacePath, hasLegacyEntry || legacyName ? "rewrite" : "current", { legacyEntry: hasLegacyEntry, legacyName });
    }
    note("codex-plugin-cache", "codex-plugin-cli", codexHome, "cli", {
      commands: [
        `codex plugin remove ${identity.legacyPluginId}`,
        `codex plugin add ${identity.pluginId}`
      ]
    });
  }

  // 4. Git hook that still carries a legacy template.
  const hookPath = path.join(home, ".githooks", "pre-commit");
  const hookStat = lstatOrNull(hookPath);
  if (hookStat?.isFile() && !hookStat.isSymbolicLink()) {
    const hash = sha256(fs.readFileSync(hookPath));
    const templateHash = sha256(fs.readFileSync(path.join(repoRoot, "templates", "git", "pre-commit")));
    note("git-pre-commit-hook", "rewrite-git-hook", hookPath, hash === templateHash ? "current" : KNOWN_LEGACY_FILE_SHA256["pre-commit-hook"].includes(hash) ? "rewrite" : "foreign");
  } else {
    note("git-pre-commit-hook", "rewrite-git-hook", hookPath, "absent");
  }

  // 5. Claude Code side.
  if (withClaude) {
    const receiptPath = path.join(claudeHome, "agentchef", claudeInstallReceiptName);
    const receipt = readJson(receiptPath);
    if (!receipt) {
      note("claude-install-receipt", "rewrite-schema", receiptPath, "absent");
    } else {
      note("claude-install-receipt", "rewrite-schema", receiptPath, isLegacySchema(receipt.schemaVersion) ? "rewrite" : "current");
      for (const mergeReceiptPath of receipt.receipts || []) {
        const mergeReceipt = readJson(mergeReceiptPath);
        note(`claude-merge-receipt:${path.basename(mergeReceiptPath)}`, "rewrite-schema", mergeReceiptPath, !mergeReceipt ? "absent" : isLegacySchema(mergeReceipt.schemaVersion) ? "rewrite" : "current");
      }
      const legacyLink = path.join(claudeHome, "skills", identity.legacyOperatorSkill);
      const linkState = inspectSkillLink(legacyLink, path.join(skillsRoot, identity.legacyOperatorSkill));
      note("claude-operator-skill-link", "relink", legacyLink, linkState.status === "link-current" || linkState.status === "link-elsewhere" ? "relink" : linkState.status === "absent" ? "absent" : "foreign", { destination: path.join(claudeHome, "skills", identity.operatorSkill), linkTarget: currentOperator });
    }
    const claudeMarketplacePath = path.join(agentsHome, "plugins", ".claude-plugin", "marketplace.json");
    const claudeMarketplace = readJson(claudeMarketplacePath);
    note("claude-marketplace", "rewrite-marketplace", claudeMarketplacePath, !claudeMarketplace ? "absent" : (claudeMarketplace.plugins || []).some((plugin) => plugin?.name === identity.legacyPluginName) ? "rewrite" : "current");
    note("claude-plugin-cache", "claude-plugin-cli", claudeHome, "cli", {
      commands: [
        `claude plugin uninstall ${identity.legacyPluginName}@${identity.marketplaceName}`,
        `claude plugin install ${identity.pluginId} --scope user`
      ]
    });
  }

  const staleEnvironment = Object.keys(process.env).filter((key) => key.startsWith(identity.legacyEnvPrefix) && !key.startsWith(`${identity.legacyEnvPrefix}TEST_`));
  const notes = [
    "Backup folders keep their existing names; `npm run chef -- --backups` lists both prefixes.",
    ...(staleEnvironment.length > 0 ? [`Environment variables still using the legacy prefix (rename them yourself): ${staleEnvironment.join(", ")}`] : [])
  ];
  return { steps, notes, targets: [...targets], claudeJson };
}

// ------------------------------------------------------------------ apply
function backupInto(backupRoot, roots, target) {
  const stat = lstatOrNull(target);
  if (!stat) return null;
  const root = roots.find((candidate) => target === candidate || target.startsWith(`${candidate}${path.sep}`));
  if (!root) throw new Error(`Refusing to back up a target outside the managed roots: ${target}`);
  const destination = path.join(backupRoot, path.basename(root), path.relative(root, target));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (stat.isSymbolicLink()) {
    fs.writeFileSync(`${destination}.link.json`, `${JSON.stringify({ link: target, resolvedTarget: fs.readlinkSync(target) }, null, 2)}\n`);
    return `${destination}.link.json`;
  }
  fs.cpSync(target, destination, { recursive: true, force: true });
  return destination;
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function applyIdentityMigration(options, plan) {
  const { codexHome, agentsHome, claudeHome, claudeJson, home } = options;
  const roots = [codexHome, agentsHome, ...(plan.targets.includes("claude") ? [claudeHome] : [])];
  const homeRoots = [...roots, path.join(home, ".githooks")];
  for (const step of plan.steps) {
    if (["rewrite", "rename", "remove-legacy", "relink"].includes(step.decision) && step.kind !== "rewrite-git-hook") {
      assertManagedTargetPath(step.kind === "relink" ? path.dirname(step.target) : step.target, homeRoots);
    }
  }
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")}-${process.pid}`;
  const backupRoot = path.join(codexHome, "backups", `${identity.backupPrefix}migrate-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const lockSet = acquireOperationLockSet({ roots, operation: "migrate-identity" });
  const journal = createOperationJournal({ backupRoot, operation: "migrate-identity" });
  const results = [];
  const record = (id, status, extra = {}) => results.push({ id, status, ...extra });
  const mutateFile = (target, writer) => {
    const backup = backupInto(backupRoot, homeRoots, target);
    if (backup) journal.recordBackup(backup);
    journal.prepareMutation({ target, backup });
    writer();
    journal.markApplied(target);
  };
  try {
    for (const step of plan.steps) {
      if (!["rewrite", "rename", "remove-legacy", "relink", "cli"].includes(step.decision)) {
        record(step.id, step.decision);
        continue;
      }
      if (step.kind === "rename-directory") {
        if (step.decision === "rename") {
          const backup = backupInto(backupRoot, homeRoots, step.target);
          journal.recordBackup(backup);
          journal.prepareMutation({ target: step.target, backup });
          journal.prepareMutation({ target: step.destination, backup: null });
          fs.renameSync(step.target, step.destination);
          journal.markApplied(step.target);
          journal.markApplied(step.destination);
          record(step.id, "renamed");
        } else {
          // Both exist: the current directory wins; the legacy copy is backed up and removed.
          const backup = backupInto(backupRoot, homeRoots, step.target);
          journal.recordBackup(backup);
          journal.prepareMutation({ target: step.target, backup });
          fs.rmSync(step.target, { recursive: true, force: true });
          journal.markApplied(step.target);
          record(step.id, "legacy-removed");
        }
        continue;
      }
      if (step.kind === "rewrite-marker") {
        const directory = path.dirname(step.target);
        const legacyName = path.basename(step.target);
        const currentName = legacyName === identity.legacyManagedMarker ? identity.managedMarker : identity.sourceMarker;
        const currentPath = path.join(directory === path.join(agentsHome, "skills", identity.legacyOperatorSkill) ? path.join(agentsHome, "skills", identity.operatorSkill) : directory, currentName);
        const legacyPath = path.join(path.dirname(currentPath), legacyName);
        const marker = readJson(legacyPath);
        if (!marker) {
          record(step.id, "skipped", { reason: "legacy marker unreadable" });
          continue;
        }
        const rewritten = { ...marker, schemaVersion: modernSchema(marker.schemaVersion) };
        if (rewritten.manager === legacyProductName) rewritten.manager = "agentchef";
        if (typeof rewritten.source === "string") {
          rewritten.source = rewritten.source
            .replace(`plugins/${identity.legacyPluginName}/`, `plugins/${identity.pluginName}/`)
            .replace(`/skills/${identity.legacyOperatorSkill}`, `/skills/${identity.operatorSkill}`);
        }
        if (currentName === identity.managedMarker && rewritten.name === identity.legacyOperatorSkill) rewritten.name = identity.operatorSkill;
        mutateFile(currentPath, () => writeJson(currentPath, rewritten));
        mutateFile(legacyPath, () => fs.rmSync(legacyPath, { force: true }));
        record(step.id, "rewritten");
        continue;
      }
      if (step.kind === "rewrite-marketplace") {
        const document = readJson(step.target);
        if (!document) {
          record(step.id, "skipped", { reason: "unreadable" });
          continue;
        }
        if (step.id === "marketplace") {
          document.plugins = (document.plugins || []).filter((plugin) => plugin?.name !== identity.legacyPluginName);
          if (document.name === identity.legacyMarketplaceName) document.name = identity.marketplaceName;
          const pluginTarget = path.join(agentsHome, "plugins", "sources", identity.pluginName);
          let entry = "plugin source directory missing; rerun the installer";
          mutateFile(step.target, () => {
            writeJson(step.target, document);
            if (isRealDirectory(pluginTarget)) entry = writeMarketplaceEntry(step.target, pluginTarget).status;
          });
          record(step.id, "rewritten", { entry });
        } else {
          document.plugins = (document.plugins || []).map((plugin) => plugin?.name === identity.legacyPluginName
            ? { ...plugin, name: identity.pluginName, source: `./sources/${identity.pluginName}` }
            : plugin);
          mutateFile(step.target, () => writeJson(step.target, document));
          record(step.id, "rewritten");
        }
        continue;
      }
      if (step.kind === "rewrite-schema") {
        const document = readJson(step.target);
        if (!document) {
          record(step.id, "skipped", { reason: "unreadable" });
          continue;
        }
        document.schemaVersion = modernSchema(document.schemaVersion);
        if (Array.isArray(document.links)) {
          document.links = document.links.map((link) => ({
            ...link,
            link: String(link.link).replace(`${path.sep}${identity.legacyOperatorSkill}`, `${path.sep}${identity.operatorSkill}`),
            target: String(link.target).replace(`${path.sep}${identity.legacyOperatorSkill}`, `${path.sep}${identity.operatorSkill}`)
          }));
        }
        mutateFile(step.target, () => writeJson(step.target, document));
        record(step.id, "rewritten");
        continue;
      }
      if (step.kind === "rewrite-git-hook") {
        const source = fs.readFileSync(path.join(repoRoot, "templates", "git", "pre-commit"));
        const mode = fs.statSync(step.target).mode;
        mutateFile(step.target, () => {
          fs.writeFileSync(step.target, source);
          if (process.platform !== "win32") fs.chmodSync(step.target, mode | 0o111);
        });
        record(step.id, "rewritten");
        continue;
      }
      if (step.kind === "relink") {
        // The legacy link is removed and a link with the current name points at
        // the renamed managed skill folder.
        const backup = backupInto(backupRoot, homeRoots, step.target);
        if (backup) journal.recordBackup(backup);
        journal.prepareMutation({ target: step.target, backup: null, link: true });
        removeSkillLink(step.target);
        journal.markApplied(step.target);
        if (!isRealDirectory(step.linkTarget)) {
          record(step.id, "unlinked", { reason: "renamed operator skill folder is missing; rerun the installer with --target claude" });
          continue;
        }
        journal.prepareMutation({ target: step.destination, backup: null, link: true });
        createSkillLink(step.destination, step.linkTarget);
        journal.markApplied(step.destination);
        record(step.id, "relinked");
        continue;
      }
      if (step.kind === "codex-plugin-cli" || step.kind === "claude-plugin-cli") {
        if (options.skipPluginRegister) {
          record(step.id, "skipped", { reason: "--skip-plugin-register", commands: step.commands });
          continue;
        }
        const command = platformCommand(step.kind === "codex-plugin-cli" ? "codex" : "claude", options.platform);
        const probe = spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30000, shell: false });
        if (probe.error || probe.status !== 0) {
          record(step.id, "skipped", { reason: `${step.kind === "codex-plugin-cli" ? "codex" : "claude"} CLI not available; run the listed commands later`, commands: step.commands });
          continue;
        }
        const env = step.kind === "codex-plugin-cli" ? { ...process.env, CODEX_HOME: codexHome } : { ...process.env, CLAUDE_CONFIG_DIR: claudeHome };
        const outcomes = [];
        for (const line of step.commands) {
          const argv = line.split(" ").slice(1);
          const run = spawnSync(command, argv, { encoding: "utf8", windowsHide: true, timeout: 120000, shell: false, env });
          outcomes.push({ command: line, status: run.status, output: `${run.stdout || ""}${run.stderr || ""}`.trim().slice(0, 300) });
        }
        record(step.id, outcomes.every((outcome) => outcome.status === 0) ? "done" : "attention", { outcomes });
      }
    }
    journal.finish("complete");
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "write-backup-manifest.mjs"), "--backup-root", backupRoot, "--operation", "migrate-identity"], { stdio: "ignore", windowsHide: true });
    return { backupRoot, results };
  } catch (error) {
    try {
      journal.finish("failed");
    } catch {
      // rollback below reads the journal from disk
    }
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "lib", "operation-journal.mjs"), "rollback", backupRoot, "-", ...homeRoots], { stdio: "ignore", windowsHide: true });
    throw error;
  } finally {
    lockSet.release();
  }
}

// ------------------------------------------------------------------ CLI
export function resolveMigrationOptions(raw = {}) {
  const platform = raw.platform || (process.platform === "win32" ? "windows" : "unix");
  const home = path.resolve(raw.home || os.homedir());
  const homes = resolveClaudeHomes({ env: process.env, home, claudeHome: raw.claudeHome, claudeJson: raw.claudeJson });
  return {
    platform,
    home,
    codexHome: path.resolve(raw.codexHome || process.env.CODEX_HOME || path.join(home, ".codex")),
    agentsHome: path.resolve(raw.agentsHome || process.env.AGENTS_HOME || path.join(home, ".agents")),
    claudeHome: homes.claudeHome,
    claudeJson: homes.claudeJson,
    targets: parseTargetSelection(raw.targets || "codex"),
    apply: Boolean(raw.apply),
    skipPluginRegister: Boolean(raw.skipPluginRegister),
    redactPaths: Boolean(raw.redactPaths),
    json: Boolean(raw.json)
  };
}

function parseArgs(argv) {
  const raw = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") raw.apply = true;
    else if (arg === "--dry-run" || arg === "--preview") raw.apply = false;
    else if (arg === "--json") raw.json = true;
    else if (arg === "--redact-paths") raw.redactPaths = true;
    else if (arg === "--skip-plugin-register") raw.skipPluginRegister = true;
    else if (arg === "--target") { raw.targets = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--codex-home") { raw.codexHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--agents-home") { raw.agentsHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--claude-home") { raw.claudeHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--home") { raw.home = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--platform") { raw.platform = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/migrate-identity.mjs [--dry-run|--apply] [--target codex|claude|both] [--codex-home <p>] [--agents-home <p>] [--claude-home <p>] [--home <p>] [--platform windows|unix] [--skip-plugin-register] [--redact-paths] [--json]

Converts an installed home from the legacy codex-chef spellings to agentchef:
ownership markers, the operator skill folder, plugin directories, marketplace
entries, the plugin cache entry, a legacy Git hook, and Claude receipts and
links. Preview first; --apply is journaled and backed up under CODEX_HOME/backups.`);
      process.exit(0);
    } else throw new CliUsageError(`Unknown argument: ${arg}`);
  }
  if (raw.platform && !["windows", "unix"].includes(raw.platform)) throw new CliUsageError("--platform must be windows or unix");
  return raw;
}

function redact(value, options) {
  if (!options.redactPaths || typeof value !== "string") return value;
  return value
    .replaceAll(options.codexHome, "${CODEX_HOME}")
    .replaceAll(options.agentsHome, "${AGENTS_HOME}")
    .replaceAll(options.claudeHome, "${CLAUDE_HOME}")
    .replaceAll(options.home, "${HOME}");
}

function main() {
  const options = resolveMigrationOptions(parseArgs(process.argv.slice(2)));
  const plan = planIdentityMigration(options);
  const outcome = options.apply ? applyIdentityMigration(options, plan) : null;
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: migrationSchemaVersion,
      dryRunOnly: !options.apply,
      targets: plan.targets,
      steps: plan.steps.map((step) => ({ ...step, target: redact(step.target, options), destination: redact(step.destination, options) })),
      notes: plan.notes,
      outcome: outcome ? { ...outcome, backupRoot: redact(outcome.backupRoot, options) } : null
    }, null, 2));
    return;
  }
  console.log(`AgentChef identity migration ${options.apply ? "apply" : "plan"} (targets: ${plan.targets.join(", ")})`);
  for (const step of plan.steps) {
    console.log(`  ${step.decision.padEnd(14)} ${step.kind.padEnd(20)} ${redact(step.target, options)}${step.destination ? ` -> ${redact(step.destination, options)}` : ""}`);
    for (const command of step.commands || []) console.log(`                 ${command}`);
  }
  for (const note of plan.notes) console.log(`Note: ${note}`);
  if (outcome) {
    for (const result of outcome.results) console.log(`  - ${result.id}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    console.log(`Backup root: ${redact(outcome.backupRoot, options)}`);
  } else {
    console.log("No files were changed. Add --apply to run this migration.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.exitCode = emitCliError({ tool: "migrate-identity", error, argv: process.argv.slice(2), root: repoRoot, prefix: "Identity migration failed" });
  }
}
