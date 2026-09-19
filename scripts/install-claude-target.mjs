#!/usr/bin/env node
// Claude Code install target. One Node transaction owns every Claude-side
// mutation so the shell installers only need to call it once:
//   node scripts/install-claude-target.mjs --dry-run   (default; writes nothing)
//   node scripts/install-claude-target.mjs --apply
// Writes are lock-guarded, journaled, backup-backed, and receipt-tracked.
// Files AgentChef does not own (settings.json, .claude.json) are merged
// additively and recorded in sidecar receipts under ${CLAUDE_HOME}/agentchef/.
// .claude.json lives at ~/.claude.json unless CLAUDE_CONFIG_DIR (or a relocated
// --claude-home) moves the config directory; see lib/targets/claude.mjs.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CliUsageError,
  emitCliError,
  requireCliValue
} from "./lib/cli-error-contract.mjs";
import { assertManagedTargetPath, isPathInside } from "./lib/managed-path-safety.mjs";
import { acquireOperationLockSet } from "./lib/operation-lock.mjs";
import { createOperationJournal } from "./lib/operation-journal.mjs";
import {
  createReceipt,
  fileSha256,
  readJsonOrDefault,
  readReceipt,
  removeRecordedEntries,
  writeReceipt
} from "./lib/json-merge-receipt.mjs";
import { planSettingsMerge } from "./lib/claude-settings-merge.mjs";
import { planMcpMerge } from "./lib/claude-mcp-merge.mjs";
import { createSkillLink, inspectSkillLink, removeSkillLink } from "./lib/skill-links.mjs";
import { platformCommand } from "./lib/platform-command.mjs";
import { resolveClaudeHomes } from "./lib/targets/claude.mjs";
import { managedMarkerNames, sourceMarkerNames } from "./lib/identity.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
export const claudeInstallSchemaVersion = "agentchef.claude-install.v1";
export const legacyClaudeInstallSchemaVersion = "codex-chef.claude-install.v1";
export const claudeInstallReceiptName = "install-receipt.json";
// Both marker spellings: an un-migrated home still carries the codex-chef names.
const managedSkillMarkers = [...managedMarkerNames, ...sourceMarkerNames];
const pluginName = "agentchef-workflows";
const claudeMarketplaceName = "agentchef";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function sha256Buffer(buffer) {
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

function fileState(destination, sourceBuffer) {
  const stat = lstatOrNull(destination);
  if (!stat) return "absent";
  if (stat.isSymbolicLink() || !stat.isFile()) return "foreign";
  return fs.readFileSync(destination).equals(sourceBuffer) ? "identical" : "drift";
}

// Skills AgentChef knows: catalog entries plus their compatibility aliases (an
// un-migrated home still carries the legacy operator folder name). A managed
// directory outside that set was retired from the catalog; it is reported as
// `retired` and never linked, adopted, or removed.
function knownSkillNames() {
  const catalog = readJson("catalog/skills.json");
  return new Set([...catalog.skills.map((skill) => skill.name), ...Object.keys(catalog.compatibilityAliases || {})]);
}

function managedSkillEntries(agentsHome) {
  const skillsRoot = path.join(agentsHome, "skills");
  if (!fs.existsSync(skillsRoot)) return [];
  const known = knownSkillNames();
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .filter((entry) => managedSkillMarkers.some((marker) => fs.existsSync(path.join(skillsRoot, entry.name, marker))))
    .map((entry) => ({ name: entry.name, known: known.has(entry.name) }))
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

// Shape verified with `claude plugin validate --strict` (Claude Code 2.1.276):
// a relative-path string is the local plugin source, and the marketplace needs
// a description to pass strict validation.
export function claudeMarketplaceDocument() {
  const pluginSource = readJson(".agents/plugins/marketplace.json").plugins.find((plugin) => plugin.name === pluginName);
  return {
    name: claudeMarketplaceName,
    description: "AgentChef workflows for Claude Code: setup maintenance, planning, review, reconstruction, and verification.",
    owner: { name: "AgentChef", url: "https://github.com/ucsahinn/agentchef" },
    plugins: [
      {
        name: pluginName,
        description: pluginSource?.interface?.shortDescription || "AgentChef workflows",
        source: `./sources/${pluginName}`
      }
    ]
  };
}

// Every action id planClaudeInstall emits, in order. The install-plan manifest
// mirrors these ids as target "claude" operations and the alignment validator
// keeps both lists identical.
export const claudeInstallActionIds = Object.freeze([
  "claude-working-agreement",
  "claude-serena-pool",
  "claude-settings-merge",
  "claude-mcp-merge",
  "claude-skill-links",
  "claude-plugin-marketplace",
  "claude-plugin-register"
]);

export function planClaudeInstall(options) {
  const { claudeHome, claudeJson, agentsHome, platform } = options;
  const actions = [];

  const agreementSource = fs.readFileSync(path.join(repoRoot, "templates", "claude", "rules", "agentchef-working-agreement.md"));
  const agreementTarget = path.join(claudeHome, "rules", "agentchef-working-agreement.md");
  actions.push({
    id: "claude-working-agreement",
    kind: "copy-file",
    source: "templates/claude/rules/agentchef-working-agreement.md",
    destination: agreementTarget,
    state: fileState(agreementTarget, agreementSource),
    backup: true
  });

  const serenaSource = fs.readFileSync(path.join(repoRoot, "templates", "codex", "serena-pool.mjs"));
  const serenaTarget = path.join(claudeHome, "agentchef", "serena-pool.mjs");
  actions.push({
    id: "claude-serena-pool",
    kind: "copy-file",
    source: "templates/codex/serena-pool.mjs",
    destination: serenaTarget,
    state: fileState(serenaTarget, serenaSource),
    backup: true
  });

  const settingsPath = path.join(claudeHome, "settings.json");
  const settingsFragment = readJson("templates/claude/settings.fragment.json");
  const settingsCurrent = readJsonOrDefault(settingsPath, {});
  const settingsPlan = planSettingsMerge(settingsCurrent, { permissions: settingsFragment.permissions });
  actions.push({
    id: "claude-settings-merge",
    kind: "json-merge",
    destination: settingsPath,
    state: settingsPlan.changed ? (fs.existsSync(settingsPath) ? "merge" : "create") : "identical",
    entries: settingsPlan.entries.map((entry) => entry.preview),
    skipped: settingsPlan.skipped.length,
    plan: settingsPlan,
    backup: true
  });

  const mcpCatalog = readJson("catalog/mcp-servers.json");
  const claudeJsonCurrent = readJsonOrDefault(claudeJson, {});
  // The previous receipt is what proves an existing entry is still AgentChef's.
  const mcpReceipt = readReceipt(path.join(claudeHome, "agentchef", "receipts", "claude-mcp-merge-receipt.json"));
  const mcpPlan = planMcpMerge(claudeJsonCurrent, mcpCatalog, {
    platform,
    claudeHome,
    previousEntries: mcpReceipt?.entries || [],
    refresh: Boolean(options.refreshManaged)
  });
  actions.push({
    id: "claude-mcp-merge",
    kind: "json-merge",
    destination: claudeJson,
    state: mcpPlan.changed ? (fs.existsSync(claudeJson) ? "merge" : "create") : "identical",
    entries: mcpPlan.entries.map((entry) => entry.preview),
    skipped: mcpPlan.skipped.length,
    plan: mcpPlan,
    backup: true
  });

  const links = managedSkillEntries(agentsHome).map(({ name, known }) => {
    const target = path.join(agentsHome, "skills", name);
    const link = path.join(claudeHome, "skills", name);
    const inspection = inspectSkillLink(link, target);
    let decision = "skip";
    if (!known) decision = "retired";
    else if (inspection.status === "absent") decision = "create";
    else if (inspection.status === "link-current") decision = "current";
    else if (inspection.status === "real-directory") {
      const chefCopy = managedSkillMarkers.some((marker) => fs.existsSync(path.join(link, marker)));
      decision = chefCopy && options.adoptSkillLinks ? "replace-copy-with-link" : chefCopy ? "adoptable-copy" : "foreign";
    } else decision = "foreign";
    return { name, link, target, status: inspection.status, decision };
  });
  actions.push({ id: "claude-skill-links", kind: "link-directory", links, backup: true });

  const marketplacePath = path.join(agentsHome, "plugins", ".claude-plugin", "marketplace.json");
  const marketplaceDesired = claudeMarketplaceDocument();
  const marketplaceState = fs.existsSync(marketplacePath)
    ? (JSON.stringify(readJsonOrDefault(marketplacePath, {})) === JSON.stringify(marketplaceDesired) ? "identical" : "drift")
    : "absent";
  actions.push({
    id: "claude-plugin-marketplace",
    kind: "write-claude-marketplace",
    destination: marketplacePath,
    document: marketplaceDesired,
    state: marketplaceState,
    backup: true
  });

  const claudeCommand = platformCommand("claude", platform);
  actions.push({
    id: "claude-plugin-register",
    kind: "claude-plugin-register",
    commands: [
      `${claudeCommand} plugin marketplace add ${path.join(agentsHome, "plugins")}`,
      `${claudeCommand} plugin install ${pluginName}@${claudeMarketplaceName} --scope user`
    ],
    state: options.skipPluginRegister ? "skipped-by-flag" : "planned",
    backup: false
  });

  const emitted = actions.map((action) => action.id);
  if (JSON.stringify(emitted) !== JSON.stringify(claudeInstallActionIds)) {
    throw new Error(`Claude install plan drifted from claudeInstallActionIds: ${emitted.join(", ")}`);
  }
  return { actions };
}

function redact(value, options) {
  if (!options.redactPaths || typeof value !== "string") return value;
  // .claude.json first: by default it sits next to the Claude home and shares its prefix.
  return value
    .replaceAll(options.claudeJson, "${CLAUDE_JSON}")
    .replaceAll(options.claudeHome, "${CLAUDE_HOME}")
    .replaceAll(options.agentsHome, "${AGENTS_HOME}")
    .replaceAll(options.home, "${HOME}");
}

function redactPlan(plan, options) {
  return {
    ...plan,
    actions: plan.actions.map((action) => ({
      ...action,
      plan: undefined,
      document: undefined,
      destination: redact(action.destination, options),
      links: action.links?.map((link) => ({ ...link, link: redact(link.link, options), target: redact(link.target, options) })),
      commands: action.commands?.map((command) => redact(command, options))
    }))
  };
}

function sameFilePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// Backups mirror the three places a Claude install may write: the Claude home
// ("claude"), the shared agents home ("agents"), and the user-scope
// .claude.json, which sits in the home directory by default ("home").
function backupInto(backupRoot, roots, target) {
  const stat = lstatOrNull(target);
  if (!stat) return null;
  const relative = isPathInside(target, roots.claudeHome)
    ? path.join("claude", path.relative(roots.claudeHome, target))
    : isPathInside(target, roots.agentsHome)
      ? path.join("agents", path.relative(roots.agentsHome, target))
      : roots.claudeJson && sameFilePath(target, roots.claudeJson)
        ? path.join("home", path.basename(target))
        : null;
  if (!relative) throw new Error(`Refusing to back up a target outside the managed roots: ${target}`);
  const destination = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (stat.isSymbolicLink()) {
    fs.writeFileSync(`${destination}.link.json`, `${JSON.stringify({ link: target, resolvedTarget: fs.readlinkSync(target) }, null, 2)}\n`);
    return `${destination}.link.json`;
  }
  fs.cpSync(target, destination, { recursive: true, force: true });
  return destination;
}

function writeFileAtomic(target, buffer) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, buffer);
  fs.renameSync(temporary, target);
}

