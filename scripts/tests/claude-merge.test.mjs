import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { planSettingsMerge } from "../lib/claude-settings-merge.mjs";
import { buildClaudeMcpEntry, claudeDefaultServers, claudePluginServers, planMcpMerge } from "../lib/claude-mcp-merge.mjs";
import {
  createReceipt,
  getAtPointer,
  pointerFor,
  readReceipt,
  receiptSchemaVersion,
  removeRecordedEntries,
  valueSha256,
  writeReceipt
} from "../lib/json-merge-receipt.mjs";

const mcpCatalog = JSON.parse(fs.readFileSync(new URL("../../catalog/mcp-servers.json", import.meta.url), "utf8"));

test("settings merge appends missing rules, keeps user content, and lets a stricter list win", () => {
  const current = {
    permissions: { allow: ["Bash(ls *)"], deny: ["Bash(gh pr list *)"] },
    hooks: { SessionEnd: [{ hooks: [{ type: "command", command: "echo user" }] }] },
    theme: "dark"
  };
  const fragment = {
    permissions: { allow: ["Bash(gh pr list *)", "Bash(git status *)", "Bash(ls *)"], ask: ["Bash(git push *)"] },
    hooks: { SessionEnd: [{ matcher: "other", hooks: [{ type: "command", command: "echo user" }, { type: "command", command: "echo agentchef" }] }] }
  };
  const plan = planSettingsMerge(current, fragment);
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.next.permissions.allow, ["Bash(ls *)", "Bash(git status *)"], "denied rule is never re-added below deny");
  assert.deepEqual(plan.next.permissions.deny, ["Bash(gh pr list *)"]);
  assert.deepEqual(plan.next.permissions.ask, ["Bash(git push *)"]);
  assert.equal(plan.next.theme, "dark");
  assert.equal(plan.next.hooks.SessionEnd.length, 2, "user hook group untouched; only the new handler is appended");
  assert.deepEqual(plan.next.hooks.SessionEnd[1].hooks.map((handler) => handler.command), ["echo agentchef"]);
  assert.deepEqual(plan.skipped.map((entry) => entry.reason).sort(), ["already-present", "stricter-list-wins"]);
  assert.equal(plan.entries.filter((entry) => entry.kind !== "container").length, 3);
  assert.deepEqual(plan.entries.filter((entry) => entry.kind === "container").map((entry) => entry.pointer), ["/permissions/ask"], "only the new ask list is a created container");
  assert.deepEqual(current.permissions.allow, ["Bash(ls *)"], "input document is not mutated");
});

test("settings merge is idempotent and reports no change on the second pass", () => {
  const fragment = { permissions: { allow: ["Bash(git status *)"] } };
  const first = planSettingsMerge({}, fragment);
  const second = planSettingsMerge(first.next, fragment);
  assert.equal(second.changed, false);
  assert.deepEqual(second.next, first.next);
});

test("settings merge refuses to overwrite a non-object permissions key", () => {
  assert.throws(() => planSettingsMerge({ permissions: [] }, { permissions: { allow: ["Bash(ls *)"] } }), /must be an object/);
});

test("containers created by a merge are pruned on removal only while they are empty", () => {
  const merge = planSettingsMerge({ theme: "dark" }, { permissions: { allow: ["Bash(git status *)"] }, env: { AGENTCHEF_TEST: "1" } });
  assert.deepEqual(merge.entries.filter((entry) => entry.kind === "container").map((entry) => entry.pointer), ["/permissions", "/permissions/allow", "/env"]);
  const receipt = createReceipt({ product: { name: "agentchef", version: "0.9.0" }, target: "/opt/agentchef-home/.claude/settings.json", beforeSha256: null, afterSha256: "b".repeat(64), entries: merge.entries });
  const pristine = removeRecordedEntries(receipt, merge.next);
  assert.deepEqual(pristine.next, { theme: "dark" });
  const userFilled = structuredClone(merge.next);
  userFilled.permissions.allow.push("Bash(ls *)");
  userFilled.env.MINE = "yes";
  const partial = removeRecordedEntries(receipt, userFilled);
  assert.deepEqual(partial.next, { theme: "dark", permissions: { allow: ["Bash(ls *)"] }, env: { MINE: "yes" } });
  assert.deepEqual(partial.kept.map((entry) => entry.reason), ["user-content", "user-content", "user-content"]);
});

