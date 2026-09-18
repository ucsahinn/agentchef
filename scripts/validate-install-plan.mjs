#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "manifests", "install-plan.json");
const schemaPath = path.join(root, "schemas", "install-plan.schema.json");
const skillsPath = path.join(root, "catalog", "skills.json");
const failures = [];

const allowedKinds = new Set([
  "copy-file",
  "copy-directory",
  "copy-glob",
  "generate-mcp-profile",
  "write-marketplace",
  "refresh-plugin-cache",
  "git-config",
  "chmod",
  "skill-install",
  "json-merge",
  "link-directory",
  "write-claude-marketplace",
  "claude-plugin-register"
]);
const allowedTargets = new Set(["codex", "claude", "shared"]);
const allowedFlags = new Set(["InstallSkills", "InstallGitGuards"]);
const allowedPlatforms = new Set(["windows", "unix"]);
const allowedRisks = new Set(["low", "medium", "high"]);

function fail(message) {
  failures.push(message);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Invalid JSON in ${label}: ${error.message}`);
    return null;
  }
}

function existsRelative(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function validateSourcePath(operation, key, relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    fail(`Operation ${operation.id} must declare ${key}`);
    return;
  }
  if (path.isAbsolute(relativePath) || relativePath.includes("..")) {
    fail(`Operation ${operation.id} ${key} must be a repo-relative path without traversal`);
    return;
  }
  if (!existsRelative(relativePath)) {
    fail(`Operation ${operation.id} references missing ${key}: ${relativePath}`);
  }
}

function validateGlob(operation) {
  const glob = operation.sourceGlob;
  if (!glob || typeof glob !== "string" || !glob.includes("*")) {
    fail(`Operation ${operation.id} must declare a sourceGlob with *`);
    return;
  }
  const normalized = glob.replace(/\\/g, "/");
  const dir = normalized.slice(0, normalized.lastIndexOf("/*"));
  if (!dir || !existsRelative(dir)) {
    fail(`Operation ${operation.id} sourceGlob directory is missing: ${glob}`);
  }
}

// Every target owns a fixed set of home tokens. Literal adjacent-harness
// homes stay denied for every target: the Claude surface is reachable only
// through the ${CLAUDE_HOME}/${CLAUDE_JSON} tokens, which the installer
// resolves from CLAUDE_CONFIG_DIR at run time.
const targetRoots = {
  codex: ["${CODEX_HOME}", "${AGENTS_HOME}"],
  claude: ["${CLAUDE_HOME}", "${CLAUDE_JSON}", "${AGENTS_HOME}/plugins"],
  shared: ["${AGENTS_HOME}"]
};

function validateDestinationPath(operation, key, value) {
  if (!value || typeof value !== "string") {
    fail(`Operation ${operation.id} must declare ${key}`);
    return;
  }
  const normalized = value.replace(/\\/g, "/");
  const deniedHomes = [
    "${HOME}/.claude",
    "${HOME}/.claude.json",
    "${HOME}/.cursor",
    "${HOME}/.opencode",
    "${HOME}/.kiro",
    "${HOME}/.vscode",
    "${HOME}/.zed",
    "${HOME}/.gemini",
    "${HOME}/.qwen"
  ];
  if (deniedHomes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    fail(`Operation ${operation.id} must not target adjacent harness home path: ${value}`);
  }

  if (operation.requiresFlag === "InstallGitGuards") {
    const allowedGitGuardTargets = [
      "${HOME}/.gitignore_global",
      "${HOME}/.githooks",
      "${HOME}/.githooks/pre-commit"
    ];
    if (!allowedGitGuardTargets.some((target) => normalized === target || normalized.startsWith(`${target}/`))) {
      fail(`Operation ${operation.id} InstallGitGuards destination must stay within reviewed Git guard targets: ${value}`);
    }
    return;
  }

  if (operation.requiresFlag && operation.requiresFlag !== "InstallGitGuards") {
    return;
  }

  const roots = targetRoots[operation.target] || targetRoots.codex;
  if (!roots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    fail(`Operation ${operation.id} (${operation.target}) destination must stay within ${roots.join(" or ")}: ${value}`);
  }
}

// Target combinations: every shared operation appears exactly once for any
// selection, no two operations write the same destination, and claude-only
// operations never leak into the default codex selection.
function validateTargetCombinations() {
  const planFor = (targetArgs, label) => {
    const output = runPlan(["--all", "--install-git-guards", "--platform", "unix", ...targetArgs, "--json"], label);
    return output ? parsePlan(output, label) : null;
  };
  const codexOnly = planFor([], "Target codex plan");
  const claudeOnly = planFor(["--target", "claude"], "Target claude plan");
  const both = planFor(["--target", "both"], "Target both plan");
  if (!codexOnly || !claudeOnly || !both) return;
  const byId = new Map(manifest.operations.map((operation) => [operation.id, operation]));
  const sharedIds = manifest.operations.filter((operation) => operation.target === "shared").map((operation) => operation.id);
  for (const [label, plan] of [["codex", codexOnly], ["claude", claudeOnly], ["both", both]]) {
    const selected = plan.selectedComponentIds;
    for (const id of sharedIds) {
      if (selected.filter((entry) => entry === id).length !== 1) {
        fail(`Target ${label} plan must include shared operation ${id} exactly once`);
      }
    }
    const destinations = new Map();
    for (const action of plan.operations) {
      if (!action.destination || action.kind === "chmod") continue;
      const previous = destinations.get(action.destination);
      if (previous && previous !== action.componentId) {
        fail(`Target ${label} plan writes ${action.destination} from both ${previous} and ${action.componentId}`);
      }
      destinations.set(action.destination, action.componentId);
    }
    for (const id of selected) {
      const target = byId.get(id)?.target;
      if (label === "codex" && target === "claude") fail(`Default codex plan must not select claude operation ${id}`);
      if (label === "claude" && target === "codex") fail(`Claude-only plan must not select codex operation ${id}`);
    }
  }
  if (both.selectedComponentIds.length !== new Set([...codexOnly.selectedComponentIds, ...claudeOnly.selectedComponentIds]).size) {
    fail("Target both plan must equal the union of the codex and claude selections");
  }
  const claudeActions = claudeOnly.operations.filter((action) => byId.get(action.componentId)?.target === "claude");
  for (const action of claudeActions) {
    if (action.destination && !/(\/|\\)\.claude(\/|\\|$)|\.claude\.json$|(\/|\\)plugins(\/|\\)\.claude-plugin(\/|\\)marketplace\.json$/.test(action.destination)) {
      fail(`Claude operation ${action.id} resolved outside the Claude surface: ${action.destination}`);
    }
  }
}

function runPlan(args, label) {
  const result = spawnSync(process.execPath, ["scripts/plan-install.mjs", ...args], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed: ${result.stderr || result.stdout}`);
    return null;
  }
  return result.stdout;
}

