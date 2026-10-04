import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scaledTimeout } from "../lib/test-timeouts.mjs";
import { identity } from "../lib/identity.mjs";
import { inspectDirectSkillTarget } from "../manage-direct-skill-target.mjs";
import { inspectPinnedSkillOwnership, hashSkillTree } from "../lib/skill-provenance.mjs";
import { KNOWN_LEGACY_FILE_SHA256 } from "../lib/global-git-guards.mjs";
import { countCodexConfigRewrites, planCodexConfigRewrite } from "../migrate-identity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const legacyHookFixture = path.join(root, "scripts", "tests", "fixtures", "pre-commit-0.9.0.txt");
const helper = path.join(root, "scripts", "migrate-identity.mjs");
const platform = process.platform === "win32" ? "windows" : "unix";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function copyTree(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// A home exactly as a 0.6.0 install left it: legacy markers, folder names,
// marketplace name, plugin id, receipts, and the legacy hook banner.
function legacyFixture({ withClaude }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-migrate-"));
  const codexHome = path.join(home, ".codex");
  const agentsHome = path.join(home, ".agents");
  const claudeHome = path.join(home, ".claude");
  const pluginSource = path.join(root, "plugins", identity.pluginName);

  // A config.toml exactly as a pre-1.0.0 install left it: AgentChef's own
  // banners and plugin-id keys next to another product's entries.
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), [
    "# Windows-first Codex Chef.",
    "",
    '[hooks.state."codex-chef-workflows@codex-chef:hooks/process-hygiene.json:session_end:0:0"]',
    'trusted_hash = "sha256:abc"',
    "",
    '[hooks.state."codex-chef-kitchen@codex-chef-kitchen:hooks/hooks.json:session_end:0:0"]',
    'trusted_hash = "sha256:def"',
    "",
    "[projects.'d:\\projects\\demo\\codex-chef']",
    'trust_level = "trusted"',
    "",
    "# Codex Chef merged config blocks. Existing user-defined tables were preserved.",
    "[agents.demo]",
    'description = "demo"',
    ""
  ].join("\n"));

  copyTree(pluginSource, path.join(codexHome, "plugins", identity.legacyPluginName));
  copyTree(pluginSource, path.join(agentsHome, "plugins", "sources", identity.legacyPluginName));

  const operator = path.join(agentsHome, "skills", identity.legacyOperatorSkill);
  copyTree(path.join(pluginSource, "skills", identity.operatorSkill), operator);
  fs.writeFileSync(path.join(operator, identity.legacyManagedMarker), `${JSON.stringify({
    schemaVersion: "codex-chef.managed-direct-skill.v1",
    manager: "codex-chef",
    component: "direct-skill",
    name: identity.legacyOperatorSkill,
    source: `plugins/${identity.legacyPluginName}/skills/${identity.legacyOperatorSkill}`
  }, null, 2)}\n`);
  const fetchSkill = path.join(agentsHome, "skills", "fetch");
  copyTree(path.join(pluginSource, "skills", "fetch"), fetchSkill);
  fs.writeFileSync(path.join(fetchSkill, identity.legacyManagedMarker), `${JSON.stringify({
    schemaVersion: "codex-chef.managed-direct-skill.v1",
    manager: "codex-chef",
    component: "direct-skill",
    name: "fetch",
    source: `plugins/${identity.legacyPluginName}/skills/fetch`
  }, null, 2)}\n`);

  const curated = path.join(agentsHome, "skills", "systematic-debugging");
  fs.mkdirSync(curated, { recursive: true });
  fs.writeFileSync(path.join(curated, "SKILL.md"), "---\nname: systematic-debugging\ndescription: pinned\n---\n# pinned\n");
  fs.writeFileSync(path.join(curated, identity.legacySourceMarker), `${JSON.stringify({
    schemaVersion: "codex-chef.pinned-skill.v1",
    package: "obra/superpowers",
    commit: "44c9b2d6e889982ac18c27d05a19fefe335194e1",
    skill: "systematic-debugging",
    cliVersion: "1.5.20",
    sourceTreeSha256: hashSkillTree(curated)
  }, null, 2)}\n`);

  fs.mkdirSync(path.join(agentsHome, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), `${JSON.stringify({
    name: identity.legacyMarketplaceName,
    plugins: [
      { name: "other-plugin", source: { source: "local", path: "./sources/other" }, policy: { installation: "AVAILABLE", authentication: "ON_USE" } },
      { name: identity.legacyPluginName, source: { source: "local", path: `./sources/${identity.legacyPluginName}` }, policy: { installation: "AVAILABLE", authentication: "ON_USE" } }
    ]
  }, null, 2)}\n`);

  // The hook exactly as 0.9.0 shipped it, legacy banner included.
  const legacyHook = fs.readFileSync(legacyHookFixture);
  fs.mkdirSync(path.join(home, ".githooks"), { recursive: true });
  fs.writeFileSync(path.join(home, ".githooks", "pre-commit"), legacyHook);

  if (withClaude) {
    fs.mkdirSync(path.join(claudeHome, "agentchef", "receipts"), { recursive: true });
    fs.mkdirSync(path.join(claudeHome, "skills"), { recursive: true });
    fs.symlinkSync(operator, path.join(claudeHome, "skills", identity.legacyOperatorSkill), process.platform === "win32" ? "junction" : "dir");
    const mergeReceipt = path.join(claudeHome, "agentchef", "receipts", "claude-settings-merge-receipt.json");
    fs.writeFileSync(path.join(claudeHome, "settings.json"), `${JSON.stringify({ permissions: { allow: ["Bash(git status *)"] } }, null, 2)}\n`);
    fs.writeFileSync(mergeReceipt, `${JSON.stringify({
      schemaVersion: "codex-chef.json-merge-receipt.v1",
      product: { name: "agentchef", version: "0.9.0" },
      target: path.join(claudeHome, "settings.json"),
      createdAt: new Date().toISOString(),
      beforeSha256: null,
      afterSha256: "b".repeat(64),
      backupPath: null,
      entries: [{ kind: "array-item", pointer: "/permissions/allow", valueSha256: "x".repeat(64), preview: "Bash(git status *)" }]
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(claudeHome, "agentchef", "install-receipt.json"), `${JSON.stringify({
      schemaVersion: "codex-chef.claude-install.v1",
      product: { name: "agentchef", version: "0.9.0" },
      createdAt: new Date().toISOString(),
      claudeHome,
      agentsHome,
      backupRoot: path.join(claudeHome, "agentchef", "backups", "agentchef-x"),
      files: [],
      links: [{ link: path.join(claudeHome, "skills", identity.legacyOperatorSkill), target: operator }],
      receipts: [mergeReceipt],
      commands: []
    }, null, 2)}\n`);
    fs.mkdirSync(path.join(agentsHome, "plugins", ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(agentsHome, "plugins", ".claude-plugin", "marketplace.json"), `${JSON.stringify({
      name: "agentchef",
      description: "AgentChef workflows for Claude Code",
      owner: { name: "AgentChef" },
      plugins: [{ name: identity.legacyPluginName, description: "AgentChef workflows", source: `./sources/${identity.legacyPluginName}` }]
    }, null, 2)}\n`);
  }
  return { home, codexHome, agentsHome, claudeHome, operator, fetchSkill, curated };
}

function run(state, args) {
  const result = spawnSync(process.execPath, [
    helper, "--codex-home", state.codexHome, "--agents-home", state.agentsHome, "--claude-home", state.claudeHome,
    "--home", state.home, "--platform", platform, "--skip-plugin-register", "--json", ...args
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(90_000), env: { ...process.env, PATH: path.join(state.home, "no-bin") } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("legacy template hashes match the shipped Git hook with the legacy banner", () => {
  const legacyHook = fs.readFileSync(legacyHookFixture);
  assert.ok(legacyHook.includes(identity.legacyHookBanner), "the fixture is the legacy-banner hook");
  assert.ok(KNOWN_LEGACY_FILE_SHA256["pre-commit-hook"].includes(sha256(legacyHook)), "the 0.9.0 hook is recognized as AgentChef's own");
});

test("legacy markers are still recognized as managed before any migration", () => {
  const state = legacyFixture({ withClaude: false });
  const fetchState = inspectDirectSkillTarget(path.join(root, "plugins", identity.pluginName, "skills", "fetch"), state.fetchSkill);
  assert.equal(fetchState.status, "managed");
  const ownership = inspectPinnedSkillOwnership(state.curated, { package: "obra/superpowers", skill: "systematic-debugging" });
  assert.equal(ownership.valid, true);
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("identity migration previews, converts, and is idempotent for both targets", () => {
  const state = legacyFixture({ withClaude: true });
  // The legacy plugin is installed here (its versioned cache exists), which is
  // what makes the Codex plugin CLI swap necessary.
  const legacyCachedPlugin = path.join(state.codexHome, "plugins", "cache", identity.legacyMarketplaceName, identity.legacyPluginName, "0.9.0", ".codex-plugin");
  fs.mkdirSync(legacyCachedPlugin, { recursive: true });
  fs.writeFileSync(path.join(legacyCachedPlugin, "plugin.json"), "{}\n");
  const plan = run(state, ["--dry-run", "--target", "both"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  assert.equal(decision("codex-plugin-cache"), "cli");
  // Since 1.3.0 every skill comes from the plugin: AgentChef's direct copies
  // are retired instead of being renamed or re-marked.
  assert.equal(decision(`direct-skill-copy:${identity.legacyOperatorSkill}`), "retire");
  assert.equal(decision("direct-skill-copy:fetch"), "retire");
  // The plugin source has no pinned copy yet (the installer writes it), so
  // the direct pinned copy stays until it does.
  assert.equal(decision("direct-skill-copy:systematic-debugging"), "keep-until-plugin");
  assert.equal(decision("operator-skill-folder"), "superseded-by-retire");
  assert.equal(decision("direct-skill-marker:fetch"), "superseded-by-retire");
  assert.equal(decision("curated-skill-marker:systematic-debugging"), "rewrite");
  assert.equal(decision(`claude-skill-link:${identity.legacyOperatorSkill}`), "retire");
  assert.equal(decision("claude-operator-skill-link"), "superseded-by-retire");
  assert.equal(decision("codex-plugin-directory"), "rename");
  assert.equal(decision("marketplace-source-directory"), "rename");
  assert.equal(decision("marketplace"), "rewrite");
  assert.equal(decision("git-pre-commit-hook"), "rewrite");
  assert.equal(decision("claude-install-receipt"), "rewrite");
  assert.equal(decision("claude-merge-receipt:claude-settings-merge-receipt.json"), "rewrite");
  assert.equal(decision("claude-marketplace"), "rewrite");
  assert.equal(plan.dryRunOnly, true);
  assert.ok(fs.existsSync(state.operator), "dry run removes nothing");

  const applied = run(state, ["--apply", "--target", "both"]);
  const statuses = Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]));
  assert.equal(statuses[`direct-skill-copy:${identity.legacyOperatorSkill}`], "retired");
  assert.equal(statuses["direct-skill-copy:fetch"], "retired");
  assert.equal(statuses["direct-skill-copy:systematic-debugging"], "keep-until-plugin");
  assert.equal(statuses[`claude-skill-link:${identity.legacyOperatorSkill}`], "retired");
  assert.equal(statuses["marketplace"], "rewritten");
  assert.equal(statuses["git-pre-commit-hook"], "rewritten");
  assert.equal(statuses["codex-plugin-cache"], "skipped");

  for (const copy of [state.operator, state.fetchSkill]) assert.ok(!fs.existsSync(copy), `${path.basename(copy)} copy retired`);
  assert.ok(fs.existsSync(state.curated), "a pinned copy the plugin does not carry yet stays");
  assert.ok(!fs.existsSync(path.join(state.agentsHome, "skills", identity.operatorSkill)), "the operator copy is not recreated under the new name");
  // Everything removed sits in the migration backup.
  const backupRoot = applied.outcome.backupRoot;
  assert.ok(fs.readdirSync(backupRoot, { recursive: true }).some((entry) => String(entry).includes("fetch")), "the fetch copy is backed up");
  assert.ok(fs.existsSync(path.join(state.codexHome, "plugins", identity.pluginName, ".codex-plugin", "plugin.json")));
  assert.ok(!fs.existsSync(path.join(state.codexHome, "plugins", identity.legacyPluginName)));
  assert.ok(fs.existsSync(path.join(state.agentsHome, "plugins", "sources", identity.pluginName, "skills", "fetch", "SKILL.md")), "the plugin source carries the skill");
  const marketplace = readJson(path.join(state.agentsHome, "plugins", "marketplace.json"));
  assert.equal(marketplace.name, identity.marketplaceName);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name).sort(), [identity.pluginName, "other-plugin"].sort());
  const hook = fs.readFileSync(path.join(state.home, ".githooks", "pre-commit"), "utf8");
  assert.ok(hook.includes(identity.hookBanner) && !hook.includes(identity.legacyHookBanner));
  const installReceipt = readJson(path.join(state.claudeHome, "agentchef", "install-receipt.json"));
  assert.equal(installReceipt.schemaVersion, "agentchef.claude-install.v1");
  assert.deepEqual(installReceipt.links, [], "the retired link leaves the receipt too");
  assert.equal(readJson(path.join(state.claudeHome, "agentchef", "receipts", "claude-settings-merge-receipt.json")).schemaVersion, "agentchef.json-merge-receipt.v1");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", identity.legacyOperatorSkill)));
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", identity.operatorSkill)));
  const claudeMarketplace = readJson(path.join(state.agentsHome, "plugins", ".claude-plugin", "marketplace.json"));
  assert.deepEqual(claudeMarketplace.plugins.map((plugin) => plugin.source), [`./sources/${identity.pluginName}`]);
  const backups = fs.readdirSync(path.join(state.codexHome, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^agentchef-migrate-/);
  assert.ok(!fs.existsSync(path.join(state.codexHome, identity.lockDirectory)), "lock released");

  const again = run(state, ["--apply", "--target", "both"]);
  const secondStatuses = again.outcome.results.map((result) => result.status);
  // "foreign": the plugin CLI swap is skipped here, so the legacy cache still
  // holds the installed plugin and is kept.
  // "keep-until-plugin": the pinned copy waits for the installer to put it in the plugin.
  assert.ok(secondStatuses.every((status) => ["current", "absent", "skipped", "no-marker", "foreign", "keep-until-plugin"].includes(status)), JSON.stringify(again.outcome.results));
  assert.ok(fs.existsSync(path.join(legacyCachedPlugin, "plugin.json")), "a cache that still holds the plugin is never deleted");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("the Codex config keeps every foreign entry while AgentChef's own banners and plugin id are rewritten", () => {
  const state = legacyFixture({ withClaude: false });
  const configPath = path.join(state.codexHome, "config.toml");
  const before = fs.readFileSync(configPath, "utf8");
  const legacyCache = path.join(state.codexHome, "plugins", "cache", identity.legacyMarketplaceName);
  fs.mkdirSync(path.join(legacyCache, "emptied"), { recursive: true });

  const preview = run(state, ["--dry-run"]);
  const planned = preview.steps.find((step) => step.id === "codex-config");
  assert.equal(planned.decision, "rewrite");
  assert.equal(planned.occurrences, 3, "the two banners and one plugin-id key");
  assert.equal(preview.steps.find((step) => step.id === "codex-plugin-cache").decision, "absent", "an emptied legacy cache tree is not an installed plugin");
  assert.equal(fs.readFileSync(configPath, "utf8"), before, "a preview writes nothing");

  run(state, ["--apply"]);
  const after = fs.readFileSync(configPath, "utf8");
  assert.ok(after.includes("# Windows-first AgentChef."), "template banner rewritten");
  assert.ok(after.includes("# AgentChef merged config blocks."), "merge banner rewritten");
  assert.ok(after.includes('[hooks.state."agentchef@agentchef:hooks/process-hygiene.json:session_end:0:0"]'), "our hook-state key rewritten");
  assert.ok(after.includes('trusted_hash = "sha256:abc"'), "the recorded hash moves with the key");
  assert.ok(after.includes('[hooks.state."codex-chef-kitchen@codex-chef-kitchen:hooks/hooks.json:session_end:0:0"]'), "another product's hook state is untouched");
  assert.ok(after.includes("[projects.'d:\\projects\\demo\\codex-chef']"), "project trust paths are untouched");
  assert.ok(after.includes("[agents.demo]"), "user tables survive");
  assert.equal(countCodexConfigRewrites(after), 0, "nothing left to rewrite");
  assert.ok(!fs.existsSync(legacyCache), "a legacy cache directory holding no files is removed");

  const again = run(state, ["--dry-run"]);
  assert.equal(again.steps.find((step) => step.id === "codex-config").decision, "current", "second run has nothing to do");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a hook-state table already written under the new plugin id makes the legacy table a duplicate", () => {
  // Codex writes its own hook-state table as soon as the plugin is re-added
  // under the new id, so renaming the legacy table would produce two identical
  // TOML tables and the config would stop parsing.
  const config = [
    "# Windows-first Codex Chef.",
    "",
    `[hooks.state."${identity.legacyPluginId}:hooks/process-hygiene.json:session_end:0:0"]`,
    'trusted_hash = "sha256:old"',
    "",
    `[hooks.state."${identity.pluginId}:hooks/process-hygiene.json:session_end:0:0"]`,
    'trusted_hash = "sha256:new"',
    "",
    '[hooks.state."codex-chef-kitchen@codex-chef-kitchen:hooks/hooks.json:session_end:0:0"]',
    'trusted_hash = "sha256:kitchen"',
    ""
  ].join("\n");

  const planned = planCodexConfigRewrite(config);
  assert.equal(planned.renamed, 0, "nothing is renamed onto an existing table");
  assert.equal(planned.dropped, 1, "the legacy duplicate is dropped");
  assert.equal(planned.banners, 1);

  const headers = planned.text.split("\n").filter((line) => line.startsWith("["));
  assert.equal(new Set(headers).size, headers.length, "no duplicate table headers");
  assert.ok(!planned.text.includes(identity.legacyPluginId), "the legacy id is gone");
  assert.ok(planned.text.includes('trusted_hash = "sha256:new"'), "Codex's own record is kept");
  assert.ok(!planned.text.includes('trusted_hash = "sha256:old"'), "the stale record leaves with its table");
  assert.ok(planned.text.includes('[hooks.state."codex-chef-kitchen@codex-chef-kitchen:hooks/hooks.json:session_end:0:0"]'), "another product is untouched");
  assert.ok(planned.text.includes('trusted_hash = "sha256:kitchen"'));
  assert.equal(planCodexConfigRewrite(planned.text).changed, false, "idempotent");
});

test("a home without the legacy plugin installed gets no plugin CLI swap", () => {
  // Running `codex plugin add` here installed a plugin the user never had and
  // rewrote config.toml; the Claude uninstall of a missing plugin failed the run.
  const state = legacyFixture({ withClaude: true });
  const plan = run(state, ["--dry-run", "--target", "both"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  assert.equal(decision("codex-plugin-cache"), "absent");
  assert.equal(decision("claude-plugin-cache"), "absent");
});

test("identity migration finishes when the current operator name is already linked in Claude", () => {
  const state = legacyFixture({ withClaude: true });
  // Both names carry markers, so the Claude install linked both.
  const currentOperator = path.join(state.agentsHome, "skills", identity.operatorSkill);
  copyTree(state.operator, currentOperator);
  fs.symlinkSync(currentOperator, path.join(state.claudeHome, "skills", identity.operatorSkill), process.platform === "win32" ? "junction" : "dir");
  const applied = run(state, ["--apply", "--target", "both"]);
  const statuses = Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]));
  assert.equal(statuses[`claude-skill-link:${identity.legacyOperatorSkill}`], "retired");
  assert.equal(statuses[`claude-skill-link:${identity.operatorSkill}`], "retired");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", identity.legacyOperatorSkill)), "the legacy link is gone");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", identity.operatorSkill)), "the current link to a retired copy is gone too");
  const again = run(state, ["--apply", "--target", "both"]);
  assert.ok(again.outcome.results.every((result) => !["relinked", "renamed", "rewritten", "retired"].includes(result.status)), "a rerun changes nothing");
  fs.rmSync(state.home, { recursive: true, force: true });
});

// A home exactly as 1.0.0 through 1.2.x left it: current markers and
// marketplace name, but the plugin still called agentchef-workflows.
function previousFixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-migrate-12-"));
  const codexHome = path.join(home, ".codex");
  const agentsHome = path.join(home, ".agents");
  const claudeHome = path.join(home, ".claude");
  const pluginSource = path.join(root, "plugins", identity.pluginName);
  const previous = identity.previousPluginName;
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), [
    "# Windows-first AgentChef.",
    "",
    `[plugins."${identity.previousPluginId}"]`,
    "enabled = true",
    "",
    `[hooks.state."${identity.previousPluginId}:hooks/process-hygiene.json:session_end:0:0"]`,
    'trusted_hash = "sha256:abc"',
    "",
    '[plugins."other@elsewhere"]',
    "enabled = true",
    ""
  ].join("\n"));
  copyTree(pluginSource, path.join(codexHome, "plugins", previous));
  copyTree(pluginSource, path.join(agentsHome, "plugins", "sources", previous));
  const fetchSkill = path.join(agentsHome, "skills", "fetch");
  copyTree(path.join(pluginSource, "skills", "fetch"), fetchSkill);
  fs.writeFileSync(path.join(fetchSkill, identity.managedMarker), `${JSON.stringify({
    schemaVersion: "agentchef.managed-direct-skill.v1",
    manager: "agentchef",
    component: "direct-skill",
    name: "fetch",
    source: `plugins/${previous}/skills/fetch`
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(agentsHome, "plugins", ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), `${JSON.stringify({
    name: identity.marketplaceName,
    plugins: [
      { name: "other-plugin", source: { source: "local", path: "./sources/other" }, policy: { installation: "AVAILABLE", authentication: "ON_USE" } },
      { name: previous, source: { source: "local", path: `./sources/${previous}` }, policy: { installation: "AVAILABLE", authentication: "ON_USE" } }
    ]
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(agentsHome, "plugins", ".claude-plugin", "marketplace.json"), `${JSON.stringify({
    name: identity.marketplaceName,
    owner: { name: "AgentChef" },
    plugins: [{ name: previous, description: "AgentChef workflows", source: `./sources/${previous}` }]
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(claudeHome, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(claudeHome, "plugins", "installed_plugins.json"), `${JSON.stringify({ version: 2, plugins: { [identity.previousPluginId]: [{ scope: "user", version: "1.2.2" }] } }, null, 2)}\n`);
  return { home, codexHome, agentsHome, claudeHome, fetchSkill };
}

test("a 1.2 home moves from agentchef-workflows to agentchef", () => {
  const state = previousFixture();
  const plan = run(state, ["--dry-run", "--target", "both"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  const previous = identity.previousPluginName;
  assert.equal(decision(`codex-plugin-directory:${previous}`), "rename");
  assert.equal(decision(`marketplace-source-directory:${previous}`), "rename");
  assert.equal(decision("marketplace"), "rewrite");
  assert.equal(decision("claude-marketplace"), "rewrite");
  assert.equal(decision("codex-plugin-cache"), "cli");
  assert.deepEqual(plan.steps.find((step) => step.id === "codex-plugin-cache").commands, [`codex plugin remove ${identity.previousPluginId}`, `codex plugin add ${identity.pluginId}`]);
  assert.deepEqual(plan.steps.find((step) => step.id === "claude-plugin-cache").commands, [`claude plugin uninstall ${identity.previousPluginId}`, `claude plugin install ${identity.pluginId} --scope user`]);
  assert.equal(decision("codex-config"), "rewrite");

  run(state, ["--apply", "--target", "both"]);
  assert.ok(fs.existsSync(path.join(state.codexHome, "plugins", identity.pluginName, ".codex-plugin", "plugin.json")));
  assert.ok(!fs.existsSync(path.join(state.codexHome, "plugins", previous)));
  assert.ok(fs.existsSync(path.join(state.agentsHome, "plugins", "sources", identity.pluginName)));
  const config = fs.readFileSync(path.join(state.codexHome, "config.toml"), "utf8");
  assert.match(config, new RegExp(`\\[plugins\\."${identity.pluginId}"\\]`));
  assert.match(config, new RegExp(`\\[hooks\\.state\\."${identity.pluginId}:hooks`));
  assert.doesNotMatch(config, new RegExp(identity.previousPluginId));
  assert.match(config, /\[plugins\."other@elsewhere"\]/, "another product's table stays");
  const marketplace = readJson(path.join(state.agentsHome, "plugins", "marketplace.json"));
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name).sort(), [identity.pluginName, "other-plugin"].sort());
  const claudeMarketplace = readJson(path.join(state.agentsHome, "plugins", ".claude-plugin", "marketplace.json"));
  assert.deepEqual(claudeMarketplace.plugins.map((plugin) => [plugin.name, plugin.source]), [[identity.pluginName, `./sources/${identity.pluginName}`]]);
  // A direct-skill marker written under the old folder name still proves
  // ownership, so the copy is retired once the plugin source carries fetch.
  assert.equal(decision("direct-skill-copy:fetch"), "retire");
  assert.ok(!fs.existsSync(state.fetchSkill), "the 1.2 direct copy is retired");
  assert.ok(fs.existsSync(path.join(state.agentsHome, "plugins", "sources", identity.pluginName, "skills", "fetch", "SKILL.md")));
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a pinned direct copy is retired once the plugin source carries that skill", () => {
  const state = legacyFixture({ withClaude: false });
  // The installer wrote the pinned skill into the plugin source.
  copyTree(state.curated, path.join(state.agentsHome, "plugins", "sources", identity.legacyPluginName, "skills", "systematic-debugging"));
  const plan = run(state, ["--dry-run"]);
  assert.equal(plan.steps.find((step) => step.id === "direct-skill-copy:systematic-debugging")?.decision, "retire");
  run(state, ["--apply"]);
  assert.ok(!fs.existsSync(state.curated), "the direct pinned copy is gone");
  assert.ok(fs.existsSync(path.join(state.agentsHome, "plugins", "sources", identity.pluginName, "skills", "systematic-debugging", "SKILL.md")), "the plugin copy stays");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("coordinator role files 1.3.0 no longer ships are retired only when AgentChef wrote them", () => {
  const state = legacyFixture({ withClaude: false });
  const agentsDir = path.join(state.codexHome, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  const shipped = fs.readFileSync(path.join(root, "scripts", "tests", "fixtures", "data_coordinator-1.2.2.toml"), "utf8");
  // A Windows checkout writes the template with CRLF; the digest still matches.
  fs.writeFileSync(path.join(agentsDir, "data_coordinator.toml"), shipped.replace(/\n/g, "\r\n"));
  fs.writeFileSync(path.join(agentsDir, "security_coordinator.toml"), "name = \"security_coordinator\"\n# edited by the user\n");
  const plan = run(state, ["--dry-run"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  assert.equal(decision("retired-file:agents/data_coordinator.toml"), "retire");
  assert.equal(decision("retired-file:agents/security_coordinator.toml"), "foreign");
  assert.equal(decision("retired-file:agents/support_coordinator.toml"), "absent");
  run(state, ["--apply"]);
  assert.ok(!fs.existsSync(path.join(agentsDir, "data_coordinator.toml")), "the shipped role file is retired");
  assert.ok(fs.existsSync(path.join(agentsDir, "security_coordinator.toml")), "an edited role file stays");
  const again = run(state, ["--dry-run"]);
  assert.equal(again.steps.find((step) => step.id === "retired-file:agents/data_coordinator.toml")?.decision, "absent");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a pinned skill the catalog replaced leaves the plugin source only when AgentChef installed it untouched", async () => {
  const { writePinnedSkillProvenance } = await import("../lib/skill-provenance.mjs");
  const state = legacyFixture({ withClaude: false });
  const skillsRoot = path.join(state.agentsHome, "plugins", "sources", identity.pluginName, "skills");
  const install = (name, edit) => {
    const target = path.join(skillsRoot, name);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), `---\nname: ${name}\ndescription: Replaced upstream skill.\n---\n`);
    writePinnedSkillProvenance(target, { package: "owner/repo", commit: "a".repeat(40), skill: name, cliVersion: "1.5.20", sourceTreeSha256: hashSkillTree(target) });
    if (edit) fs.appendFileSync(path.join(target, "SKILL.md"), "local edit\n");
    return target;
  };
  const replaced = install("request-refactor-plan", false);
  const edited = install("frontend-skill", true);
  const plan = run(state, ["--dry-run"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  assert.equal(decision("replaced-pinned-skill:request-refactor-plan"), "retire");
  assert.equal(decision("replaced-pinned-skill:frontend-skill"), "foreign", "an edited copy stays");
  run(state, ["--apply"]);
  assert.ok(!fs.existsSync(replaced), "the untouched replaced pin is gone");
  assert.ok(fs.existsSync(edited), "the edited one is kept");
  fs.rmSync(state.home, { recursive: true, force: true });
});
