#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findProblemRules, significantRulesLines } from "./lib/approval-rules.mjs";
import { resolveInstallContract } from "./lib/install-contract.mjs";
import { assertManagedTargetPath, isPathInside } from "./lib/managed-path-safety.mjs";
import {
  inspectDirectSkillTarget,
  isDirectSkillStateAdoptable,
  writeDirectSkillMarker
} from "./manage-direct-skill-target.mjs";
import { inspectMarketplaceEntry, writeMarketplaceEntry } from "./upsert-marketplace-entry.mjs";
import {
  CliUsageError,
  installCliErrorBoundary,
  requireCliValue
} from "./lib/cli-error-contract.mjs";
import { PLUGIN_ID, refreshInstalledPlugin } from "./refresh-installed-plugin.mjs";
import { acquireOperationLockSet } from "./lib/operation-lock.mjs";
import { createOperationJournal } from "./lib/operation-journal.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "repair-install",
  argv: args,
  root,
  prefix: "AgentChef repair error"
});

const options = {
  apply: false,
  explicitPreview: false,
  json: false,
  noBackup: false,
  adoptFetchSkill: false,
  adoptSeoSkill: false,
  adoptEvidenceResearchSkill: false,
  adoptDirectSkills: new Set(),
  pruneManagedPluginExtras: false,
  migrateLegacyProfilePins: false,
  redactPaths: false,
  platform: process.platform === "win32" ? "windows" : "unix",
  codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  agentsHome: process.env.AGENTS_HOME || path.join(os.homedir(), ".agents")
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--apply") options.apply = true;
  else if (arg === "--preview") {
    options.explicitPreview = true;
  }
  else if (arg === "--json") options.json = true;
  else if (arg === "--no-backup") options.noBackup = true;
  else if (arg === "--adopt-fetch-skill") options.adoptFetchSkill = true;
  else if (arg === "--adopt-seo-skill") options.adoptSeoSkill = true;
  else if (arg === "--adopt-evidence-research-skill") options.adoptEvidenceResearchSkill = true;
  else if (arg === "--adopt-direct-skill") {
    const skillName = requireCliValue(args, index, "--adopt-direct-skill");
    options.adoptDirectSkills.add(skillName);
    index += 1;
  }
  else if (arg === "--prune-managed-plugin-extras") options.pruneManagedPluginExtras = true;
  else if (arg === "--migrate-legacy-profile-pins") options.migrateLegacyProfilePins = true;
  else if (arg === "--redact-paths") options.redactPaths = true;
  else if (arg === "--platform") {
    options.platform = requireCliValue(args, index, "--platform");
    index += 1;
  } else if (arg === "--codex-home") {
    options.codexHome = path.resolve(requireCliValue(args, index, "--codex-home"));
    index += 1;
  } else if (arg === "--agents-home") {
    options.agentsHome = path.resolve(requireCliValue(args, index, "--agents-home"));
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

if (!["windows", "unix"].includes(options.platform)) {
  throw new CliUsageError(`Unsupported platform: ${options.platform}`);
}

if (
  options.explicitPreview
  && (
    options.apply
    || options.noBackup
    || options.adoptFetchSkill
    || options.adoptSeoSkill
    || options.adoptEvidenceResearchSkill
    || options.adoptDirectSkills.size > 0
    || options.pruneManagedPluginExtras
    || options.migrateLegacyProfilePins
  )
) {
  throw new CliUsageError("--preview cannot be combined with write-capable options.");
}

function printHelp() {
  console.log(`Usage: node scripts/repair-install.mjs [options]

Repair or preview repair for an existing AgentChef global install.

Options:
  --preview                       Preview repairs without writing (default)
  --apply                         Write backup-backed repairs
  --no-backup                     Skip backups when --apply is used
  --adopt-fetch-skill             Explicitly adopt and replace an existing foreign AGENTS_HOME/skills/fetch target
  --adopt-seo-skill               Explicitly adopt and replace an existing foreign AGENTS_HOME/skills/seo target
  --adopt-evidence-research-skill Explicitly adopt and replace an existing foreign AGENTS_HOME/skills/evidence-research target
  --adopt-direct-skill <name>     Explicitly adopt another cataloged managed direct-skill target
  --prune-managed-plugin-extras   Delete extra files only inside the two managed AgentChef plugin mirrors
  --migrate-legacy-profile-pins   Remove model/review_model pins from known legacy profile files after backup
  --platform <windows|unix>       Select config template; defaults to current OS
  --codex-home <path>             Installed Codex home to inspect
  --agents-home <path>            Installed Agents home to inspect
  --redact-paths                  Redact home and repository paths in output
  --json                          Emit machine-readable JSON
`);
}

const legacyAdoptOptions = new Map([
  ["fetch", { option: "adoptFetchSkill", flag: "--adopt-fetch-skill" }],
  ["seo", { option: "adoptSeoSkill", flag: "--adopt-seo-skill" }],
  ["evidence-research", { option: "adoptEvidenceResearchSkill", flag: "--adopt-evidence-research-skill" }]
]);
const directSkills = readJson("catalog/skills.json")
  .skills
  .filter((skill) => skill.directInstall === true)
  .map((skill) => ({
    name: skill.name,
    display: skill.name
      .split("-")
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" "),
    adoptOption: legacyAdoptOptions.get(skill.name)?.option || null,
    adoptFlag: legacyAdoptOptions.get(skill.name)?.flag || `--adopt-direct-skill ${skill.name}`
  }));
const unknownAdoptSkills = [...options.adoptDirectSkills]
  .filter((name) => !directSkills.some((skill) => skill.name === name));
if (unknownAdoptSkills.length > 0) {
  throw new CliUsageError(`Unknown managed direct skill adoption target: ${unknownAdoptSkills.join(", ")}`);
}

function shouldAdoptDirectSkill(skill) {
  return options.adoptDirectSkills.has(skill.name)
    || (skill.adoptOption ? options[skill.adoptOption] === true : false);
}

const backupRoot = path.join(
  options.codexHome,
  "backups",
  `codex-chef-repair-${timestamp()}-${crypto.randomUUID()}`
);
const actions = [];
const warnings = [];
const notes = [];
const failures = [];
let preflight;
let operationLock = null;
let operationJournal = null;
const transactionOriginals = new Map();
const transactionWrites = new Map();

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function redact(value) {
  if (!options.redactPaths || typeof value !== "string") return value;
  const home = os.homedir();
  return value
    .replaceAll(home, "${HOME}")
    .replaceAll(home.replaceAll("\\", "/"), "${HOME}")
    .replaceAll(root, "${REPO}")
    .replaceAll(root.replaceAll("\\", "/"), "${REPO}")
    .replace(/[A-Za-z]:\\Users\\[^\\/]+/g, "${OTHER_USERPROFILE}")
    .replace(/[A-Za-z]:\/Users\/[^\\/]+/g, "${OTHER_USERPROFILE}");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function normalizePathForCompare(filePath) {
  return path.resolve(filePath || "").toLowerCase();
}

function isInside(child, parent) {
  return isPathInside(child, parent);
}

function assertManagedTarget(targetPath) {
  return assertManagedTargetPath(targetPath, [options.codexHome, options.agentsHome]);
}

function ensureDir(directory) {
  if (!options.apply) return;
  fs.mkdirSync(directory, { recursive: true });
}

function relativeBackupPath(targetPath) {
  const resolved = path.resolve(targetPath);
  for (const base of [options.codexHome, options.agentsHome]) {
    if (isInside(resolved, base)) {
      const prefix = base === options.codexHome ? "codex" : "agents";
      return path.join(prefix, path.relative(base, resolved));
    }
  }
  return path.basename(resolved);
}

function backupTarget(targetPath) {
  if (!options.apply || options.noBackup || !fs.existsSync(targetPath)) return null;
  assertManagedTarget(targetPath);
  const key = path.resolve(targetPath);
  if (transactionOriginals.has(key)) return transactionOriginals.get(key);
  operationJournal ||= createOperationJournal({ backupRoot, operation: "repair-install" });
  const destination = path.join(backupRoot, relativeBackupPath(targetPath));
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(targetPath, destination, { recursive: true, force: true });
    operationJournal?.recordBackup(destination);
  } catch (error) {
    throw new Error(
      `Could not back up managed target before repair: ${targetPath} -> ${destination}. ` +
      `Fix filesystem permissions or rerun the repair from an elevated shell. Cause: ${error.message}`
    );
  }
  transactionOriginals.set(key, destination);
  return destination;
}

function fingerprintTarget(targetPath) {
  if (!fs.existsSync(targetPath)) return { kind: "absent" };
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`Transaction refuses linked output: ${targetPath}`);
  if (stat.isFile()) {
    return {
      kind: "file",
      sha256: crypto.createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex")
    };
  }
  if (!stat.isDirectory()) throw new Error(`Transaction refuses unsupported output: ${targetPath}`);
  const hash = crypto.createHash("sha256");
  for (const relative of listFilesRecursive(targetPath, { rejectLinks: true })) {
    hash.update(relative).update("\0").update(fs.readFileSync(path.join(targetPath, relative))).update("\0");
  }
  return { kind: "directory", sha256: hash.digest("hex") };
}

