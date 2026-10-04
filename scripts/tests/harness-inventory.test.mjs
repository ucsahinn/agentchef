import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildHarnessInventory, loadHarnessCatalog } from "../lib/harness-inventory.mjs";
import { formatInventory } from "../harness-inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = loadHarnessCatalog(root);

function kebab(name) {
  return name.replace(/_/g, "-");
}

// A 1.3.0 home with every harness component in place.
function completeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-inventory-"));
  const homes = {
    codexHome: path.join(home, ".codex"),
    agentsHome: path.join(home, ".agents"),
    claudeHome: path.join(home, ".claude"),
    claudeJson: path.join(home, ".claude.json")
  };
  const source = path.join(homes.agentsHome, "plugins", "sources", "agentchef");
  for (const name of catalog.harnessSkills) {
    fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
    fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n`);
  }
  fs.mkdirSync(path.join(source, "agents"), { recursive: true });
  fs.mkdirSync(path.join(homes.codexHome, "agents"), { recursive: true });
  for (const role of catalog.roles) {
    fs.writeFileSync(path.join(source, "agents", `${kebab(role.name)}.md`), "---\n---\n");
    fs.writeFileSync(path.join(homes.codexHome, "agents", `${role.name}.toml`), "");
  }
  fs.mkdirSync(path.join(source, "mcp"), { recursive: true });
  fs.copyFileSync(path.join(root, "plugins", "agentchef", "mcp", "claude.mcp.json"), path.join(source, "mcp", "claude.mcp.json"));
  fs.writeFileSync(path.join(homes.codexHome, "config.toml"), catalog.mcpServers.map((server) => `[mcp_servers.${server.name}]\nenabled = ${server.defaultEnabled === true}\n`).join("\n"));
  fs.writeFileSync(homes.claudeJson, "{}\n");
  return { home, homes };
}

test("a complete home matches the catalog on both targets with no issues", () => {
  const { home, homes } = completeHome();
  try {
    const report = buildHarnessInventory({ repoRoot: root, homes });
    assert.equal(report.installed, true);
    assert.equal(report.complete, true);
    for (const target of ["codex", "claude"]) {
      assert.equal(report.found[target].skills, report.expected.skills);
      assert.equal(report.found[target].agents, report.expected.agents);
    }
    assert.equal(report.found.codex.mcp, report.expected.mcp);
    assert.equal(report.found.claude.mcp, report.expected.claudePluginMcp);
    assert.deepEqual(Object.entries(report.issues).filter(([, count]) => count > 0), []);
    assert.equal(report.expected.agents, report.expected.specialists + report.expected.coordinators);
    assert.match(formatInventory(report), /Issues: none/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("shadowing, leftover copies, retired items, and user items are each classified", () => {
  const { home, homes } = completeHome();
  try {
    const harnessSkill = [...catalog.bundledSkills][0];
    // A direct copy with AgentChef's marker is a 1.2 leftover; one without is the user's own.
    const leftover = path.join(homes.agentsHome, "skills", harnessSkill);
    fs.mkdirSync(leftover, { recursive: true });
    fs.writeFileSync(path.join(leftover, ".agentchef-managed.json"), "{}");
    const shadow = path.join(homes.claudeHome, "skills", harnessSkill);
    fs.mkdirSync(shadow, { recursive: true });
    fs.mkdirSync(path.join(homes.claudeHome, "skills", "my-own-skill"), { recursive: true });
    fs.writeFileSync(path.join(homes.codexHome, "agents", "data_coordinator.toml"), "");
    fs.mkdirSync(path.join(homes.claudeHome, "agents"), { recursive: true });
    fs.writeFileSync(path.join(homes.claudeHome, "agents", "code-reviewer.md"), "");
    fs.writeFileSync(path.join(homes.codexHome, "config.toml"), `${fs.readFileSync(path.join(homes.codexHome, "config.toml"), "utf8")}\n[mcp_servers.memory]\nenabled = false\n\n[mcp_servers.custom]\ncommand = "x"\n`);
    fs.writeFileSync(homes.claudeJson, JSON.stringify({ mcpServers: { serena: { command: "mine" }, github: { type: "http" }, custom: {} } }));
    const report = buildHarnessInventory({ repoRoot: root, homes });
    const find = (kind, name) => report.rows.find((row) => row.kind === kind && row.name === name);
    assert.equal(find("skill", harnessSkill).codex, "migration-pending");
    assert.equal(find("skill", harnessSkill).claude, "shadowed");
    assert.equal(find("skill", "my-own-skill").source, "user");
    assert.equal(find("agent", "data_coordinator").source, "retired");
    assert.equal(find("agent", "data_coordinator").codex, "migration-pending");
    assert.equal(find("agent", "code_reviewer").claude, "shadowed");
    assert.equal(find("mcp", "memory").codex, "migration-pending");
    assert.equal(find("mcp", "custom").codex, "user (enabled)");
    assert.equal(find("mcp", "serena").claude, "shadowed");
    assert.equal(find("mcp", "github").claude, "user-added");
    assert.equal(report.complete, true, "extra and shadowing definitions do not make the harness incomplete");
    assert.ok(report.issues.shadowed >= 3);
    assert.ok(report.issues["migration-pending"] >= 3);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("a missing harness role makes the inventory incomplete", () => {
  const { home, homes } = completeHome();
  try {
    fs.rmSync(path.join(homes.codexHome, "agents", `${catalog.roles[0].name}.toml`));
    const report = buildHarnessInventory({ repoRoot: root, homes, targets: ["codex"] });
    assert.equal(report.complete, false);
    assert.equal(report.issues.missing, 1);
    assert.deepEqual(report.targets, ["codex"]);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