test("MCP merge writes no user entry by default and retires only what this install wrote for plugin servers", () => {
  const options = { platform: "windows", claudeHome: "C:\\Claude" };
  assert.deepEqual(claudeDefaultServers, []);
  assert.deepEqual(claudePluginServers(mcpCatalog).sort(), ["context7", "serena"]);

  // Nothing to write and nothing recorded: a user's own entry is kept and
  // reported as shadowing the plugin's server.
  const current = { mcpServers: { context7: { type: "stdio", command: "custom" } }, numStartups: 4 };
  const plan = planMcpMerge(current, mcpCatalog, options);
  assert.equal(plan.changed, false);
  assert.deepEqual(plan.next, current);
  assert.deepEqual(plan.shadowing.map((entry) => [entry.name, entry.reason]), [["context7", "user-owned"]]);

  // An entry a 1.2 install wrote, still exactly as written, is retired.
  const written = planMcpMerge({ numStartups: 4 }, mcpCatalog, { ...options, serverNames: ["context7", "serena"] });
  const recorded = written.entries;
  const retired = planMcpMerge(written.next, mcpCatalog, { ...options, previousEntries: recorded });
  assert.equal(retired.changed, true);
  assert.deepEqual(Object.keys(retired.next.mcpServers), []);
  assert.deepEqual(retired.retired.map((entry) => entry.pointer).sort(), ["/mcpServers/context7", "/mcpServers/serena"]);
  assert.equal(retired.next.numStartups, 4);

  // Once edited it is the user's: kept and reported, unless adopted.
  const edited = structuredClone(written.next);
  edited.mcpServers.serena.args.push("--verbose");
  const kept = planMcpMerge(edited, mcpCatalog, { ...options, previousEntries: recorded });
  assert.ok(kept.next.mcpServers.serena, "an edited entry stays");
  assert.deepEqual(kept.shadowing.map((entry) => [entry.name, entry.reason]), [["serena", "user-modified"]]);
  const adopted = planMcpMerge(edited, mcpCatalog, { ...options, previousEntries: recorded, adopt: true });
  assert.ok(!adopted.next.mcpServers.serena, "--adopt-mcp retires it");
  assert.deepEqual(adopted.shadowing, []);

  // A server the plugin does not ship is never touched.
  const other = planMcpMerge({ mcpServers: { github: { type: "http", url: "https://example.test" } } }, mcpCatalog, { ...options, adopt: true });
  assert.equal(other.changed, false);
  assert.ok(other.next.mcpServers.github);
});

test("MCP entries use the Windows cmd wrapper and the plain npx form on unix", () => {
  const context7 = mcpCatalog.servers.find((server) => server.name === "context7");
  const windows = buildClaudeMcpEntry(context7, { platform: "windows", claudeHome: "C:\\Claude" });
  assert.equal(windows.command, "cmd.exe");
  assert.deepEqual(windows.args.slice(0, 5), ["/d", "/s", "/c", "npx.cmd", "-y"]);
  const unix = buildClaudeMcpEntry(context7, { platform: "unix", claudeHome: "/opt/agentchef-home/.claude" });
  assert.equal(unix.command, "npx");
  assert.deepEqual(unix.args.slice(0, 1), ["-y"]);
  assert.throws(() => planMcpMerge({ mcpServers: [] }, mcpCatalog, { platform: "unix", claudeHome: "/x" }), /must be an object/);
});

