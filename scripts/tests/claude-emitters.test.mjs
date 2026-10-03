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
  assert.equal(expected, 28);
  // A bare mcp__serena grants a user's own Serena entry's write tools too.
  for (const [fileName, text] of agents) {
    const toolsLine = text.split("\n").find((line) => line.startsWith("tools:")) || "";
    assert.ok(!/\bmcp__serena(,|$)/.test(toolsLine), `${fileName} grants Serena by tool name only`);
    for (const writeTool of ["replace_symbol_body", "write_memory", "rename_symbol", "replace_content", "activate_project"]) {
      assert.ok(!toolsLine.includes(`mcp__serena__${writeTool}`), `${fileName} must not grant ${writeTool}`);
    }
  }
  assert.ok(agents.get("code-mapper.md").includes("mcp__serena__find_symbol"), "code-mapper keeps semantic navigation");
  const coordinatorNames = new Set((catalog.coordinators || []).map((coordinator) => coordinator.name.replace(/_/g, "-")));
  for (const [fileName, text] of agents) {
    assert.match(fileName, /^[a-z0-9-]+\.md$/, "kebab-case file names");
    const fields = frontmatter(text);
    assert.equal(`${fields.name}.md`, fileName);
    assert.ok(fields.description.length > 10, `${fileName} description`);
    assert.doesNotMatch(text, /bypassPermissions|dontAsk|disableAllHooks/);
    // Claude ignores these keys on plugin agents, so emitting them would only mislead.
    for (const ignored of ["permissionMode", "hooks", "mcpServers", "initialPrompt"]) {
      assert.equal(fields[ignored], undefined, `${fileName} must not carry ${ignored}`);
    }
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

test("allow rules that can run code or write files carry an ask guard, or are asked outright", () => {
  const rulesText = fs.readFileSync(path.join(root, "templates", "codex", "rules", "default.rules"), "utf8");
  const { permissions } = emitClaudePermissions(rulesText);
  // Each was measured to run code or write a file through its allow rule.
  for (const [allowed, guard] of [
    ["Bash(rg *)", "Bash(rg *--pre*)"],
    ["Bash(git diff *)", "Bash(git diff *--output*)"],
    ["Bash(git log *)", "Bash(git log *--output*)"],
    ["Bash(git show *)", "Bash(git show *--output*)"]
  ]) {
    assert.ok(permissions.allow.includes(allowed), `${allowed} stays usable`);
    assert.ok(permissions.ask.includes(guard), `${guard} must outrank ${allowed}`);
  }
  for (const demoted of ["Bash(node --check *)", "Bash(git ls-remote *)"]) {
    assert.equal(permissions.allow.includes(demoted), false, `${demoted} must not be auto-allowed`);
    assert.ok(permissions.ask.includes(demoted));
  }
  // npx prefers a matching package in the project's node_modules, so a
  // repository can supply the code a launch runs.
  assert.deepEqual(permissions.allow.filter((rule) => /\bnpx(\.cmd)? /.test(rule)), [], "no npx launch is auto-allowed");
  assert.ok(permissions.ask.includes("Bash(npx.cmd skills list *)"));
  for (const [allowed, guard] of [
    ["Bash(gitleaks detect --redact --no-banner --no-git --verbose *)", "Bash(gitleaks * -r=*)"],
    ["Bash(gitleaks detect --redact --no-banner --no-git --verbose *)", "Bash(gitleaks *--log-opts*)"],
    ["Bash(npm pack --dry-run --json --ignore-scripts *)", "Bash(npm pack *--no-ignore-scripts*)"],
    ["Bash(npm pack --dry-run --json --ignore-scripts *)", "Bash(npm pack *--pack-destination*)"],
    ["Bash(gh config get *)", "Bash(gh config get *token*)"]
  ]) {
    assert.ok(permissions.allow.includes(allowed), `${allowed} stays usable`);
    assert.ok(permissions.ask.includes(guard), `${guard} must outrank ${allowed}`);
  }
});

test("the Claude plugin manifest mirrors the Codex manifest version and lists every agent file", () => {
  const agents = emitClaudeAgents({ catalog, roleDirectory, pluginName: "agentchef" });
  const manifest = renderClaudePluginManifest(root, [...agents.keys()]);
  const codexManifest = JSON.parse(fs.readFileSync(path.join(root, "plugins", "agentchef", ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, codexManifest.name);
  assert.equal(manifest.version, codexManifest.version);
  assert.equal(manifest.agents.length, agents.size);
  assert.deepEqual(manifest.agents, [...manifest.agents].sort());
  assert.ok(manifest.agents.every((entry) => entry.startsWith("./agents/") && entry.endsWith(".md")));
  assert.equal(manifest.skills, "./skills/");
  // One inline SessionEnd hook, in exec form, running the plugin's own script.
  assert.deepEqual(Object.keys(manifest.hooks), ["SessionEnd"]);
  const [hook] = manifest.hooks.SessionEnd.flatMap((group) => group.hooks);
  assert.equal(manifest.hooks.SessionEnd.flatMap((group) => group.hooks).length, 1);
  assert.equal(hook.command, "node");
  assert.deepEqual(hook.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs", "--session-end", "--runtime", "claude"]);
  assert.ok(hook.timeout <= 60);
  // Neither CLI may pick up the other's hook file.
  assert.ok(!fs.existsSync(path.join(root, "plugins", "agentchef", "hooks", "hooks.json")), "Claude would auto-load hooks/hooks.json");
});
