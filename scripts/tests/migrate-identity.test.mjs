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

  const template = fs.readFileSync(path.join(root, "templates", "git", "pre-commit"), "utf8");
  const legacyHook = template.replace(identity.hookBanner, identity.legacyHookBanner);
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
  const template = fs.readFileSync(path.join(root, "templates", "git", "pre-commit"), "utf8");
  const legacyHook = template.replace(identity.hookBanner, identity.legacyHookBanner);
  assert.ok(KNOWN_LEGACY_FILE_SHA256["pre-commit-hook"].includes(sha256(Buffer.from(legacyHook))), "the legacy hook differs from the current template only by its banner");
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
  const plan = run(state, ["--dry-run", "--target", "both"]);
  const decision = (id) => plan.steps.find((step) => step.id === id)?.decision;
  assert.equal(decision("operator-skill-folder"), "rename");
  assert.equal(decision(`direct-skill-marker:${identity.operatorSkill}`), "rewrite");
  assert.equal(decision("direct-skill-marker:fetch"), "rewrite");
  assert.equal(decision("curated-skill-marker:systematic-debugging"), "rewrite");
  assert.equal(decision("codex-plugin-directory"), "rename");
  assert.equal(decision("marketplace-source-directory"), "rename");
  assert.equal(decision("marketplace"), "rewrite");
  assert.equal(decision("git-pre-commit-hook"), "rewrite");
  assert.equal(decision("claude-install-receipt"), "rewrite");
  assert.equal(decision("claude-merge-receipt:claude-settings-merge-receipt.json"), "rewrite");
  assert.equal(decision("claude-operator-skill-link"), "relink");
  assert.equal(decision("claude-marketplace"), "rewrite");
  assert.equal(plan.dryRunOnly, true);
  assert.ok(fs.existsSync(state.operator), "dry run renames nothing");

  const applied = run(state, ["--apply", "--target", "both"]);
  const statuses = Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]));
  assert.equal(statuses["operator-skill-folder"], "renamed");
  assert.equal(statuses[`direct-skill-marker:${identity.operatorSkill}`], "rewritten");
  assert.equal(statuses["marketplace"], "rewritten");
  assert.equal(statuses["git-pre-commit-hook"], "rewritten");
  assert.equal(statuses["claude-operator-skill-link"], "relinked");
  assert.equal(statuses["codex-plugin-cache"], "skipped");

  const newOperator = path.join(state.agentsHome, "skills", identity.operatorSkill);
  assert.ok(!fs.existsSync(state.operator) && fs.existsSync(newOperator));
  const operatorMarker = readJson(path.join(newOperator, identity.managedMarker));
  assert.equal(operatorMarker.schemaVersion, "agentchef.managed-direct-skill.v1");
  assert.equal(operatorMarker.manager, "agentchef");
  assert.equal(operatorMarker.name, identity.operatorSkill);
  assert.equal(operatorMarker.source, `plugins/${identity.pluginName}/skills/${identity.operatorSkill}`);
  assert.ok(!fs.existsSync(path.join(newOperator, identity.legacyManagedMarker)));
  assert.equal(inspectDirectSkillTarget(path.join(root, "plugins", identity.pluginName, "skills", identity.operatorSkill), newOperator).status, "managed");
  assert.equal(readJson(path.join(state.fetchSkill, identity.managedMarker)).source, `plugins/${identity.pluginName}/skills/fetch`);
  const curatedMarker = readJson(path.join(state.curated, identity.sourceMarker));
  assert.equal(curatedMarker.schemaVersion, "agentchef.pinned-skill.v1");
  assert.ok(!fs.existsSync(path.join(state.curated, identity.legacySourceMarker)));
  assert.ok(fs.existsSync(path.join(state.codexHome, "plugins", identity.pluginName, ".codex-plugin", "plugin.json")));
  assert.ok(!fs.existsSync(path.join(state.codexHome, "plugins", identity.legacyPluginName)));
  assert.ok(fs.existsSync(path.join(state.agentsHome, "plugins", "sources", identity.pluginName, ".codex-plugin", "plugin.json")));
  const marketplace = readJson(path.join(state.agentsHome, "plugins", "marketplace.json"));
  assert.equal(marketplace.name, identity.marketplaceName);
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name).sort(), [identity.pluginName, "other-plugin"].sort());
  const hook = fs.readFileSync(path.join(state.home, ".githooks", "pre-commit"), "utf8");
  assert.ok(hook.includes(identity.hookBanner) && !hook.includes(identity.legacyHookBanner));
  assert.equal(readJson(path.join(state.claudeHome, "agentchef", "install-receipt.json")).schemaVersion, "agentchef.claude-install.v1");
  assert.equal(readJson(path.join(state.claudeHome, "agentchef", "receipts", "claude-settings-merge-receipt.json")).schemaVersion, "agentchef.json-merge-receipt.v1");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", identity.legacyOperatorSkill)));
  assert.ok(fs.lstatSync(path.join(state.claudeHome, "skills", identity.operatorSkill)).isSymbolicLink());
  const claudeMarketplace = readJson(path.join(state.agentsHome, "plugins", ".claude-plugin", "marketplace.json"));
  assert.deepEqual(claudeMarketplace.plugins.map((plugin) => plugin.source), [`./sources/${identity.pluginName}`]);
  const backups = fs.readdirSync(path.join(state.codexHome, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^agentchef-migrate-/);
  assert.ok(!fs.existsSync(path.join(state.codexHome, identity.lockDirectory)), "lock released");

  const again = run(state, ["--apply", "--target", "both"]);
  const secondStatuses = again.outcome.results.map((result) => result.status);
  assert.ok(secondStatuses.every((status) => ["current", "absent", "skipped", "no-marker"].includes(status)), JSON.stringify(again.outcome.results));
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
  assert.equal(fs.readFileSync(configPath, "utf8"), before, "a preview writes nothing");

  run(state, ["--apply"]);
  const after = fs.readFileSync(configPath, "utf8");
  assert.ok(after.includes("# Windows-first AgentChef."), "template banner rewritten");
  assert.ok(after.includes("# AgentChef merged config blocks."), "merge banner rewritten");
  assert.ok(after.includes('[hooks.state."agentchef-workflows@agentchef:hooks/process-hygiene.json:session_end:0:0"]'), "our hook-state key rewritten");
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