function parsePlan(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    fail(`${label} did not emit parseable JSON: ${error.message}`);
    return null;
  }
}

function validatePlanOutputSmoke() {
  const jsonOutput = runPlan(["--all", "--json"], "Install plan JSON smoke");
  if (jsonOutput) {
    const plan = parsePlan(jsonOutput, "Install plan JSON smoke");
    if (plan) {
      if (plan.schemaVersion !== "agentchef.install-state-preview.v1") {
        fail("Install plan JSON smoke returned unexpected schemaVersion");
      }
      if (!Array.isArray(plan.operations) || plan.operations.length === 0) {
        fail("Install plan JSON smoke returned no operations");
      }
    }
  }

  const noBackupOutput = runPlan(["--no-backup", "--json"], "Install plan no-backup smoke");
  if (noBackupOutput) {
    const plan = parsePlan(noBackupOutput, "Install plan no-backup smoke");
    const backupManaged = plan?.operations?.filter(
      (operation) => operation.kind !== "skill-install" && operation.collision.includes("backup")
    ) || [];
    if (plan && backupManaged.some((operation) => operation.backup !== true)) {
      fail("Install plan --no-backup must preserve mandatory backup metadata for existing mutations");
    }
    if (plan && backupManaged.some((operation) => operation.noBackupPolicy !== "creation-only")) {
      fail("Install plan --no-backup must limit backup-managed operations to creation-only eligibility");
    }
    const curatedSkills = plan?.operations?.filter((operation) => operation.kind === "skill-install") || [];
    if (plan && curatedSkills.some((operation) => operation.backup !== true)) {
      fail("Install plan --no-backup must keep mandatory pinned-skill replacement backups enabled");
    }
  }

  const forceOutput = runPlan(["--force", "--json"], "Install plan force smoke");
  if (forceOutput) {
    const plan = parsePlan(forceOutput, "Install plan force smoke");
    if (plan?.operations?.some((operation) => operation.force !== true)) {
      fail("Install plan --force smoke must mark operations as force=true");
    }
  }

  const uncOutput = runPlan([
    "--platform",
    "windows",
    "--codex-home",
    "\\\\server\\share\\.codex",
    "--agents-home",
    "\\\\server\\share\\.agents",
    "--home",
    "\\\\server\\share",
    "--json"
  ], "Install plan UNC path smoke");
  if (uncOutput) {
    const plan = parsePlan(uncOutput, "Install plan UNC path smoke");
    const firstDestination = plan?.operations?.find((operation) => operation.destination)?.destination || "";
    if (plan && !firstDestination.startsWith("\\\\server\\share\\.codex\\")) {
      fail("Install plan UNC path smoke must preserve leading UNC double backslashes");
    }
  }

  validateTargetCombinations();

  const extendedOutput = runPlan([
    "--platform",
    "windows",
    "--codex-home",
    "\\\\?\\C:\\Temp\\.codex",
    "--agents-home",
    "\\\\?\\C:\\Temp\\.agents",
    "--home",
    "\\\\?\\C:\\Temp",
    "--json"
  ], "Install plan extended path smoke");
  if (extendedOutput) {
    const plan = parsePlan(extendedOutput, "Install plan extended path smoke");
    const firstDestination = plan?.operations?.find((operation) => operation.destination)?.destination || "";
    if (plan && !firstDestination.startsWith("\\\\?\\C:\\Temp\\.codex\\")) {
      fail("Install plan extended path smoke must preserve leading extended-length path prefix");
    }
  }
}