function sameFingerprint(left, right) {
  return left.kind === right.kind && left.sha256 === right.sha256;
}

function trackTransactionWrite(targetPath) {
  if (!options.apply) return;
  const key = path.resolve(targetPath);
  assertManagedTarget(key);
  operationJournal?.markApplied(key);
  transactionWrites.set(key, {
    output: fingerprintTarget(key),
    backup: transactionOriginals.get(key) || null
  });
  const failAfter = Number(process.env.CODEX_CHEF_TEST_REPAIR_FAIL_AFTER_WRITES || 0);
  if (process.env.CODEX_CHEF_TEST_MODE === "1" && Number.isInteger(failAfter) && failAfter > 0 && transactionWrites.size >= failAfter) {
    throw new Error("Injected repair post-write failure");
  }
}

function prepareTransactionWrite(targetPath) {
  if (!options.apply) return;
  const key = path.resolve(targetPath);
  assertManagedTarget(key);
  operationJournal ||= createOperationJournal({ backupRoot, operation: "repair-install" });
  operationJournal.prepareMutation({ target: key, backup: transactionOriginals.get(key) || null });
}

function reconcileTransaction() {
  const unresolved = [];
  for (const [targetPath, entry] of [...transactionWrites.entries()].reverse()) {
    let current;
    try {
      current = fingerprintTarget(targetPath);
    } catch (error) {
      unresolved.push(`${redact(targetPath)} could not be inspected: ${error.message}`);
      continue;
    }
    if (!sameFingerprint(current, entry.output)) {
      unresolved.push(`${redact(targetPath)} changed after repair wrote it; preserved user/concurrent changes`);
      continue;
    }
    try {
      assertManagedTarget(targetPath);
      fs.rmSync(targetPath, { recursive: true, force: true });
      if (entry.backup) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.cpSync(entry.backup, targetPath, { recursive: true, force: true });
      }
    } catch (error) {
      unresolved.push(`${redact(targetPath)} could not be reconciled: ${error.message}`);
    }
  }
  return unresolved;
}

