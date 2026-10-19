import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "scripts/team-run.mjs");
const boardCli = path.join(root, "scripts/coordination-board.mjs");
const fakeCodex = path.join(root, "scripts/tests/fixtures/fake-codex/fake-codex.cjs");
const gitCommand = process.platform === "win32" ? "C:/Program Files/Git/mingw64/bin/git.exe" : "git";
function node(file, args, options = {}) { return spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: "utf8", windowsHide: true, ...options }); }
function git(cwd, ...args) { const result = spawnSync(gitCommand, args, { cwd, encoding: "utf8", windowsHide: true }); assert.equal(result.status, 0, result.stderr || result.error?.message); return result.stdout.trim(); }
function initRepo(dir) { fs.mkdirSync(dir, { recursive: true }); git(dir, "init", "-b", "main"); git(dir, "config", "user.name", "AgentChef Test"); git(dir, "config", "user.email", "agentchef-test@example.invalid"); fs.writeFileSync(path.join(dir, "README.md"), "base\n"); git(dir, "add", "README.md"); git(dir, "commit", "-m", "base"); }
function makeRun(temp, runId, workers, extraEnv = {}) {
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo);
  assert.equal(node(boardCli, ["init", "--state", state, "--json"]).status, 0);
  const wrapper = path.join(temp, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex");
  if (process.platform === "win32") fs.writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${fakeCodex}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
  else { fs.writeFileSync(wrapper, `#!/bin/sh\nexec node ${JSON.stringify(fakeCodex)} "$@"\n`); fs.chmodSync(wrapper, 0o755); }
  const isolatedTemp = path.join(temp, "tmp"); fs.mkdirSync(isolatedTemp);
  // Pin the plan-time capacity so this test exercises only the supervisor's run-time memory guard.
  const capacity = path.join(temp, "kapasite.json"); fs.writeFileSync(capacity, JSON.stringify({ v: 1, ts: new Date().toISOString(), onerilen: workers.length, tavan: 8, neden: "test fixture" }));
  const env = { ...process.env, AGENTCHEF_TEAM_MODE: "experimental", AGENTCHEF_TEAM_CODEX_COMMAND: wrapper, FAKE_CODEX_SCENARIO: "ok", FAKE_CODEX_FILE_BY_TASK: "1", AGENTCHEF_TEAM_PANE: "off", TEMP: isolatedTemp, TMP: isolatedTemp, TMPDIR: isolatedTemp, AGENTCHEF_TEAM_RESOURCE_FILE: capacity, ...extraEnv };
  const brief = path.join(temp, "brief.md"); fs.writeFileSync(brief, ["Goal: complete", "Evidence: fixture", "Write scope: src/", "Boundaries: stay in scope", "Done when: collected", "Return format: JSON", "User's words: complete"].join("\n"));
  const plan = path.join(temp, "plan.json"); fs.writeFileSync(plan, JSON.stringify({ workers: workers.map((taskId) => ({ taskId, role: "docs_author", briefFile: "brief.md", writeScope: [`src/${taskId}/`] })) }));
  const planned = node(cli, ["plan", "--state", state, "--json", "--repo", repo, "--plan-file", plan, "--run", runId], { env }); assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  return { state, env, run: JSON.parse(planned.stdout).run };
}
function approveStart(state, run) { const dir = path.join(path.dirname(state), "approvals"); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${run.runId}.baslat.json`), JSON.stringify({ v: 2, taskId: run.runId, runId: run.runId, tur: "baslat", nonce: "test-nonce", approvedAt: new Date().toISOString(), kanal: "sohbet", ajan: "claude", session: "test", kullanildi: "", kullanan: "" })); }
async function waitFinished(state, runId, count) { const until = Date.now() + 15000; while (Date.now() < until) { const result = node(cli, ["status", "--state", state, "--json", "--run", runId]); assert.equal(result.status, 0, result.stderr); const run = JSON.parse(result.stdout).run; if (run.workers.filter((worker) => worker.status === "finished").length === count) return run; await new Promise((resolve) => setTimeout(resolve, 50)); } throw new Error("workers did not finish"); }
async function startRun(state, run, env, count) { approveStart(state, run); const started = node(cli, ["start", "--state", state, "--json", "--run", run.runId], { env }); assert.equal(started.status, 0, started.stderr || started.stdout); await waitFinished(state, run.runId, count); }

test("memory pressure holds one worker at a time and records memory_hold", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-memory-held-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const { state, env, run } = makeRun(temp, "R-memory-held", ["TASK-MEM-1", "TASK-MEM-2"], { AGENTCHEF_TEAM_MIN_FREE_MB: "999999999" });

  await startRun(state, run, env, 2);

  const finalRun = await waitFinished(state, run.runId, 2);
  assert.equal(finalRun.workers.filter((worker) => worker.status === "finished").length, 2);
  assert.ok(finalRun.history.some((item) => item.event === "memory_hold"), "expected supervisor to record a memory_hold event");
});

test("disabling the memory guard suppresses memory_hold under the same reserve", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-memory-off-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const { state, env, run } = makeRun(temp, "R-memory-off", ["TASK-MEM-OFF-1", "TASK-MEM-OFF-2"], {
    AGENTCHEF_TEAM_MIN_FREE_MB: "999999999",
    AGENTCHEF_TEAM_MEMORY_GUARD: "off",
  });

  await startRun(state, run, env, 2);

  const finalRun = await waitFinished(state, run.runId, 2);
  assert.equal(finalRun.workers.filter((worker) => worker.status === "finished").length, 2);
  assert.equal(finalRun.history.some((item) => item.event === "memory_hold"), false);
});
