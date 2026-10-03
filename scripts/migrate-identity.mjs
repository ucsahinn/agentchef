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
import { acceptsSchema, identity, isLegacySchema, legacyProductName, modernSchema, retiredPluginIds, retiredPluginNames } from "./lib/identity.mjs";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { acquireOperationLockSet } from "./lib/operation-lock.mjs";
import { createOperationJournal, rollbackAfterFailure } from "./lib/operation-journal.mjs";
import { parseTargetSelection } from "./lib/targets/index.mjs";
import { claudeCliEnv, resolveClaudeHomes } from "./lib/targets/claude.mjs";
import { inspectDirectSkillTarget, markerFileName, writeDirectSkillMarker } from "./manage-direct-skill-target.mjs";
import { spawnHarnessCli } from "./lib/platform-command.mjs";
import { writeMarketplaceEntry } from "./upsert-marketplace-entry.mjs";
import { KNOWN_LEGACY_FILE_SHA256, inspectGlobalGitGuards } from "./lib/global-git-guards.mjs";
import { inspectSkillLink, createSkillLink, removeSkillLink } from "./lib/skill-links.mjs";
import { inspectPinnedSkillOwnership } from "./lib/skill-provenance.mjs";
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

// Strings inside ${CODEX_HOME}/config.toml that AgentChef itself wrote: the
// template banner, the merge banner, and its own plugin id (which Codex also
// uses as the `[hooks.state."<plugin id>:<hook>"]` key prefix). Nothing else in
// the file is rewritten, so user tables, project trust entries, and other
// products keep their names — `codex-chef-kitchen@codex-chef-kitchen` never
// matches `codex-chef-workflows@codex-chef`.
const codexConfigBanners = Object.freeze([
  Object.freeze(["# Windows-first Codex Chef.", "# Windows-first AgentChef."]),
  Object.freeze(["# Unix/WSL Codex Chef.", "# Unix/WSL AgentChef."]),
  Object.freeze(["# Codex Chef merged config blocks.", "# AgentChef merged config blocks."])
]);

// A TOML table header on its own line, e.g. `[hooks.state."<plugin id>:…"]`.
// Deliberately strict so an array value spanning lines is never mistaken for one.
const tomlTableHeader = /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/;

// Rewrites only what AgentChef itself wrote. Banner comments are plain
// replacements. Table headers carrying the legacy plugin id are renamed, unless
// the renamed header already exists — Codex writes its own hook-state table as
// soon as the plugin is re-added under the new id, and two identical tables
// would make the file unparseable — in which case the legacy table is dropped
// with the lines that belong to it.
export function planCodexConfigRewrite(input) {
  let banners = 0;
  let text = input;
  for (const [from, to] of codexConfigBanners) {
    const hits = text.split(from).length - 1;
    if (hits === 0) continue;
    banners += hits;
    text = text.split(from).join(to);
  }

  const lines = text.split("\n");
  const headers = new Set(lines.filter((line) => tomlTableHeader.test(line)).map((line) => line.trim()));
  const kept = [];
  let renamed = 0;
  let dropped = 0;
  let dropping = false;
  for (const line of lines) {
    if (tomlTableHeader.test(line)) {
      dropping = false;
      // A plugin table quotes the bare id; a hook-state table quotes id:path.
      const retiredId = retiredPluginIds.find((id) => line.includes(`"${id}"`) || line.includes(`"${id}:`));
      if (retiredId) {
        const renamedHeader = line.split(retiredId).join(identity.pluginId);
        if (headers.has(renamedHeader.trim())) {
          dropping = true;
          dropped += 1;
          continue;
        }
        renamed += 1;
        kept.push(renamedHeader);
        continue;
      }
    } else if (dropping) {
      continue;
    }
    kept.push(line);
  }

  const output = kept.join("\n");
  return { text: output, banners, renamed, dropped, occurrences: banners + renamed + dropped, changed: output !== input };
}

export function countCodexConfigRewrites(text) {
  return planCodexConfigRewrite(text).occurrences;
}

export function rewriteCodexConfigText(text) {
  return planCodexConfigRewrite(text).text;
}