function recordAction(action) {
  actions.push({
    ...action,
    source: action.source ? redact(action.source) : undefined,
    target: action.target ? redact(action.target) : undefined,
    backup: action.backup ? redact(action.backup) : undefined
  });
}

function migrateLegacyProfilePins() {
  const profiles = ["conservative.config.toml", "trusted-project.config.toml", "full-access.config.toml"];
  const results = [];
  if (!options.migrateLegacyProfilePins) return { requested: false, results };
  for (const name of profiles) {
    const target = path.join(options.codexHome, name);
    if (!fs.existsSync(target)) continue;
    const original = fs.readFileSync(target, "utf8");
    const updated = original.replace(/^(?:model|review_model)\s*=\s*"[^"]+"\s*\r?\n/gm, "");
    if (updated === original) {
      results.push({ profile: name, status: "current" });
      continue;
    }
    const action = {
      kind: "migrate-legacy-profile-pins",
      target,
      status: options.apply ? "applied" : "planned",
      reason: "remove legacy model and review_model pins while preserving profile behavior"
    };
    if (options.apply) {
      action.backup = backupTarget(target);
      prepareTransactionWrite(target);
      fs.writeFileSync(target, updated, "utf8");
      trackTransactionWrite(target);
    }
    recordAction(action);
    results.push({ profile: name, status: action.status });
  }
  return { requested: true, results };
}

function listFilesRecursive(directory, { rejectLinks = false } = {}) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  const rootStat = fs.lstatSync(directory);
  if (rejectLinks && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    throw new Error(`Managed directory must be a real directory: ${directory}`);
  }

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const stat = fs.lstatSync(full);
      if (rejectLinks && stat.isSymbolicLink()) {
        throw new Error(`Managed directory tree must not contain links: ${full}`);
      }
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) files.push(toPosix(path.relative(directory, full)));
      else if (rejectLinks) throw new Error(`Managed directory tree contains an unsupported entry: ${full}`);
    }
  }

  walk(directory);
  return files.sort();
}

function fileEquals(sourcePath, targetPath) {
  return fs.existsSync(sourcePath)
    && fs.existsSync(targetPath)
    && fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
}

function repairFile(sourceRel, targetPath, id) {
  assertManagedTarget(targetPath);
  const sourcePath = path.join(root, sourceRel);
  const exists = fs.existsSync(targetPath);
  const current = exists && fileEquals(sourcePath, targetPath);
  if (current) return { status: "current", source: sourceRel, target: redact(targetPath) };

  const action = {
    id,
    kind: "copy-file",
    source: sourceRel,
    target: targetPath,
    status: options.apply ? "applied" : "planned",
    reason: exists ? "drifted" : "missing"
  };

  if (options.apply) {
    assertManagedTarget(targetPath);
    ensureDir(path.dirname(targetPath));
    action.backup = backupTarget(targetPath);
    prepareTransactionWrite(targetPath);
    fs.copyFileSync(sourcePath, targetPath);
    trackTransactionWrite(targetPath);
  }

  recordAction(action);
  return { status: action.status, source: sourceRel, target: redact(targetPath), reason: action.reason };
}

function repairGeneratedMcpProfile(templateRel, targetPath, id) {
  assertManagedTarget(targetPath);
  const templatePath = path.join(root, templateRel);
  const configPath = path.join(options.codexHome, "config.toml");
  const fallbackConfig = path.join(root, "templates", "codex", options.platform === "windows" ? "config.windows.toml" : "config.unix.toml");
  const render = (sourcePath) => {
    const result = spawnSync(process.execPath, [
      "scripts/merge-codex-config.mjs",
      "--render-mcp-profile",
      "--source", sourcePath,
      "--template", templatePath,
      "--output", targetPath,
      "--dry-run"
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 30000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || "MCP profile generation failed.").trim());
    return result.stdout;
  };
  let rendered;
  try {
    const sourceConfig = fs.existsSync(configPath) ? configPath : fallbackConfig;
    rendered = render(sourceConfig);
  } catch (error) {
    if (!fs.existsSync(configPath)) throw error;
    rendered = render(fallbackConfig);
    warnings.push(`Generated ${path.basename(targetPath)} from the platform template because the installed config lacks one or more required bundled MCP transports.`);
  }
  const exists = fs.existsSync(targetPath);
  const current = exists && fs.readFileSync(targetPath, "utf8") === rendered;
  if (current) return { status: "current", source: templateRel, target: redact(targetPath) };

  const action = {
    id,
    kind: "generate-mcp-profile",
    source: templateRel,
    target: targetPath,
    status: options.apply ? "applied" : "planned",
    reason: exists ? "drifted" : "missing"
  };
  if (options.apply) {
    ensureDir(path.dirname(targetPath));
    action.backup = backupTarget(targetPath);
    prepareTransactionWrite(targetPath);
    fs.writeFileSync(targetPath, rendered, "utf8");
    trackTransactionWrite(targetPath);
  }
  recordAction(action);
  return { status: action.status, source: templateRel, target: redact(targetPath), reason: action.reason };
}