const manifest = readJson(manifestPath, "manifests/install-plan.json");
const schema = readJson(schemaPath, "schemas/install-plan.schema.json");
const skillsCatalog = readJson(skillsPath, "catalog/skills.json");

if (!manifest) {
  process.exit(1);
}

if (!schema) {
  fail("Missing or invalid schemas/install-plan.schema.json");
}

if (manifest.schemaVersion !== "agentchef.install-plan.v2") {
  fail("Install plan manifest has unexpected schemaVersion");
}

if (!manifest.profiles || typeof manifest.profiles !== "object" || Array.isArray(manifest.profiles)) {
  fail("Install plan manifest must declare profiles object");
}

if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) {
  fail("Install plan manifest must declare operations array");
}

const operationIds = new Set();
for (const operation of manifest.operations || []) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    fail("Install plan operation must be an object");
    continue;
  }

  if (!operation.id || !/^[a-z0-9-]+$/.test(operation.id)) {
    fail(`Install plan operation has invalid id: ${operation.id}`);
    continue;
  }
  if (operationIds.has(operation.id)) {
    fail(`Duplicate install plan operation id: ${operation.id}`);
  }
  operationIds.add(operation.id);

  if (!allowedKinds.has(operation.kind)) fail(`Operation ${operation.id} has invalid kind: ${operation.kind}`);
  if (!allowedTargets.has(operation.target)) fail(`Operation ${operation.id} has invalid target: ${operation.target}`);
  if (["json-merge", "link-directory", "write-claude-marketplace", "claude-plugin-register"].includes(operation.kind) && operation.target !== "claude") {
    fail(`Operation ${operation.id} kind ${operation.kind} is Claude-only and must declare target claude`);
  }
  if (!operation.summary) fail(`Operation ${operation.id} must declare summary`);
  if (!operation.collision) fail(`Operation ${operation.id} must declare collision`);
  if (typeof operation.backup !== "boolean") fail(`Operation ${operation.id} must declare boolean backup`);
  if (!allowedRisks.has(operation.risk)) fail(`Operation ${operation.id} has invalid risk: ${operation.risk}`);
  if (!operation.conflictPolicy) fail(`Operation ${operation.id} must declare conflictPolicy`);
  if (operation.requiresFlag && !allowedFlags.has(operation.requiresFlag)) {
    fail(`Operation ${operation.id} has invalid requiresFlag: ${operation.requiresFlag}`);
  }

  if (!Array.isArray(operation.platforms) || operation.platforms.length === 0) {
    fail(`Operation ${operation.id} must declare platforms`);
  } else {
    for (const platform of operation.platforms) {
      if (!allowedPlatforms.has(platform)) fail(`Operation ${operation.id} has invalid platform: ${platform}`);
    }
  }

  if (operation.kind === "copy-file" || operation.kind === "copy-directory") {
    if (operation.sourceByPlatform) {
      for (const platform of operation.platforms || []) {
        validateSourcePath(operation, `sourceByPlatform.${platform}`, operation.sourceByPlatform[platform]);
      }
    } else {
      validateSourcePath(operation, "source", operation.source);
    }
    validateDestinationPath(operation, "destination", operation.destination);
  }

  if (operation.kind === "copy-glob") {
    validateGlob(operation);
    validateDestinationPath(operation, "destinationDir", operation.destinationDir);
  }

  if (operation.kind === "generate-mcp-profile") {
    if (!Array.isArray(operation.sources) || operation.sources.length === 0) {
      fail(`Operation ${operation.id} must declare generated MCP profile sources`);
    } else {
      for (const source of operation.sources) validateSourcePath(operation, "sources", source);
    }
    validateDestinationPath(operation, "destinationDir", operation.destinationDir);
    validateDestinationPath(operation, "configSource", operation.configSource);
  }

  if (operation.kind === "skill-install") {
    validateSourcePath(operation, "catalog", operation.catalog);
    validateSourcePath(operation, "lock", operation.lock);
  }

  if (operation.kind === "json-merge") {
    validateSourcePath(operation, "source", operation.source);
    validateDestinationPath(operation, "destination", operation.destination);
    if (!/receipt/i.test(operation.collision || "")) fail(`Operation ${operation.id} json-merge collision must be receipt-backed`);
    if (!/receipt/i.test(operation.conflictPolicy || "")) fail(`Operation ${operation.id} json-merge conflictPolicy must explain receipt-scoped removal`);
  }

  if (operation.kind === "link-directory") {
    // Links live under the Claude home and point into the shared skill tree.
    if (String(operation.source || "").replace(/\\/g, "/") !== "${AGENTS_HOME}/skills") {
      fail(`Operation ${operation.id} link-directory source must be the shared ${"$"}{AGENTS_HOME}/skills tree`);
    }
    validateDestinationPath(operation, "destination", operation.destination);
    if (!/foreign/i.test(operation.conflictPolicy || "")) fail(`Operation ${operation.id} link-directory conflictPolicy must say foreign directories are never touched`);
  }

  if (operation.kind === "write-claude-marketplace") {
    validateDestinationPath(operation, "destination", operation.destination);
    validateDestinationPath(operation, "pluginTarget", operation.pluginTarget);
    if (!operation.destination.endsWith("/.claude-plugin/marketplace.json")) {
      fail(`Operation ${operation.id} must write the .claude-plugin/marketplace.json manifest`);
    }
  }

  if (operation.kind === "claude-plugin-register") {
    if (operation.pluginId !== "agentchef-workflows@agentchef") fail(`Operation ${operation.id} must declare the AgentChef Claude plugin id`);
    if (operation.backup !== false) fail(`Operation ${operation.id} is CLI-owned and must not claim a file backup`);
  }

  if (operation.kind === "write-marketplace") {
    validateDestinationPath(operation, "destination", operation.destination);
    validateDestinationPath(operation, "pluginTarget", operation.pluginTarget);
    if (operation.id === "plugin-marketplace") {
      if (operation.collision !== "upsert-entry-with-backup") {
        fail("plugin-marketplace must use upsert-entry-with-backup collision policy.");
      }
      if (!/unrelated marketplace plugins are preserved/i.test(operation.conflictPolicy || "")) {
        fail("plugin-marketplace conflictPolicy must say unrelated marketplace plugins are preserved.");
      }
    }
  }

  if (operation.kind === "git-config") {
    if (!operation.key || !operation.value) {
      fail(`Operation ${operation.id} must declare git config key and value`);
    } else {
      validateDestinationPath(operation, "value", operation.value);
    }
  }

  if (operation.kind === "refresh-plugin-cache") {
    validateDestinationPath(operation, "source", operation.source);
    validateDestinationPath(operation, "destination", operation.destination);
    if (operation.pluginId !== "agentchef-workflows@agentchef") {
      fail(`Operation ${operation.id} must declare the managed AgentChef plugin id`);
    }
  }

  if (operation.kind === "chmod") {
    validateDestinationPath(operation, "destination", operation.destination);
    if (operation.mode !== "+x") fail(`Operation ${operation.id} must declare mode +x`);
    if (!operation.platforms?.includes("unix") || operation.platforms?.includes("windows")) {
      fail(`Operation ${operation.id} chmod must be Unix-only`);
    }
  }
}