test("receipts round-trip and only remove the entries they recorded", () => {
  const original = { mcpServers: { user: { type: "http", url: "https://example.test" } }, permissions: { allow: ["Bash(ls *)"] } };
  const mcpPlan = planMcpMerge(original, mcpCatalog, { platform: "unix", claudeHome: "/opt/agentchef-home/.claude", serverNames: ["context7", "serena"] });
  const settingsPlan = planSettingsMerge(mcpPlan.next, { permissions: { allow: ["Bash(git status *)"] } });
  const merged = settingsPlan.next;
  const entries = [...mcpPlan.entries, ...settingsPlan.entries];
  const receipt = createReceipt({
    product: { name: "agentchef", version: "0.9.0" },
    target: "/opt/agentchef-home/.claude/.claude.json",
    beforeSha256: "a".repeat(64),
    afterSha256: "b".repeat(64),
    entries
  });
  assert.equal(receipt.schemaVersion, receiptSchemaVersion);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-receipt-"));
  const receiptPath = path.join(dir, "receipt.json");
  writeReceipt(receiptPath, receipt);
  const loaded = readReceipt(receiptPath);
  assert.deepEqual(loaded.entries, entries);
  assert.equal(getAtPointer(merged, pointerFor(["mcpServers", "user", "url"])), "https://example.test");

  const userEdited = structuredClone(merged);
  userEdited.mcpServers.serena.args.push("--verbose");
  const removal = removeRecordedEntries(loaded, userEdited);
  assert.deepEqual(removal.next.permissions.allow, ["Bash(ls *)"], "recorded rule removed");
  assert.deepEqual(removal.next.mcpServers.user, original.mcpServers.user, "user server untouched");
  assert.ok(removal.next.mcpServers.serena, "user-changed managed entry is kept");
  assert.equal(removal.removed.length + removal.kept.length, entries.length);
  assert.equal(removal.kept.length, 1);
  assert.ok(!Object.hasOwn(removal.next.mcpServers, "context7"));

  const pristine = removeRecordedEntries(loaded, merged);
  assert.deepEqual(pristine.next, original);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an MCP entry is refreshed only while it still matches the receipt", () => {
  const catalog = {
    servers: [
      { name: "context7", transport: "stdio", package: "@upstash/context7-mcp@9.9.9" },
      { name: "serena", transport: "stdio", package: "ignored" }
    ]
  };
  const options = { platform: "unix", claudeHome: "/opt/agentchef-home/.claude", serverNames: ["context7"] };

  // First install: the entry is created and recorded.
  const fresh = planMcpMerge({}, catalog, options);
  assert.equal(fresh.changed, true);
  const recorded = fresh.entries.filter((entry) => entry.kind === "object-key");
  assert.equal(recorded.length, 1);
  const installed = fresh.next;

  // Without the flag an existing entry is never touched, exactly as before.
  const older = { servers: [{ name: "context7", transport: "stdio", package: "@upstash/context7-mcp@1.0.0" }] };
  const untouched = planMcpMerge(installed, older, { ...options, previousEntries: recorded });
  assert.equal(untouched.changed, false);
  assert.equal(untouched.skipped[0].reason, "already-present");

  // With the flag, and the value still matching the receipt, it is refreshed.
  const refreshed = planMcpMerge(installed, older, { ...options, previousEntries: recorded, refresh: true });
  assert.equal(refreshed.changed, true);
  assert.match(refreshed.entries[0].preview, /refreshed/);
  assert.deepEqual(refreshed.next.mcpServers.context7.args, ["-y", "@upstash/context7-mcp@1.0.0"]);

  // Re-running against the same catalog has nothing to do.
  const again = planMcpMerge(refreshed.next, older, { ...options, previousEntries: refreshed.entries, refresh: true });
  assert.equal(again.changed, false);
  assert.equal(again.skipped[0].reason, "current");

  // A user edit no longer matches the recorded hash, so it is left alone.
  const edited = structuredClone(installed);
  edited.mcpServers.context7.env = { MY_KEY: "1" };
  const respected = planMcpMerge(edited, older, { ...options, previousEntries: recorded, refresh: true });
  assert.equal(respected.changed, false);
  assert.equal(respected.skipped[0].reason, "user-modified");
  assert.deepEqual(respected.next.mcpServers.context7.env, { MY_KEY: "1" });

  // An entry AgentChef never wrote is not its to refresh either.
  const foreign = { mcpServers: { context7: { type: "stdio", command: "my-own-thing" } } };
  const kept = planMcpMerge(foreign, older, { ...options, previousEntries: [], refresh: true });
  assert.equal(kept.changed, false);
  assert.equal(kept.skipped[0].reason, "already-present");
  assert.equal(kept.next.mcpServers.context7.command, "my-own-thing");
});