function repairRulesFile(sourceRel, targetPath, id) {
  const sourcePath = path.join(root, sourceRel);
  const exists = fs.existsSync(targetPath);
  const sourceText = fs.readFileSync(sourcePath, "utf8");
  const targetText = exists ? fs.readFileSync(targetPath, "utf8") : "";
  const sourceLines = significantRulesLines(sourceText);
  const targetLines = new Set(significantRulesLines(targetText));
  const missingLines = sourceLines.filter((line) => !targetLines.has(line));
  const problemRules = exists ? findProblemRules(targetText, { sourceText }) : [];
  if (exists && missingLines.length === 0 && problemRules.length === 0) {
    return { id, status: "current", source: sourceRel, target: redact(targetPath) };
  }

  const reasons = [];
  if (!exists) reasons.push("missing");
  if (missingLines.length > 0) reasons.push(`missing ${missingLines.length} managed rules baseline line(s)`);
  if (problemRules.length > 0) reasons.push(`${problemRules.length} conflicting local approval rule(s)`);
  const action = {
    id,
    kind: "merge-rules-baseline",
    source: sourceRel,
    target: targetPath,
    status: options.apply ? "applied" : "planned",
    reason: reasons.join("; "),
    problemRules: problemRules.map((rule) => ({
      lineNumber: rule.lineNumber,
      pattern: rule.pattern,
      decision: rule.decision,
      reason: rule.reason
    }))
  };

  if (options.apply) {
    assertManagedTarget(targetPath);
    ensureDir(path.dirname(targetPath));
    action.backup = backupTarget(targetPath);
    const sourceLineSet = new Set(sourceLines);
    const problemLineSet = new Set(problemRules.map((rule) => rule.line));
    const extra = exists
      ? targetText
          .split(/\r?\n/)
          .filter((line) => {
            const trimmed = line.trim();
            return !sourceLineSet.has(trimmed) && !problemLineSet.has(trimmed);
          })
          .join("\n")
          .trim()
      : "";
    if (problemRules.length > 0) {
      action.removedConflictingLocalRules = problemRules.length;
      notes.push(`Removed ${problemRules.length} conflicting local approval rule(s) from ${redact(targetPath)} during repair.`);
    }
    const next = extra ? `${sourceText.trimEnd()}\n\n# Local approval rules preserved by AgentChef repair.\n${extra}\n` : sourceText;
    prepareTransactionWrite(targetPath);
    fs.writeFileSync(targetPath, next, "utf8");
    trackTransactionWrite(targetPath);
  }

  recordAction(action);
  return {
    id,
    status: action.status,
    source: sourceRel,
    target: redact(targetPath),
    reason: action.reason,
    problemRules: action.problemRules,
    removedConflictingLocalRules: action.removedConflictingLocalRules || 0
  };
}

