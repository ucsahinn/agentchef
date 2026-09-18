import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scaledTimeout } from "../lib/test-timeouts.mjs";
import { claudeInstallActionIds } from "../install-claude-target.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const helper = path.join(root, "scripts", "install-claude-target.mjs");
const platform = process.platform === "win32" ? "windows" : "unix";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Skill names come from catalog/skills.json: a managed directory whose name
// left the catalog is reported as retired and never linked.
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-claude-target-"));
  const agentsHome = path.join(home, ".agents");
  const claudeHome = path.join(home, ".claude");
  const managedSkill = path.join(agentsHome, "skills", "seo");
  fs.mkdirSync(managedSkill, { recursive: true });
  fs.writeFileSync(path.join(managedSkill, "SKILL.md"), "---\nname: seo\ndescription: demo\n---\n# demo\n");
  fs.writeFileSync(path.join(managedSkill, ".agentchef-managed.json"), `${JSON.stringify({ schemaVersion: "agentchef.direct-skill.v1" })}\n`);
  const foreignSkill = path.join(agentsHome, "skills", "user-agents-skill");
  fs.mkdirSync(foreignSkill, { recursive: true });
  fs.writeFileSync(path.join(foreignSkill, "SKILL.md"), "user\n");
  fs.mkdirSync(path.join(agentsHome, "plugins", "sources", "agentchef-workflows"), { recursive: true });
  fs.mkdirSync(path.join(claudeHome, "skills", "user-claude-skill"), { recursive: true });
  fs.writeFileSync(path.join(claudeHome, "skills", "user-claude-skill", "SKILL.md"), "mine\n");
  const settings = {
    permissions: { allow: ["Bash(ls *)"], deny: ["Bash(gh pr list *)"] },
    hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "echo user" }] }] },
    theme: "dark"
  };
  const claudeJson = { mcpServers: { context7: { type: "stdio", command: "custom" } }, numStartups: 4 };
  fs.writeFileSync(path.join(claudeHome, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
  // Without CLAUDE_CONFIG_DIR Claude Code keeps the user-scope file at ~/.claude.json.
  fs.writeFileSync(path.join(home, ".claude.json"), `${JSON.stringify(claudeJson, null, 2)}\n`);
  return { home, agentsHome, claudeHome, settings, claudeJson };
}

// The fixture models a default home; a CLAUDE_CONFIG_DIR inherited from the
// caller would move .claude.json inside the config directory.
const fixtureEnv = { ...process.env, CLAUDE_CONFIG_DIR: undefined };

function run(fixtureState, args) {
  const result = spawnSync(process.execPath, [
    helper,
    "--claude-home", fixtureState.claudeHome,
    "--agents-home", fixtureState.agentsHome,
    "--home", fixtureState.home,
    "--platform", platform,
    "--skip-plugin-register",
    "--json",
    ...args
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env: fixtureEnv });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("Claude target plan, apply, idempotent re-apply, and receipt-scoped removal", () => {
  const state = fixture();
  const plan = run(state, ["--dry-run"]);
  assert.equal(plan.dryRunOnly, true);
  assert.deepEqual(plan.plan.actions.map((action) => action.id), [...claudeInstallActionIds]);
  const links = plan.plan.actions.find((action) => action.kind === "link-directory").links;
  assert.deepEqual(links.map((link) => [link.name, link.decision]), [["seo", "create"]], "only marker-carrying skills are linked");
  assert.ok(fs.existsSync(path.join(state.claudeHome, "settings.json")));
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "agentchef")), "dry run writes nothing");

  const applied = run(state, ["--apply"]);
  const statuses = Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]));
  assert.equal(statuses["claude-working-agreement"], "installed");
  assert.equal(statuses["claude-serena-pool"], "installed");
  assert.equal(statuses["claude-settings-merge"], "merged");
  assert.equal(statuses["claude-mcp-merge"], "merged");
  assert.equal(statuses["claude-skill-links"], "linked");
  assert.equal(statuses["claude-plugin-marketplace"], "installed");
  assert.equal(statuses["claude-plugin-register"], "skipped");

  const settings = readJson(path.join(state.claudeHome, "settings.json"));
  assert.ok(settings.permissions.allow.includes("Bash(ls *)"));
  assert.ok(settings.permissions.allow.length > 10);
  assert.ok(!settings.permissions.allow.includes("Bash(gh pr list *)"), "denied rule stays out of allow");
  assert.deepEqual(settings.permissions.deny, ["Bash(gh pr list *)"]);
  assert.deepEqual(settings.hooks, state.settings.hooks, "user hooks untouched; no hook is installed for Claude in this release");
  assert.equal(settings.theme, "dark");
  const claudeJson = readJson(path.join(state.home, ".claude.json"));
  assert.ok(!fs.existsSync(path.join(state.claudeHome, ".claude.json")), "no stray .claude.json inside the config directory");
  assert.deepEqual(claudeJson.mcpServers.context7, { type: "stdio", command: "custom" });
  assert.equal(claudeJson.numStartups, 4);
  assert.equal(claudeJson.mcpServers.serena.command, "node");
  assert.ok(fs.existsSync(path.join(state.claudeHome, "rules", "agentchef-working-agreement.md")));
  assert.ok(fs.existsSync(path.join(state.claudeHome, "agentchef", "serena-pool.mjs")));
  assert.ok(fs.lstatSync(path.join(state.claudeHome, "skills", "seo")).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(state.claudeHome, "skills", "user-claude-skill", "SKILL.md"), "utf8"), "mine\n");
  const marketplace = readJson(path.join(state.agentsHome, "plugins", ".claude-plugin", "marketplace.json"));
  assert.equal(marketplace.name, "agentchef");
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.source), ["./sources/agentchef-workflows"]);
  const receipts = fs.readdirSync(path.join(state.claudeHome, "agentchef", "receipts")).sort();
  assert.deepEqual(receipts, ["claude-mcp-merge-receipt.json", "claude-settings-merge-receipt.json"]);
  const installReceipt = readJson(path.join(state.claudeHome, "agentchef", "install-receipt.json"));
  assert.equal(installReceipt.links.length, 1);
  assert.ok(fs.existsSync(path.join(state.claudeHome, "agentchef", "backups")));
  assert.ok(!fs.existsSync(path.join(state.claudeHome, ".agentchef-operation.lock")), "lock released");

  const again = run(state, ["--apply"]);
  assert.ok(again.outcome.results.every((result) => ["current", "skipped"].includes(result.status)), JSON.stringify(again.outcome.results));
  assert.deepEqual(readJson(path.join(state.claudeHome, "settings.json")), settings, "second apply changes nothing");

  const removalPlan = run(state, ["--remove", "--dry-run"]);
  assert.equal(removalPlan.plan.present, true);
  assert.ok(removalPlan.plan.receipts.every((entry) => entry.decision === "revert"));
  const removed = run(state, ["--remove", "--apply"]);
  assert.ok(removed.outcome.results.some((result) => result.status === "reverted"));
  assert.deepEqual(readJson(path.join(state.claudeHome, "settings.json")), state.settings, "settings restored to the user's document");
  assert.deepEqual(readJson(path.join(state.home, ".claude.json")), state.claudeJson, ".claude.json restored to the user's document");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "skills", "seo")));
  assert.equal(fs.readFileSync(path.join(state.claudeHome, "skills", "user-claude-skill", "SKILL.md"), "utf8"), "mine\n");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "rules", "agentchef-working-agreement.md")));
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "agentchef", "install-receipt.json")));
  assert.ok(fs.existsSync(path.join(state.agentsHome, "skills", "seo", "SKILL.md")), "managed tree under AGENTS_HOME is never touched");
  const nothing = run(state, ["--remove", "--apply"]);
  assert.equal(nothing.outcome.results[0].status, "nothing-installed");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("Claude target refuses to replace a foreign real directory that shadows a managed skill", () => {
  const state = fixture();
  const shadow = path.join(state.claudeHome, "skills", "seo");
  fs.mkdirSync(shadow, { recursive: true });
  fs.writeFileSync(path.join(shadow, "SKILL.md"), "hand copy without marker\n");
  const plan = run(state, ["--dry-run"]);
  const link = plan.plan.actions.find((action) => action.kind === "link-directory").links[0];
  assert.equal(link.decision, "foreign");
  const result = spawnSync(process.execPath, [
    helper, "--claude-home", state.claudeHome, "--agents-home", state.agentsHome, "--home", state.home,
    "--platform", platform, "--skip-plugin-register", "--apply"
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env: fixtureEnv });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /foreign skill paths/);
  assert.equal(fs.readFileSync(path.join(shadow, "SKILL.md"), "utf8"), "hand copy without marker\n");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "rules", "agentchef-working-agreement.md")), "nothing was written");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("an AgentChef-marked copy is adopted into a link only with --adopt-skill-links", () => {
  const state = fixture();
  const copy = path.join(state.claudeHome, "skills", "seo");
  fs.mkdirSync(copy, { recursive: true });
  fs.writeFileSync(path.join(copy, "SKILL.md"), "older managed copy\n");
  fs.writeFileSync(path.join(copy, ".agentchef-managed.json"), "{}\n");
  const plan = run(state, ["--dry-run"]);
  assert.equal(plan.plan.actions.find((action) => action.kind === "link-directory").links[0].decision, "adoptable-copy");
  const adopted = run(state, ["--apply", "--adopt-skill-links"]);
  const linkResult = adopted.outcome.results.find((result) => result.id === "claude-skill-links");
  assert.equal(linkResult.status, "linked");
  assert.ok(fs.lstatSync(copy).isSymbolicLink());
  const backupRoot = adopted.outcome.backupRoot;
  assert.ok(fs.existsSync(path.join(backupRoot, "claude", "skills", "seo", "SKILL.md")), "the replaced copy was backed up first");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("an un-migrated home with legacy marker spellings is still linked and adopted", () => {
  const state = fixture();
  // Managed tree written before 1.0.0: legacy marker on the AGENTS_HOME skill...
  const legacySkill = path.join(state.agentsHome, "skills", "gh-fix-ci");
  fs.mkdirSync(legacySkill, { recursive: true });
  fs.writeFileSync(path.join(legacySkill, "SKILL.md"), "---\nname: gh-fix-ci\ndescription: legacy\n---\n# legacy\n");
  fs.writeFileSync(path.join(legacySkill, ".codex-chef-source.json"), `${JSON.stringify({ schemaVersion: "codex-chef.pinned-skill.v1" })}\n`);
  // ...and a hand-mirrored copy under the Claude home that carries the legacy marker too.
  const copy = path.join(state.claudeHome, "skills", "gh-fix-ci");
  fs.mkdirSync(copy, { recursive: true });
  fs.writeFileSync(path.join(copy, "SKILL.md"), "older mirrored copy\n");
  fs.writeFileSync(path.join(copy, ".codex-chef-source.json"), "{}\n");
  const plan = run(state, ["--dry-run"]);
  const links = Object.fromEntries(plan.plan.actions.find((action) => action.kind === "link-directory").links.map((link) => [link.name, link.decision]));
  assert.equal(links.seo, "create");
  assert.equal(links["gh-fix-ci"], "adoptable-copy", "a legacy-marked copy is adoptable, not foreign");
  const applied = run(state, ["--apply", "--adopt-skill-links"]);
  assert.equal(applied.outcome.results.find((result) => result.id === "claude-skill-links").status, "linked");
  assert.ok(fs.lstatSync(copy).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(applied.outcome.backupRoot, "claude", "skills", "gh-fix-ci", "SKILL.md")));
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a managed directory that is no longer in the catalog is reported as retired and never linked", () => {
  const state = fixture();
  // A skill AgentChef installed before it was retired from catalog/skills.json...
  const retired = path.join(state.agentsHome, "skills", "codex-chef-brain");
  fs.mkdirSync(retired, { recursive: true });
  fs.writeFileSync(path.join(retired, "SKILL.md"), "---\nname: codex-chef-brain\ndescription: retired\n---\n# retired\n");
  fs.writeFileSync(path.join(retired, ".codex-chef-managed.json"), "{}\n");
  // ...and a hand copy of it under the Claude home that carries a marker too.
  const copy = path.join(state.claudeHome, "skills", "codex-chef-brain");
  fs.mkdirSync(copy, { recursive: true });
  fs.writeFileSync(path.join(copy, "SKILL.md"), "hand copy of the retired skill\n");
  fs.writeFileSync(path.join(copy, ".codex-chef-managed.json"), "{}\n");
  const plan = run(state, ["--dry-run"]);
  const links = Object.fromEntries(plan.plan.actions.find((action) => action.kind === "link-directory").links.map((link) => [link.name, link.decision]));
  assert.deepEqual(links, { "codex-chef-brain": "retired", seo: "create" });
  const applied = run(state, ["--apply", "--adopt-skill-links"]);
  assert.equal(applied.outcome.results.find((result) => result.id === "claude-skill-links").status, "linked");
  const copyStat = fs.lstatSync(copy);
  assert.ok(copyStat.isDirectory() && !copyStat.isSymbolicLink(), "the retired copy stays a real directory");
  assert.equal(fs.readFileSync(path.join(copy, "SKILL.md"), "utf8"), "hand copy of the retired skill\n");
  const receipt = readJson(path.join(state.claudeHome, "agentchef", "install-receipt.json"));
  assert.deepEqual(receipt.links.map((link) => path.basename(link.link)), ["seo"], "only the catalog skill is recorded");
  const removed = run(state, ["--remove", "--apply"]);
  assert.ok(removed.outcome.results.some((result) => result.status === "reverted"));
  assert.equal(fs.readFileSync(path.join(copy, "SKILL.md"), "utf8"), "hand copy of the retired skill\n", "removal never touches the retired copy");
  fs.rmSync(state.home, { recursive: true, force: true });
});
