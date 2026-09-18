import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scaledTimeout } from "../lib/test-timeouts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const helper = path.join(root, "scripts", "remove-install.mjs");
const platform = process.platform === "win32" ? "windows" : "unix";

function copyTemplate(relative, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, relative), destination);
}

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-remove-"));
  const codexHome = path.join(home, ".codex");
  const agentsHome = path.join(home, ".agents");
  copyTemplate("templates/codex/AGENTS.md", path.join(codexHome, "AGENTS.md"));
  copyTemplate("templates/codex/codex-profile.mjs", path.join(codexHome, "codex-profile.mjs"));
  copyTemplate("templates/codex/rules/default.rules", path.join(codexHome, "rules", "default.rules"));
  fs.appendFileSync(path.join(codexHome, "rules", "default.rules"), "\n# user addition\n");
  fs.writeFileSync(path.join(codexHome, "config.toml"), "# user config\nmodel = \"x\"\n");
  const pluginTarget = path.join(codexHome, "plugins", "agentchef-workflows");
  copyTemplate("plugins/agentchef-workflows/.codex-plugin/plugin.json", path.join(pluginTarget, ".codex-plugin", "plugin.json"));
  fs.writeFileSync(path.join(pluginTarget, "extra.txt"), "user extra\n");
  const directSkill = path.join(agentsHome, "skills", "context-budget-planner");
  copyTemplate("plugins/agentchef-workflows/skills/context-budget-planner/SKILL.md", path.join(directSkill, "SKILL.md"));
  fs.writeFileSync(path.join(directSkill, ".agentchef-managed.json"), "{}\n");
  const foreignDirect = path.join(agentsHome, "skills", "fetch");
  fs.mkdirSync(foreignDirect, { recursive: true });
  fs.writeFileSync(path.join(foreignDirect, "SKILL.md"), "hand-written fetch skill\n");
  const curated = path.join(agentsHome, "skills", "systematic-debugging");
  fs.mkdirSync(curated, { recursive: true });
  fs.writeFileSync(path.join(curated, "SKILL.md"), "pinned\n");
  fs.writeFileSync(path.join(curated, ".agentchef-source.json"), `${JSON.stringify({ schemaVersion: "agentchef.pinned-skill.v1" })}\n`);
  const userSkill = path.join(agentsHome, "skills", "webapp-testing");
  fs.mkdirSync(userSkill, { recursive: true });
  fs.writeFileSync(path.join(userSkill, "SKILL.md"), "mine\n");
  fs.mkdirSync(path.join(agentsHome, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(agentsHome, "plugins", "marketplace.json"), `${JSON.stringify({ name: "agentchef", plugins: [{ name: "other-plugin" }, { name: "agentchef-workflows" }] }, null, 2)}\n`);
  return { home, codexHome, agentsHome, pluginTarget, directSkill, foreignDirect, curated, userSkill };
}