// An array item is identified by its value, because one pointer can own several
// of them. An object key or a container is identified by its pointer alone, so
// a refreshed value replaces the record of the value it replaced instead of
// leaving a stale one behind for removal to trip over.
function mergeReceiptEntries(previous, added) {
  const positionByKey = new Map();
  const merged = [];
  for (const entry of [...(previous?.entries || []), ...added]) {
    const key = entry.kind === "array-item"
      ? `${entry.kind}:${entry.pointer}:${entry.valueSha256}`
      : `${entry.kind}:${entry.pointer}`;
    const at = positionByKey.get(key);
    if (at === undefined) {
      positionByKey.set(key, merged.length);
      merged.push(entry);
      continue;
    }
    merged[at] = entry;
  }
  return merged;
}

// A skill link is the one managed path that is allowed to be a link: its
// parent must be a safe managed directory, and the link itself may only be
// absent, a real directory (adoption), or a link that already points at the
// managed skill tree. Links that point anywhere else are never followed.
function assertSkillLinkPath(link, claudeHome) {
  assertManagedTargetPath(path.dirname(link.link), [claudeHome]);
  if (["link-elsewhere", "unreadable-link", "not-a-directory"].includes(link.status)) {
    throw new Error(`Refusing to touch a foreign skill path under ${claudeHome}: ${link.link} [${link.status}]`);
  }
}

