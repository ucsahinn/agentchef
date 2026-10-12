import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildExecArgs, classifyFailure, parseExecEvent, resolveCodexCommand, spawnCodexExec, stopChild, workerEnv } from "../lib/codex-exec.mjs";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-codex", "fake-codex.cjs");

test("JSONL event parser captures thread, message, usage and failure and ignores malformed lines", () => {
  const result = { threadId: null, usage: null, finalMessage: null, items: [], failure: null };
  assert.equal(parseExecEvent("{bad", result), false);
  for (const event of [
    { type: "thread.started", thread_id: "thr-1" },
    { type: "item.completed", item: { type: "agent_message", text: "done" } },
    { type: "turn.completed", usage: { input_tokens: 5 } }
  ]) assert.equal(parseExecEvent(JSON.stringify(event), result), true);
  assert.deepEqual(result, { threadId: "thr-1", usage: { input_tokens: 5 }, finalMessage: "done", items: [{ type: "agent_message", text: "done" }], failure: null });
  parseExecEvent(JSON.stringify({ type: "turn.failed", message: "rate limit" }), result);
  assert.equal(result.failure.kind, "usage_limit");
  parseExecEvent(JSON.stringify({ type: "error", message: "other problem" }), result);
  assert.equal(result.failure.kind, "exec_failed");
});

test("usage limits classify known quota messages", () => {
  for (const message of ["usage limit", "rate limit", "quota", "too many requests", "429", "weekly limit"]) assert.equal(classifyFailure(message), "usage_limit");
  assert.equal(classifyFailure("invalid prompt"), "exec_failed");
});

test("buildExecArgs uses stdin prompt, resume syntax and never adds approval bypass flags", () => {
  const args = buildExecArgs({ worktree: "C:/work tree", sandbox: "workspace-write", schema: "schema.json", output: "final.json", resumeThreadId: "thr-1", platform: "win32" });
  assert.deepEqual(args, ["exec", "resume", "thr-1", "--json", "-C", "C:/work tree", "-s", "workspace-write", "-m", "gpt-6-luna", "-p", "offline", "--output-schema", "schema.json", "-o", "final.json", "-c", "features.multi_agent=false", "-c", 'approval_policy="never"', "-c", 'windows.sandbox="unelevated"', "--ignore-rules", "-"]);
  assert.equal(args.includes("--approve-for-me"), false);
  assert.equal(args.includes("--full-auto"), false);
});

test("workerEnv sets six team variables, removes BEYIN_CHILD and preserves BEYIN_AGENT", () => {
  const env = workerEnv({ runId: "R1", taskId: "TASK-040", worktree: "wt", role: "developer", boardState: "board" }, { BEYIN_CHILD: "1", BEYIN_AGENT: "claude", KEEP: "yes" });
  assert.equal(Object.hasOwn(env, "BEYIN_CHILD"), false);
  assert.equal(env.BEYIN_AGENT, "claude");
  assert.equal(env.KEEP, "yes");
  assert.deepEqual([env.AGENTCHEF_TEAM_RUN, env.AGENTCHEF_TEAM_TASK, env.AGENTCHEF_TEAM_WORKTREE, env.AGENTCHEF_TEAM_ROLE, env.AGENTCHEF_ROUTING_HINT, env.AGENTCHEF_BOARD_STATE], ["R1", "TASK-040", "wt", "developer", "off", "board"]);
});

test("stopChild signals only the supplied child and requires identity for Windows shims", () => {
  let signalled = 0;
  const child = { pid: 123, kill() { signalled += 1; return true; } };
  assert.equal(stopChild(child, { cmdShim: true, platform: "win32" }), false);
  assert.equal(signalled, 0);
  assert.equal(stopChild(child, { platform: "linux" }), true);
  assert.equal(signalled, 1);
});

test("resolveCodexCommand honors explicit command before Windows PATH lookup", () => {
  assert.equal(resolveCodexCommand({ AGENTCHEF_TEAM_CODEX_COMMAND: "custom-codex" }, "win32"), "custom-codex");
  assert.equal(resolveCodexCommand({ PATH: "" }, "win32"), "codex");
});

test("fake codex spawn captures JSONL, output message, usage, and crash failure", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-exec-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worktree = path.join(root, "worktree");
  const runDir = path.join(root, "run");
  const schema = path.join(root, "schema.json");
  fs.writeFileSync(schema, JSON.stringify({ type: "object" }));
  fs.mkdirSync(worktree);
  const common = { prompt: "## Team rules\nOnly this worktree", worktree, runDir, schema, output: path.join(root, "final.json"), runId: "R-test", taskId: "TASK-040", role: "worker", boardState: "board.json", sandbox: "workspace-write", platform: process.platform };
  const ok = await spawnCodexExec({ ...common, env: { ...process.env, AGENTCHEF_TEAM_CODEX_COMMAND: process.execPath, FAKE_CODEX_SCENARIO: "ok" }, spawnImpl: (command, args, options) => spawn(command, [fixture, ...args], options) });
  assert.equal(ok.exitCode, 0);
  assert.equal(ok.threadId, "fake-thread-1");
  assert.match(ok.finalMessage, /fixture complete/);
  assert.equal(ok.usage.input_tokens, 11);
  assert.match(fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8"), /thread.started/);
  const failed = await spawnCodexExec({ ...common, env: { ...process.env, AGENTCHEF_TEAM_CODEX_COMMAND: process.execPath, FAKE_CODEX_SCENARIO: "crash" }, spawnImpl: (command, args, options) => spawn(command, [fixture, ...args], options) });
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.failure.kind, "exec_failed");
  assert.match(fs.readFileSync(path.join(runDir, "stderr.log"), "utf8"), /simulated crash/);
});
