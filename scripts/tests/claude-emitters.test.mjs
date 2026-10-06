import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
  // Three inline hooks in exec form, each running the plugin's own script: the
  // Agent spawn guard, the SessionEnd hygiene sweep, and the routing hint.
  assert.deepEqual(Object.keys(manifest.hooks), ["PreToolUse", "SessionEnd", "UserPromptSubmit"]);
  const [hint] = manifest.hooks.UserPromptSubmit;
  assert.equal(hint.matcher, undefined, "the prompt-submit event has no matcher");
  assert.deepEqual(hint.hooks.map((entry) => [entry.command, entry.args, entry.timeout]), [["node", ["${CLAUDE_PLUGIN_ROOT}/scripts/routing-hint.mjs"], 10]]);
  const [guard] = manifest.hooks.PreToolUse;
  assert.equal(guard.matcher, "Agent");
  assert.deepEqual(guard.hooks.map((entry) => entry.args), [["${CLAUDE_PLUGIN_ROOT}/scripts/agent-spawn-guard.mjs"]]);
  const [hook] = manifest.hooks.SessionEnd.flatMap((group) => group.hooks);
  assert.equal(manifest.hooks.SessionEnd.flatMap((group) => group.hooks).length, 1);
  assert.equal(hook.command, "node");
  assert.deepEqual(hook.args, ["${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs", "--session-end", "--runtime", "claude"]);
  assert.ok(hook.timeout <= 60);
  // Neither CLI may pick up the other's hook file.
  assert.ok(!fs.existsSync(path.join(root, "plugins", "agentchef", "hooks", "hooks.json")), "Claude would auto-load hooks/hooks.json");
});

test("every role runs on the catalog worker model; the orchestrating session keeps its own", () => {
  assert.equal(catalog.workerModels?.claude, "sonnet");
  assert.equal(catalog.workerModels?.codex, "gpt-6-luna");
  const agents = emitClaudeAgents({ catalog, roleDirectory, pluginName: "agentchef" });
  for (const [fileName, text] of agents) {
    assert.match(text, /^model: sonnet$/m, `${fileName} runs on the worker model`);
  }
  for (const file of fs.readdirSync(roleDirectory).filter((name) => name.endsWith(".toml"))) {
    assert.match(fs.readFileSync(path.join(roleDirectory, file), "utf8"), /^model = "gpt-6-luna"$/m, `${file} runs on the worker model`);
  }
});

test("the Agent spawn guard keeps coordinators to their workers and workers from spawning", async () => {
  const { decide } = await import(new URL("../../plugins/agentchef/scripts/agent-spawn-guard.mjs", import.meta.url));
  const call = (caller, target) => decide({ tool_name: "Agent", agent_type: caller, tool_input: { subagent_type: target } });
  assert.equal(decide({ tool_name: "Agent", tool_input: { subagent_type: "general-purpose" } }), null, "main session is never blocked");
  assert.equal(call("Explore", "general-purpose"), null, "a user's own agent is not ours to police");
  assert.equal(call("agentchef:qa-coordinator", "agentchef:test-verifier"), null);
  assert.match(call("agentchef:qa-coordinator", "test-verifier"), /use the full agentchef: name/, "a bare name resolves to a user agent first");
  assert.equal(call("plugin_agentchef_qa-coordinator", "agentchef:test-verifier"), null);
  assert.match(call("plugin_agentchef_qa-coordinator", "general-purpose"), /may spawn only/);
  assert.match(call("plugin:agentchef:qa-coordinator", "general-purpose"), /may spawn only/);
  assert.match(decide({ tool_name: "Task", agent_type: "agentchef:code-reviewer", tool_input: { subagent_type: "x" } }), /is a worker/);
  assert.match(call("agentchef:qa-coordinator", "general-purpose"), /may spawn only agentchef:qa-lead/);
  assert.match(call("agentchef:qa-coordinator", "agentchef:ui-coordinator"), /outside its workers/);
  assert.match(call("agentchef:code-reviewer", "agentchef:code-mapper"), /is a worker and never spawns/);
  assert.match(call("agentchef:no-such-role", "general-purpose"), /no agent file/, "an AgentChef-named caller without a file fails closed");
  assert.equal(call("other-plugin:qa-coordinator", "general-purpose"), null, "another plugin is not ours");
  assert.equal(decide({ tool_name: "Bash", agent_type: "agentchef:code-reviewer" }), null);
  const script = path.join(root, "plugins", "agentchef", "scripts", "agent-spawn-guard.mjs");
  const denied = spawnSync(process.execPath, [script], { input: JSON.stringify({ tool_name: "Agent", agent_type: "agentchef:ui-coordinator", tool_input: { subagent_type: "fork" } }), encoding: "utf8" });
  assert.equal(denied.status, 2, "exit code 2 blocks the call");
  assert.match(denied.stderr, /may spawn only agentchef:frontend-verifier/);
  const garbage = spawnSync(process.execPath, [script], { input: "not json", encoding: "utf8" });
  assert.deepEqual([garbage.status, garbage.stdout], [0, ""]);
});