function repairManagedFiles(contract) {
  let current = 0;
  let planned = 0;
  let applied = 0;
  const changed = [];

  function account(result) {
    if (result.status === "current") current += 1;
    else if (result.status === "planned") planned += 1;
    else if (result.status === "applied") applied += 1;
    if (result.status !== "current") changed.push(result);
  }

  const pluginMirrors = [];
  let expected = 0;
  for (const action of contract.operations) {
    if (action.id === "codex-config") {
      config = runConfigMerge();
      expected += 1;
      if (config.status === "current") current += 1;
      else if (config.status === "planned") planned += 1;
      else if (config.status === "applied") applied += 1;
      continue;
    }
    if (action.kind === "copy-file") {
      const result = action.id === "codex-rules"
        ? repairRulesFile(action.source, action.destination, action.id)
        : repairFile(action.source, action.destination, action.id);
      expected += 1;
      account(result);
      continue;
    }
    if (action.kind === "generate-mcp-profile") {
      expected += 1;
      account(repairGeneratedMcpProfile(action.source, action.destination, action.id));
      continue;
    }
    if (action.kind === "copy-directory") {
      const sourceRoot = path.join(root, action.source);
      const sourceFiles = listFilesRecursive(sourceRoot, { rejectLinks: true });
      if (["codex-plugin", "codex-plugin-marketplace-source"].includes(action.componentId)) {
        pluginMirrors.push({
          id: action.componentId,
          root: action.destination,
          sourceFiles: new Set(sourceFiles)
        });
      }
      for (const file of sourceFiles) {
        expected += 1;
        account(repairFile(
          toPosix(path.join(action.source, file)),
          path.join(action.destination, file),
          `${action.id}:${file}`
        ));
      }
      continue;
    }
    if (action.kind === "write-ownership-marker") {
      expected += 1;
      const targetRoot = path.dirname(action.destination);
      const skillName = path.basename(targetRoot);
      const directSkill = directSkills.find((entry) => entry.name === skillName);
      if (!directSkill) throw new Error(`Resolved ownership marker has no matching direct skill: ${action.id}`);
      const sourceRoot = path.join(root, action.source);
      const markerWasCurrent = ["managed", "managed-with-extras"].includes(inspectDirectSkillTarget(sourceRoot, targetRoot).status);
      if (markerWasCurrent) {
        current += 1;
        continue;
      }
      const status = options.apply ? "applied" : "planned";
      if (options.apply) {
        if (fs.existsSync(action.destination)) backupTarget(action.destination);
        prepareTransactionWrite(action.destination);
        writeDirectSkillMarker(sourceRoot, targetRoot, {
          allowAdopt: shouldAdoptDirectSkill(directSkill)
        });
        trackTransactionWrite(action.destination);
      }
      recordAction({
        id: action.id,
        kind: "write-managed-ownership-marker",
        target: action.destination,
        status,
        reason: "managed-direct-skill-ownership"
      });
      if (status === "applied") applied += 1;
      else planned += 1;
    }
  }

  // Direct-skill directory actions must account for every nested source file.
  // Keep this invariant explicit so a platform-specific contract expansion can
  // never leave a managed support file behind while still writing the marker.
  for (const directSkill of directSkills) {
    const sourceRoot = path.join(root, "plugins", "codex-chef-workflows", "skills", directSkill.name);
    const targetRoot = path.join(options.agentsHome, "skills", directSkill.name);
    for (const relativePath of listFilesRecursive(sourceRoot, { rejectLinks: true })) {
      const sourcePath = path.join(sourceRoot, relativePath);
      const targetPath = path.join(targetRoot, relativePath);
      if (!fileEquals(sourcePath, targetPath)) {
        expected += 1;
        account(repairFile(
          toPosix(path.join("plugins/codex-chef-workflows/skills", directSkill.name, relativePath)),
          targetPath,
          `direct-skill-reconcile:${directSkill.name}:${relativePath}`
        ));
      }
    }
  }
  const extraPluginFiles = pluginMirrors.flatMap((mirror) =>
    listFilesRecursive(mirror.root, { rejectLinks: true })
      .filter((file) => !mirror.sourceFiles.has(file))
      .map((file) => ({ mirror: mirror.id, path: path.join(mirror.root, file), root: mirror.root }))
  );
  const pruned = [];

  for (const extra of extraPluginFiles) {
    const extraPath = extra.path;
    if (!options.pruneManagedPluginExtras) {
      warnings.push(`Extra file in managed AgentChef plugin mirror requires explicit prune flag: ${redact(extraPath)}`);
      continue;
    }
    if (!options.apply) {
      recordAction({
        id: `prune-plugin-extra:${extra.mirror}:${toPosix(path.relative(extra.root, extraPath))}`,
        kind: "delete-extra-managed-plugin-file",
        target: extraPath,
        status: "planned",
        reason: "extra-managed-plugin-file"
      });
      continue;
    }
    assertManagedTarget(extraPath);
    if (!isInside(extraPath, extra.root)) {
      throw new Error(`Refusing to prune file outside managed plugin mirror: ${extraPath}`);
    }
    const backup = backupTarget(extraPath);
    prepareTransactionWrite(extraPath);
    fs.rmSync(extraPath, { force: true });
    trackTransactionWrite(extraPath);
    pruned.push(redact(extraPath));
    recordAction({
      id: `prune-plugin-extra:${extra.mirror}:${toPosix(path.relative(extra.root, extraPath))}`,
      kind: "delete-extra-managed-plugin-file",
      target: extraPath,
      backup,
      status: "applied",
      reason: "extra-managed-plugin-file"
    });
  }

  if (current + planned + applied !== expected) {
    throw new Error(
      `Managed file accounting invariant failed: expected ${expected}, observed ${current + planned + applied}.`
    );
  }

  return {
    expected,
    current,
    planned,
    applied,
    changed,
    extraPluginFiles: extraPluginFiles.map((extra) => redact(extra.path)),
    pruned
  };
}

function runPreflightValidators() {
  const checks = [
    ["agent-config", "scripts/validate-agent-config.mjs"],
    ["mcp-config", "scripts/validate-mcp-config.mjs"],
    ["approval-harmony", "scripts/validate-approval-harmony.mjs"]
  ];
  const results = [];

  for (const [id, script] of checks) {
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 120000
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const ok = !result.error && result.status === 0;
    results.push({
      id,
      status: ok ? "ok" : "fail",
      exitCode: result.status,
      outputPreview: output ? output.split(/\r?\n/).slice(0, 8) : []
    });
    if (result.error) {
      failures.push(`Repair preflight ${id} could not run: ${result.error.message}`);
    } else if (result.status !== 0) {
      failures.push(`Repair preflight ${id} failed: ${output}`);
    }
  }

  return {
    inspected: true,
    status: results.every((result) => result.status === "ok") ? "ok" : "fail",
    checks: results
  };
}

