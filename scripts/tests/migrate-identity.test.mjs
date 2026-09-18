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