test("an update retires only the permission rules this install added and no longer wants", () => {
  const before = { permissions: { allow: ["Bash(npx -y demo-mcp@1.0.0 *)"], ask: [], deny: ["Bash(rm *)"] } };
  const oldFragment = { permissions: { allow: ["Bash(npx -y demo-mcp@1.0.0 *)"] } };
  const first = planSettingsMerge(before, oldFragment);
  assert.equal(first.changed, false, "the rule is already there");

  // Pretend AgentChef wrote it, then the pin moves.
  const owned = [{ kind: "array-item", pointer: "/permissions/allow", valueSha256: valueSha256("Bash(npx -y demo-mcp@1.0.0 *)"), preview: "Bash(npx -y demo-mcp@1.0.0 *)" }];
  const newFragment = { permissions: { allow: ["Bash(npx -y demo-mcp@2.0.0 *)"] } };

  // Without the flag the old rule stays, exactly as before.
  const additive = planSettingsMerge(before, newFragment, { previousEntries: owned });
  assert.deepEqual(additive.next.permissions.allow, ["Bash(npx -y demo-mcp@1.0.0 *)", "Bash(npx -y demo-mcp@2.0.0 *)"]);
  assert.equal((additive.retired || []).length, 0);

  // With the flag the superseded rule is taken back.
  const retiring = planSettingsMerge(before, newFragment, { previousEntries: owned, retire: true });
  assert.deepEqual(retiring.next.permissions.allow, ["Bash(npx -y demo-mcp@2.0.0 *)"]);
  assert.equal(retiring.retired.length, 1);
  assert.equal(retiring.retired[0].preview, "Bash(npx -y demo-mcp@1.0.0 *)");
  assert.deepEqual(retiring.next.permissions.deny, ["Bash(rm *)"], "deny is never touched");

  // A rule the user wrote has no record, so it survives a retire pass.
  const withUserRule = { permissions: { allow: ["Bash(npx -y demo-mcp@1.0.0 *)", "Bash(my-own-tool *)"], deny: [] } };
  const kept = planSettingsMerge(withUserRule, newFragment, { previousEntries: owned, retire: true });
  assert.ok(kept.next.permissions.allow.includes("Bash(my-own-tool *)"), "user rules are never retired");
  assert.ok(!kept.next.permissions.allow.includes("Bash(npx -y demo-mcp@1.0.0 *)"));

  // A duplicate of an owned rule belongs to whoever added the second copy.
  const duplicated = { permissions: { allow: ['Bash(npx -y demo-mcp@1.0.0 *)', 'Bash(npx -y demo-mcp@1.0.0 *)'], deny: [] } };
  const oneLeft = planSettingsMerge(duplicated, newFragment, { previousEntries: owned, retire: true });
  assert.deepEqual(oneLeft.next.permissions.allow.filter((rule) => rule.includes('1.0.0')).length, 1, 'only one occurrence is taken back');
  assert.equal(oneLeft.retired.length, 1);

  // A rule still wanted by the fragment is never retired.
  const stillWanted = planSettingsMerge(before, oldFragment, { previousEntries: owned, retire: true });
  assert.deepEqual(stillWanted.next.permissions.allow, ["Bash(npx -y demo-mcp@1.0.0 *)"]);
  assert.equal(stillWanted.retired.length, 0);
});

test("the claude CLI is pointed at a Claude home only when it is really relocated", async () => {
  const { claudeCliEnv } = await import("../lib/targets/claude.mjs");
  const home = process.platform === "win32" ? "D:\tools\home" : "/opt/agentchef-home";
  const defaultHome = `${home}${process.platform === "win32" ? "\\" : "/"}.claude`;
  // Forcing CLAUDE_CONFIG_DIR to the default home makes Claude Code read
  // ~/.claude/.claude.json instead of ~/.claude.json.
  const plain = claudeCliEnv(defaultHome, { env: { PATH: "x" }, home });
  assert.equal("CLAUDE_CONFIG_DIR" in plain, false);
  assert.equal(plain.PATH, "x");
  const relocated = claudeCliEnv(`${home}${process.platform === "win32" ? "\\" : "/"}other-claude`, { env: { PATH: "x" }, home });
  assert.ok(relocated.CLAUDE_CONFIG_DIR.endsWith("other-claude"));
  const explicit = claudeCliEnv(defaultHome, { env: { PATH: "x", CLAUDE_CONFIG_DIR: defaultHome }, home });
  assert.equal(explicit.CLAUDE_CONFIG_DIR, defaultHome, "a user-set variable is kept");
});

test("a rule AgentChef moves from ask to allow lands in allow in one run", () => {
  const rule = "Bash(git ls-files *)";
  const first = planSettingsMerge({}, { permissions: { ask: [rule] } });
  const second = planSettingsMerge(first.next, { permissions: { allow: [rule] } }, { previousEntries: first.entries, retire: true });
  assert.deepEqual(second.next.permissions.ask, [], "the old ask copy is retired");
  assert.deepEqual(second.next.permissions.allow, [rule], "the rule is allowed in the same run");
});

test("a user's own ask rule still wins over an AgentChef allow", () => {
  const rule = "Bash(git ls-files *)";
  const plan = planSettingsMerge({ permissions: { ask: [rule] } }, { permissions: { allow: [rule] } }, { previousEntries: [], retire: true });
  assert.deepEqual(plan.next.permissions.ask, [rule]);
  assert.equal(plan.next.permissions.allow?.includes(rule) ?? false, false);
});