function listFilesRecursive(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    total += entry.isDirectory() ? listFilesRecursive(path.join(directory, entry.name)) : 1;
  }
  return total;
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
  // The pre-1.0 name keeps the original step ids; the 1.0 to 1.2 name gets a suffix.
  const generationSuffix = (name) => (name === identity.legacyPluginName ? "" : `:${name}`);
  const pluginDirectories = retiredPluginNames.flatMap((name) => [
    ...(withCodex ? [[`codex-plugin-directory${generationSuffix(name)}`, path.join(codexHome, "plugins", name), path.join(codexHome, "plugins", identity.pluginName)]] : []),
    [`marketplace-source-directory${generationSuffix(name)}`, path.join(agentsHome, "plugins", "sources", name), path.join(agentsHome, "plugins", "sources", identity.pluginName)]
  ]);
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
      const hasLegacyEntry = (marketplace.plugins || []).some((plugin) => retiredPluginNames.includes(plugin?.name));
      const legacyName = marketplace.name === identity.legacyMarketplaceName;
      note("marketplace", "rewrite-marketplace", marketplacePath, hasLegacyEntry || legacyName ? "rewrite" : "current", { legacyEntry: hasLegacyEntry, legacyName });
    }
    // Only a Codex that has the legacy plugin installed needs the CLI swap.
    // Running it on a current or plugin-free home installed a plugin the user
    // never had and rewrote config.toml.
    const configText = (() => { try { return fs.readFileSync(path.join(codexHome, "config.toml"), "utf8"); } catch { return ""; } })();
    // `codex plugin remove` leaves an emptied directory tree behind, so only a
    // cache that still holds files counts as an installed plugin.
    const cacheRootFor = (id) => {
      const [name, marketplaceName] = id.split("@");
      return id === identity.legacyPluginId
        ? path.join(codexHome, "plugins", "cache", marketplaceName)
        : path.join(codexHome, "plugins", "cache", marketplaceName, name);
    };
    const installedRetiredIds = retiredPluginIds.filter((id) => configText.includes(`[plugins."${id}"]`)
      || (isRealDirectory(cacheRootFor(id)) && listFilesRecursive(cacheRootFor(id)) > 0));
    const legacyCodexPlugin = installedRetiredIds.length > 0;
    note("codex-plugin-cache", "codex-plugin-cli", codexHome, legacyCodexPlugin ? "cli" : "absent", {
      commands: [
        ...(installedRetiredIds.length > 0 ? installedRetiredIds : [identity.legacyPluginId]).map((id) => `codex plugin remove ${id}`),
        `codex plugin add ${identity.pluginId}`
      ]
    });

    const configPath = path.join(codexHome, "config.toml");
    const configStat = lstatOrNull(configPath);
    if (configStat?.isFile() && !configStat.isSymbolicLink()) {
      const planned = planCodexConfigRewrite(fs.readFileSync(configPath, "utf8"));
      note("codex-config", "rewrite-codex-config", configPath, planned.changed ? "rewrite" : "current", {
        occurrences: planned.occurrences,
        banners: planned.banners,
        renamedTables: planned.renamed,
        droppedDuplicateTables: planned.dropped
      });
    } else {
      note("codex-config", "rewrite-codex-config", configPath, configStat ? "foreign" : "absent");
    }

    // `codex plugin remove` clears the legacy marketplace's cache but leaves the
    // directory tree behind; remove it only while it holds no files at all.
    const previousCache = cacheRootFor(identity.previousPluginId);
    const previousCacheStat = lstatOrNull(previousCache);
    if (previousCacheStat?.isDirectory() && !previousCacheStat.isSymbolicLink()) {
      const files = listFilesRecursive(previousCache);
      note(`codex-legacy-plugin-cache:${identity.previousPluginName}`, "remove-empty-directory", previousCache, files === 0 || installedRetiredIds.includes(identity.previousPluginId) ? "remove-legacy" : "foreign", { files });
    }
    const legacyCache = path.join(codexHome, "plugins", "cache", identity.legacyMarketplaceName);
    const legacyCacheStat = lstatOrNull(legacyCache);
    if (legacyCacheStat?.isDirectory() && !legacyCacheStat.isSymbolicLink()) {
      const files = listFilesRecursive(legacyCache);
      // A cache the plugin swap is about to empty is decided again after it.
      note("codex-legacy-plugin-cache", "remove-empty-directory", legacyCache, files === 0 || legacyCodexPlugin ? "remove-legacy" : "foreign", { files });
    } else {
      note("codex-legacy-plugin-cache", "remove-empty-directory", legacyCache, "absent");
    }
  }

  // 3b. Direct skill copies. Since 1.3.0 every skill reaches both CLIs from
  // the plugin, so a copy under AGENTS_HOME/skills lists it a second time. A
  // copy goes only when AgentChef's marker or provenance proves it is ours and
  // the plugin source already holds that skill; otherwise it stays.
  const pluginSkillRoots = [identity.pluginName, ...retiredPluginNames].map((name) => path.join(agentsHome, "plugins", "sources", name, "skills"));
  const pluginHasSkill = (name) => pluginSkillRoots.some((rootDir) => fs.existsSync(path.join(rootDir, name, "SKILL.md")));
  const catalogSkills = readJson(path.join(repoRoot, "catalog", "skills.json"), { skills: [] }).skills;
  for (const skill of catalogSkills.filter((entry) => entry.directInstall === true || entry.install === true)) {
    const names = skill.name === identity.operatorSkill ? [identity.operatorSkill, identity.legacyOperatorSkill] : [skill.name];
    for (const name of names) {
      const target = path.join(skillsRoot, name);
      if (!isRealDirectory(target)) continue;
      let owned = false;
      if (skill.directInstall === true) {
        const hasMarker = [identity.managedMarker, identity.legacyManagedMarker].some((marker) => fs.existsSync(path.join(target, marker)));
        if (hasMarker) {
          try {
            const status = inspectDirectSkillTarget(path.join(repoRoot, "plugins", identity.pluginName, "skills", skill.name), target).status;
            owned = status.startsWith("managed") || status === "legacy-match";
          } catch {
            owned = false;
          }
          // The operator folder under its pre-1.0 name is proven by its marker.
          if (!owned && name === identity.legacyOperatorSkill) {
            const marker = readJson(path.join(target, identity.legacyManagedMarker));
            owned = acceptsSchema(marker?.schemaVersion, "managed-direct-skill", 1);
          }
        }
      } else {
        owned = inspectPinnedSkillOwnership(target, { package: skill.package, skill: skill.skill || skill.name }).valid;
      }
      const decision = !owned ? "foreign" : pluginHasSkill(skill.name) || pluginHasSkill(skill.skill || skill.name) ? "retire" : "keep-until-plugin";
      note(`direct-skill-copy:${name}`, "retire-direct-copy", target, decision, { skill: skill.name });
    }
  }

  // 3c. Codex role files a release no longer ships (1.3.0 retired five
  // coordinators). A file goes only when its content is a version AgentChef
  // wrote; an edited file stays and is reported.
  if (withCodex) {
    const retiredFiles = readJson(path.join(repoRoot, "templates", "codex", "retired-files.json"), { files: {} }).files || {};
    for (const [relative, digests] of Object.entries(retiredFiles)) {
      const target = path.join(codexHome, ...relative.split("/"));
      const stat = lstatOrNull(target);
      let decision = "absent";
      if (stat) {
        decision = "foreign";
        if (stat.isFile() && !stat.isSymbolicLink()) {
          const normalized = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
          if (digests.includes(sha256(Buffer.from(normalized, "utf8")))) decision = "retire";
        }
      }
      note(`retired-file:${relative}`, "retire-file", target, decision);
    }
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
    note("claude-marketplace", "rewrite-marketplace", claudeMarketplacePath, !claudeMarketplace ? "absent" : (claudeMarketplace.plugins || []).some((plugin) => retiredPluginNames.includes(plugin?.name)) ? "rewrite" : "current");
    // Same for Claude: swap only a plugin registered under the legacy name.
    const installedPlugins = (() => { try { return fs.readFileSync(path.join(claudeHome, "plugins", "installed_plugins.json"), "utf8"); } catch { return ""; } })();
    const installedClaudeIds = retiredPluginNames.map((name) => `${name}@${identity.marketplaceName}`).filter((id) => installedPlugins.includes(`"${id}"`));
    const legacyClaudePlugin = installedClaudeIds.length > 0;
    note("claude-plugin-cache", "claude-plugin-cli", claudeHome, legacyClaudePlugin ? "cli" : "absent", {
      commands: [
        ...(installedClaudeIds.length > 0 ? installedClaudeIds : [`${identity.legacyPluginName}@${identity.marketplaceName}`]).map((id) => `claude plugin uninstall ${id}`),
        `claude plugin install ${identity.pluginId} --scope user`
      ]
    });
  }

  const staleEnvironment = Object.keys(process.env).filter((key) => key.startsWith(identity.legacyEnvPrefix) && !key.startsWith(`${identity.legacyEnvPrefix}TEST_`));
  const notes = [
    "Backup folders keep their existing names; `npm run chef -- --backups` lists both prefixes.",
    ...(staleEnvironment.length > 0 ? [`Environment variables still using the legacy prefix (rename them yourself): ${staleEnvironment.join(", ")}`] : [])
  ];
  const retiredTargets = new Set(steps.filter((step) => step.kind === "retire-direct-copy" && step.decision === "retire").map((step) => step.target));
  // A Claude link into a retired copy would dangle; it goes with the copy.
  if (withClaude && retiredTargets.size > 0) {
    const claudeSkills = path.join(claudeHome, "skills");
    let entries = [];
    try { entries = fs.readdirSync(claudeSkills, { withFileTypes: true }); } catch { entries = []; }
    for (const entry of entries) {
      const link = path.join(claudeSkills, entry.name);
      const stat = lstatOrNull(link);
      if (!stat?.isSymbolicLink()) continue;
      let resolved = null;
      try { resolved = path.resolve(claudeSkills, fs.readlinkSync(link)); } catch { resolved = null; }
      const same = (left, right) => (process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right);
      if (resolved && [...retiredTargets].some((retired) => same(path.resolve(retired), resolved.replace(/[\\/]+$/, "")))) {
        note(`claude-skill-link:${entry.name}`, "retire-claude-link", link, "retire");
      }
    }
  }
  const retiredLinks = new Set(steps.filter((step) => step.kind === "retire-claude-link").map((step) => step.target));
  const receiptStep = steps.find((step) => step.id === "claude-install-receipt");
  if (receiptStep && retiredLinks.size > 0) {
    receiptStep.dropLinks = [...retiredLinks];
    if (receiptStep.decision === "current") receiptStep.decision = "rewrite";
  }
  for (const step of steps) {
    if (step.kind === "relink" && step.decision === "relink" && retiredLinks.has(step.target)) step.decision = "superseded-by-retire";
  }
  for (const step of steps) {
    if (step.kind === "retire-direct-copy" || step.kind === "retire-claude-link") continue;
    const touchesRetired = [step.target, step.destination].filter(Boolean).some((value) => [...retiredTargets].some((retired) => value === retired || value.startsWith(`${retired}${path.sep}`)));
    if (touchesRetired && ["rewrite", "rename", "remove-legacy"].includes(step.decision)) step.decision = "superseded-by-retire";
  }
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
    if (["rewrite", "rename", "remove-legacy", "relink", "retire"].includes(step.decision) && step.kind !== "rewrite-git-hook") {
      // A link is checked through its parent folder: the link itself is a link.
      assertManagedTargetPath(step.kind === "relink" || step.kind === "retire-claude-link" ? path.dirname(step.target) : step.target, homeRoots);
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
    const isCliStep = (step) => step.kind === "codex-plugin-cli" || step.kind === "claude-plugin-cli";
    // The plugin CLI swaps cannot be rolled back, so they run only after every
    // local step that can still fail.
    for (const step of [...plan.steps.filter((step) => !isCliStep(step)), ...plan.steps.filter(isCliStep)]) {
      if (!["rewrite", "rename", "remove-legacy", "relink", "cli", "retire"].includes(step.decision)) {
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
      if (step.kind === "retire-claude-link") {
        journal.prepareMutation({ target: step.target, backup: null, link: true });
        removeSkillLink(step.target);
        journal.markApplied(step.target);
        record(step.id, "retired");
        continue;
      }
      if (step.kind === "retire-direct-copy" || step.kind === "retire-file") {
        const backup = backupInto(backupRoot, homeRoots, step.target);
        journal.recordBackup(backup);
        journal.prepareMutation({ target: step.target, backup });
        fs.rmSync(step.target, { recursive: true, force: true });
        journal.markApplied(step.target);
        record(step.id, "retired");
        continue;
      }
      if (step.kind === "rewrite-codex-config") {
        const text = fs.readFileSync(step.target, "utf8");
        mutateFile(step.target, () => fs.writeFileSync(step.target, rewriteCodexConfigText(text)));
        record(step.id, "rewritten", { occurrences: step.occurrences });
        continue;
      }
      if (step.kind === "remove-empty-directory") {
        // Counted again here: the plugin CLI step before this one empties it,
        // or removes it altogether.
        if (!lstatOrNull(step.target)) {
          record(step.id, "absent");
          continue;
        }
        if (listFilesRecursive(step.target) > 0) {
          record(step.id, "foreign", { reason: "still holds files" });
          continue;
        }
        const backup = backupInto(backupRoot, homeRoots, step.target);
        if (backup) journal.recordBackup(backup);
        journal.prepareMutation({ target: step.target, backup });
        // Verified to hold no files during planning; nested empty folders may remain.
        fs.rmSync(step.target, { recursive: true, force: true });
        journal.markApplied(step.target);
        record(step.id, "legacy-removed");
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
            .replace(new RegExp(`^plugins/(?:${retiredPluginNames.join("|")})/`), `plugins/${identity.pluginName}/`)
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
          document.plugins = (document.plugins || []).filter((plugin) => !retiredPluginNames.includes(plugin?.name));
          if (document.name === identity.legacyMarketplaceName) document.name = identity.marketplaceName;
          const pluginTarget = path.join(agentsHome, "plugins", "sources", identity.pluginName);
          let entry = "plugin source directory missing; rerun the installer";
          mutateFile(step.target, () => {
            writeJson(step.target, document);
            if (isRealDirectory(pluginTarget)) entry = writeMarketplaceEntry(step.target, pluginTarget).status;
          });
          record(step.id, "rewritten", { entry });
        } else {
          // One current entry: a retired entry is renamed unless the current one is already listed.
          const hasCurrent = (document.plugins || []).some((plugin) => plugin?.name === identity.pluginName);
          document.plugins = (document.plugins || [])
            .filter((plugin) => !(hasCurrent && retiredPluginNames.includes(plugin?.name)))
            .map((plugin) => retiredPluginNames.includes(plugin?.name)
              ? { ...plugin, name: identity.pluginName, source: `./sources/${identity.pluginName}` }
              : plugin);
          document.plugins = document.plugins.filter((plugin, index, all) => plugin?.name !== identity.pluginName || all.findIndex((other) => other?.name === identity.pluginName) === index);
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
        if (Array.isArray(document.links) && Array.isArray(step.dropLinks)) {
          const dropped = new Set(step.dropLinks.flatMap((link) => [
            path.resolve(link),
            path.resolve(String(link).replace(`${path.sep}${identity.legacyOperatorSkill}`, `${path.sep}${identity.operatorSkill}`))
          ]));
          document.links = document.links.filter((entry) => !dropped.has(path.resolve(String(entry.link))));
        }
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
        // The Claude install links every marker-carrying folder, so the current
        // name can already be linked; then only the legacy link goes.
        if (inspectSkillLink(step.destination, step.linkTarget).status === "link-current") {
          record(step.id, "relinked", { reason: "current link already present; legacy link removed" });
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
        const command = step.kind === "codex-plugin-cli" ? "codex" : "claude";
        const probe = spawnHarnessCli(command, ["--version"], { encoding: "utf8", windowsHide: true, timeout: 30000 }, options.platform);
        if (probe.error || probe.status !== 0) {
          record(step.id, "skipped", { reason: `${step.kind === "codex-plugin-cli" ? "codex" : "claude"} CLI not available; run the listed commands later`, commands: step.commands });
          continue;
        }
        const env = step.kind === "codex-plugin-cli" ? { ...process.env, CODEX_HOME: codexHome } : claudeCliEnv(claudeHome, { home });
        const outcomes = [];
        for (const line of step.commands) {
          const argv = line.split(" ").slice(1);
          const run = spawnHarnessCli(command, argv, { encoding: "utf8", windowsHide: true, timeout: 120000, env }, options.platform);
          const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
          // Removing an entry that is already gone is done, not a failure; only
          // a "not found" that names this plugin counts, so a missing
          // marketplace or any other error stays a failure.
          const pluginName = (argv[argv.length - 1] || "").split("@")[0];
          const alreadyGone = run.status !== 0 && /\b(remove|uninstall)\b/.test(line) && /\bnot found\b/i.test(output) && Boolean(pluginName) && output.includes(pluginName);
          outcomes.push({ command: line, status: alreadyGone ? 0 : run.status, output: output.slice(0, 300) });
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
    rollbackAfterFailure({ backupRoot, allowedTargets: homeRoots, error });
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