function runConfigMerge() {
  const template = path.join(root, "templates", "codex", options.platform === "windows" ? "config.windows.toml" : "config.unix.toml");
  const destination = path.join(options.codexHome, "config.toml");
  const inspectArgs = [
    "scripts/merge-codex-config.mjs",
    template,
    destination,
    "--sync-managed-tables",
    "--json",
    "--dry-run"
  ];

  const inspect = spawnSync(process.execPath, inspectArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 60000
  });

  if (inspect.error) {
    failures.push(`Codex config repair could not run: ${inspect.error.message}`);
    return { inspected: false, status: "fail" };
  }
  if (inspect.status !== 0) {
    failures.push(`Codex config repair failed: ${[inspect.stdout, inspect.stderr].filter(Boolean).join("\n").trim()}`);
    return { inspected: true, status: "fail", exitCode: inspect.status };
  }

  let report;
  try {
    report = JSON.parse(inspect.stdout || "{}");
  } catch (error) {
    failures.push(`Codex config repair did not emit parseable JSON: ${error.message}`);
    return { inspected: true, status: "fail", exitCode: inspect.status };
  }

  const removedDeprecatedFields = report.removedDeprecatedFields || [];
  const updatedManagedFields = report.updatedManagedFields || [];
  const updatedManagedTables = report.updatedManagedTables || [];
  const addedRootKeys = report.addedRootKeys || [];
  const fullTemplateInstall = report.fullTemplateInstall === true;
  const configNeedsApply = fullTemplateInstall
    || report.addedRootKeyCount > 0
    || report.addedTableCount > 0
    || removedDeprecatedFields.length > 0
    || updatedManagedFields.length > 0
    || updatedManagedTables.length > 0;

  if (options.apply && configNeedsApply) {
    if (fs.existsSync(destination)) backupTarget(destination);
    ensureDir(path.dirname(destination));
    prepareTransactionWrite(destination);
    const apply = spawnSync(process.execPath, [
      "scripts/merge-codex-config.mjs",
      template,
      destination,
      "--sync-managed-tables",
      "--json"
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 60000
    });

    if (apply.error) {
      failures.push(`Codex config repair apply could not run: ${apply.error.message}`);
      return { inspected: true, status: "fail" };
    }
    if (apply.status !== 0) {
      failures.push(`Codex config repair apply failed: ${[apply.stdout, apply.stderr].filter(Boolean).join("\n").trim()}`);
      return { inspected: true, status: "fail", exitCode: apply.status };
    }
    trackTransactionWrite(destination);
  }

  if (configNeedsApply) {
    recordAction({
      id: "codex-config",
      kind: fullTemplateInstall ? "install-config" : report.addedTableCount > 0 ? "merge-config" : "repair-config-fields",
      source: template,
      target: destination,
      status: options.apply ? "applied" : "planned",
      reason: [
        fullTemplateInstall ? "missing config.toml" : null,
        report.addedRootKeyCount > 0 ? `missing ${report.addedRootKeyCount} managed root setting(s)` : null,
        report.addedTableCount > 0 ? `missing ${report.addedTableCount} managed config table(s)` : null,
        removedDeprecatedFields.length > 0 ? `deprecated managed field(s): ${removedDeprecatedFields.join(", ")}` : null,
        updatedManagedFields.length > 0 ? `managed field update(s): ${updatedManagedFields.join(", ")}` : null,
        updatedManagedTables.length > 0 ? `managed table sync(s): ${updatedManagedTables.join(", ")}` : null
      ].filter(Boolean).join("; ")
    });
  }

  return {
    inspected: true,
    status: configNeedsApply ? (options.apply ? "applied" : "planned") : "current",
    fullTemplateInstall,
    addedRootKeys,
    addedRootKeyCount: report.addedRootKeyCount || 0,
    addedTables: report.addedTables || [],
    addedTableCount: report.addedTableCount || 0,
    removedDeprecatedFields,
    updatedManagedFields,
    updatedManagedTables
  };
}

function repairMarketplace() {
  const marketplacePath = path.join(options.agentsHome, "plugins", "marketplace.json");
  const pluginTarget = path.join(options.agentsHome, "plugins", "sources", "codex-chef-workflows");
  let state;

  try {
    state = inspectMarketplaceEntry(marketplacePath, pluginTarget);
  } catch (error) {
    failures.push(`Cannot repair plugin marketplace because it is invalid or unreadable: ${redact(marketplacePath)} (${error.message})`);
    return { inspected: true, status: "fail", path: redact(marketplacePath) };
  }

  if (!state.changed) {
    return {
      inspected: true,
      status: "current",
      path: redact(marketplacePath),
      preservedPlugins: state.beforeCount
    };
  }

  if (options.apply) {
    ensureDir(path.dirname(marketplacePath));
    const backup = backupTarget(marketplacePath);
    prepareTransactionWrite(marketplacePath);
    writeMarketplaceEntry(marketplacePath, pluginTarget);
    trackTransactionWrite(marketplacePath);
    recordAction({
      id: "plugin-marketplace",
      kind: state.existingIndex >= 0 ? "update-marketplace-entry" : "add-marketplace-entry",
      target: marketplacePath,
      backup,
      status: "applied",
      reason: state.existingIndex >= 0 ? "stale AgentChef plugin entry" : "missing AgentChef plugin entry"
    });
  } else {
    recordAction({
      id: "plugin-marketplace",
      kind: state.existingIndex >= 0 ? "update-marketplace-entry" : "add-marketplace-entry",
      target: marketplacePath,
      status: "planned",
      reason: state.existingIndex >= 0 ? "stale AgentChef plugin entry" : "missing AgentChef plugin entry"
    });
  }

  return {
    inspected: true,
    status: options.apply ? "applied" : "planned",
    path: redact(marketplacePath),
    preservedPlugins: state.beforeCount,
    action: state.existingIndex >= 0 ? "update-entry" : "add-entry"
  };
}