export function applyClaudeInstall(options, plan) {
  const { claudeHome, claudeJson, agentsHome } = options;
  const roots = [claudeHome, agentsHome];
  const backupRoots = { claudeHome, agentsHome, claudeJson: options.claudeJson };
  for (const action of plan.actions) {
    if (action.destination) assertManagedTargetPath(action.destination, action.destination === claudeJson ? [path.dirname(claudeJson)] : roots);
    for (const link of action.links || []) if (link.decision !== "retired") assertSkillLinkPath(link, claudeHome);
  }
  const foreignLinks = plan.actions.find((action) => action.kind === "link-directory").links.filter((link) => link.decision === "foreign");
  if (foreignLinks.length > 0) {
    throw new Error(`Refusing to touch foreign skill paths under ${claudeHome}: ${foreignLinks.map((link) => link.name).join(", ")}`);
  }

  const packageJson = readJson("package.json");
  const product = { name: packageJson.name, version: packageJson.version };
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")}-${process.pid}`;
  const agentchefRoot = path.join(claudeHome, "agentchef");
  const backupRoot = path.join(agentchefRoot, "backups", `agentchef-${stamp}`);
  const receiptsRoot = path.join(agentchefRoot, "receipts");
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(receiptsRoot, { recursive: true });

  const lockSet = acquireOperationLockSet({ roots: options.agentsLockHeld ? [claudeHome] : roots, operation: "claude-install" });
  const journal = createOperationJournal({ backupRoot, operation: "claude-install" });
  const installed = { files: [], links: [], receipts: [], commands: [] };
  const results = [];
  try {
    for (const action of plan.actions) {
      if (action.kind === "copy-file") {
        if (action.state === "identical") {
          // Still owned: the rewritten install receipt must keep listing it.
          installed.files.push({ path: action.destination, sha256: fileSha256(action.destination), source: action.source });
          results.push({ id: action.id, status: "current" });
          continue;
        }
        if (action.state === "foreign") throw new Error(`Refusing to replace a linked or non-regular file: ${action.destination}`);
        const backup = options.noBackup ? null : backupInto(backupRoot, backupRoots, action.destination);
        if (backup) journal.recordBackup(backup);
        journal.prepareMutation({ target: action.destination, backup });
        const buffer = fs.readFileSync(path.join(repoRoot, action.source));
        writeFileAtomic(action.destination, buffer);
        journal.markApplied(action.destination);
        installed.files.push({ path: action.destination, sha256: sha256Buffer(buffer), source: action.source });
        results.push({ id: action.id, status: action.state === "absent" ? "installed" : "refreshed" });
        continue;
      }
      if (action.kind === "json-merge") {
        const receiptPath = path.join(receiptsRoot, `${action.id}-receipt.json`);
        const previous = readReceipt(receiptPath);
        if (!action.plan.changed) {
          results.push({ id: action.id, status: "current" });
          if (previous) installed.receipts.push(receiptPath);
          continue;
        }
        const backup = options.noBackup ? null : backupInto(backupRoot, backupRoots, action.destination);
        if (backup) journal.recordBackup(backup);
        const before = fileSha256(action.destination);
        journal.prepareMutation({ target: action.destination, backup });
        writeFileAtomic(action.destination, Buffer.from(`${JSON.stringify(action.plan.next, null, 2)}\n`, "utf8"));
        journal.markApplied(action.destination);
        const receipt = createReceipt({
          product,
          target: action.destination,
          beforeSha256: before,
          afterSha256: fileSha256(action.destination),
          entries: mergeReceiptEntries(previous, action.plan.entries),
          backupPath: backup
        });
        if (fs.existsSync(receiptPath)) fs.rmSync(receiptPath);
        writeReceipt(receiptPath, receipt);
        installed.receipts.push(receiptPath);
        results.push({ id: action.id, status: "merged", added: action.plan.entries.length });
        continue;
      }
      if (action.kind === "link-directory") {
        const created = [];
        for (const link of action.links) {
          if (link.decision === "current") {
            installed.links.push({ link: link.link, target: link.target });
            continue;
          }
          if (link.decision === "create") {
            journal.prepareMutation({ target: link.link, backup: null, link: true });
            createSkillLink(link.link, link.target);
            journal.markApplied(link.link);
            installed.links.push({ link: link.link, target: link.target });
            created.push(link.name);
            continue;
          }
          if (link.decision === "replace-copy-with-link") {
            const backup = backupInto(backupRoot, backupRoots, link.link);
            journal.recordBackup(backup);
            journal.prepareMutation({ target: link.link, backup, link: true });
            fs.rmSync(link.link, { recursive: true, force: true });
            createSkillLink(link.link, link.target);
            journal.markApplied(link.link);
            installed.links.push({ link: link.link, target: link.target });
            created.push(`${link.name} (adopted copy)`);
          }
        }
        results.push({ id: action.id, status: created.length > 0 ? "linked" : "current", created });
        continue;
      }
      if (action.kind === "write-claude-marketplace") {
        if (action.state === "identical") {
          installed.files.push({ path: action.destination, sha256: fileSha256(action.destination), source: "generated:claude-marketplace" });
          results.push({ id: action.id, status: "current" });
          continue;
        }
        const backup = options.noBackup ? null : backupInto(backupRoot, backupRoots, action.destination);
        if (backup) journal.recordBackup(backup);
        journal.prepareMutation({ target: action.destination, backup });
        writeFileAtomic(action.destination, Buffer.from(`${JSON.stringify(action.document, null, 2)}\n`, "utf8"));
        journal.markApplied(action.destination);
        installed.files.push({ path: action.destination, sha256: fileSha256(action.destination), source: "generated:claude-marketplace" });
        results.push({ id: action.id, status: action.state === "absent" ? "installed" : "refreshed" });
        continue;
      }
      if (action.kind === "claude-plugin-register") {
        if (action.state === "skipped-by-flag") {
          results.push({ id: action.id, status: "skipped" });
          continue;
        }
        const claudeCommand = platformCommand("claude", options.platform);
        const probe = spawnSync(claudeCommand, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30000, shell: false });
        if (probe.error || probe.status !== 0) {
          results.push({ id: action.id, status: "skipped", reason: "claude CLI not available; run the listed commands after installing Claude Code" });
          continue;
        }
        const outcomes = [];
        for (const argv of [
          ["plugin", "marketplace", "add", path.join(agentsHome, "plugins")],
          ["plugin", "install", `${pluginName}@${claudeMarketplaceName}`, "--scope", "user"]
        ]) {
          const run = spawnSync(claudeCommand, argv, { encoding: "utf8", windowsHide: true, timeout: 120000, shell: false });
          outcomes.push({ argv: argv.join(" "), status: run.status, output: `${run.stdout || ""}${run.stderr || ""}`.trim().slice(0, 400) });
          installed.commands.push(argv.join(" "));
          if (run.status !== 0) break;
        }
        results.push({ id: action.id, status: outcomes.every((outcome) => outcome.status === 0) ? "registered" : "attention", outcomes });
      }
    }

    const installReceipt = {
      schemaVersion: claudeInstallSchemaVersion,
      product,
      createdAt: new Date().toISOString(),
      claudeHome,
      agentsHome,
      backupRoot,
      ...installed
    };
    const installReceiptPath = path.join(agentchefRoot, claudeInstallReceiptName);
    journal.prepareMutation({ target: installReceiptPath, backup: null });
    writeFileAtomic(installReceiptPath, Buffer.from(`${JSON.stringify(installReceipt, null, 2)}\n`, "utf8"));
    journal.markApplied(installReceiptPath);
    journal.finish("complete");
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "write-backup-manifest.mjs"), "--backup-root", backupRoot, "--operation", "claude-install"], { stdio: "ignore", windowsHide: true });
    return { backupRoot, results, installReceiptPath };
  } catch (error) {
    try {
      journal.finish("failed");
    } catch {
      // The journal may already be closed; rollback below still works from disk.
    }
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "lib", "operation-journal.mjs"), "rollback", backupRoot, "-", claudeHome, agentsHome], { stdio: "ignore", windowsHide: true });
    throw error;
  } finally {
    lockSet.release();
  }
}