const curatedSkillsOperation = (manifest.operations || []).find(
  (operation) => operation.id === "curated-skills"
);
if (
  curatedSkillsOperation?.collision
  !== "preserve-foreign-update-owned-mandatory-backup-explicit-adoption-required"
  || curatedSkillsOperation?.backup !== true
  || !/foreign|unmarked/i.test(curatedSkillsOperation?.conflictPolicy || "")
  || !/--adopt-existing/.test(curatedSkillsOperation?.conflictPolicy || "")
) {
  fail(
    "curated-skills must preserve foreign targets, upgrade owned targets with mandatory backup, and require per-skill --adopt-existing"
  );
}

for (const [profileId, operationIdsForProfile] of Object.entries(manifest.profiles || {})) {
  if (!Array.isArray(operationIdsForProfile)) {
    fail(`Profile ${profileId} must be an array`);
    continue;
  }
  const seen = new Set();
  for (const operationId of operationIdsForProfile) {
    if (!operationIds.has(operationId)) fail(`Profile ${profileId} references unknown operation: ${operationId}`);
    if (seen.has(operationId)) fail(`Profile ${profileId} repeats operation: ${operationId}`);
    seen.add(operationId);
  }
}

if (!manifest.profiles?.default || !manifest.profiles?.all) {
  fail("Install plan manifest must declare default and all profiles");
}