function inspectSkills() {
  const expected = readJson("catalog/skills.json")
    .skills
    .filter((skill) => skill.install === true || skill.directInstall === true)
    .map((skill) => skill.name)
    .sort();
  const expectedSet = new Set(expected);
  const managedDirectSet = new Set(
    readJson("catalog/skills.json")
      .skills
      .filter((skill) => skill.directInstall === true)
      .map((skill) => skill.name)
  );
  const roots = [
    path.join(options.codexHome, "skills"),
    path.join(options.agentsHome, "skills")
  ];
  const locations = new Map();

  for (const skillRoot of roots) {
    if (!fs.existsSync(skillRoot)) continue;
    for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const current = locations.get(entry.name) || [];
      current.push(skillRoot);
      locations.set(entry.name, current);
    }
  }

  const installed = [...locations.keys()].sort();
  const missing = expected.filter((skill) => !locations.has(skill));
  const extra = installed.filter((skill) => !expectedSet.has(skill) && !managedDirectSet.has(skill));
  const duplicates = [...locations.entries()]
    .filter(([, skillRoots]) => skillRoots.length > 1)
    .map(([name, skillRoots]) => ({ name, roots: skillRoots.map(redact) }));

  if (extra.length > 0) {
    notes.push(`${extra.length} non-curated global skill(s) are installed; repair reports them but does not delete user skills.`);
  }
  if (duplicates.length > 0) {
    warnings.push(`${duplicates.length} duplicate global skill name(s) are visible across skill roots.`);
  }

  return {
    inspected: true,
    expected: expected.length,
    installed: installed.length,
    missing,
    extraCount: extra.length,
    duplicateCount: duplicates.length,
    duplicates,
    cleanupCandidates: extra,
    roots: roots.map((skillRoot) => ({
      path: redact(skillRoot),
      exists: fs.existsSync(skillRoot),
      count: fs.existsSync(skillRoot)
        ? fs.readdirSync(skillRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).length
        : 0
    }))
  };
}

function writeBackupManifest() {
  if (!options.apply || options.noBackup || !fs.existsSync(backupRoot)) return;
  const result = spawnSync(process.execPath, [
    "scripts/write-backup-manifest.mjs",
    "--backup-root",
    backupRoot,
    "--operation",
    "repair",
    "--platform",
    options.platform
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 60000
  });
  if (result.error) {
    warnings.push(`Could not write repair backup manifest: ${result.error.message}`);
  } else if (result.status !== 0) {
    warnings.push(`Could not write repair backup manifest: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`);
  }
}

let managedFiles;
let config;
let marketplace;
let pluginRefresh;
let skills;
let legacyProfileMigration;

function pathEntryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function resolveRepairContract() {
  const contract = resolveInstallContract({
    root,
    platform: options.platform,
    codexHome: options.codexHome,
    agentsHome: options.agentsHome,
    home: os.homedir(),
    noBackup: options.noBackup
  });
  const targets = contract.preflightTargets;
  for (const target of targets) assertManagedTarget(target);
  return contract;
}

function assertNoBackupCreationOnly(targets, pluginRefreshInspection) {
  if (!options.apply || !options.noBackup) return;
  const requestedExistingMutation = targets.find((target) => pathEntryExists(target));
  const requestedNonCreationAction = options.pruneManagedPluginExtras
    || options.migrateLegacyProfilePins
    || options.adoptFetchSkill
    || options.adoptSeoSkill
    || options.adoptEvidenceResearchSkill
    || options.adoptDirectSkills.size > 0;
  const requestedPluginCacheMutation = pluginRefreshInspection?.status === "planned";
  if (requestedExistingMutation || requestedNonCreationAction || requestedPluginCacheMutation) {
    throw new Error(
      "--no-backup is creation-only; existing managed targets, adoption, migration, prune actions, and a stale installed plugin cache require backup-backed apply."
    );
  }
}

try {
  const repairContract = resolveRepairContract();
  const noBackupPluginRefresh = options.apply && options.noBackup
    ? refreshInstalledPlugin({
        apply: false,
        codexHome: options.codexHome,
        expectedVersion: readJson("plugins/codex-chef-workflows/.codex-plugin/plugin.json").version,
        platform: options.platform
      })
    : null;
  assertNoBackupCreationOnly(repairContract.preflightTargets, noBackupPluginRefresh);
  for (const directSkill of directSkills) {
    const source = path.join(root, "plugins", "codex-chef-workflows", "skills", directSkill.name);
    const target = path.join(options.agentsHome, "skills", directSkill.name);
    const alternateTarget = path.join(options.codexHome, "skills", directSkill.name);
    if (
      path.resolve(alternateTarget) !== path.resolve(target)
      && pathEntryExists(alternateTarget)
    ) {
      throw new Error(
        `Duplicate direct skill root detected; move or explicitly reconcile the existing CODEX_HOME copy before repair: ${redact(alternateTarget)}`
      );
    }
    const state = inspectDirectSkillTarget(source, target);
    if (
      !state.safeToSync
      && !(shouldAdoptDirectSkill(directSkill) && isDirectSkillStateAdoptable(state))
    ) {
      throw new Error(
        `Refusing to overwrite user-owned ${directSkill.display} skill without ${directSkill.adoptFlag}: ${redact(target)}`
      );
    }
  }
  const marketplacePath = path.join(options.agentsHome, "plugins", "marketplace.json");
  const marketplacePluginTarget = path.join(options.agentsHome, "plugins", "sources", "codex-chef-workflows");
  inspectMarketplaceEntry(marketplacePath, marketplacePluginTarget);
  preflight = runPreflightValidators();
  if (preflight.status !== "ok") {
    throw new Error("Repair preflight failed; refusing to plan or apply managed global changes until validators pass.");
  }
  if (options.apply) {
    operationLock = acquireOperationLockSet({
      roots: [options.codexHome, options.agentsHome],
      operation: "repair-install"
    });
  }
  managedFiles = repairManagedFiles(repairContract);
  legacyProfileMigration = migrateLegacyProfilePins();
  marketplace = repairMarketplace();
  pluginRefresh = noBackupPluginRefresh || refreshInstalledPlugin({
    apply: options.apply,
    codexHome: options.codexHome,
    expectedVersion: readJson("plugins/codex-chef-workflows/.codex-plugin/plugin.json").version,
    platform: options.platform
  });
  if (pluginRefresh.status === "planned" || pluginRefresh.status === "refreshed") {
    recordAction({
      id: "installed-plugin-cache",
      kind: "refresh-installed-plugin-cache",
      target: PLUGIN_ID,
      status: pluginRefresh.status === "refreshed" ? "applied" : "planned",
      reason: `installed AgentChef plugin cache is ${pluginRefresh.currentVersion || pluginRefresh.previousVersion || "unknown"}; expected ${pluginRefresh.expectedVersion}`
    });
  } else if (pluginRefresh.warning) {
    notes.push(pluginRefresh.warning);
  }
  skills = inspectSkills();
  writeBackupManifest();
} catch (error) {
  failures.push(error.message);
} finally {
  if (options.apply && failures.length > 0 && transactionWrites.size > 0) {
    const unresolved = reconcileTransaction();
    if (unresolved.length > 0) {
      failures.push(`Repair reconciliation left ${unresolved.length} unresolved target(s): ${unresolved.join("; ")}`);
    } else {
      notes.push(`Repair failed after mutation; reconciled ${transactionWrites.size} managed target(s) from their backups.`);
    }
  }
  if (operationJournal && failures.length > 0) operationJournal.finish("failed");
  if (operationJournal && failures.length === 0) operationJournal.finish("complete");
  if (operationLock) operationLock.release();
}

