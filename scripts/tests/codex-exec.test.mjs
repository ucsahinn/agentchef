import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as codexRuntime from '../lib/codex-exec.mjs';
const { buildExecArgs, buildViewerPaneArgs, classifyFailure, isProcessAlive, parseExecEvent, processCreatedAt, resolveCodexCommand, spawnCodexExec, stopChild, workerEnv } = codexRuntime;

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
  parseExecEvent(JSON.stringify({ type: "error", message: `ghp_${"x".repeat(36)}` }), result);
  assert.doesNotMatch(result.failure.message, /ghp_/);
});

test("usage limits classify known quota messages", () => {
  for (const message of ["usage limit", "rate limit", "quota", "too many requests", "429", "weekly limit"]) assert.equal(classifyFailure(message), "usage_limit");
  assert.equal(classifyFailure("invalid prompt"), "exec_failed");
});

test("buildExecArgs uses stdin prompt, resume syntax and never adds approval bypass flags", () => {
  const args = buildExecArgs({ worktree: "C:/work tree", sandbox: "workspace-write", profile: "full", schema: "schema.json", output: "final.json", resumeThreadId: "thr-1", platform: "win32" });
  assert.deepEqual(args, ["exec", "resume", "thr-1", "--json", "-m", "gpt-6-luna", "--output-schema", "schema.json", "-o", "final.json", "-c", "features.multi_agent=false", "-c", "approval_policy=never", "-c", "sandbox_mode=workspace-write", "-c", "profile=full", "-c", "windows.sandbox=unelevated", "--ignore-rules", "-"]);
  assert.equal(args.includes("--approve-for-me"), false);
  assert.equal(args.includes("--full-auto"), false);
});

test("Windows app execution aliases resolve when stat is denied", async () => {
  const { resolveWindowsCli } = await import("../lib/platform-command.mjs");
  const fileSystem = { statSync() { const error = new Error("denied"); error.code = "EACCES"; throw error; }, lstatSync() { return { isSymbolicLink: () => true }; } };
  assert.equal(resolveWindowsCli("wt", { PATH: "C:/WindowsApps;D:/Tools" }, fileSystem, "win32"), path.win32.join("C:/WindowsApps", "wt.exe"));
});

test("viewer pane argv does not contain shell command separators", () => {
  const args = buildViewerPaneArgs({ root: "C:/agentchef", state: "C:/state/board.json", worktree: "C:/work tree", runId: "R-test", taskId: "TASK-045" });
  assert.deepEqual(args, ["-w", "0", "new-tab", "--title", "R-test TASK-045", "node", path.join("C:/agentchef", "scripts", "team-run.mjs"), "watch", "--run", "R-test", "--task", "TASK-045", "--state", "C:/state/board.json"]);
  assert.equal(args.some((value) => value.includes(";")), false);
});

test('worker process profile parks MCPs including a valid disabled node_repl transport and binds live capacity', () => {
  const args = buildExecArgs({ worktree: 'repo', sandbox: 'workspace-write', schema: 'schema', output: 'final', workerConfig: true, maxWorkers: 3 });
  assert.ok(args.includes('mcp_servers.node_repl.enabled=false'));
  assert.ok(args.includes('mcp_servers.node_repl.command=node'));
  assert.ok(args.includes('agents.max_threads=3'));
  assert.ok(args.includes('agents.max_depth=1'));
  assert.throws(() => buildExecArgs({ workerConfig: true, maxWorkers: 9 }), /cap/);
});

test('role templates preserve interactive agent capacity; only worker argv bounds nesting and threads', () => {
  const roles = new URL('../../templates/codex/agents/', import.meta.url);
  const files = fs.readdirSync(roles).filter(file => file.endsWith('.toml'));
  assert.equal(files.length, 28);
  for (const file of files) assert.doesNotMatch(fs.readFileSync(new URL(file, roles), 'utf8'), /^\[agents\]/m, file);
  const ordinary = buildExecArgs({ worktree: 'repo', sandbox: 'read-only', schema: 'schema', output: 'final' });
  assert.equal(ordinary.some(arg => /^agents\.max_(depth|threads)=/.test(arg)), false);
  for (const resumeThreadId of [undefined, 'thread-fixture']) {
    const worker = buildExecArgs({ worktree: 'repo', sandbox: 'workspace-write', schema: 'schema', output: 'final', workerConfig: true, maxWorkers: 4, resumeThreadId });
    for (const value of ['agents.max_depth=1', 'agents.max_threads=4']) assert.equal(worker[worker.indexOf(value) - 1], '-c');
  }
});