const requiredOrderedDefaultIds = [
  "codex-agents-md",
  "codex-config",
  "codex-profile-launcher",
  "codex-serena-pool",
  "codex-rules",
  "codex-agents",
  "codex-profiles",
  "codex-mcp-profiles"
];
if (JSON.stringify(manifest.profiles?.default?.slice(0, requiredOrderedDefaultIds.length))
  !== JSON.stringify(requiredOrderedDefaultIds)) {
  fail("Default install profile must declare launcher and profile actions in installer order");
}

const generatedProfiles = manifest.operations?.find((operation) => operation.id === "codex-mcp-profiles");
if (generatedProfiles?.kind !== "generate-mcp-profile"
  || JSON.stringify(generatedProfiles?.sources) !== JSON.stringify([
    "templates/codex/profiles/full.config.toml",
    "templates/codex/profiles/multi-session.config.toml",
    "templates/codex/profiles/offline.config.toml"
  ])) {
  fail("full, multi-session, and offline profiles must be modeled as generated MCP profiles");
}

const marketplaceOperation = manifest.operations?.find((operation) => operation.id === "plugin-marketplace");
if (marketplaceOperation?.pluginTarget !== "${AGENTS_HOME}/plugins/sources/agentchef-workflows") {
  fail("plugin-marketplace pluginTarget must stay under AGENTS_HOME marketplace sources");
}

