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

test("a failed install rolls ~/.claude.json back along with the files under the Claude home", () => {
  const state = fixture();
  const claudeJsonPath = path.join(state.home, ".claude.json");
  const settingsPath = path.join(state.claudeHome, "settings.json");
  const before = { claudeJson: fs.readFileSync(claudeJsonPath, "utf8"), settings: fs.readFileSync(settingsPath, "utf8") };
  // Fail after the settings and MCP merges have written both files.
  const result = spawnSync(process.execPath, [
    helper,
    "--claude-home", state.claudeHome,
    "--agents-home", state.agentsHome,
    "--home", state.home,
    "--platform", platform,
    "--skip-plugin-register",
    "--apply"
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: scaledTimeout(60_000),
    env: { ...fixtureEnv, AGENTCHEF_TEST_MODE: "1", AGENTCHEF_TEST_CLAUDE_FAIL_BEFORE_ACTION: "claude-skill-links" }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Injected Claude install failure before claude-skill-links/);
  assert.doesNotMatch(result.stderr + result.stdout, /Rollback could not restore/);
  assert.equal(fs.readFileSync(claudeJsonPath, "utf8"), before.claudeJson, "~/.claude.json is restored");
  assert.equal(fs.readFileSync(settingsPath, "utf8"), before.settings, "settings.json is restored");
  fs.rmSync(state.home, { recursive: true, force: true });
});

// A stand-in `claude` on an isolated PATH: a .cmd shim on Windows, as npm
// installs it, and an executable script elsewhere. FAKE_CLAUDE_MODE picks what
// the plugin commands return; every call is logged.
function fakeClaude(home, binName = "fake-bin") {
  const bin = path.join(home, binName);
  fs.mkdirSync(bin, { recursive: true });
  const script = path.join(bin, "fake-claude.cjs");
  fs.writeFileSync(script, [
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    "fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(args) + String.fromCharCode(10));",
    "if (args[0] === '--version') { console.log('9.9.9 (Claude Code)'); process.exit(0); }",
    "const mode = process.env.FAKE_CLAUDE_MODE || 'ok';",
    "if (mode === 'notfound') { console.error('Plugin not found in installed plugins'); process.exit(1); }",
    "if (mode === 'fail') { console.error('permission denied'); process.exit(1); }",
    "process.exit(0);",
    ""
  ].join("\n"));
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(bin, "claude.cmd"), `@"${process.execPath}" "%~dp0fake-claude.cjs" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(bin, "claude"), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-claude.cjs" "$@"\n`, { mode: 0o755 });
  }
  return { bin, log: path.join(home, "fake-claude.log") };
}

