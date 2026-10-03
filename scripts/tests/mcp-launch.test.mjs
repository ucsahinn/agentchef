import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { launchPlan } from "../../plugins/agentchef/scripts/mcp-launch.mjs";
import { renderClaudePluginMcp } from "../render-target-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("the plugin MCP launcher runs npx.cmd through cmd.exe on Windows and npx elsewhere", () => {
  const windows = launchPlan(["@playwright/mcp@0.0.83", "--isolated"], "win32");
  assert.equal(windows.command, "cmd.exe");
  assert.deepEqual(windows.args, ["/d", "/s", "/c", "npx.cmd", "-y", "@playwright/mcp@0.0.83", "--isolated"]);
  assert.equal(windows.env.NoDefaultCurrentDirectoryInExePath, "1", "cmd.exe must not resolve npx from the project folder");
  const unix = launchPlan(["@upstash/context7-mcp@4.1.1"], "linux");
  assert.equal(unix.command, "npx");
  assert.deepEqual(unix.args, ["-y", "@upstash/context7-mcp@4.1.1"]);
});

test("the plugin MCP launcher accepts only an exact version and plain arguments", () => {
  for (const pkg of ["@playwright/mcp", "@playwright/mcp@latest", "@playwright/mcp@^0.0.83", "chrome-devtools-mcp@1", "", "../evil@1.0.0"]) {
    assert.throws(() => launchPlan([pkg], "linux"), /exact package version/, pkg);
  }
  for (const arg of ["--x=a&b", "a|b", "$(id)", "a;b", "`id`"]) {
    assert.throws(() => launchPlan(["chrome-devtools-mcp@1.10.1", arg], "win32"), /shell syntax/, arg);
  }
});

test("every npx server the plugin ships is pinned to an exact version the launcher accepts", () => {
  const rendered = renderClaudePluginMcp(root);
  const committed = JSON.parse(fs.readFileSync(path.join(root, "plugins", "agentchef", "mcp", "claude.mcp.json"), "utf8"));
  assert.deepEqual(committed, rendered);
  assert.deepEqual(Object.keys(rendered.mcpServers).sort(), ["context7", "playwright", "serena"]);
  for (const [name, server] of Object.entries(rendered.mcpServers)) {
    assert.equal(server.command, "node", `${name} starts through node on every platform`);
    if (name === "serena") {
      assert.deepEqual(server.args.slice(1), ["bridge", "--project-root", "${CLAUDE_PROJECT_DIR}"]);
      continue;
    }
    assert.equal(server.args[0], "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-launch.mjs");
    assert.doesNotThrow(() => launchPlan(server.args.slice(1), "win32"), name);
  }
  const bridge = fs.readFileSync(path.join(root, "plugins", "agentchef", "scripts", "serena-pool.mjs"), "utf8");
  const template = fs.readFileSync(path.join(root, "templates", "codex", "serena-pool.mjs"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(bridge.replace(/\r\n/g, "\n"), template, "the plugin bridge is byte-identical so it shares the pool manager");
});