export function planClaudeRemoval(options) {
  const { claudeHome, agentsHome } = options;
  const receiptPath = path.join(claudeHome, "agentchef", claudeInstallReceiptName);
  if (!fs.existsSync(receiptPath)) {
    return { receiptPath, present: false, files: [], links: [], receipts: [], commands: [] };
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  if (![claudeInstallSchemaVersion, legacyClaudeInstallSchemaVersion].includes(receipt.schemaVersion)) throw new Error(`Unsupported install receipt: ${receiptPath}`);
  const files = (receipt.files || []).map((file) => {
    const stat = lstatOrNull(file.path);
    let decision = "absent";
    if (stat && (stat.isSymbolicLink() || !stat.isFile())) decision = "foreign";
    else if (stat) decision = fileSha256(file.path) === file.sha256 ? "remove" : "user-changed";
    return { ...file, decision };
  });
  const links = (receipt.links || []).map((link) => {
    const inspection = inspectSkillLink(link.link, link.target);
    return { ...link, status: inspection.status, decision: inspection.status === "link-current" ? "remove" : inspection.status === "absent" ? "absent" : "foreign" };
  });
  const receipts = (receipt.receipts || []).map((mergeReceiptPath) => {
    const mergeReceipt = readReceipt(mergeReceiptPath);
    if (!mergeReceipt) return { receiptPath: mergeReceiptPath, decision: "absent" };
    const document = readJsonOrDefault(mergeReceipt.target, {});
    const removal = removeRecordedEntries(mergeReceipt, document);
    return { receiptPath: mergeReceiptPath, target: mergeReceipt.target, decision: removal.removed.length > 0 ? "revert" : "nothing-to-revert", removed: removal.removed.length, kept: removal.kept.length, removal };
  });
  const claudeCommand = platformCommand("claude", options.platform);
  const commands = options.skipPluginRegister ? [] : [
    `${claudeCommand} plugin uninstall ${pluginName}@${claudeMarketplaceName}`,
    `${claudeCommand} plugin marketplace remove ${claudeMarketplaceName}`
  ];
  return { receiptPath, present: true, receipt, files, links, receipts, commands, agentsHome };
}

export function applyClaudeRemoval(options, plan) {
  if (!plan.present) return { results: [{ id: "claude-remove", status: "nothing-installed" }], backupRoot: null };
  const { claudeHome, agentsHome } = options;
  const roots = [claudeHome, agentsHome];
  const backupRoots = { claudeHome, agentsHome, claudeJson: options.claudeJson };
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")}-${process.pid}`;
  const backupRoot = path.join(claudeHome, "agentchef", "backups", `agentchef-remove-${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const lockSet = acquireOperationLockSet({ roots: options.agentsLockHeld ? [claudeHome] : roots, operation: "claude-remove" });
  const journal = createOperationJournal({ backupRoot, operation: "claude-remove" });
  const results = [];
  try {
    for (const entry of plan.receipts) {
      if (entry.decision !== "revert") {
        results.push({ id: `revert:${path.basename(entry.receiptPath)}`, status: entry.decision });
        continue;
      }
      assertManagedTargetPath(entry.target, entry.target === options.claudeJson ? [path.dirname(options.claudeJson)] : roots);
      const backup = backupInto(backupRoot, backupRoots, entry.target);
      if (backup) journal.recordBackup(backup);
      journal.prepareMutation({ target: entry.target, backup });
      writeFileAtomic(entry.target, Buffer.from(`${JSON.stringify(entry.removal.next, null, 2)}\n`, "utf8"));
      journal.markApplied(entry.target);
      journal.prepareMutation({ target: entry.receiptPath, backup: null });
      fs.rmSync(entry.receiptPath, { force: true });
      journal.markApplied(entry.receiptPath);
      results.push({ id: `revert:${path.basename(entry.receiptPath)}`, status: "reverted", removed: entry.removed, kept: entry.kept });
    }
    for (const link of plan.links) {
      if (link.decision !== "remove") {
        results.push({ id: `unlink:${path.basename(link.link)}`, status: link.decision });
        continue;
      }
      assertSkillLinkPath(link, claudeHome);
      const backup = backupInto(backupRoot, backupRoots, link.link);
      if (backup) journal.recordBackup(backup);
      journal.prepareMutation({ target: link.link, backup: null, link: true });
      removeSkillLink(link.link);
      journal.markApplied(link.link);
      results.push({ id: `unlink:${path.basename(link.link)}`, status: "removed" });
    }
    for (const file of plan.files) {
      if (file.decision !== "remove") {
        results.push({ id: `delete:${path.basename(file.path)}`, status: file.decision });
        continue;
      }
      assertManagedTargetPath(file.path, roots);
      const backup = backupInto(backupRoot, backupRoots, file.path);
      if (backup) journal.recordBackup(backup);
      journal.prepareMutation({ target: file.path, backup });
      fs.rmSync(file.path, { force: true });
      journal.markApplied(file.path);
      results.push({ id: `delete:${path.basename(file.path)}`, status: "removed" });
    }
    if (plan.commands.length > 0) {
      const claudeCommand = platformCommand("claude", options.platform);
      const probe = spawnSync(claudeCommand, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30000, shell: false });
      if (probe.error || probe.status !== 0) {
        results.push({ id: "claude-plugin-unregister", status: "skipped", reason: "claude CLI not available; run the listed commands manually" });
      } else {
        for (const argv of [["plugin", "uninstall", `${pluginName}@${claudeMarketplaceName}`], ["plugin", "marketplace", "remove", claudeMarketplaceName]]) {
          const run = spawnSync(claudeCommand, argv, { encoding: "utf8", windowsHide: true, timeout: 120000, shell: false });
          results.push({ id: `claude ${argv.join(" ")}`, status: run.status === 0 ? "done" : "attention", output: `${run.stdout || ""}${run.stderr || ""}`.trim().slice(0, 400) });
        }
      }
    }
    journal.prepareMutation({ target: plan.receiptPath, backup: null });
    fs.rmSync(plan.receiptPath, { force: true });
    journal.markApplied(plan.receiptPath);
    journal.finish("complete");
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "write-backup-manifest.mjs"), "--backup-root", backupRoot, "--operation", "claude-remove"], { stdio: "ignore", windowsHide: true });
    return { results, backupRoot };
  } catch (error) {
    try {
      journal.finish("failed");
    } catch {
      // rollback below reads the journal from disk
    }
    spawnSync(process.execPath, [path.join(repoRoot, "scripts", "lib", "operation-journal.mjs"), "rollback", backupRoot, "-", claudeHome, agentsHome], { stdio: "ignore", windowsHide: true });
    throw error;
  } finally {
    lockSet.release();
  }
}

export function resolveClaudeInstallOptions(raw = {}) {
  const platform = raw.platform || (process.platform === "win32" ? "windows" : "unix");
  const home = raw.home || os.homedir();
  const homes = resolveClaudeHomes({ env: process.env, home, claudeHome: raw.claudeHome });
  return {
    platform,
    home,
    claudeHome: homes.claudeHome,
    claudeJson: raw.claudeJson || homes.claudeJson,
    agentsHome: path.resolve(raw.agentsHome || process.env.AGENTS_HOME || path.join(home, ".agents")),
    apply: Boolean(raw.apply),
    refreshManaged: Boolean(raw.refreshManaged),
    remove: Boolean(raw.remove),
    noBackup: Boolean(raw.noBackup),
    agentsLockHeld: Boolean(raw.agentsLockHeld),
    adoptSkillLinks: Boolean(raw.adoptSkillLinks),
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
    else if (arg === "--dry-run") raw.apply = false;
    else if (arg === "--remove") raw.remove = true;
    else if (arg === "--json") raw.json = true;
    else if (arg === "--no-backup") raw.noBackup = true;
    else if (arg === "--agents-lock-held") raw.agentsLockHeld = true;
    else if (arg === "--adopt-skill-links") raw.adoptSkillLinks = true;
    else if (arg === "--skip-plugin-register") raw.skipPluginRegister = true;
    else if (arg === "--redact-paths") raw.redactPaths = true;
    else if (arg === "--claude-home") { raw.claudeHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--claude-json") { raw.claudeJson = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--refresh-managed") { raw.refreshManaged = true; }
    else if (arg === "--agents-home") { raw.agentsHome = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--home") { raw.home = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--platform") { raw.platform = requireCliValue(argv, index, arg); index += 1; }
    else if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    else throw new CliUsageError(`Unknown argument: ${arg}`);
  }
  if (raw.platform && !["windows", "unix"].includes(raw.platform)) throw new CliUsageError("--platform must be windows or unix");
  return raw;
}

function printHelp() {
  console.log(`Usage: node scripts/install-claude-target.mjs [--dry-run|--apply] [options]

Options:
  --claude-home <path>        Override CLAUDE_CONFIG_DIR (default ~/.claude)
  --claude-json <path>        Override the user-scope .claude.json location
  --refresh-managed           Update MCP entries whose value still matches this
                              install's receipt, so a catalog version bump
                              reaches an installed home; user-edited entries
                              are reported and left alone
  --agents-home <path>        Override AGENTS_HOME (default ~/.agents)
  --home <path>               Override HOME for planning only
  --platform <name>           windows or unix (defaults to current platform)
  --adopt-skill-links         Replace AgentChef-marked skill copies under ~/.claude/skills with links
  --agents-lock-held          Internal: the calling installer already holds the AGENTS_HOME operation lock
  --skip-plugin-register      Do not run the claude plugin CLI commands
  --no-backup                 Creation-only mode; refuses to replace existing targets
  --redact-paths              Replace home paths with placeholders in output
  --json                      Emit machine-readable JSON
`);
}

function printPlan(plan, options) {
  console.log(`AgentChef Claude Code target ${options.apply ? "apply" : "plan"}`);
  console.log(`Claude home: ${redact(options.claudeHome, options)}`);
  console.log(`Agents home: ${redact(options.agentsHome, options)}`);
  console.log("");
  for (const action of plan.actions) {
    if (action.kind === "link-directory") {
      console.log(`[link-directory] claude-skill-links (${action.links.length})`);
      for (const link of action.links) console.log(`  ${link.decision.padEnd(24)} ${link.name}`);
      continue;
    }
    if (action.kind === "claude-plugin-register") {
      console.log(`[${action.kind}] ${action.id}: ${action.state}`);
      for (const command of action.commands) console.log(`  ${redact(command, options)}`);
      continue;
    }
    console.log(`[${action.kind}] ${action.id}: ${action.state} -> ${redact(action.destination, options)}`);
    for (const entry of action.entries || []) console.log(`  + ${entry}`);
  }
}

function printRemovalPlan(plan, options) {
  console.log(`AgentChef Claude Code target ${options.apply ? "removal" : "removal plan"}`);
  if (!plan.present) {
    console.log("Nothing is installed for this Claude home (no install receipt).");
    return;
  }
  for (const entry of plan.receipts) console.log(`  ${entry.decision.padEnd(20)} revert ${redact(entry.target || entry.receiptPath, options)} (${entry.removed || 0} entries, ${entry.kept || 0} kept)`);
  for (const link of plan.links) console.log(`  ${link.decision.padEnd(20)} unlink ${redact(link.link, options)}`);
  for (const file of plan.files) console.log(`  ${file.decision.padEnd(20)} delete ${redact(file.path, options)}`);
  for (const command of plan.commands) console.log(`  command              ${command}`);
}

function main() {
  const raw = parseArgs(process.argv.slice(2));
  const options = resolveClaudeInstallOptions(raw);
  if (options.remove) {
    const removalPlan = planClaudeRemoval(options);
    const removal = options.apply ? applyClaudeRemoval(options, removalPlan) : null;
    if (options.json) {
      console.log(JSON.stringify({ schemaVersion: claudeInstallSchemaVersion, mode: "remove", dryRunOnly: !options.apply, plan: { present: removalPlan.present, files: removalPlan.files, links: removalPlan.links, receipts: removalPlan.receipts.map(({ removal: _removal, ...rest }) => rest), commands: removalPlan.commands }, outcome: removal }, null, 2));
      return;
    }
    printRemovalPlan(removalPlan, options);
    if (removal) for (const result of removal.results) console.log(`  - ${result.id}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    else console.log("\nNo files were changed. Add --apply to run this removal.");
    return;
  }
  const plan = planClaudeInstall(options);
  let outcome = null;
  if (options.apply) outcome = applyClaudeInstall(options, plan);
  if (options.json) {
    console.log(JSON.stringify({
      schemaVersion: claudeInstallSchemaVersion,
      dryRunOnly: !options.apply,
      target: { platform: options.platform, claudeHome: redact(options.claudeHome, options), claudeJson: redact(options.claudeJson, options), agentsHome: redact(options.agentsHome, options) },
      plan: redactPlan(plan, options),
      outcome: outcome ? { ...outcome, backupRoot: redact(outcome.backupRoot, options), installReceiptPath: redact(outcome.installReceiptPath, options) } : null
    }, null, 2));
    return;
  }
  printPlan(plan, options);
  if (outcome) {
    console.log("");
    for (const result of outcome.results) console.log(`  - ${result.id}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    console.log(`Backup root: ${redact(outcome.backupRoot, options)}`);
  } else {
    console.log("");
    console.log("No files were changed. Add --apply to run this plan.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    main();
  } catch (error) {
    process.exitCode = emitCliError({ tool: "install-claude-target", error, argv: process.argv.slice(2), root: repoRoot, prefix: "Claude Code target install failed" });
  }
}