function run(state, args) {
  const result = spawnSync(process.execPath, [
    helper, "--codex-home", state.codexHome, "--agents-home", state.agentsHome, "--home", state.home, "--platform", platform, "--json", ...args
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(60_000), env: { ...process.env, PATH: path.join(state.home, "no-bin") } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("Codex removal previews ownership decisions and removes only AgentChef-owned content", () => {
  const state = fixture();
  const plan = run(state, ["--dry-run"]);
  assert.equal(plan.dryRunOnly, true);
  const decision = (id) => plan.items.find((item) => item.id === id)?.decision;
  assert.equal(decision("codex-agents-md"), "remove");
  assert.equal(decision("codex-profile-launcher"), "remove");
  assert.equal(decision("codex-rules"), "user-changed");
  assert.equal(decision("codex-serena-pool"), "absent");
  assert.equal(decision("context-budget-planner-direct-skill"), "remove-owned");
  assert.equal(decision("fetch-direct-skill"), "foreign");
  assert.equal(decision("codex-plugin"), "remove-owned");
  assert.equal(decision("plugin-marketplace"), "remove-entry");
  assert.equal(decision("curated-skills:systematic-debugging"), "remove");
  assert.equal(decision("curated-skills:webapp-testing"), "foreign");
  assert.ok(plan.items.every((item) => item.id !== "codex-config" || item.decision === "user-changed"));
  assert.ok(!plan.items.some((item) => item.kind === "generated-config" && item.decision.startsWith("remove")));
  assert.ok(fs.existsSync(path.join(state.codexHome, "AGENTS.md")), "dry run removes nothing");

  const applied = run(state, ["--apply"]);
  const statuses = Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]));
  assert.equal(statuses["codex-agents-md"], "removed");
  assert.equal(statuses["codex-rules"], "user-changed");
  assert.equal(statuses["context-budget-planner-direct-skill"], "removed-owned-files");
  assert.equal(statuses["codex-plugin"], "removed-owned-files");
  assert.equal(statuses["plugin-marketplace"], "entry-removed");
  assert.equal(statuses["curated-skills:systematic-debugging"], "removed");
  assert.equal(statuses["curated-skills:webapp-testing"], "foreign");
  assert.equal(statuses["installed-plugin-cache-refresh"], "skipped", "no codex CLI on PATH in this test");
  assert.ok(!fs.existsSync(path.join(state.codexHome, "AGENTS.md")));
  assert.ok(fs.existsSync(path.join(state.codexHome, "rules", "default.rules")), "user-changed file kept");
  assert.equal(fs.readFileSync(path.join(state.codexHome, "config.toml"), "utf8"), "# user config\nmodel = \"x\"\n");
  assert.ok(!fs.existsSync(path.join(state.pluginTarget, ".codex-plugin", "plugin.json")));
  assert.equal(fs.readFileSync(path.join(state.pluginTarget, "extra.txt"), "utf8"), "user extra\n", "extras inside managed directories are kept");
  assert.ok(!fs.existsSync(state.directSkill), "marker-carrying direct skill removed entirely");
  assert.equal(fs.readFileSync(path.join(state.foreignDirect, "SKILL.md"), "utf8"), "hand-written fetch skill\n");
  assert.ok(!fs.existsSync(state.curated));
  assert.equal(fs.readFileSync(path.join(state.userSkill, "SKILL.md"), "utf8"), "mine\n");
  const marketplace = JSON.parse(fs.readFileSync(path.join(state.agentsHome, "plugins", "marketplace.json"), "utf8"));
  assert.deepEqual(marketplace.plugins.map((plugin) => plugin.name), ["other-plugin"]);
  const backups = fs.readdirSync(path.join(state.codexHome, "backups"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^agentchef-remove-/);
  assert.ok(fs.existsSync(path.join(state.codexHome, "backups", backups[0], ".codex", "AGENTS.md")), "removed files are backed up first");
  assert.ok(!fs.existsSync(path.join(state.codexHome, ".agentchef-operation.lock")));

  const again = run(state, ["--apply"]);
  assert.ok(again.outcome.results.every((result) => !["removed", "removed-owned-files", "entry-removed"].includes(result.status)), JSON.stringify(again.outcome.results));
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("Codex removal recognizes a direct skill that still carries the legacy ownership marker", () => {
  const state = fixture();
  const legacyDirect = path.join(state.agentsHome, "skills", "adaptive-agent-routing");
  copyTemplate("plugins/agentchef-workflows/skills/adaptive-agent-routing/SKILL.md", path.join(legacyDirect, "SKILL.md"));
  fs.writeFileSync(path.join(legacyDirect, ".codex-chef-managed.json"), "{}\n");
  const plan = run(state, ["--dry-run"]);
  assert.equal(plan.items.find((item) => item.id === "adaptive-agent-routing-direct-skill")?.decision, "remove-owned");
  const applied = run(state, ["--apply"]);
  assert.equal(Object.fromEntries(applied.outcome.results.map((result) => [result.id, result.status]))["adaptive-agent-routing-direct-skill"], "removed-owned-files");
  assert.ok(!fs.existsSync(path.join(legacyDirect, ".codex-chef-managed.json")), "the legacy marker is removed with the owned files");
  fs.rmSync(state.home, { recursive: true, force: true });
});

test("Codex removal removes both marker spellings from a partially migrated direct skill", () => {
  const state = fixture();
  const direct = path.join(state.agentsHome, "skills", "adaptive-agent-routing");
  copyTemplate("plugins/agentchef-workflows/skills/adaptive-agent-routing/SKILL.md", path.join(direct, "SKILL.md"));
  fs.writeFileSync(path.join(direct, ".agentchef-managed.json"), "{}\n");
  fs.writeFileSync(path.join(direct, ".codex-chef-managed.json"), "{}\n");
  const plan = run(state, ["--dry-run"]);
  const item = plan.items.find((entry) => entry.id === "adaptive-agent-routing-direct-skill");
  assert.equal(item?.decision, "remove-owned");
  assert.deepEqual(item.files.filter((file) => file.relative.endsWith("-managed.json")).map((file) => file.relative).sort(), [".agentchef-managed.json", ".codex-chef-managed.json"], "both markers are planned for removal");
  run(state, ["--apply"]);
  assert.ok(!fs.existsSync(path.join(direct, ".agentchef-managed.json")));
  assert.ok(!fs.existsSync(path.join(direct, ".codex-chef-managed.json")), "no stale marker is left behind");
  fs.rmSync(state.home, { recursive: true, force: true });
});
