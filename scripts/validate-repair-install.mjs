#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scaledTimeout } from "./lib/test-timeouts.mjs";

const root = path.resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fixtureChildEnv() {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") || "PATH";
  return {
    ...process.env,
    [pathKey]: path.dirname(process.execPath),
    AGENTCHEF_CODEX_COMMAND: "agentchef-missing-fixture-command"
  };
}

function runRepair(args, codexHome, agentsHome, cwd = root) {
  return spawnSync(process.execPath, [
    path.join(root, "scripts", "repair-install.mjs"),
    "--json",
    "--platform",
    process.platform === "win32" ? "windows" : "unix",
    "--codex-home",
    codexHome,
    "--agents-home",
    agentsHome,
    ...args
  ], {
    cwd,
    encoding: "utf8",
    env: fixtureChildEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    timeout: scaledTimeout(120000),
    windowsHide: true
  });
}

function parseResult(result, label) {
  if (result.error) {
    fail(`${label} could not run: ${result.error.message}`);
    return null;
  }
  if (result.status !== 0) {
    fail(`${label} exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} did not emit parseable JSON: ${error.message}`);
    return null;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(filePath, { recursive: true });
}

function write(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
}

function assertRootAssignment(text, key, expectedValue, label) {
  const firstTableIndex = text.search(/^\s*\[/m);
  const rootText = firstTableIndex >= 0 ? text.slice(0, firstTableIndex) : text;
  const pattern = new RegExp(`^${key}\\s*=\\s*${expectedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
  if (!pattern.test(rootText)) {
    fail(`${label} must define root-level ${key} = ${expectedValue}.`);
  }
}

function assertManagedFileAccounting(report, label) {
  const managed = report?.managedFiles;
  if (!managed) {
    fail(`${label} must include managed file accounting.`);
    return;
  }
  const observed = Number(managed.current || 0)
    + Number(managed.planned || 0)
    + Number(managed.applied || 0);
  if (observed !== managed.expected) {
    fail(`${label} managed file accounting drifted: expected ${managed.expected}, observed ${observed}.`);
  }
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-"));
const codexHome = path.join(fixtureRoot, ".codex");
const agentsHome = path.join(fixtureRoot, ".agents");
const pluginTarget = path.join(codexHome, "plugins", "agentchef-workflows");
const marketplacePluginTarget = path.join(agentsHome, "plugins", "sources", "agentchef-workflows");
const directSkills = JSON.parse(read("catalog/skills.json")).skills.filter((skill) => skill.directInstall === true);
const directSupportFiles = {
  fetch: [
    "agents/openai.yaml",
    "assets/fetch-report.template.json",
    "references/safety-boundaries.md",
    "scripts/validate-fetch-report.mjs"
  ],
  seo: [
    "agents/openai.yaml",
    "assets/seo-audit-report.template.json",
    "references/sources.md",
    "scripts/validate-seo-report.mjs"
  ],
  "evidence-research": [
    "agents/openai.yaml",
    "assets/research-report.template.json",
    "references/sources.md",
    "scripts/validate-research-report.mjs"
  ]
};
const expectedPluginSource = "./.agents/plugins/sources/agentchef-workflows";

write(path.join(codexHome, "AGENTS.md"), "# stale guidance\n");
write(
  path.join(codexHome, "config.toml"),
  [
    "# user setting must stay",
    "model = \"gpt-5\"",
    "",
    "[apps._default]",
    "enabled = true",
    "default_tools_enabled = true",
    "",
    "[mcp_servers.supabase]",
    "enabled = false",
    "command = \"cmd.exe\"",
    "args = [\"/c\", \"npx\", \"-y\", \"@modelcontextprotocol/server-postgres@0.6.2\", \"%SUPABASE_DB_URL%\"]",
    "default_tools_approval_mode = \"prompt\"",
    ""
  ].join("\n")
);
write(
  path.join(codexHome, "rules", "default.rules"),
  `${read("templates/codex/rules/default.rules")}prefix_rule(pattern=["my-local-readonly"], decision="prompt")\nprefix_rule(pattern=["powershell.exe", "-NoProfile", "-Command"], decision="allow")\n`
);
write(path.join(codexHome, "agents", "code_mapper.toml"), "# stale agent\n");
write(path.join(codexHome, "development.config.toml"), "# stale profile\n");
for (const profile of ["conservative.config.toml", "trusted-project.config.toml", "full-access.config.toml"]) {
  write(path.join(codexHome, profile), 'model = "legacy-model"\nreview_model = "legacy-review"\nmodel_reasoning_effort = "high"\n');
}
write(
  path.join(pluginTarget, ".codex-plugin", "plugin.json"),
  "{\n  \"name\": \"agentchef-workflows\",\n  \"version\": \"0.0.0\"\n}\n"
);
write(path.join(pluginTarget, "extra.txt"), "extra managed plugin file\n");
write(path.join(marketplacePluginTarget, "marketplace-extra.txt"), "extra marketplace mirror file\n");
for (const skill of directSkills) {
  const directTarget = path.join(agentsHome, "skills", skill.name);
  write(path.join(directTarget, "SKILL.md"), `---\nname: ${skill.name}\n---\n\nstale direct skill\n`);
  write(
    path.join(directTarget, ".agentchef-managed.json"),
    JSON.stringify({
      schemaVersion: "agentchef.managed-direct-skill.v1",
      manager: "agentchef",
      component: "direct-skill",
      name: skill.name,
      source: `plugins/agentchef-workflows/skills/${skill.name}`
    }, null, 2) + "\n"
  );
}
write(
  path.join(agentsHome, "plugins", "marketplace.json"),
  JSON.stringify({
    name: "personal",
    plugins: [
      {
        name: "other-plugin",
        source: { source: "local", path: "C:/other/plugin" },
        policy: { installation: "AVAILABLE", authentication: "ON_USE" }
      },
      {
        name: "agentchef-workflows",
        source: { source: "local", path: "C:/stale/agentchef-workflows" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }
      }
    ]
  }, null, 2) + "\n",
  "utf8"
);
ensureDir(path.join(codexHome, "skills", "frontend-skill"));
ensureDir(path.join(agentsHome, "skills", "frontend-skill"));
ensureDir(path.join(agentsHome, "skills", "random-extra-skill"));

const plan = parseResult(runRepair([], codexHome, agentsHome), "repair plan");
if (plan) {
  assertManagedFileAccounting(plan, "repair plan");
  if (plan.schemaVersion !== "agentchef.repair.v1") fail("repair plan schemaVersion drifted.");
  if (plan.mode !== "plan") fail(`repair plan mode drifted: ${plan.mode}`);
  if (plan.status !== "attention") fail(`repair plan should need attention, got ${plan.status}.`);
  if (!Array.isArray(plan.actions) || plan.actions.length === 0) fail("repair plan must include planned actions.");
  if ((plan.managedFiles?.extraPluginFiles?.length || 0) < 2) {
    fail("repair plan must report extra files from both managed plugin mirrors.");
  }
  if (!plan.config?.removedDeprecatedFields?.includes("apps._default.default_tools_enabled")) {
    fail("repair plan must report deprecated managed config fields.");
  }
  if (!plan.config?.updatedManagedFields?.includes("apps._default.enabled")) {
    fail("repair plan must report managed app connector default updates.");
  }
  if (!plan.config?.updatedManagedFields?.includes("apps._default.destructive_enabled")) {
    fail("repair plan must report missing destructive app connector guard backfill.");
  }
  if (!plan.config?.updatedManagedFields?.includes("apps._default.open_world_enabled")) {
    fail("repair plan must report missing open-world app connector guard backfill.");
  }
  if (!plan.config?.updatedManagedFields?.includes("apps._default.default_tools_approval_mode")) {
    fail("repair plan must report missing apps._default default tool approval mode backfill.");
  }
  if (!plan.managedFiles?.changed?.some((entry) => entry.id === "codex-rules" && /conflicting local approval rule/.test(entry.reason || ""))) {
    fail("repair plan must report conflicting local approval rules.");
  }
  if (!plan.skills || plan.skills.extraCount < 1 || plan.skills.duplicateCount < 1) {
    fail("repair plan must report non-curated and duplicate skill inventory.");
  }
}

const previewAliasPlan = parseResult(runRepair(["--preview"], codexHome, agentsHome), "repair preview alias");
if (previewAliasPlan) {
  if (previewAliasPlan.mode !== "plan") fail(`repair --preview must stay in plan mode, got ${previewAliasPlan.mode}.`);
  if (previewAliasPlan.applied === true) fail("repair --preview must not apply writes.");
}

const externalCwdPlan = parseResult(runRepair([], codexHome, agentsHome, fixtureRoot), "repair plan from external cwd");
if (externalCwdPlan) {
  if (externalCwdPlan.schemaVersion !== "agentchef.repair.v1") {
    fail("repair plan from external cwd must still resolve source files from the repair script location.");
  }
  if (externalCwdPlan.managedFiles?.expected < 30 || !externalCwdPlan.actions?.some((action) => String(action.id || "").startsWith("codex-agents:"))) {
    fail("repair plan from external cwd must still find managed AgentChef source files.");
  }
}

if (!fs.readFileSync(path.join(codexHome, "rules", "default.rules"), "utf8").includes("powershell.exe")) {
  fail("repair preview must not mutate default.rules.");
}

const applied = parseResult(runRepair(["--apply"], codexHome, agentsHome), "repair apply");
if (applied) {
  assertManagedFileAccounting(applied, "repair apply");
  if (applied.mode !== "apply") fail(`repair apply mode drifted: ${applied.mode}`);
  if (!["attention", "repaired"].includes(applied.status)) {
    fail(`repair apply should succeed with attention or repaired, got ${applied.status}.`);
  }
  if (!applied.backupRoot) fail("repair apply must create a backup root.");
  if (!applied.actions.some((action) => action.status === "applied")) {
    fail("repair apply must report applied actions.");
  }
}

for (const profile of ["conservative.config.toml", "trusted-project.config.toml", "full-access.config.toml"]) {
  const profileText = fs.readFileSync(path.join(codexHome, profile), "utf8");
  if (!profileText.includes('model = "legacy-model"')) {
    fail("ordinary repair apply must not migrate legacy profile pins without the explicit flag.");
  }
}

const migrated = parseResult(
  runRepair(["--apply", "--migrate-legacy-profile-pins"], codexHome, agentsHome),
  "repair legacy profile migration"
);
if (migrated) {
  if (!migrated.legacyProfileMigration?.requested) fail("legacy profile migration must report requested=true.");
  for (const profile of ["conservative.config.toml", "trusted-project.config.toml", "full-access.config.toml"]) {
    const profileText = fs.readFileSync(path.join(codexHome, profile), "utf8");
    if (/^(?:model|review_model)\s*=/m.test(profileText)) {
      fail(`legacy profile migration must remove model pins from ${profile}.`);
    }
    if (!profileText.includes('model_reasoning_effort = "high"')) {
      fail(`legacy profile migration must preserve non-model profile behavior in ${profile}.`);
    }
  }
}

const repairedRules = fs.readFileSync(path.join(codexHome, "rules", "default.rules"), "utf8");
if (!repairedRules.includes(read("templates/codex/rules/default.rules").trim())) {
  fail("repair apply must preserve the managed default.rules baseline.");
}
if (!repairedRules.includes("my-local-readonly")) {
  fail("repair apply must preserve harmless local approval rules in default.rules.");
}
if (repairedRules.includes('prefix_rule(pattern=["powershell.exe", "-NoProfile", "-Command"], decision="allow")')) {
  fail("repair apply must remove conflicting broad PowerShell approval rules in default.rules.");
}
if (fs.readFileSync(path.join(codexHome, "AGENTS.md"), "utf8") !== read("templates/codex/AGENTS.md")) {
  fail("repair apply must restore AGENTS.md from the managed template.");
}
if (
  fs.readFileSync(path.join(pluginTarget, ".codex-plugin", "plugin.json"), "utf8") !==
  read("plugins/agentchef-workflows/.codex-plugin/plugin.json")
) {
  fail("repair apply must restore the plugin manifest from source.");
}
if (!fs.existsSync(path.join(pluginTarget, "extra.txt"))) {
  fail("repair apply must not delete extra plugin files without the explicit prune flag.");
}
if (!fs.existsSync(path.join(marketplacePluginTarget, "marketplace-extra.txt"))) {
  fail("repair apply must not delete marketplace mirror extras without the explicit prune flag.");
}
for (const skill of directSkills) {
  const directTarget = path.join(agentsHome, "skills", skill.name);
  if (
    fs.readFileSync(path.join(directTarget, "SKILL.md"), "utf8")
    !== read(`plugins/agentchef-workflows/skills/${skill.name}/SKILL.md`)
  ) {
    fail(`repair apply must restore the direct $${skill.name} skill from its canonical plugin source.`);
  }
  const marker = readJson(path.join(directTarget, ".agentchef-managed.json"));
  if (
    marker.name !== skill.name
    || marker.source !== `plugins/agentchef-workflows/skills/${skill.name}`
  ) {
    fail(`repair apply must write the correct direct $${skill.name} ownership marker.`);
  }
  for (const relativePath of directSupportFiles[skill.name] || []) {
    if (
      fs.readFileSync(path.join(directTarget, relativePath), "utf8")
      !== read(`plugins/agentchef-workflows/skills/${skill.name}/${relativePath}`)
    ) {
      fail(`repair apply must install the direct $${skill.name} support file ${relativePath}.`);
    }
  }
}

const repairedMarketplace = readJson(path.join(agentsHome, "plugins", "marketplace.json"));
if (!repairedMarketplace.plugins.some((plugin) => plugin.name === "other-plugin")) {
  fail("repair apply must preserve unrelated marketplace plugins.");
}
const chefPlugin = repairedMarketplace.plugins.find((plugin) => plugin.name === "agentchef-workflows");
if (!chefPlugin || chefPlugin.source?.path !== expectedPluginSource) {
  fail("repair apply must write the portable marketplace-root-relative managed plugin path.");
}
if (chefPlugin?.interface?.shortDescription !== "Security-first Codex planning, maintenance, and verification workflows.") {
  fail("repair apply must preserve AgentChef marketplace interface metadata.");
}

const repairedConfig = fs.readFileSync(path.join(codexHome, "config.toml"), "utf8");
if (!repairedConfig.includes("# user setting must stay") || !repairedConfig.includes("[mcp_servers.")) {
  fail("repair apply must preserve user config text and merge missing managed blocks.");
}
if (repairedConfig.includes("default_tools_enabled")) {
  fail("repair apply must remove deprecated managed apps._default.default_tools_enabled.");
}
if (!/\[apps\._default\][\s\S]*?\nenabled\s*=\s*false/.test(repairedConfig)) {
  fail("repair apply must set apps._default.enabled = false.");
}
if (!/\[apps\._default\][\s\S]*?\ndestructive_enabled\s*=\s*false/.test(repairedConfig)) {
  fail("repair apply must backfill apps._default.destructive_enabled = false.");
}
if (!/\[apps\._default\][\s\S]*?\nopen_world_enabled\s*=\s*false/.test(repairedConfig)) {
  fail("repair apply must backfill apps._default.open_world_enabled = false.");
}
if (!/\[apps\._default\][\s\S]*?\ndefault_tools_approval_mode\s*=\s*"prompt"/.test(repairedConfig)) {
  fail("repair apply must backfill apps._default.default_tools_approval_mode = prompt.");
}
assertRootAssignment(repairedConfig, "approvals_reviewer", '"auto_review"', "repair apply config");
if (/SUPABASE_DB_URL|@modelcontextprotocol\/server-postgres/.test(repairedConfig)) {
  fail("repair apply must remove the deprecated Postgres launcher and connection-string credential path.");
}
if (!/\[mcp_servers\.supabase\][\s\S]*?url\s*=\s*"https:\/\/mcp\.supabase\.com\/mcp\?read_only=true&features=database,docs"/.test(repairedConfig)) {
  fail("repair apply must install the official hosted, read-only Supabase OAuth boundary.");
}

const missingConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-missing-config-"));
const missingConfigCodexHome = path.join(missingConfigRoot, ".codex");
const missingConfigAgentsHome = path.join(missingConfigRoot, ".agents");
ensureDir(missingConfigCodexHome);
ensureDir(missingConfigAgentsHome);
const missingConfigPlan = parseResult(runRepair([], missingConfigCodexHome, missingConfigAgentsHome), "repair missing config plan");
if (missingConfigPlan) {
  if (missingConfigPlan.config?.fullTemplateInstall !== true) {
    fail("repair plan must report full template install when config.toml is missing.");
  }
}
const missingConfigApplied = parseResult(runRepair(["--apply"], missingConfigCodexHome, missingConfigAgentsHome), "repair missing config apply");
if (missingConfigApplied) {
  const installedConfig = fs.readFileSync(path.join(missingConfigCodexHome, "config.toml"), "utf8");
  if (!/\nmodel\s*=\s*"[^"]+"/.test(`\n${installedConfig}`)) {
    fail("repair apply must install root-level model when config.toml is missing.");
  }
  if (!installedConfig.includes('approval_policy = "on-request"')) {
    fail("repair apply must install root-level approval policy when config.toml is missing.");
  }
  if (!installedConfig.includes('sandbox_mode = "workspace-write"')) {
    fail("repair apply must install root-level sandbox mode when config.toml is missing.");
  }
  if (!installedConfig.includes('approvals_reviewer = "auto_review"')) {
    fail("repair apply must install root-level approvals reviewer when config.toml is missing.");
  }
  if (!/\[apps\._default\][\s\S]*?\nenabled\s*=\s*false/.test(installedConfig)) {
    fail("repair apply must install app connector defaults when config.toml is missing.");
  }
  if (!/\[apps\._default\][\s\S]*?\ndefault_tools_approval_mode\s*=\s*"prompt"/.test(installedConfig)) {
    fail("repair apply must install app connector default approval mode when config.toml is missing.");
  }
}

const minimalExistingConfigRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-minimal-existing-config-"));
const minimalExistingConfigCodexHome = path.join(minimalExistingConfigRoot, ".codex");
const minimalExistingConfigAgentsHome = path.join(minimalExistingConfigRoot, ".agents");
write(
  path.join(minimalExistingConfigCodexHome, "config.toml"),
  [
    "# user config must survive",
    "model = \"local-custom-model\"",
    "",
    "[mcp_servers.user-local]",
    "command = \"node\"",
    "args = [\"server.js\"]",
    ""
  ].join("\n")
);
ensureDir(minimalExistingConfigAgentsHome);
const minimalExistingApplied = parseResult(
  runRepair(["--apply"], minimalExistingConfigCodexHome, minimalExistingConfigAgentsHome),
  "repair minimal existing config apply"
);
if (minimalExistingApplied) {
  const minimalConfig = fs.readFileSync(path.join(minimalExistingConfigCodexHome, "config.toml"), "utf8");
  if (!minimalConfig.includes('model = "local-custom-model"')) {
    fail("repair apply must preserve an existing root-level model setting.");
  }
  if (!minimalConfig.includes('approval_policy = "on-request"')) {
    fail("repair apply must backfill missing root-level approval policy in existing config.toml.");
  }
  if (!minimalConfig.includes('sandbox_mode = "workspace-write"')) {
    fail("repair apply must backfill missing root-level sandbox mode in existing config.toml.");
  }
  if (!minimalConfig.includes('model_reasoning_effort = "medium"')) {
    fail("repair apply must backfill missing root-level reasoning effort in existing config.toml.");
  }
  if (!minimalConfig.includes('approvals_reviewer = "auto_review"')) {
    fail("repair apply must backfill missing root-level approvals reviewer in existing config.toml.");
  }
  assertRootAssignment(minimalConfig, "approval_policy", '"on-request"', "repair apply minimal existing config");
  assertRootAssignment(minimalConfig, "sandbox_mode", '"workspace-write"', "repair apply minimal existing config");
  assertRootAssignment(minimalConfig, "model_reasoning_effort", '"medium"', "repair apply minimal existing config");
  assertRootAssignment(minimalConfig, "approvals_reviewer", '"auto_review"', "repair apply minimal existing config");
  if (!/\[mcp_servers\.user-local\][\s\S]*?command\s*=\s*"node"/.test(minimalConfig)) {
    fail("repair apply must preserve user-defined MCP tables while backfilling root defaults.");
  }
}

const inlineCommentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-inline-apps-"));
const inlineCommentCodexHome = path.join(inlineCommentRoot, ".codex");
const inlineCommentAgentsHome = path.join(inlineCommentRoot, ".agents");
write(
  path.join(inlineCommentCodexHome, "config.toml"),
  [
    "# inline comments must survive repair",
    "",
    "[apps._default]",
    "enabled = true # local app connector testing",
    "destructive_enabled = true # must be parked",
    "open_world_enabled = true # must be parked",
    ""
  ].join("\n")
);
ensureDir(inlineCommentAgentsHome);
const inlineCommentApplied = parseResult(runRepair(["--apply"], inlineCommentCodexHome, inlineCommentAgentsHome), "repair inline app comments apply");
if (inlineCommentApplied) {
  const inlineConfig = fs.readFileSync(path.join(inlineCommentCodexHome, "config.toml"), "utf8");
  const appsBlock = /\[apps\._default\]([\s\S]*?)(?:\n\[|$)/.exec(inlineConfig)?.[1] || "";
  for (const key of ["enabled", "destructive_enabled", "open_world_enabled"]) {
    const matches = appsBlock.match(new RegExp(`^${key}\\s*=`, "gm")) || [];
    if (matches.length !== 1) {
      fail(`repair apply must not duplicate apps._default.${key} when inline comments are present.`);
    }
    if (!new RegExp(`${key}\\s*=\\s*false\\s*#`).test(appsBlock)) {
      fail(`repair apply must rewrite apps._default.${key} to false while preserving inline comments.`);
    }
  }
  if (!/\ndefault_tools_approval_mode\s*=\s*"prompt"/.test(appsBlock)) {
    fail("repair apply must backfill apps._default.default_tools_approval_mode when inline comments are present.");
  }
}

const managedTableDriftRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-managed-table-drift-"));
const managedTableDriftCodexHome = path.join(managedTableDriftRoot, ".codex");
const managedTableDriftAgentsHome = path.join(managedTableDriftRoot, ".agents");
write(
  path.join(managedTableDriftCodexHome, "config.toml"),
  [
    "model = \"local-custom-model\"",
    "",
    "[mcp_servers.user-local]",
    "command = \"node\"",
    "args = [\"server.js\"]",
    "",
    "[mcp_servers.supabase]",
    "enabled = false",
    "command = \"cmd.exe\"",
    "args = [\"/c\", \"npx\", \"-y\", \"@modelcontextprotocol/server-postgres@0.6.2\", \"%SUPABASE_DB_URL%\"]",
    "default_tools_approval_mode = \"prompt\"",
    ""
  ].join("\n")
);
ensureDir(managedTableDriftAgentsHome);
const managedTableDriftPlan = parseResult(
  runRepair([], managedTableDriftCodexHome, managedTableDriftAgentsHome),
  "repair managed table drift plan"
);
if (managedTableDriftPlan && !managedTableDriftPlan.config?.updatedManagedTables?.includes("mcp_servers.supabase")) {
  fail("repair plan must report drifted managed MCP tables.");
}
const managedTableDriftApplied = parseResult(
  runRepair(["--apply"], managedTableDriftCodexHome, managedTableDriftAgentsHome),
  "repair managed table drift apply"
);
if (managedTableDriftApplied) {
  const driftConfig = fs.readFileSync(path.join(managedTableDriftCodexHome, "config.toml"), "utf8");
  if (!/\[mcp_servers\.user-local\][\s\S]*?command\s*=\s*"node"/.test(driftConfig)) {
    fail("repair managed table drift must preserve user-defined MCP tables.");
  }
  if (/SUPABASE_DB_URL|@modelcontextprotocol\/server-postgres/.test(driftConfig)) {
    fail("repair managed table drift must remove the deprecated Postgres launcher and credential path.");
  }
  if (!/\[mcp_servers\.supabase\][\s\S]*?url\s*=\s*"https:\/\/mcp\.supabase\.com\/mcp\?read_only=true&features=database,docs"/.test(driftConfig)) {
    fail("repair managed table drift must sync the hosted read-only Supabase OAuth boundary.");
  }
}

const nestedMcpEnvRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-nested-mcp-env-"));
const nestedMcpEnvCodexHome = path.join(nestedMcpEnvRoot, ".codex");
const nestedMcpEnvAgentsHome = path.join(nestedMcpEnvRoot, ".agents");
write(
  path.join(nestedMcpEnvCodexHome, "config.toml"),
  [
    "[mcp_servers.context7]",
    "enabled = true",
    "command = \"cmd.exe\"",
    "args = [\"/d\", \"/s\", \"/c\", \"npx.cmd\", \"-y\", \"@upstash/context7-mcp@3.2.1\"]",
    "",
    "[mcp_servers.context7.env]",
    "NoDefaultCurrentDirectoryInExePath = \"1\"",
    ""
  ].join("\n")
);
ensureDir(nestedMcpEnvAgentsHome);
const nestedMcpEnvApplied = parseResult(
  runRepair(["--apply"], nestedMcpEnvCodexHome, nestedMcpEnvAgentsHome),
  "repair nested MCP env apply"
);
if (nestedMcpEnvApplied) {
  const nestedEnvConfig = fs.readFileSync(path.join(nestedMcpEnvCodexHome, "config.toml"), "utf8");
  const context7Block = /\[mcp_servers\.context7\]([\s\S]*?)(?=\n\[mcp_servers\.context7\.env\]|$)/.exec(nestedEnvConfig)?.[1] || "";
  if (/^env\s*=/m.test(context7Block)) {
    fail("repair must not add an inline MCP env value when the destination preserves an MCP env table.");
  }
  if (!/\[mcp_servers\.context7\.env\][\s\S]*?NoDefaultCurrentDirectoryInExePath\s*=\s*\"1\"/.test(nestedEnvConfig)) {
    fail("repair must preserve a destination MCP env table without creating a TOML duplicate key.");
  }
}

const pruned = parseResult(runRepair(["--apply", "--prune-managed-plugin-extras"], codexHome, agentsHome), "repair prune");
if (pruned) {
  if (fs.existsSync(path.join(pluginTarget, "extra.txt"))) {
    fail("repair prune must delete explicit extra managed plugin files.");
  }
  if (fs.existsSync(path.join(marketplacePluginTarget, "marketplace-extra.txt"))) {
    fail("repair prune must delete explicit extras from the managed marketplace plugin mirror.");
  }
}

const noteOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-note-only-"));
const noteOnlyCodexHome = path.join(noteOnlyRoot, ".codex");
const noteOnlyAgentsHome = path.join(noteOnlyRoot, ".agents");
ensureDir(noteOnlyCodexHome);
ensureDir(noteOnlyAgentsHome);
for (const skill of JSON.parse(read("catalog/skills.json")).skills.filter((entry) => entry.install === true)) {
  ensureDir(path.join(noteOnlyAgentsHome, "skills", skill.name));
}
const noteOnlyApplied = parseResult(runRepair(["--apply"], noteOnlyCodexHome, noteOnlyAgentsHome), "repair note-only apply");
if (noteOnlyApplied) {
  ensureDir(path.join(noteOnlyAgentsHome, "skills", "user-extra-skill"));
  const noteOnlyPlan = parseResult(runRepair([], noteOnlyCodexHome, noteOnlyAgentsHome), "repair note-only plan");
  if (noteOnlyPlan) {
    if (noteOnlyPlan.status !== "ok") {
      fail(`repair note-only plan should stay ok when only non-curated user skills are present, got ${noteOnlyPlan.status}.`);
    }
    if (noteOnlyPlan.attentionReasons?.some((reason) => /non-curated/.test(reason))) {
      fail("repair note-only plan must not classify non-curated user skills as attention.");
    }
    if (!noteOnlyPlan.notes?.some((note) => /non-curated/.test(note))) {
      fail("repair note-only plan must report non-curated user skills as notes.");
    }
  }
}

const repairAdoptionScenarios = [
  { name: "fetch", display: "Fetch", flagArgs: ["--adopt-fetch-skill"] },
  { name: "seo", display: "SEO", flagArgs: ["--adopt-seo-skill"] },
  {
    name: "evidence-research",
    display: "Evidence Research",
    flagArgs: ["--adopt-evidence-research-skill"]
  },
  {
    name: "context-budget-planner",
    display: "Context Budget Planner",
    flagArgs: ["--adopt-direct-skill", "context-budget-planner"]
  }
];
for (const scenario of repairAdoptionScenarios) {
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-foreign-${scenario.name}-`));
  const foreignCodexHome = path.join(foreignRoot, ".codex");
  const foreignAgentsHome = path.join(foreignRoot, ".agents");
  const foreignSkillRoot = path.join(foreignAgentsHome, "skills", scenario.name);
  const foreignSkillText = `---\nname: ${scenario.name}\n---\n\nUser-owned unrelated ${scenario.display} workflow.\n`;
  const foreignSentinel = "preserve this user-owned file\n";
  write(path.join(foreignSkillRoot, "SKILL.md"), foreignSkillText);
  write(path.join(foreignSkillRoot, "user-owned.txt"), foreignSentinel);
  const foreignApply = runRepair(["--apply"], foreignCodexHome, foreignAgentsHome);
  if (foreignApply.error) {
    fail(`repair foreign ${scenario.display} collision could not run: ${foreignApply.error.message}`);
  } else if (foreignApply.status === 0) {
    fail(`repair apply must fail closed when the direct ${scenario.display} target is user-owned.`);
  }
  if (
    fs.existsSync(foreignCodexHome)
    || fs.existsSync(path.join(foreignAgentsHome, "plugins", "marketplace.json"))
  ) {
    fail(`repair foreign ${scenario.display} collision must perform zero managed writes before failing.`);
  }
  if (
    fs.readFileSync(path.join(foreignSkillRoot, "SKILL.md"), "utf8") !== foreignSkillText
    || fs.readFileSync(path.join(foreignSkillRoot, "user-owned.txt"), "utf8") !== foreignSentinel
  ) {
    fail(`repair foreign ${scenario.display} collision must preserve every user-owned file byte-for-byte.`);
  }

  const adopted = parseResult(
    runRepair(["--apply", ...scenario.flagArgs], foreignCodexHome, foreignAgentsHome),
    `repair explicit ${scenario.display} adoption`
  );
  if (adopted) {
    if (
      fs.readFileSync(path.join(foreignSkillRoot, "SKILL.md"), "utf8")
      !== read(`plugins/agentchef-workflows/skills/${scenario.name}/SKILL.md`)
    ) {
      fail(`repair explicit ${scenario.display} adoption must install the canonical managed source.`);
    }
    if (fs.readFileSync(path.join(foreignSkillRoot, "user-owned.txt"), "utf8") !== foreignSentinel) {
      fail(`repair explicit ${scenario.display} adoption must preserve unrelated user-owned files.`);
    }
  }
}

const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-linked-fetch-"));
const linkedCodexHome = path.join(linkedRoot, ".codex");
const linkedAgentsHome = path.join(linkedRoot, ".agents");
const linkedFetchRoot = path.join(linkedAgentsHome, "skills", "fetch");
const linkedExternalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-linked-external-"));
const foreignSkill = "---\nname: fetch\n---\n\nUser-owned unrelated Fetch workflow.\n";
ensureDir(path.dirname(linkedFetchRoot));
write(path.join(linkedExternalRoot, "SKILL.md"), foreignSkill);
fs.symlinkSync(linkedExternalRoot, linkedFetchRoot, process.platform === "win32" ? "junction" : "dir");
const linkedApply = runRepair(
  ["--apply", "--adopt-fetch-skill"],
  linkedCodexHome,
  linkedAgentsHome
);
if (linkedApply.error) {
  fail(`repair linked Fetch collision could not run: ${linkedApply.error.message}`);
} else if (linkedApply.status === 0) {
  fail("repair must reject a linked Fetch root even with explicit adoption.");
}
if (
  fs.existsSync(linkedCodexHome)
  || fs.existsSync(path.join(linkedAgentsHome, "plugins", "marketplace.json"))
) {
  fail("repair linked Fetch collision must perform zero managed writes.");
}
if (fs.readFileSync(path.join(linkedExternalRoot, "SKILL.md"), "utf8") !== foreignSkill) {
  fail("repair linked Fetch collision must not write through the linked target.");
}

const danglingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-repair-dangling-fetch-"));
const danglingCodexHome = path.join(danglingRoot, ".codex");
const danglingAgentsHome = path.join(danglingRoot, ".agents");
const danglingFetchRoot = path.join(danglingAgentsHome, "skills", "fetch");
const danglingExternalRoot = path.join(danglingRoot, "missing-external-fetch");
ensureDir(path.dirname(danglingFetchRoot));
fs.symlinkSync(danglingExternalRoot, danglingFetchRoot, process.platform === "win32" ? "junction" : "dir");
for (const repairArgs of [["--apply"], ["--apply", "--adopt-fetch-skill"]]) {
  const danglingApply = runRepair(repairArgs, danglingCodexHome, danglingAgentsHome);
  if (danglingApply.error) {
    fail(`repair dangling Fetch collision could not run: ${danglingApply.error.message}`);
  } else if (danglingApply.status === 0) {
    fail("repair must reject a dangling Fetch root with or without explicit adoption.");
  }
  if (
    fs.existsSync(danglingCodexHome)
    || fs.existsSync(path.join(danglingAgentsHome, "plugins", "marketplace.json"))
  ) {
    fail("repair dangling Fetch collision must perform zero managed writes.");
  }
  if (fs.existsSync(danglingExternalRoot) || !fs.lstatSync(danglingFetchRoot).isSymbolicLink()) {
    fail("repair dangling Fetch collision must preserve the dangling link without creating its target.");
  }
}

for (const scenario of [
  { name: "codex-plugin-parent", home: "codex", linkedSegment: "plugins" },
  { name: "agents-plugin-parent", home: "agents", linkedSegment: "plugins" }
]) {
  const linkedAncestorRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-${scenario.name}-`));
  const linkedAncestorCodexHome = path.join(linkedAncestorRoot, ".codex");
  const linkedAncestorAgentsHome = path.join(linkedAncestorRoot, ".agents");
  const selectedHome = scenario.home === "codex" ? linkedAncestorCodexHome : linkedAncestorAgentsHome;
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-${scenario.name}-external-`));
  ensureDir(selectedHome);
  fs.symlinkSync(externalRoot, path.join(selectedHome, scenario.linkedSegment), process.platform === "win32" ? "junction" : "dir");

  const linkedAncestorApply = runRepair(["--apply"], linkedAncestorCodexHome, linkedAncestorAgentsHome);
  if (linkedAncestorApply.error) {
    fail(`repair ${scenario.name} safety check could not run: ${linkedAncestorApply.error.message}`);
  } else if (linkedAncestorApply.status === 0) {
    fail(`repair must reject the linked ${scenario.home} managed-path ancestor.`);
  }
  if (fs.readdirSync(externalRoot).length > 0) {
    fail(`repair must not write through the linked ${scenario.home} managed-path ancestor.`);
  }
  const untouchedHome = scenario.home === "codex" ? linkedAncestorAgentsHome : linkedAncestorCodexHome;
  if (fs.existsSync(untouchedHome)) {
    fail(`repair linked ${scenario.home} ancestor preflight must fail before writing the other managed home.`);
  }
}

for (const home of ["codex", "agents"]) {
  const linkedHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-${home}-home-link-`));
  const linkedHomeCodex = path.join(linkedHomeRoot, ".codex");
  const linkedHomeAgents = path.join(linkedHomeRoot, ".agents");
  const selectedHome = home === "codex" ? linkedHomeCodex : linkedHomeAgents;
  const untouchedHome = home === "codex" ? linkedHomeAgents : linkedHomeCodex;
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `agentchef-repair-${home}-home-external-`));
  write(path.join(externalRoot, "sentinel.txt"), "unchanged\n");
  fs.symlinkSync(externalRoot, selectedHome, process.platform === "win32" ? "junction" : "dir");

  const linkedHomeApply = runRepair(["--apply"], linkedHomeCodex, linkedHomeAgents);
  if (linkedHomeApply.error) {
    fail(`repair ${home} home-link safety check could not run: ${linkedHomeApply.error.message}`);
  } else if (linkedHomeApply.status === 0) {
    fail(`repair must reject a linked ${home.toUpperCase()}_HOME root.`);
  }
  if (fs.readdirSync(externalRoot).sort().join(",") !== "sentinel.txt") {
    fail(`repair must not write through a linked ${home.toUpperCase()}_HOME root.`);
  }
  if (fs.existsSync(untouchedHome)) {
    fail(`repair linked ${home.toUpperCase()}_HOME preflight must fail before writing the other managed home.`);
  }
}

if (failures.length > 0) {
  console.error("Repair install validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Repair install validation passed.");
