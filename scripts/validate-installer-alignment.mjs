#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMarketplaceEntry, writeMarketplaceEntry } from "./upsert-marketplace-entry.mjs";
import { resolveInstallContract } from "./lib/install-contract.mjs";
import { inspectInstallerSafety } from "./lib/installer-safety-preflight.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifests", "install-plan.json"), "utf8"));
const skillCatalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "skills.json"), "utf8"));
const ps = fs.readFileSync(path.join(root, "scripts", "install.ps1"), "utf8");
const sh = fs.readFileSync(path.join(root, "scripts", "install.sh"), "utf8");
const pinnedSkillHelper = fs.readFileSync(path.join(root, "scripts", "install-pinned-skill.mjs"), "utf8");
const pinnedSkillActivation = fs.readFileSync(path.join(root, "scripts", "lib", "pinned-skill-activation.mjs"), "utf8");
const marketplaceHelper = fs.readFileSync(path.join(root, "scripts", "upsert-marketplace-entry.mjs"), "utf8");
const pluginRefreshHelper = fs.readFileSync(path.join(root, "scripts", "refresh-installed-plugin.mjs"), "utf8");
const repairHelper = fs.readFileSync(path.join(root, "scripts", "repair-install.mjs"), "utf8");
const runtimeVerifier = fs.readFileSync(path.join(root, "scripts", "verify-install-runtime.mjs"), "utf8");
const safetyPreflight = fs.readFileSync(path.join(root, "scripts", "lib", "installer-safety-preflight.mjs"), "utf8");

function fail(message) {
  failures.push(message);
}

function requireText(text, snippet, label) {
  if (!text.includes(snippet)) fail(`${label} missing snippet: ${snippet}`);
}

function requireRegex(text, pattern, label) {
  if (!pattern.test(text)) fail(`${label} missing pattern: ${pattern}`);
}

function requireOrderedText(text, snippets, label) {
  let cursor = -1;
  for (const snippet of snippets) {
    const index = text.indexOf(snippet, cursor + 1);
    if (index < 0) {
      fail(`${label} missing ordered snippet: ${snippet}`);
      return;
    }
    cursor = index;
  }
}

function operation(id) {
  return manifest.operations.find((item) => item.id === id);
}