const plannedCount = actions.filter((action) => action.status === "planned").length;
const appliedCount = actions.filter((action) => action.status === "applied").length;
const destructivePlanned = actions.filter((action) => action.kind === "delete-extra-managed-plugin-file");

if (options.pruneManagedPluginExtras && !options.apply && destructivePlanned.length > 0) {
  warnings.push("--prune-managed-plugin-extras was requested in preview mode; no files were deleted.");
}

const attentionReasons = [
  ...warnings,
  ...(skills?.missing?.length > 0 ? [`${skills.missing.length} curated skill(s) are missing; run the installer with skill installation enabled.`] : []),
  ...(managedFiles?.extraPluginFiles?.length > 0 && !options.pruneManagedPluginExtras
    ? ["Managed plugin has extra files; rerun repair with --prune-managed-plugin-extras only after reviewing the backup/destructive scope."]
    : [])
];

const status = failures.length > 0
  ? "fail"
  : options.apply
    ? appliedCount > 0
      ? (attentionReasons.length > 0 ? "attention" : "repaired")
      : (attentionReasons.length > 0 ? "attention" : "ok")
    : plannedCount > 0 || attentionReasons.length > 0
      ? "attention"
      : "ok";

const report = {
  schemaVersion: "codex-chef.repair.v1",
  generatedAt: new Date().toISOString(),
  mode: options.apply ? "apply" : "plan",
  status,
  codexHome: redact(options.codexHome),
  agentsHome: redact(options.agentsHome),
  backupRoot: options.apply && !options.noBackup && fs.existsSync(backupRoot) ? redact(backupRoot) : null,
  preflight,
  managedFiles,
  config,
  marketplace,
  pluginRefresh,
  skills,
  legacyProfileMigration,
  actions,
  warnings,
  notes,
  attentionReasons,
  failures,
  nextActions: status === "fail"
    ? ["Fix failed repair items, then rerun npm run repair:install -- --apply."]
    : options.apply
      ? ["Run npm run codex:status after restarting Codex."]
      : plannedCount > 0
        ? ["Review the planned actions, then rerun with --apply to repair managed drift."]
        : attentionReasons.length > 0
          ? ["Review attention items; non-curated or duplicate skills are reported but not deleted automatically."]
          : ["No repair action needed."]
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("AgentChef repair");
  console.log(`Mode: ${report.mode}`);
  console.log(`Overall: ${report.status}`);
  console.log(`Codex home: ${report.codexHome}`);
  console.log(`Agents home: ${report.agentsHome}`);
  if (managedFiles) {
    console.log(`Managed files: ${managedFiles.current}/${managedFiles.expected} current, ${managedFiles.planned} planned, ${managedFiles.applied} applied`);
  }
  if (config) {
    console.log(`Config: ${config.status}${config.addedTableCount ? ` (${config.addedTableCount} missing table(s))` : ""}`);
  }
  if (marketplace) {
    console.log(`Marketplace: ${marketplace.status}`);
  }
  if (pluginRefresh) {
    console.log(`Plugin cache: ${pluginRefresh.status}`);
  }
  if (skills) {
    console.log(`Skills: ${skills.installed} unique installed (${skills.expected} curated expected, ${skills.missing.length} missing, ${skills.extraCount} non-curated, ${skills.duplicateCount} duplicate names)`);
  }
  for (const action of actions) {
    console.log(`Action: ${action.status} ${action.kind} ${action.target || ""}`.trim());
  }
  for (const note of notes) console.log(`Note: ${note}`);
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  for (const failure of failures) console.error(`Failure: ${failure}`);
  if (report.backupRoot) console.log(`Backup: ${report.backupRoot}`);
}

if (status === "fail") process.exit(1);