for (const operation of manifest.operations?.filter((entry) => entry.id.endsWith("-direct-skill")) || []) {
  if (operation.ownershipMarker !== `${operation.destination}/.agentchef-managed.json`) {
    fail(`Direct skill ${operation.id} must declare its explicit ownership marker action`);
  }
}

for (const requiredId of ["installed-plugin-cache-refresh", "git-pre-commit-hook-executable"]) {
  if (!operationIds.has(requiredId)) fail(`Install plan is missing explicit side-effect operation: ${requiredId}`);
}

const gitGuardAdoptionFlags = new Map([
  ["git-ignore-global", "AdoptGitIgnore"],
  ["git-pre-commit-hook", "AdoptGitHook"],
  ["git-config-excludesfile", "AdoptGitExcludesFile"],
  ["git-config-hooks-path", "AdoptGitHooksPath"]
]);
for (const [operationId, adoptionFlag] of gitGuardAdoptionFlags) {
  const operation = manifest.operations?.find((entry) => entry.id === operationId);
  if (operation?.adoptionFlag !== adoptionFlag) {
    fail(`Git guard ${operationId} must require its narrow adoption flag ${adoptionFlag}`);
  }
  if (operation?.stateBackup !== "agentchef.global-git-guards-receipt@1" || operation?.backup !== true) {
    fail(`Git guard ${operationId} must require an exact prior-state receipt before mutation`);
  }
}

const operationOrder = manifest.operations.map((operation) => operation.id);
const normativeOptionalOrder = [
  "git-ignore-global",
  "git-pre-commit-hook",
  "git-pre-commit-hook-executable",
  "git-config-excludesfile",
  "git-config-hooks-path",
  "curated-skills",
  "installed-plugin-cache-refresh"
];
const optionalIndexes = normativeOptionalOrder.map((id) => operationOrder.indexOf(id));
if (optionalIndexes.some((index) => index < 0)
  || optionalIndexes.some((index, position) => position > 0 && index <= optionalIndexes[position - 1])) {
  fail("Manifest optional operation order must keep Git guards and curated skills before terminal cache refresh");
}

for (const skill of skillsCatalog?.skills?.filter((entry) => entry.directInstall === true) || []) {
  const operationId = `${skill.name}-direct-skill`;
  const operation = manifest.operations?.find((entry) => entry.id === operationId);
  if (!operation) {
    fail(`Install plan is missing cataloged direct-skill operation: ${operationId}`);
    continue;
  }
  for (const profileName of ["default", "all"]) {
    if (!manifest.profiles?.[profileName]?.includes(operationId)) {
      fail(`Install plan ${profileName} profile is missing direct-skill operation: ${operationId}`);
    }
  }
}

validatePlanOutputSmoke();

if (failures.length > 0) {
  console.error("Install plan validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Install plan validation passed. Checked ${operationIds.size} operations.`);