test('worker profile validators use the runtime table and reject missing transport, enabled MCPs and global leakage', () => {
  assert.equal(typeof codexRuntime.workerMcpOverrides, 'function');
  assert.equal(typeof codexRuntime.assertWorkerMcpBoundary, 'function');
  const template = fs.readFileSync(new URL('../../templates/codex/profiles/team-worker.config.toml', import.meta.url), 'utf8');
  const overrides = codexRuntime.workerMcpOverrides(template);
  assert.ok(overrides.includes('mcp_servers.node_repl.enabled=false'));
  assert.ok(overrides.includes('mcp_servers.node_repl.command=node'));
  assert.throws(() => codexRuntime.workerMcpOverrides(template.replace('enabled = false', 'enabled = true')), /park/);
  assert.throws(() => codexRuntime.workerMcpOverrides(template.replace('command = "node"', '')), /transport/);
  assert.throws(() => codexRuntime.assertWorkerMcpBoundary(['[mcp_servers.node_repl]\nenabled = false']), /global/);
  const configs = ['windows', 'unix'].map(platform => fs.readFileSync(new URL(`../../templates/codex/config.${platform}.toml`, import.meta.url), 'utf8'));
  assert.doesNotThrow(() => codexRuntime.assertWorkerMcpBoundary(configs));
});

test("viewer pane launches the AgentChef watcher with the board state", () => {
  const args = buildViewerPaneArgs({ worktree: "C:/worker", runId: "R-test", taskId: "TASK-045", root: "C:/agentchef", state: "C:/state/board.json" });
  assert.ok(args.includes(path.join("C:/agentchef", "scripts", "team-run.mjs")));
  assert.deepEqual(args.slice(-6), ["--run", "R-test", "--task", "TASK-045", "--state", "C:/state/board.json"]);
  assert.ok(args.includes("--state"));
  assert.ok(args.includes("C:/state/board.json"));
});

test("workerEnv filters secret-like names, preserves Codex runtime vars and honors explicit allowlist", () => {
  const env = workerEnv({ runId: "R1", taskId: "TASK-040", worktree: "wt", role: "developer", boardState: "board" }, { BEYIN_CHILD: "1", BEYIN_AGENT: "claude", KEEP: "yes", GH_TOKEN: "fake-gh", AWS_SECRET_ACCESS_KEY: "fake-aws", OPENAI_API_KEY: "fake-openai", CODEX_HOME: "codex-home" });
  assert.equal(Object.hasOwn(env, "BEYIN_CHILD"), false);
  assert.equal(env.BEYIN_AGENT, "claude");
  assert.equal(env.KEEP, "yes");
  assert.equal(Object.hasOwn(env, "GH_TOKEN"), false);
  assert.equal(Object.hasOwn(env, "AWS_SECRET_ACCESS_KEY"), false);
  assert.equal(env.OPENAI_API_KEY, "fake-openai");
  assert.equal(env.CODEX_HOME, "codex-home");
  const allowed = workerEnv({ runId: "R1", taskId: "TASK-040", worktree: "wt", role: "developer", boardState: "board" }, { GH_TOKEN: "fake-gh", AGENTCHEF_TEAM_WORKER_ENV_ALLOW: "GH_TOKEN" });
  assert.equal(allowed.GH_TOKEN, "fake-gh");
  assert.deepEqual([env.AGENTCHEF_TEAM_RUN, env.AGENTCHEF_TEAM_TASK, env.AGENTCHEF_TEAM_WORKTREE, env.AGENTCHEF_TEAM_ROLE, env.AGENTCHEF_ROUTING_HINT, env.AGENTCHEF_BOARD_STATE], ["R1", "TASK-040", "wt", "developer", "off", "board"]);
});

test("stopChild signals only the supplied child and requires identity for Windows shims", () => {
  let signalled = 0;
  const child = { pid: 123, kill() { signalled += 1; return true; } };
  assert.equal(stopChild(child, { cmdShim: true, platform: "win32" }), false);
  assert.equal(signalled, 0);
  assert.equal(stopChild(child, { platform: "linux" }), false, "POSIX process termination requires a matching creation identity");
  assert.equal(signalled, 0);
});

test("processCreatedAt reads a POSIX process start identity", () => {
  if (process.platform === "win32") return;
  const identity = processCreatedAt(process.pid);
  assert.equal(typeof identity, "string"); assert.ok(identity.length > 0);
  assert.equal(processCreatedAt(2147483000), null);
});

test("process aliveness treats POSIX zombies as stopped", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(2147483000), false);
  assert.equal(isProcessAlive(process.pid, "win32"), true);
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

test("stdin EPIPE is handled and streamed JSONL is visible before child close", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-epipe-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worktree = path.join(root, "worktree"), runDir = path.join(root, "run"), schema = path.join(root, "schema.json");
  fs.mkdirSync(worktree); fs.writeFileSync(schema, "{}");
  const child = new EventEmitter(); child.pid = 9; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.kill = () => true;
  child.stdin.end = () => child.stdin.emit("error", Object.assign(new Error("closed"), { code: "EPIPE" }));
  const execution = spawnCodexExec({ prompt: "prompt", worktree, runDir, schema, output: path.join(root, "final.json"), runId: "R-epipe", taskId: "TASK-040", role: "worker", boardState: "board", sandbox: "workspace-write", spawnImpl: () => { setImmediate(() => { child.stdout.emit("data", JSON.stringify({ type: "thread.started", thread_id: "thr-stream" }) + "\n"); setTimeout(() => child.emit("close", 0, null), 50); }); return child; } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(fs.readFileSync(path.join(runDir, "events.jsonl"), "utf8"), /thread.started/);
  const result = await execution;
  assert.equal(result.exitCode, 0);
  assert.equal(result.threadId, "thr-stream");
});
