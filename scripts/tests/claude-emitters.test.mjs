import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { emitClaudeAgents } from "../lib/emitters/claude-agents.mjs";
import { emitClaudePermissions, parseCodexRules } from "../lib/emitters/claude-permissions.mjs";
import { renderClaudePluginManifest } from "../render-target-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "agents.json"), "utf8"));
const roleDirectory = path.join(root, "templates", "codex", "agents");
const rulesText = fs.readFileSync(path.join(root, "templates", "codex", "rules", "default.rules"), "utf8");

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "agent file starts with frontmatter");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    fields[key.trim()] = rest.join(":").trim();
  }
  return fields;
}

test("every catalog role becomes a namespaced Claude subagent without permission bypasses", () => {
  const agents = emitClaudeAgents({ catalog, roleDirectory, pluginName: "agentchef" });
  const expected = catalog.agents.length + (catalog.coordinators || []).length;
  assert.equal(agents.size, expected);
  assert.equal(expected, 32);
  const coordinatorNames = new Set((catalog.coordinators || []).map((coordinator) => coordinator.name.replace(/_/g, "-")));
  for (const [fileName, text] of agents) {
    assert.match(fileName, /^[a-z0-9-]+\.md$/, "kebab-case file names");
    const fields = frontmatter(text);
    assert.equal(`${fields.name}.md`, fileName);
    assert.ok(fields.description.length > 10, `${fileName} description`);
    assert.doesNotMatch(text, /bypassPermissions|dontAsk|disableAllHooks/);
    assert.notEqual(fields.permissionMode, "bypassPermissions");
    if (coordinatorNames.has(fields.name)) {
      assert.match(fields.tools || "", /Agent\(agentchef:[a-z0-9-]+/, `${fileName} delegates through the plugin namespace`);
    } else {
      assert.match(fields.tools || "", /Read/, `${fileName} keeps read access`);
    }
  }
  const readOnly = catalog.agents.find((agent) => agent.sandboxMode === "read-only" && !agent.webSearch);
  if (readOnly) {
    const text = agents.get(`${readOnly.name.replace(/_/g, "-")}.md`);
    const fields = frontmatter(text);
    assert.doesNotMatch(fields.tools, /\b(Write|Edit|Bash)\b/);
    assert.match(fields.disallowedTools || "", /Write/);
  }
});

test("Claude permissions are derived from the Codex rules without wildcard grants", () => {
  const parsed = parseCodexRules(rulesText);
  assert.ok(parsed.length > 0);
  const { permissions } = emitClaudePermissions(rulesText);
  assert.ok(permissions.allow.length > 50);
  assert.ok(permissions.ask.length > 50);
  for (const list of ["allow", "ask"]) {
    for (const rule of permissions[list]) {
      assert.match(rule, /^[A-Za-z]+\(.+\)$/, `${list}: ${rule}`);
      assert.notEqual(rule, "Bash(*)");
      assert.notEqual(rule, "*");
    }
  }
  const overlap = permissions.allow.filter((rule) => permissions.ask.includes(rule));
  assert.deepEqual(overlap, [], "a rule is never both allowed and asked");
  assert.ok(permissions.allow.some((rule) => rule.startsWith("Bash(git ")));
  assert.ok(permissions.allow.some((rule) => rule.startsWith("PowerShell(")), "PowerShell cmdlet rules are emitted for Windows hosts");
  assert.ok(!Object.hasOwn(permissions, "deny") || permissions.deny.every((rule) => /^[A-Za-z]+\(.+\)$/.test(rule)));
});

test("the Claude plugin manifest mirrors the Codex manifest version and lists every agent file", () => {
  const agents = emitClaudeAgents({ catalog, roleDirectory, pluginName: "agentchef" });
  const manifest = renderClaudePluginManifest(root, [...agents.keys()]);
  const codexManifest = JSON.parse(fs.readFileSync(path.join(root, "plugins", "agentchef-workflows", ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, codexManifest.name);
  assert.equal(manifest.version, codexManifest.version);
  assert.equal(manifest.agents.length, agents.size);
  assert.deepEqual(manifest.agents, [...manifest.agents].sort());
  assert.ok(manifest.agents.every((entry) => entry.startsWith("./agents/") && entry.endsWith(".md")));
  assert.equal(manifest.skills, "./skills/");
  assert.ok(!Object.hasOwn(manifest, "hooks"), "the Codex-only process-hygiene hook is not published to Claude yet");
});