function runWithCli(fixtureState, args, { bin = null, mode = "ok", log }) {
  const systemDirs = process.platform === "win32" ? [path.join(process.env.SystemRoot || "C:\Windows", "System32")] : ["/usr/bin", "/bin"];
  const env = {
    ...fixtureEnv,
    PATH: [...(bin ? [bin] : []), ...systemDirs].join(path.delimiter),
    FAKE_CLAUDE_MODE: mode,
    FAKE_CLAUDE_LOG: log
  };
  delete env.Path;
  const result = spawnSync(process.execPath, [
    helper,
    "--claude-home", fixtureState.claudeHome,
    "--agents-home", fixtureState.agentsHome,
    "--home", fixtureState.home,
    "--platform", platform,
    "--json",
    ...args
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env });
  return { status: result.status, report: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

test("an npm-installed claude (a .cmd shim on Windows) is found for plugin registration", () => {
  const state = fixture();
  const cli = fakeClaude(state.home);
  const applied = runWithCli(state, ["--apply"], { bin: cli.bin, log: cli.log });
  assert.equal(applied.status, 0, applied.stderr);
  const register = applied.report.outcome.results.find((result) => result.id === "claude-plugin-register");
  assert.equal(register.status, "registered", JSON.stringify(register));
  const calls = fs.readFileSync(cli.log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(calls.map((argv) => argv.slice(0, 2).join(" ")), ["--version", "plugin marketplace", "plugin install"]);
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a claude.cmd shim in a folder with a space is still found and gets its arguments intact", () => {
  // cmd.exe /s /c cut a quoted shim path at its first space, so a shim under
  // a folder with a space (a profile whose user name has one) hid the CLI.
  const state = fixture();
  const cli = fakeClaude(state.home, "fake bin with space");
  const applied = runWithCli(state, ["--apply"], { bin: cli.bin, log: cli.log });
  assert.equal(applied.status, 0, applied.stderr);
  const register = applied.report.outcome.results.find((result) => result.id === "claude-plugin-register");
  assert.equal(register.status, "registered", JSON.stringify(register));
  const calls = fs.readFileSync(cli.log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const marketplaceAdd = calls.find((argv) => argv[0] === "plugin" && argv[1] === "marketplace");
  assert.equal(marketplaceAdd[3], path.join(state.agentsHome, "plugins"), "the path argument arrives as one argument");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("removal fails and keeps its receipt while the plugin may still be registered", () => {
  const state = fixture();
  const cli = fakeClaude(state.home);
  const receiptPath = path.join(state.claudeHome, "agentchef", "install-receipt.json");
  assert.equal(runWithCli(state, ["--apply"], { bin: cli.bin, log: cli.log }).status, 0);

  // The unregister command fails for a real reason.
  const failed = runWithCli(state, ["--remove", "--apply"], { bin: cli.bin, mode: "fail", log: cli.log });
  assert.equal(failed.status, 1, "a removal that left the plugin registered must not exit 0");
  assert.equal(failed.report.outcome.incomplete, true);
  assert.ok(fs.existsSync(receiptPath), "the receipt stays so a rerun retries the unregister step");
  assert.ok(!fs.existsSync(path.join(state.claudeHome, "rules", "agentchef-working-agreement.md")), "owned files were still removed");

  // No CLI at all, but the receipt records a registration.
  const noCli = runWithCli(state, ["--remove", "--apply"], { bin: null, log: cli.log });
  assert.equal(noCli.status, 1);
  assert.ok(fs.existsSync(receiptPath));

  // Claude Code reports an already-removed plugin as "not found": that finishes it.
  const finished = runWithCli(state, ["--remove", "--apply"], { bin: cli.bin, mode: "notfound", log: cli.log });
  assert.equal(finished.status, 0, finished.stderr);
  assert.ok(finished.report.outcome.results.some((result) => result.status === "already-absent"));
  assert.ok(!fs.existsSync(receiptPath));
  assert.deepEqual(readJson(path.join(state.claudeHome, "settings.json")), state.settings, "the user's settings are back after the retries");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("--no-backup refuses to replace an existing settings.json or .claude.json", () => {
  // Creation-only: without a backup a later failure would roll the user's
  // files back by deleting them.
  const state = fixture();
  const result = spawnSync(process.execPath, [
    helper, "--claude-home", state.claudeHome, "--agents-home", state.agentsHome, "--home", state.home,
    "--platform", platform, "--skip-plugin-register", "--json", "--apply", "--no-backup"
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env: fixtureEnv });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /--no-backup only creates missing files/);
  assert.deepEqual(readJson(path.join(state.claudeHome, "settings.json")), state.settings, "nothing was written");
  assert.deepEqual(readJson(path.join(state.home, ".claude.json")), state.claudeJson);
  fs.rmSync(state.home, { recursive: true, force: true });
});

function runRaw(fixtureState, args, extraEnv = {}) {
  return spawnSync(process.execPath, [
    helper,
    "--claude-home", fixtureState.claudeHome,
    "--agents-home", fixtureState.agentsHome,
    "--home", fixtureState.home,
    "--platform", platform,
    "--skip-plugin-register",
    ...args
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env: { ...fixtureEnv, AGENTCHEF_TEST_MODE: "1", ...extraEnv } });
}

test("a failed re-install restores the merge receipt together with the file it describes", () => {
  const state = fixture();
  run(state, ["--apply"]);
  const settingsPath = path.join(state.claudeHome, "settings.json");
  const receiptPath = path.join(state.claudeHome, "agentchef", "receipts", "claude-settings-merge-receipt.json");
  // Drop one AgentChef rule so the next run merges it back and rewrites the receipt.
  const settings = readJson(settingsPath);
  const owned = readJson(receiptPath).entries.find((entry) => entry.kind === "array-item" && entry.pointer === "/permissions/allow");
  settings.permissions.allow = settings.permissions.allow.filter((rule) => rule !== owned.preview);
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  const before = { settings: fs.readFileSync(settingsPath, "utf8"), receipt: fs.readFileSync(receiptPath, "utf8") };
  const failed = runRaw(state, ["--apply"], { AGENTCHEF_TEST_CLAUDE_FAIL_BEFORE_ACTION: "claude-skill-links" });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.readFileSync(settingsPath, "utf8"), before.settings, "settings.json is restored");
  assert.equal(fs.readFileSync(receiptPath, "utf8"), before.receipt, "the receipt is restored with it");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a removal that fails after reverting the receipts restores them, so a rerun still removes AgentChef's entries", () => {
  const state = fixture();
  run(state, ["--apply"]);
  const receiptsDir = path.join(state.claudeHome, "agentchef", "receipts");
  const receiptsBefore = fs.readdirSync(receiptsDir).sort();
  const failed = runRaw(state, ["--remove", "--apply", "--json"], { AGENTCHEF_TEST_CLAUDE_FAIL_REMOVAL_AFTER_RECEIPTS: "1" });
  assert.notEqual(failed.status, 0);
  assert.deepEqual(fs.readdirSync(receiptsDir).sort(), receiptsBefore, "receipts come back with the rollback");
  run(state, ["--remove", "--apply"]);
  const settings = readJson(path.join(state.claudeHome, "settings.json"));
  assert.deepEqual(settings.permissions.allow, state.settings.permissions.allow, "only the user's own rules remain");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("a write to ~/.claude.json between plan and apply is kept, not overwritten", () => {
  const state = fixture();
  const claudeJsonPath = path.join(state.home, ".claude.json");
  const result = runRaw(state, ["--apply", "--json"], { AGENTCHEF_TEST_CLAUDE_TOUCH_BEFORE_MERGE: "claude-mcp-merge" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = readJson(claudeJsonPath);
  assert.equal(after.agentchefTestTouched, true, "the concurrent write survives");
  assert.ok(after.mcpServers.serena, "AgentChef's merge still landed");
  assert.equal(after.mcpServers.context7.command, "custom", "the user's own entry is untouched");
  fs.rmSync(state.home, { recursive: true, force: true });
});