function runMarketplaceHelperSmokes() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-marketplace-"));
  const marketplacePath = path.join(fixtureRoot, "agents", "plugins", "marketplace.json");
  const pluginTarget = path.join(fixtureRoot, "agents", "plugins", "sources", "codex-chef-workflows");
  const expectedPluginSource = `./${path.relative(fixtureRoot, pluginTarget).replaceAll(path.sep, "/")}`;
  fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });

  fs.writeFileSync(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "personal",
        plugins: [
          {
            name: "other-plugin",
            source: { source: "local", path: "C:/other/plugin" },
            policy: { installation: "AVAILABLE", authentication: "ON_USE" },
            category: "Testing",
            interface: { displayName: "Other Plugin", shortDescription: "Must survive." }
          },
          {
            name: "codex-chef-workflows",
            source: { source: "local", path: "C:/old/plugin" },
            policy: { installation: "AVAILABLE", authentication: "NONE" },
            category: "Productivity",
            interface: { displayName: "Codex Chef Workflows", shortDescription: "Security-first Codex setup maintenance workflow." }
          }
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const before = inspectMarketplaceEntry(marketplacePath, pluginTarget);
  if (!before.changed) fail("Marketplace helper smoke must detect stale Codex Chef plugin path.");

  writeMarketplaceEntry(marketplacePath, pluginTarget);
  const written = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  const other = written.plugins.find((plugin) => plugin.name === "other-plugin");
  const chef = written.plugins.find((plugin) => plugin.name === "codex-chef-workflows");
  if (!other || other.interface?.displayName !== "Other Plugin") {
    fail("Marketplace helper smoke must preserve unrelated plugin entries and interface metadata.");
  }
  if (!chef || chef.source?.path !== expectedPluginSource) {
    fail("Marketplace helper smoke must write a portable marketplace-root-relative plugin path.");
  }
  if (chef.interface?.shortDescription !== "Security-first Codex planning, maintenance, and verification workflows.") {
    fail("Marketplace helper smoke must preserve Codex Chef interface metadata.");
  }
  if (chef.policy?.authentication !== "ON_INSTALL") {
    fail("Marketplace helper smoke must write the current Codex ON_INSTALL policy.");
  }
  const after = inspectMarketplaceEntry(marketplacePath, pluginTarget);
  if (after.changed) fail("Marketplace helper smoke must report current after write.");

  const invalidPath = path.join(fixtureRoot, "invalid-marketplace.json");
  fs.writeFileSync(invalidPath, "{not-json", "utf8");
  try {
    inspectMarketplaceEntry(invalidPath, pluginTarget);
    fail("Marketplace helper smoke must fail closed on invalid JSON.");
  } catch {
    // Expected.
  }

  const badShapePath = path.join(fixtureRoot, "bad-shape-marketplace.json");
  fs.writeFileSync(badShapePath, JSON.stringify({ name: "bad", plugins: "not-an-array" }), "utf8");
  try {
    inspectMarketplaceEntry(badShapePath, pluginTarget);
    fail("Marketplace helper smoke must fail closed when plugins is not an array.");
  } catch {
    // Expected.
  }

  const invalidPolicyPath = path.join(fixtureRoot, "invalid-policy-marketplace.json");
  fs.writeFileSync(
    invalidPolicyPath,
    JSON.stringify({
      name: "invalid-policy",
      plugins: [{
        name: "legacy-plugin",
        source: { source: "local", path: "C:/legacy/plugin" },
        policy: { installation: "AVAILABLE", authentication: "NONE" },
        category: "Testing"
      }]
    }),
    "utf8"
  );
  try {
    inspectMarketplaceEntry(invalidPolicyPath, pluginTarget);
    fail("Marketplace helper smoke must reject unsupported authentication policy values.");
  } catch {
    // Expected.
  }

  const bomPath = path.join(fixtureRoot, "bom-marketplace.json");
  fs.writeFileSync(bomPath, `\uFEFF${JSON.stringify({ name: "bom", plugins: [] })}`, "utf8");
  try {
    inspectMarketplaceEntry(bomPath, pluginTarget);
  } catch {
    fail("Marketplace helper smoke must accept valid UTF-8 JSON with a BOM.");
  }
}

for (const id of manifest.profiles.default || []) {
  if (!operation(id)) fail(`Default profile references missing operation: ${id}`);
}

for (const id of manifest.profiles.all || []) {
  if (!operation(id)) fail(`All profile references missing operation: ${id}`);
}

const requiredOperations = [
  "codex-agents-md",
  "codex-config",
  "codex-profile-launcher",
  "codex-serena-pool",
  "codex-rules",
  "codex-agents",
  "codex-profiles",
  "codex-mcp-profiles",
  "codex-plugin",
  "codex-plugin-marketplace-source",
  "plugin-marketplace",
  "installed-plugin-cache-refresh",
  "git-ignore-global",
  "git-pre-commit-hook",
  "git-pre-commit-hook-executable",
  "git-config-excludesfile",
  "git-config-hooks-path",
  "curated-skills"
];

for (const id of requiredOperations) {
  if (!operation(id)) fail(`Manifest missing installer-covered operation: ${id}`);
}
for (const skill of skillCatalog.skills.filter((entry) => entry.directInstall === true)) {
  const id = `${skill.name}-direct-skill`;
  const directOperation = operation(id);
  if (!directOperation) {
    fail(`Manifest missing managed direct-skill operation: ${id}`);
    continue;
  }
  if (directOperation.source !== `plugins/codex-chef-workflows/skills/${skill.name}`) {
    fail(`Manifest direct-skill source drifted for ${skill.name}.`);
  }
  if (directOperation.destination !== `\${AGENTS_HOME}/skills/${skill.name}`) {
    fail(`Manifest direct-skill destination drifted for ${skill.name}.`);
  }
}

requireText(ps, "[switch]$All", "PowerShell installer");
requireText(ps, "[switch]$InstallSkills", "PowerShell installer");
requireText(ps, "[switch]$InstallGitGuards", "PowerShell installer");
requireText(ps, "[switch]$AdoptGitIgnore", "PowerShell installer");
requireText(ps, "[switch]$AdoptGitHook", "PowerShell installer");
requireText(ps, "[switch]$AdoptGitExcludesFile", "PowerShell installer");
requireText(ps, "[switch]$AdoptGitHooksPath", "PowerShell installer");
requireText(ps, "[switch]$Force", "PowerShell installer");
requireText(ps, "[switch]$Repair", "PowerShell installer");
requireText(ps, "[switch]$NoBackup", "PowerShell installer");
requireText(ps, "[switch]$Interactive", "PowerShell installer");
requireText(ps, "[switch]$PlainOutput", "PowerShell installer");
requireText(ps, "SupportsShouldProcess", "PowerShell installer");
requireText(ps, "CODEX_HOME", "PowerShell installer");
requireText(ps, "AGENTS_HOME", "PowerShell installer");
requireText(ps, "Backup-Target", "PowerShell installer");
requireText(ps, "Assert-ManagedDirectoryTarget", "PowerShell installer");
requireText(ps, "assert-install-surface.mjs", "PowerShell installer");
requireText(ps, "Sync source-owned files from", "PowerShell installer");
requireText(ps, "synced directory", "PowerShell installer");
requireText(ps, "Install-CodexConfig", "PowerShell installer");
requireText(ps, "merge-codex-config.mjs", "PowerShell installer");
requireText(ps, "repair-install.mjs", "PowerShell installer");
requireText(ps, "Read-OptionalPath", "PowerShell installer");
requireText(ps, "Resolve-InstallPath", "PowerShell installer");
requireText(ps, "Read-YesNo", "PowerShell installer");
requireText(ps, "Write-Section", "PowerShell installer");
requireText(ps, "Write-NameList", "PowerShell installer");
requireText(ps, "Capability board", "PowerShell installer");
requireText(ps, "catalog\\routing-profiles.json", "PowerShell installer");
requireText(ps, "Enterprise routing profiles", "PowerShell installer");
requireText(ps, "npm run codex:routing", "PowerShell installer");
requireText(ps, "npm run codex:status", "PowerShell installer");
requireText(ps, "templates\\codex", "PowerShell installer");
requireText(ps, "AGENTS.md", "PowerShell installer");
requireText(ps, "config.windows.toml", "PowerShell installer");
requireText(ps, "rules\\default.rules", "PowerShell installer");
requireText(ps, "agents", "PowerShell installer");
requireText(ps, "profiles", "PowerShell installer");
requireText(ps, "plugins\\codex-chef-workflows", "PowerShell installer");
requireText(ps, "plugins\\sources\\codex-chef-workflows", "PowerShell installer");
requireText(ps, "manage-direct-skill-target.mjs", "PowerShell installer");
requireText(ps, "AdoptFetchSkill", "PowerShell installer");
requireText(ps, "AdoptSeoSkill", "PowerShell installer");
requireText(ps, "AdoptEvidenceResearchSkill", "PowerShell installer");
requireText(ps, "AdoptDirectSkill", "PowerShell installer");
requireText(ps, "Get-ManagedDirectSkills", "PowerShell installer");
requireText(ps, "marketplace.json", "PowerShell installer");
requireText(ps, "upsert-marketplace-entry.mjs", "PowerShell installer");
requireText(ps, "Upsert Codex Chef plugin marketplace entry", "PowerShell installer");
requireText(ps, "Cannot update plugin marketplace because it is invalid or unreadable", "PowerShell installer");
requireText(ps, "refresh-installed-plugin.mjs", "PowerShell installer");
requireText(ps, "Refresh installed Codex Chef plugin cache", "PowerShell installer");
requireText(ps, "manage-global-git-guards.mjs", "PowerShell installer");
requireText(ps, "-git-guards.json", "PowerShell installer");
requireText(ps, "successful dry run or install", "PowerShell installer");
requireRegex(ps, /exit\s+0\s*$/m, "PowerShell installer");
requireText(ps, "templates\\git\\.gitignore_global", "PowerShell installer");
requireText(ps, "templates\\git\\pre-commit", "PowerShell installer");
requireText(ps, "core.excludesfile", "PowerShell installer");
requireText(ps, "core.hooksPath", "PowerShell installer");
requireText(ps, "catalog\\skills.json", "PowerShell installer");
requireText(ps, "install-pinned-skill.mjs", "PowerShell installer");
requireText(ps, '"--commit"', "PowerShell installer");
requireText(ps, '"--cli-version"', "PowerShell installer");
requireText(ps, "Assert-ManagedWriteTarget", "PowerShell installer");
requireText(ps, "assert-managed-target.mjs", "PowerShell installer");
requireRegex(ps, /if\s*\(\$All\)\s*\{[\s\S]*\$InstallSkills\s*=\s*\$true[\s\S]*\}/, "PowerShell installer");
const psAllBlock = ps.match(/if\s*\(\$All\)\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body || "";
if (/\$InstallGitGuards\s*=\s*\$true/.test(psAllBlock)) {
  fail("PowerShell -All must not enable InstallGitGuards; global Git guards require the explicit InstallGitGuards flag.");
}
requireRegex(ps, /if\s*\(\$InstallGitGuards\)\s*\{[\s\S]*core\.excludesfile[\s\S]*core\.hooksPath[\s\S]*\}/, "PowerShell installer");
requireRegex(ps, /if\s*\(\$InstallSkills\)\s*\{[\s\S]*install-pinned-skill\.mjs[\s\S]*"--commit"[\s\S]*"--cli-version"[\s\S]*\}/, "PowerShell installer");
if (/InstalledSkills|ContainsKey\(\$Skill\.name\)/.test(ps)) {
  fail("PowerShell installer must not skip pinned verification based only on an installed skill name.");
}

requireText(sh, "INSTALL_SKILLS=0", "Bash installer");
requireText(sh, "INSTALL_GIT_GUARDS=0", "Bash installer");
requireText(sh, "ALL=0", "Bash installer");
requireText(sh, "FORCE=0", "Bash installer");
requireText(sh, "REPAIR=0", "Bash installer");
requireText(sh, "--adopt-direct-skill=", "Bash installer");
requireText(sh, "--adopt-git-ignore", "Bash installer");
requireText(sh, "--adopt-git-hook", "Bash installer");
requireText(sh, "--adopt-git-excludes-file", "Bash installer");
requireText(sh, "--adopt-git-hooks-path", "Bash installer");
requireText(sh, "direct_skill_names", "Bash installer");
requireText(sh, "NO_BACKUP=0", "Bash installer");
requireText(sh, "DRY_RUN=0", "Bash installer");
requireText(sh, "PLAIN_OUTPUT=0", "Bash installer");
requireText(sh, "--plain-output", "Bash installer");
requireText(sh, "--repair", "Bash installer");
requireText(sh, "INTERACTIVE=0", "Bash installer");
requireText(sh, "--interactive", "Bash installer");
requireText(sh, "require_command()", "Bash installer");
requireText(sh, "Required command not found for Codex Chef Bash install", "Bash installer");
requireText(sh, "CODEX_HOME_DIR", "Bash installer");
requireText(sh, "AGENTS_HOME_DIR", "Bash installer");
requireText(sh, "backup_target", "Bash installer");
requireText(sh, "assert_managed_directory_target", "Bash installer");
requireText(sh, "assert-install-surface.mjs", "Bash installer");
requireText(sh, "sync source-owned files from", "Bash installer");
requireText(sh, "synced directory", "Bash installer");
requireText(sh, "install_codex_config", "Bash installer");
requireText(sh, "merge-codex-config.mjs", "Bash installer");
requireText(sh, "repair-install.mjs", "Bash installer");
requireText(sh, "section()", "Bash installer");
requireText(sh, "action()", "Bash installer");
requireText(sh, "yes_no()", "Bash installer");
requireText(sh, "optional_path()", "Bash installer");
requireText(sh, "normalize_install_path()", "Bash installer");
requireText(sh, "Capability board", "Bash installer");
requireText(sh, "catalog/routing-profiles.json", "Bash installer");
requireText(sh, "Enterprise routing profiles", "Bash installer");
requireText(sh, "npm run codex:routing", "Bash installer");
requireText(sh, "npm run codex:status", "Bash installer");
requireText(sh, "catalog/mcp-servers.json", "Bash installer");
requireText(sh, "templates/codex", "Bash installer");
requireText(sh, "AGENTS.md", "Bash installer");
requireText(sh, "config.unix.toml", "Bash installer");
requireText(sh, "rules/default.rules", "Bash installer");
requireText(sh, "/agents", "Bash installer");
requireText(sh, "/profiles", "Bash installer");
requireText(sh, "plugins/codex-chef-workflows", "Bash installer");
requireText(sh, "plugins/sources/codex-chef-workflows", "Bash installer");
requireText(sh, "manage-direct-skill-target.mjs", "Bash installer");
requireText(sh, "adopt-fetch-skill", "Bash installer");
requireText(sh, "adopt-seo-skill", "Bash installer");
requireText(sh, "adopt-evidence-research-skill", "Bash installer");
requireText(sh, "marketplace.json", "Bash installer");
requireText(sh, "upsert-marketplace-entry.mjs", "Bash installer");
requireText(sh, "Would upsert Codex Chef plugin marketplace entry", "Bash installer");
requireText(sh, "Cannot update plugin marketplace because it is invalid or unreadable", "Bash installer");
requireText(sh, "refresh-installed-plugin.mjs", "Bash installer");
requireText(sh, "Refresh installed Codex Chef plugin cache", "Bash installer");
requireText(sh, "manage-global-git-guards.mjs", "Bash installer");
requireText(sh, "-git-guards.json", "Bash installer");
requireText(sh, "Backup failed; refusing to replace managed target without a backup", "Bash installer");
if (/rm\s+-rf|Remove-Item[^\n]*-Recurse/i.test(`${ps}\n${sh}`)) {
  fail("Installers must not tree-replace managed directories during force or update.");
}
if (/git\s+config\s+--global/i.test(`${ps}\n${sh}`)) {
  fail("Installers must route global Git guard mutations through the typed transaction helper.");
}
requireText(sh, "templates/git/.gitignore_global", "Bash installer");
requireText(sh, "templates/git/pre-commit", "Bash installer");
requireText(sh, "core.excludesfile", "Bash installer");
requireText(sh, "core.hooksPath", "Bash installer");
requireText(sh, "catalog/skills.json", "Bash installer");
requireText(sh, "install-pinned-skill.mjs", "Bash installer");
requireText(sh, "\"--commit\"", "Bash installer");
requireText(sh, "\"--cli-version\"", "Bash installer");
requireText(sh, "assert_managed_write_target", "Bash installer");
requireText(sh, "assert-managed-target.mjs", "Bash installer");
requireRegex(sh, /if \[ "\$ALL" -eq 1 \]; then[\s\S]*INSTALL_SKILLS=1[\s\S]*fi/, "Bash installer");
const shAllBlock = sh.match(/if \[ "\$ALL" -eq 1 \]; then(?<body>[\s\S]*?)\nfi/)?.groups?.body || "";
if (/INSTALL_GIT_GUARDS=1/.test(shAllBlock)) {
  fail("Bash --all must not enable INSTALL_GIT_GUARDS; global Git guards require the explicit --install-git-guards flag.");
}
requireRegex(sh, /if \[ "\$INSTALL_GIT_GUARDS" -eq 1 \]; then[\s\S]*core\.excludesfile[\s\S]*core\.hooksPath[\s\S]*fi/, "Bash installer");
requireRegex(sh, /if \[ "\$INSTALL_SKILLS" -eq 1 \]; then[\s\S]*install-pinned-skill\.mjs[\s\S]*"--commit"[\s\S]*"--cli-version"[\s\S]*fi/, "Bash installer");
if (/installed\.has\(skill\.name\)/.test(sh)) {
  fail("Bash installer must not skip pinned verification based only on an installed skill name.");
}

for (const required of [
  "inspectPinnedSkillTarget",
  "sourceTreeSha256",
  "activatePinnedSkill",
  "--adopt-existing",
  "--json",
  "skipped-user-owned",
  "already-current"
]) {
  requireText(pinnedSkillHelper, required, "Pinned skill installer");
}
if (/\bnpx(?:\.cmd)?\b|\bnpm\s+exec\b|`skills@\$\{options\.cliVersion\}`/.test(pinnedSkillHelper)) {
  fail("Pinned skill installer must copy the verified checkout natively and must not execute a registry-delivered Skills CLI.");
}
for (const required of [
  "fs.cpSync(source, staging",
  "fs.renameSync(staging, target)",
  "inspectPinnedSkillTarget",
  "afterActivate"
]) {
  requireText(pinnedSkillActivation, required, "Pinned skill activation helper");
}

const allProfile = new Set(manifest.profiles.all || []);
for (const id of ["git-ignore-global", "git-pre-commit-hook", "git-config-excludesfile", "git-config-hooks-path"]) {
  if (allProfile.has(id)) {
    fail(`All profile must not include ${id}; global Git guards require the explicit InstallGitGuards flag.`);
  }
}

const curatedSkillsOperation = operation("curated-skills");
if (
  curatedSkillsOperation?.collision
  !== "preserve-foreign-update-owned-mandatory-backup-explicit-adoption-required"
) {
  fail("curated-skills collision must preserve foreign targets and require explicit adoption.");
}
if (curatedSkillsOperation?.backup !== true) {
  fail("curated-skills must declare mandatory backup for managed upgrades or explicit adoption.");
}
for (const required of ["foreign", "--adopt-existing"]) {
  requireText(
    curatedSkillsOperation?.conflictPolicy || "",
    required,
    "curated-skills conflictPolicy"
  );
}
for (const required of ["--json", "preserved user-owned skill", "already current"]) {
  requireText(ps, required, "PowerShell curated skill status contract");
}
for (const required of ["--json", "preserved user-owned skill", "skill already current"]) {
  requireText(sh, required, "Bash curated skill status contract");
}

for (const op of manifest.operations) {
  if (op.requiresFlag === "InstallSkills" && op.id !== "curated-skills") {
    fail(`Only curated-skills should require InstallSkills: ${op.id}`);
  }
  if (op.requiresFlag === "InstallGitGuards" && !op.id.startsWith("git-")) {
    fail(`Only git operations should require InstallGitGuards: ${op.id}`);
  }
}

const marketplaceOperation = operation("plugin-marketplace");
if (marketplaceOperation?.collision !== "upsert-entry-with-backup") {
  fail("plugin-marketplace collision must be upsert-entry-with-backup.");
}
if (!/unrelated marketplace plugins are preserved/i.test(marketplaceOperation?.conflictPolicy || "")) {
  fail("plugin-marketplace conflictPolicy must promise unrelated marketplace plugins are preserved.");
}
const pluginOperation = operation("codex-plugin");
if (pluginOperation?.collision !== "sync-managed-files-preserve-extras-backup-before-sync") {
  fail("codex-plugin collision must sync managed files while preserving extras.");
}
if (!/extra files are preserved/i.test(pluginOperation?.conflictPolicy || "")) {
  fail("codex-plugin conflictPolicy must promise extra files are preserved by default.");
}
requireText(marketplaceHelper, ".agents", "Marketplace upsert helper");
requireText(marketplaceHelper, "sourceMarketplacePath", "Marketplace upsert helper");
requireText(marketplaceHelper, "--check", "Marketplace upsert helper");
requireText(marketplaceHelper, "--write", "Marketplace upsert helper");
requireText(marketplaceHelper, "stableJson", "Marketplace upsert helper");
requireText(pluginRefreshHelper, '["plugin", "list", "--json"]', "Installed plugin refresh helper");
requireText(pluginRefreshHelper, '["plugin", "add", PLUGIN_ID, "--json"]', "Installed plugin refresh helper");
requireText(pluginRefreshHelper, 'status: "not-installed"', "Installed plugin refresh helper");
requireText(repairHelper, 'import { PLUGIN_ID, refreshInstalledPlugin } from "./refresh-installed-plugin.mjs"', "Repair helper");
requireText(repairHelper, "pluginRefresh = noBackupPluginRefresh || refreshInstalledPlugin", "Repair helper");
for (const [surface, label] of [
  [repairHelper, "Repair helper"],
  [runtimeVerifier, "Runtime verifier"],
  [safetyPreflight, "Installer safety preflight"]
]) {
  requireText(surface, "resolveInstallContract", label);
  requireText(surface, "contract.operations", label);
}
runMarketplaceHelperSmokes();

function validateResolvedInstallContract() {
  const fixtureRoot = path.join(os.tmpdir(), "codex-chef-install-contract");
  const codexHome = path.join(fixtureRoot, "codex");
  const agentsHome = path.join(fixtureRoot, "agents");
  const platform = process.platform === "win32" ? "windows" : "unix";
  const contract = resolveInstallContract({
    platform,
    codexHome,
    agentsHome,
    home: fixtureRoot
  });
  const safety = inspectInstallerSafety({
    codexHome,
    agentsHome,
    home: fixtureRoot
  });
  const semanticLedger = contract.operations.map((action) => ({
    id: action.id,
    kind: action.kind,
    destination: action.destination ?? null,
    key: action.key ?? null,
    backup: action.backup
  }));
  if (JSON.stringify(safety.contract.actions) !== JSON.stringify(semanticLedger)) {
    fail("Installer preflight operation ledger must exactly match resolved IDs, kinds, destinations, keys, backup semantics, and order.");
  }
  const canonicalDefaultOrder = manifest.operations
    .filter((operation) => manifest.profiles.default.includes(operation.id))
    .map((operation) => operation.id);
  if (JSON.stringify(contract.selectedComponents.map((operation) => operation.id))
    !== JSON.stringify(canonicalDefaultOrder)) {
    fail("Resolved default installer components must use canonical manifest operation order.");
  }

  const actionById = new Map(contract.operations.map((action) => [action.id, action]));
  if (actionById.get("codex-profile-launcher")?.destination !== path.join(codexHome, "codex-profile.mjs")) {
    fail("Resolved installer contract must target the Codex profile launcher.");
  }
  if (actionById.get("codex-serena-pool")?.destination !== path.join(codexHome, "serena-pool.mjs")) {
    fail("Resolved installer contract must target the Serena pool launcher.");
  }
  const generatedNames = contract.operations
    .filter((action) => action.kind === "generate-mcp-profile")
    .map((action) => path.basename(action.destination));
  if (JSON.stringify(generatedNames) !== JSON.stringify([
    "full.config.toml",
    "multi-session.config.toml",
    "offline.config.toml"
  ])) {
    fail("Resolved installer contract must generate the three MCP profiles in manifest order.");
  }
  const copiedProfiles = contract.operations
    .filter((action) => action.componentId === "codex-profiles")
    .map((action) => path.basename(action.destination));
  if (copiedProfiles.some((name) => generatedNames.includes(name))) {
    fail("Generated MCP profiles must not also be modeled as plain copies.");
  }
  const markerActions = contract.operations.filter((action) => action.kind === "write-ownership-marker");
  if (markerActions.length !== skillCatalog.skills.filter((skill) => skill.directInstall === true).length) {
    fail("Resolved installer contract must include one ownership-marker action per direct skill.");
  }
  if (!contract.operations.some((action) => action.kind === "refresh-plugin-cache")) {
    fail("Resolved installer contract must include installed plugin cache refresh.");
  }
  for (const expectedSource of [
    path.join(root, "templates", "codex", "codex-profile.mjs"),
    path.join(root, "templates", "codex", "serena-pool.mjs"),
    path.join(root, "templates", "codex", "profiles", "multi-session.config.toml")
  ]) {
    if (!contract.sourcePreflight.includes(expectedSource)) {
      fail(`Manifest-derived source preflight is missing artifact: ${expectedSource}`);
    }
  }
  const brokenManifest = structuredClone(manifest);
  brokenManifest.operations.find((operation) => operation.id === "codex-profile-launcher").source
    = "templates/codex/missing-codex-profile.mjs";
  try {
    resolveInstallContract({
      manifest: brokenManifest,
      platform: "windows",
      codexHome,
      agentsHome,
      home: fixtureRoot
    });
    fail("Manifest-derived source preflight must fail before writes when a selected source is missing.");
  } catch (error) {
    if (!/source file is missing/i.test(error.message)) {
      fail(`Missing selected source produced unexpected preflight error: ${error.message}`);
    }
  }
  for (const expectedTarget of [
    path.join(codexHome, "codex-profile.mjs"),
    path.join(codexHome, "serena-pool.mjs"),
    path.join(codexHome, "full.config.toml"),
    path.join(codexHome, "multi-session.config.toml"),
    path.join(codexHome, "offline.config.toml"),
    ...markerActions.map((action) => action.destination)
  ]) {
    if (!contract.preflightTargets.includes(expectedTarget)) {
      fail(`Manifest-derived preflight inventory is missing target: ${expectedTarget}`);
    }
  }

  requireOrderedText(ps, [
    '"AGENTS.md")',
    '"config.windows.toml")',
    '"codex-profile.mjs")',
    '"serena-pool.mjs")',
    '"rules\\default.rules")',
    '"agents") -Filter "*.toml"',
    '"profiles") -Filter "*.toml"',
    "Install-Directory -Source $PluginSource -Destination $PluginTarget",
    "Install-Directory -Source $PluginSource -Destination $MarketplacePluginTarget",
    "Install-Directory -Source $DirectSource -Destination $DirectTarget",
    "Upsert Codex Chef plugin marketplace entry",
    "Refresh installed Codex Chef plugin cache"
  ], "PowerShell installer operation order");
  requireOrderedText(sh, [
    'AGENTS.md"',
    'config.unix.toml"',
    'codex-profile.mjs"',
    'serena-pool.mjs"',
    'rules/default.rules"',
    '/agents/*.toml',
    '/profiles/*.toml',
    'install_directory "$PLUGIN_SOURCE" "$PLUGIN_TARGET"',
    'install_directory "$PLUGIN_SOURCE" "$MARKETPLACE_PLUGIN_TARGET"',
    'install_directory "$DIRECT_SKILL_SOURCE" "$DIRECT_SKILL_TARGET"',
    "Would upsert Codex Chef plugin marketplace entry",
    "Refresh installed Codex Chef plugin cache"
  ], "Bash installer operation order");
}

validateResolvedInstallContract();

function validatePortabilityContracts() {
  const ignoredDirectories = new Set([
    ".git",
    ".next",
    ".serena",
    ".agentspace",
    "agent-results",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "temp",
    "tmp"
  ]);
  const ignoredRelativeFiles = new Set(["docs/.agent-notifications"]);
  const textExtensions = new Set([
    ".json",
    ".js",
    ".md",
    ".mjs",
    ".ps1",
    ".rules",
    ".sh",
    ".toml",
    ".txt",
    ".yaml",
    ".yml"
  ]);

  function walkTextFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      if (ignoredRelativeFiles.has(path.relative(root, fullPath).split(path.sep).join("/"))) continue;
      if (entry.isDirectory()) files.push(...walkTextFiles(fullPath));
      else if (entry.isFile() && (textExtensions.has(path.extname(entry.name)) || entry.name === "package.json")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const personalPathPatterns = [
    /[A-Za-z]:[\\/]+Users[\\/]+[^\\/"'`\s]+/gi,
    /\/Users\/[^/"'`\s]+/g,
    /\/home\/[^/"'`\s]+/g
  ];
  const forbiddenLocalIdentifiers = new RegExp(`\\b(?:${["ula", "sc"].join("")}|${["mit", "nick"].join("")})\\b`, "gi");
  const genericHomeRegexLiteral = ["/ho", "me/i"].join("");

  for (const file of walkTextFiles(root)) {
    const relativePath = path.relative(root, file).split(path.sep).join("/");
    if (/^scripts\/(?:validate-|security-audit\.mjs$)/.test(relativePath)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of personalPathPatterns) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        if (match[0] === genericHomeRegexLiteral
          && text.slice(match.index, match.index + match[0].length) === genericHomeRegexLiteral) {
          continue;
        }
        fail(`${relativePath} contains a machine/user-specific absolute path: ${match[0]}`);
      }
    }
    forbiddenLocalIdentifiers.lastIndex = 0;
    if (forbiddenLocalIdentifiers.test(text)) {
      fail(`${relativePath} contains a local machine or user identifier.`);
    }
  }

  const windowsConfig = fs.readFileSync(path.join(root, "templates", "codex", "config.windows.toml"), "utf8");
  const unixConfig = fs.readFileSync(path.join(root, "templates", "codex", "config.unix.toml"), "utf8");
  if (!/server-filesystem@[^\"]+",\s*"\."\]/.test(windowsConfig)) {
    fail("Windows filesystem MCP must use the portable current-workspace root.");
  }
  if (!/server-filesystem@[^\"]+",\s*"\."\]/.test(unixConfig)) {
    fail("Unix filesystem MCP must use the portable current-workspace root.");
  }
  if (/(?:%USERPROFILE%|\$HOME)[\\/]+Desktop/.test(`${windowsConfig}\n${unixConfig}`)) {
    fail("MCP templates must not assume a user Desktop directory.");
  }

  const planner = fs.readFileSync(path.join(root, "scripts", "plan-install.mjs"), "utf8");
  if (!planner.includes('import os from "node:os"') || !planner.includes("os.homedir()")) {
    fail("Install planning must resolve fallback homes through os.homedir().");
  }
  if (planner.includes('|| "~"')) {
    fail("Install planning must not emit a literal tilde fallback path.");
  }

  for (const token of ["CODEX_HOME", "AGENTS_HOME"]) {
    if (!ps.includes(token)) fail(`PowerShell installer must honor ${token}.`);
    if (!sh.includes(token)) fail(`Bash installer must honor ${token}.`);
  }
  if (!sh.startsWith("#!/usr/bin/env bash")) {
    fail("Unix installer must use a portable env-based Bash shebang.");
  }

  const platformResolver = fs.readFileSync(path.join(root, "scripts", "lib", "platform-command.mjs"), "utf8");
  for (const command of ["npm.cmd", "npx.cmd", "codex.cmd"]) {
    if (!platformResolver.includes(command)) fail(`Windows command resolver is missing ${command}.`);
  }

  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  for (const runner of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
    if (!workflow.includes(runner)) fail(`Validation workflow must cover ${runner}.`);
  }
  for (const nodeVersion of ["18", "24"]) {
    if (!new RegExp(`(?:node-version|node):\\s*${nodeVersion}\\b`).test(workflow)) {
      fail(`Validation workflow must cover supported Node.js ${nodeVersion}.`);
    }
  }
}

validatePortabilityContracts();

if (failures.length > 0) {
  console.error("Installer alignment validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Installer alignment and portability validation passed.");
