import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isProcessAlive, processCreatedAt } from "../lib/codex-exec.mjs";
import { approvalIsValid, updateRunRecord } from "../lib/team-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "team-run.mjs");
const boardCli = path.join(root, "scripts", "coordination-board.mjs");
const fakeCodex = path.join(root, "scripts", "tests", "fixtures", "fake-codex", "fake-codex.cjs");
const scale = Number(process.env.AGENTCHEF_TEST_TIMEOUT_SCALE || 1);
const scaledTimeout = (ms) => Math.ceil(ms * scale);

function runNode(file, args, options = {}) {
  return spawnSync(process.execPath, [file, ...args], { encoding: "utf8", timeout: scaledTimeout(30_000), ...options, windowsHide: true });
}
function runCli(state, command, args = [], env = {}) {
  const result = runNode(cli, [command, "--state", state, "--json", ...args], { env: { ...process.env, ...env } });
  let json;
  try { json = JSON.parse(result.stdout); } catch { /* report captured below */ }
  return { ...result, json };
}
function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: scaledTimeout(30_000), windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}
function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.name", "AgentChef Test");
  git(dir, "config", "user.email", "agentchef-test@example.invalid");
  fs.writeFileSync(path.join(dir, "README.md"), "base\n");
  git(dir, "add", "README.md"); git(dir, "commit", "-m", "base");
}
function writeBoard(state) {
  const result = runNode(boardCli, ["init", "--state", state, "--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const brief = [
  "Goal: Complete the fixture task.", "Evidence: Test handoff.", "Write scope: src/",
  "Boundaries: Do not touch other files.", "Done when: The report is attached.",
  "Return format: JSON.", "User's words: Complete this task."
].join("\n");
function fixtureCommand(dir) {
  const windows = process.platform === "win32";
  const wrapper = path.join(dir, windows ? "fake-codex.cmd" : "fake-codex");
  if (windows) fs.writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${fakeCodex}" %*\r\nexit /b %ERRORLEVEL%\r\n`);
  else { fs.writeFileSync(wrapper, `#!/bin/sh\nexec node ${JSON.stringify(fakeCodex)} "$@"\n`); fs.chmodSync(wrapper, 0o755); }
  return { command: wrapper };
}
function validApproval(state, runId, tur, plannedAt) {
  const dir = path.join(path.dirname(state), "approvals"); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${runId}.${tur}.json`);
  const approval = { v: 2, taskId: runId, runId, tur, nonce: "test-nonce", approvedAt: new Date().toISOString(), kanal: "sohbet", ajan: "claude", session: "test", kullanildi: "", kullanan: "" };
  assert.ok(approvalIsValid(approval, { runId, tur, plannedAt, now: new Date().toISOString() }), JSON.stringify({ approval, plannedAt }));
  fs.writeFileSync(file, JSON.stringify(approval));
  return file;
}
function planRun({ temp, state, repo, runId, scenario = "ok", role = "docs_author", workers, maxWorkers, planArgs = [], extraEnv = {}, allowFailure = false }) {
  const planPath = path.join(temp, "plan.json"), briefPath = path.join(temp, "brief.md");
  fs.writeFileSync(briefPath, brief);
  fs.writeFileSync(planPath, JSON.stringify({ workers: workers || [{ taskId: "TASK-043", role, briefFile: "brief.md", writeScope: ["src/"], checks: ["node --version"] }] }));
  const isolatedTemp = path.join(temp, "os-temp"); fs.mkdirSync(isolatedTemp, { recursive: true });
  const codex = fixtureCommand(temp);
  const env = { AGENTCHEF_TEAM_MODE: "experimental", AGENTCHEF_TEAM_CODEX_COMMAND: codex.command, FAKE_CODEX_SCENARIO: scenario, AGENTCHEF_TEAM_PANE: "off", TEMP: isolatedTemp, TMP: isolatedTemp, TMPDIR: isolatedTemp, AGENTCHEF_TEAM_RESOURCE_FILE: path.join(temp, "no-capacity.json"), ...(maxWorkers ? { AGENTCHEF_TEAM_MAX_WORKERS: String(maxWorkers) } : {}), ...extraEnv };
  const loginProbe = spawnSync(process.execPath, [fakeCodex, "login", "status"], { encoding: "utf8", env, windowsHide: true });
  assert.equal(loginProbe.status, 0, loginProbe.error?.message || loginProbe.stderr || loginProbe.stdout);
  const planned = runCli(state, "plan", ["--repo", repo, "--plan-file", planPath, "--run", runId, ...planArgs], env);
  if (!allowFailure) assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  return { env, run: planned.json?.run, planPath, planned };
}
function finalHandoff(verdict = "pass", changedScope = ["src/change.txt"], claimedPaths = ["src/change.txt"]) {
  return { outcome: "fixture completed", evidence: ["fixture check passed"], changedScope, risks: [], openQuestions: [], needs: [], nextVerification: "integration verification", verdict, mutationCheck: { claimedPaths, outsideScope: [] } };
}
async function waitForWorker(state, runId) {
  const deadline = Date.now() + scaledTimeout(15_000);
  while (Date.now() < deadline) {
    const status = runCli(state, "status", ["--run", runId]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    if (["finished", "failed", "paused_limit", "timed_out", "aborted"].includes(status.json.run.workers[0].status)) return status.json.run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("worker did not finish before timeout");
}
async function waitForAllWorkers(state, runId) {
  const deadline = Date.now() + scaledTimeout(15_000);
  while (Date.now() < deadline) {
    const status = runCli(state, "status", ["--run", runId]);
    assert.equal(status.status, 0, status.stderr || status.stdout);
    if (status.json.run.workers.every((worker) => ["finished", "failed", "paused_limit", "timed_out", "aborted"].includes(worker.status))) return status.json.run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("all workers did not finish before timeout");
}
async function waitForRunStatus(state, runId, expected) {
  const deadline = Date.now() + scaledTimeout(15_000);
  while (Date.now() < deadline) {
    const result = runCli(state, "status", ["--run", runId]);
    if (result.json?.run.status === expected) return result.json.run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run did not reach ${expected}`);
}
async function waitForSupervisorStopped(state, runId) {
  const deadline = Date.now() + scaledTimeout(15_000);
  const lockFile = path.join(path.dirname(state), "team-runs", runId, "supervisor.lock");
  const recordFile = path.join(path.dirname(state), "team-runs", `${runId}.json`);
  while (Date.now() < deadline) {
    const run = JSON.parse(fs.readFileSync(recordFile, "utf8")), pid = run.supervisor?.pid;
    let alive = false;
    if (Number.isInteger(pid)) {
      alive = isProcessAlive(pid) && (!run.supervisor.createdAt || processCreatedAt(pid) === run.supervisor.createdAt);
    }
    if (!fs.existsSync(lockFile) && !alive) {
      if (process.platform === "win32" && Number.isInteger(pid)) {
        const task = spawnSync("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8", timeout: 5000, windowsHide: true });
        assert.equal(task.status, 0, task.stderr || "tasklist failed");
        if (task.stdout.includes(`,\"${pid}\"`)) assert.notEqual(processCreatedAt(pid), run.supervisor.createdAt, `supervisor PID ${pid} still identifies the test run`);
      }
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("supervisor did not exit before test cleanup");
}

test("team run completes plan, collect, integrate, verify, and approved merge", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-full-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-task043-full";
  initRepo(repo); writeBoard(state);
  const { env } = planRun({ temp, state, repo, runId });
  const denied = runCli(state, "start", ["--run", runId], env); assert.equal(denied.status, 3);
  validApproval(state, runId, "baslat", runCli(state, "status", ["--run", runId]).json.run.plannedAt);
  const started = runCli(state, "start", ["--run", runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  const hookDir = path.join(temp, "hooks"), hookMarker = path.join(temp, "merge-hook-ran"); fs.mkdirSync(hookDir);
  const hook = path.join(hookDir, "pre-merge-commit"); fs.writeFileSync(hook, `#!/bin/sh\nprintf ran > '${hookMarker.replace(/\\/g, "/")}'\n`); fs.chmodSync(hook, 0o755);
  git(repo, "config", "core.hooksPath", hookDir);
  let run = await waitForWorker(state, runId);
  const collected = runCli(state, "collect", ["--run", runId], env); assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  const integrated = runCli(state, "integrate", ["--run", runId, "--check", "node --version", "--check", "node --version"], env); assert.equal(integrated.status, 0, integrated.stderr || integrated.stdout);
  assert.equal(fs.existsSync(hookMarker), false, "engine integration must not execute repository merge hooks");
  assert.equal(integrated.json.checks.length, 2);
  assert.match(fs.readFileSync(path.join(path.dirname(state), "team-runs", runId, "integration.diff"), "utf8"), /worker output/);
  assert.match(fs.readFileSync(path.join(path.dirname(state), "team-runs", runId, "integration.stat"), "utf8"), /change\.txt/);
  const verified = runCli(state, "verify", ["--run", runId], env); assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  const mergeDenied = runCli(state, "merge", ["--run", runId], env); assert.equal(mergeDenied.status, 3);
  run = runCli(state, "status", ["--run", runId]).json.run;
  validApproval(state, runId, "birlestir", run.plannedAt);
  const merged = runCli(state, "merge", ["--run", runId], env); assert.equal(merged.status, 0, merged.stderr || merged.stdout);
  assert.equal(git(repo, "branch", "--show-current"), "main");
  assert.match(git(repo, "log", "-1", "--pretty=%P"), /\S+ \S+/);
  assert.ok(git(repo, "branch", "--list", "takim/R-task043-full").length);
  assert.ok(git(repo, "branch", "--list", "takim/R-task043-full-TASK-043").length);
  assert.ok(!git(repo, "worktree", "list", "--porcelain").includes(run.worktreeRoot));
  assert.equal(runCli(state, "status", ["--run", runId], env).status, 0, "status remains available after merge cleanup removes worker worktrees");
  const stateJson = JSON.parse(fs.readFileSync(state, "utf8"));
  assert.equal(stateJson.tasks[0].status, "review");
  assert.ok(stateJson.tasks[0].evidence.some((entry) => /verified-by: test_verifier - pass/.test(entry.text || entry)));
  assert.ok(stateJson.tasks[0].reports?.length || stateJson.tasks[0].reportId);
  const approval = JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.birlestir.json`), "utf8"));
  assert.ok(approval.kullanildi);
  const startApproval = JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.baslat.json`), "utf8"));
  assert.ok(startApproval.kullanildi);
  const runRecord = JSON.parse(fs.readFileSync(path.join(path.dirname(state), "team-runs", `${runId}.json`), "utf8"));
  assert.ok(runRecord.approvals.start.consumedAt && runRecord.approvals.merge.consumedAt);
});

test("start rejects approvals with wrong type, no nonce, consumed, stale, or pre-plan timestamps", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-invalid-approval-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"); initRepo(repo);
  for (const [index, mutate] of [
    (a) => ({ ...a, tur: "birlestir" }),
    (a) => ({ ...a, nonce: "" }),
    (a) => ({ ...a, kullanildi: new Date().toISOString() }),
    (a) => ({ ...a, approvedAt: new Date(Date.now() - 8 * 86400000).toISOString() }),
    (a, plannedAt) => ({ ...a, approvedAt: new Date(Date.parse(plannedAt) - 1000).toISOString() })
  ].entries()) {
    const caseDir = path.join(temp, `case-${index}`); fs.mkdirSync(caseDir); const state = path.join(caseDir, "board.json"); writeBoard(state);
    const { env, run } = planRun({ temp: caseDir, state, repo, runId: `R-invalid-approval-${index}` });
    const file = validApproval(state, run.runId, "baslat", run.plannedAt);
    fs.writeFileSync(file, JSON.stringify(mutate(JSON.parse(fs.readFileSync(file, "utf8")), run.plannedAt)));
    assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 3, `invalid approval case ${index}`);
    assert.equal(runCli(state, "status", ["--run", run.runId], env).json.run.status, "planned");
  }
});

test("simultaneous starts serialize and leave a valid run record", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-racing-start-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-racing-start", scenario: "slow" });
  validApproval(state, run.runId, "baslat", run.plannedAt);
  const start = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "start", "--state", state, "--json", "--run", run.runId], { env: { ...process.env, ...env }, windowsHide: true });
    const timer = setTimeout(() => child.kill(), scaledTimeout(30_000)); let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; }); child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); resolve({ status: code, stdout, stderr }); });
  });
  const [a, b] = await Promise.all([start(), start()]);
  const statuses = [a.status, b.status].sort((x, y) => x - y);
  assert.deepEqual(statuses, [0, 1]);
  const record = runCli(state, "status", ["--run", run.runId], env);
  assert.equal(record.status, 0, record.stderr || record.stdout); assert.equal(record.json.run.status, "running");
  assert.equal(record.json.run.workers.length, 1);
  assert.ok(["spawning", "running"].includes(record.json.run.workers[0].status), `worker should be spawning or running after start, got ${record.json.run.workers[0].status}`);
  assert.equal(runCli(state, "abort", ["--run", run.runId, "--reason", "race test complete"], env).status, 0);
  await waitForSupervisorStopped(state, run.runId);
});

test("base merge conflict preserves verified state and does not consume approval", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-base-conflict-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-base-conflict" });
  validApproval(state, run.runId, "baslat", run.plannedAt); assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  await waitForWorker(state, run.runId); assert.equal(runCli(state, "collect", ["--run", run.runId], env).status, 0);
  assert.equal(runCli(state, "integrate", ["--run", run.runId], env).status, 0);
  await waitForSupervisorStopped(state, run.runId);
  env.FAKE_CODEX_SCENARIO = "verifier-pass";
  assert.equal(runCli(state, "verify", ["--run", run.runId], env).status, 0);
  fs.mkdirSync(path.join(repo, "src"), { recursive: true }); fs.writeFileSync(path.join(repo, "src", "change.txt"), "base branch edit\n");
  git(repo, "add", "src/change.txt"); git(repo, "commit", "-m", "base branch conflicting edit");
  validApproval(state, run.runId, "birlestir", run.plannedAt);
  const result = runCli(state, "merge", ["--run", run.runId], env);
  assert.notEqual(result.status, 0);
  assert.equal(runCli(state, "status", ["--run", run.runId], env).json.run.status, "verified");
  const approval = JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${run.runId}.birlestir.json`), "utf8"));
  assert.equal(approval.kullanildi, "");
});

test("status tolerates an unstarted worker and abort finalizes a planned run", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-planned-abort-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-planned-abort" });
  const status = runCli(state, "status", ["--run", run.runId], env); assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.deepEqual(status.json.warnings, []);
  const aborted = runCli(state, "abort", ["--run", run.runId, "--reason", "cancel before start"], env);
  assert.equal(aborted.status, 0, aborted.stderr || aborted.stdout);
  assert.equal(runCli(state, "status", ["--run", run.runId], env).json.run.status, "aborted");
});

test("start rollback preserves pre-existing branches, restores task state, and skips checkout hooks", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-start-rollback-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-start-rollback"; initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId });
  const branch = `takim/${runId}-TASK-043`; git(repo, "branch", branch);
  const hookDir = path.join(temp, "hooks"), marker = path.join(temp, "post-checkout-marker"); fs.mkdirSync(hookDir);
  const hook = path.join(hookDir, "post-checkout"); fs.writeFileSync(hook, `#!/bin/sh\nprintf ran > '${marker.replace(/\\/g, "/")}'\n`); fs.chmodSync(hook, 0o755); git(repo, "config", "core.hooksPath", hookDir);
  validApproval(state, runId, "baslat", run.plannedAt);
  const result = runCli(state, "start", ["--run", runId], env);
  assert.notEqual(result.status, 0);
  const current = runCli(state, "status", ["--run", runId], env).json.run;
  assert.equal(current.status, "planned"); assert.equal(current.workers[0].status, "planned");
  assert.equal(current.workers[0].worktree, null);
  assert.equal(git(repo, "branch", "--list", `takim/${runId}`).length, 0);
  assert.equal(git(repo, "branch", "--list", branch), branch, "pre-existing worker branch remains untouched");
  assert.equal(fs.existsSync(path.join(repo, ".agentchef-worktrees", runId, "_integration")), false);
  assert.equal(fs.existsSync(marker), false, "worktree creation does not execute post-checkout hooks");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].status, "todo");
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.baslat.json`), "utf8")).kullanildi, "");
});

test("start rollback clears stale controls, preserves approval, and permits retry", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-heartbeat-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-heartbeat-fail"; initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId });
  const guard = path.join(temp, "fail-supervisor.cjs"), marker = path.join(temp, "failed-once"); fs.writeFileSync(guard, `const fs=require("node:fs"); if (process.argv[1]?.endsWith("team-run.mjs") && process.argv[2] === "supervise" && !fs.existsSync(${JSON.stringify(marker)})) { fs.writeFileSync(${JSON.stringify(marker)}, "once"); process.exit(29); }\n`);
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${guard}`].filter(Boolean).join(" ");
  validApproval(state, runId, "baslat", run.plannedAt);
  const control = path.join(path.dirname(state), "team-runs", runId, "control"); fs.mkdirSync(control, { recursive: true }); fs.writeFileSync(path.join(control, "abort.json"), JSON.stringify({ runId, reason: "stale abort" }));
  const result = runCli(state, "start", ["--run", runId], env);
  assert.notEqual(result.status, 0); assert.match(result.stderr + result.stdout, /startup heartbeat/);
  const current = runCli(state, "status", ["--run", runId], env).json.run;
  assert.equal(current.status, "planned"); assert.equal(current.workers[0].status, "planned");
  assert.equal(git(repo, "branch", "--list", `takim/${runId}`), "");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].status, "todo");
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.baslat.json`), "utf8")).kullanildi, "");
  assert.equal(fs.existsSync(path.join(control, "abort.json")), false);
  const retry = runCli(state, "start", ["--run", runId], env); assert.equal(retry.status, 0, retry.stderr || retry.stdout);
  assert.equal((await waitForWorker(state, runId)).workers[0].status, "finished");
  await waitForSupervisorStopped(state, runId);
});

test("start recovers an orphaned lock and retries successfully", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-stale-lock-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-stale-lock"; initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId });
  const lock = path.join(path.dirname(state), "team-runs", runId, "start.lock"); fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, JSON.stringify({ pid: 2147483000, createdAt: "2000-01-01T00:00:00.000Z", nonce: "orphan" }));
  validApproval(state, runId, "baslat", run.plannedAt);
  const started = runCli(state, "start", ["--run", runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  assert.equal(fs.existsSync(lock), false);
  await waitForWorker(state, runId); await waitForSupervisorStopped(state, runId);
});

test("collect detects actual outside-scope mutations and leaves the card out of review", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-scope-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-scope", scenario: "outside-scope" });
  validApproval(state, run.runId, "baslat", run.plannedAt);
  const started = runCli(state, "start", ["--run", run.runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  await waitForWorker(state, run.runId);
  const result = runCli(state, "collect", ["--run", run.runId], env); assert.equal(result.status, 4);
  assert.equal(result.json.run.workers[0].status, "scope_violation");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].status, "todo");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].leaseUntil, null);
  await waitForSupervisorStopped(state, run.runId);
});

test("read-only workers collect a report without a commit or write scope", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-readonly-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-team-readonly", role: "code_mapper", scenario: "read-only" });
  assert.deepEqual(run.workers[0].writeScope, []);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].writeScope, null);
  validApproval(state, run.runId, "baslat", run.plannedAt);
  const started = runCli(state, "start", ["--run", run.runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  await waitForWorker(state, run.runId);
  const collected = runCli(state, "collect", ["--run", run.runId], env);
  assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  assert.equal(collected.json.run.workers[0].status, "collected");
  assert.equal(collected.json.run.workers[0].commit, null);
  assert.match(fs.readFileSync(path.join(path.dirname(state), "team-runs", run.runId, "reports", "TASK-043-code_mapper.md"), "utf8"), /read-only worker/);
  await waitForSupervisorStopped(state, run.runId);
});

test("two read-only workers share no write scopes or leases and run with a concurrency cap", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-readonly-multi-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const workers = ["TASK-051", "TASK-052"].map((taskId, index) => ({ taskId, role: index ? "docs_researcher" : "code_mapper", briefFile: "brief.md", checks: [] }));
  const { env, run } = planRun({ temp, state, repo, runId: "R-readonly-multi", scenario: "read-only", workers, maxWorkers: 1 });
  assert.equal(run.maxWorkers, 1); assert.ok(run.workers.every((worker) => worker.writeScope.length === 0));
  assert.ok(JSON.parse(fs.readFileSync(state, "utf8")).tasks.every((task) => task.writeScope === null && task.leaseUntil === null));
  validApproval(state, run.runId, "baslat", run.plannedAt); assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  const completed = await waitForAllWorkers(state, run.runId); assert.ok(completed.workers.every((worker) => worker.status === "finished"));
  const collected = runCli(state, "collect", ["--run", run.runId], env); assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  await waitForSupervisorStopped(state, run.runId);
});

test("status keeps complete NUL-delimited rename paths including spaces", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-status-rename-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo);
  fs.writeFileSync(path.join(repo, "README with space.md"), "tracked\n"); git(repo, "add", "README with space.md"); git(repo, "commit", "-m", "add spaced path"); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-status-rename", scenario: "slow" });
  validApproval(state, run.runId, "baslat", run.plannedAt); const started = runCli(state, "start", ["--run", run.runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  const startedRun = runCli(state, "status", ["--run", run.runId], env).json.run, worktree = startedRun.workers[0].worktree;
  fs.renameSync(path.join(worktree, "README with space.md"), path.join(worktree, "README renamed with space.md"));
  git(worktree, "add", "-A");
  const status = runCli(state, "status", ["--run", run.runId], env);
  assert.deepEqual(status.json.warnings[0].outsideScope, ["README renamed with space.md", "README with space.md"]);
  assert.equal(runCli(state, "abort", ["--run", run.runId, "--reason", "status test complete"], env).status, 0);
  await waitForSupervisorStopped(state, run.runId);
});

test("missing and invalid handoffs fail collection and settle the finished worker", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-handoff-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"); initRepo(repo);
  for (const [index, scenario] of ["no-handoff", "invalid-handoff"].entries()) {
    const caseDir = path.join(temp, `case-${index}`); fs.mkdirSync(caseDir); const state = path.join(caseDir, "board.json"); writeBoard(state);
    const { env, run } = planRun({ temp: caseDir, state, repo, runId: `R-handoff-${index}`, scenario });
    validApproval(state, run.runId, "baslat", run.plannedAt);
    assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
    await waitForWorker(state, run.runId);
    const collected = runCli(state, "collect", ["--run", run.runId], env);
    assert.equal(collected.status, 4);
    assert.equal(collected.json.run.workers[0].status, "failed");
    assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].leaseUntil, null, "uncollectable worker releases its write lease");
    await waitForSupervisorStopped(state, run.runId);
  }
});

test("usage limits pause the run and abort reaches a slow worker", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-control-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"); initRepo(repo);
  const limitedTemp = path.join(temp, "limited"); fs.mkdirSync(limitedTemp); const limitedState = path.join(limitedTemp, "board.json"); writeBoard(limitedState);
  const limited = planRun({ temp: limitedTemp, state: limitedState, repo, runId: "R-usage-limit", scenario: "usage-limit" });
  validApproval(limitedState, limited.run.runId, "baslat", limited.run.plannedAt);
  assert.equal(runCli(limitedState, "start", ["--run", limited.run.runId], limited.env).status, 0);
  const pausedWorker = await waitForWorker(limitedState, limited.run.runId);
  assert.equal(pausedWorker.status, "paused"); assert.equal(pausedWorker.workers[0].status, "paused_limit");
  assert.equal(runCli(limitedState, "collect", ["--run", limited.run.runId], limited.env).status, 4);
  assert.equal(runCli(limitedState, "status", ["--run", limited.run.runId]).json.run.status, "collected");
  await waitForSupervisorStopped(limitedState, limited.run.runId);
  const slowTemp = path.join(temp, "slow"); fs.mkdirSync(slowTemp); const slowState = path.join(slowTemp, "board.json"); writeBoard(slowState);
  const slow = planRun({ temp: slowTemp, state: slowState, repo, runId: "R-abort-slow", scenario: "slow" });
  validApproval(slowState, slow.run.runId, "baslat", slow.run.plannedAt);
  assert.equal(runCli(slowState, "start", ["--run", slow.run.runId], slow.env).status, 0);
  const abort = runCli(slowState, "abort", ["--run", slow.run.runId, "--reason", "test abort"], slow.env);
  assert.equal(abort.status, 0, abort.stderr || abort.stdout);
  const aborted = await waitForRunStatus(slowState, slow.run.runId, "aborted");
  assert.equal(aborted.workers[0].status, "aborted");
  const abortedTask = JSON.parse(fs.readFileSync(slowState, "utf8")).tasks[0];
  assert.equal(abortedTask.status, "todo"); assert.equal(abortedTask.leaseUntil, null);
  await waitForSupervisorStopped(slowState, slow.run.runId);
});

test("supervisor renews the worker lease through the imported coordination helper", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-lease-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-lease-renew", scenario: "slow" });
  validApproval(state, run.runId, "baslat", run.plannedAt);
  assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  const file = path.join(path.dirname(state), "team-runs", `${run.runId}.json`);
  const initialLease = JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].leaseUntil;
  updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((worker) => ({ ...worker, leaseRenewedAt: new Date(Date.now() - 21 * 60_000).toISOString() })) }));
  const deadline = Date.now() + scaledTimeout(15_000);
  let renewed = false;
  while (Date.now() < deadline) {
    const current = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Date.parse(current.workers[0].leaseRenewedAt) > Date.now() - 10 * 60_000) { renewed = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(renewed, true, "the supervisor tick should record a lease renewal");
  assert.ok(Date.parse(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].leaseUntil) > Date.parse(initialLease));
  assert.equal(runCli(state, "abort", ["--run", run.runId, "--reason", "finish lease test"], env).status, 0);
  await waitForRunStatus(state, run.runId, "aborted");
  await waitForSupervisorStopped(state, run.runId);
});

test("timed-out workers release their card lease during collection", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-timeout-lease-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-timeout-lease", scenario: "slow" });
  env.AGENTCHEF_TEAM_IDLE_KILL_MINUTES = "0.001";
  validApproval(state, run.runId, "baslat", run.plannedAt); assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  const timedOut = await waitForWorker(state, run.runId);
  assert.equal(timedOut.workers[0].status, "timed_out");
  assert.equal(runCli(state, "collect", ["--run", run.runId], env).status, 4);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].leaseUntil, null);
  await waitForSupervisorStopped(state, run.runId);
});

test("integrate records real worker merge conflicts and merge refuses a conflicted run", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-conflict-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-conflict", scenario: "conflict" });
  validApproval(state, run.runId, "baslat", run.plannedAt);
  assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  await waitForWorker(state, run.runId);
  fs.mkdirSync(path.join(run.integrationWorktree, "src"), { recursive: true });
  fs.writeFileSync(path.join(run.integrationWorktree, "src", "conflict.txt"), "integration edit\n");
  git(run.integrationWorktree, "add", "src/conflict.txt"); git(run.integrationWorktree, "commit", "-m", "integration edit");
  const collected = runCli(state, "collect", ["--run", run.runId], env); assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  const result = runCli(state, "integrate", ["--run", run.runId], env); assert.equal(result.status, 4);
  assert.equal(result.json.run.workers[0].status, "conflict"); assert.deepEqual(result.json.conflicts, ["src/conflict.txt"]);
  validApproval(state, run.runId, "birlestir", run.plannedAt);
  const rejected = runCli(state, "merge", ["--run", run.runId], env); assert.notEqual(rejected.status, 0);
});

test("failed independent verifier can be retried and doctor emits JSON checks", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-verify-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-verifier", scenario: "verifier-blocked" });
  const integration = run.integrationWorktree; git(repo, "worktree", "add", "-b", run.integrationBranch, integration);
  fs.writeFileSync(path.join(integration, "src.txt"), "integration\n"); git(integration, "add", "src.txt"); git(integration, "commit", "-m", "integrated change");
  const recordPath = path.join(path.dirname(state), "team-runs", `${run.runId}.json`), record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  fs.mkdirSync(run.worktreeRoot, { recursive: true }); fs.writeFileSync(path.join(run.worktreeRoot, "TASK-043.prompt.md"), brief);
  record.status = "integrated"; record.workers[0].status = "integrated"; record.integration = { merged: [record.workers[0].taskId], conflicts: [], checks: [], ok: true }; fs.writeFileSync(recordPath, JSON.stringify(record));
  const verified = runCli(state, "verify", ["--run", run.runId], env); assert.equal(verified.status, 4, verified.stderr || verified.stdout);
  assert.equal(verified.json.run.status, "integrated");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].evidence.some((entry) => /verified-by:/.test(entry.text || entry)), false);
  const report = fs.readFileSync(path.join(path.dirname(state), "team-runs", run.runId, "reports", `verification-${run.runId}.md`), "utf8");
  assert.match(report, /Outcome: fixture complete/); assert.match(report, /read-only fixture evidence/); assert.match(report, /fixture risk/);
  env.FAKE_CODEX_SCENARIO = "verifier-pass";
  const retried = runCli(state, "verify", ["--run", run.runId], env); assert.equal(retried.status, 0, retried.stderr || retried.stdout);
  assert.equal(retried.json.run.status, "verified");
  assert.ok(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].evidence.some((entry) => /verified-by: test_verifier - pass/.test(entry.text || entry)));
  const rejected = runCli(state, "merge", ["--run", run.runId], env); assert.notEqual(rejected.status, 0);
  validApproval(state, run.runId, "birlestir", run.plannedAt);
  const merged = runCli(state, "merge", ["--run", run.runId], env); assert.equal(merged.status, 0, merged.stderr || merged.stdout);
  const doctor = runCli(state, "doctor", [], { ...env, FAKE_CODEX_LOGIN: "fail" });
  assert.ok(doctor.json && Array.isArray(doctor.json.checks));
  assert.equal(doctor.json.checks.find((entry) => entry.id === "codex.login").status, "fail");
  assert.doesNotThrow(() => JSON.parse(doctor.stdout));
});

test("status watch JSON emits one parseable document with all snapshots", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-watch-json-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-watch-json" });
  const result = runCli(state, "status", ["--run", run.runId, "--watch-seconds", "1", "--json"], env);
  assert.equal(result.status, 0, result.stderr); const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.snapshots.length >= 1); assert.ok(parsed.snapshots.every((snapshot) => snapshot.run.runId === run.runId));
});

test("warning verdict remains verifiable and can merge only with the explicit flag", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-verify-warn-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-verify-warn" });
  validApproval(state, run.runId, "baslat", run.plannedAt); assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  await waitForWorker(state, run.runId);
  assert.equal(runCli(state, "collect", ["--run", run.runId], env).status, 0);
  assert.equal(runCli(state, "integrate", ["--run", run.runId, "--check", "node --version"], env).status, 0);
  await waitForSupervisorStopped(state, run.runId);
  env.FAKE_CODEX_SCENARIO = "verifier-warn";
  const verified = runCli(state, "verify", ["--run", run.runId], env);
  assert.equal(verified.status, 0, verified.stderr || verified.stdout); assert.equal(verified.json.run.verification.verdict, "warn");
  const runApproval = runCli(state, "status", ["--run", run.runId], env).json.run;
  validApproval(state, run.runId, "birlestir", runApproval.plannedAt);
  assert.notEqual(runCli(state, "merge", ["--run", run.runId], env).status, 0);
  const failCleanup = path.join(temp, "fail-worktree-remove.cjs");
  fs.writeFileSync(failCleanup, `const cp=require("node:child_process");const original=cp.execFileSync;cp.execFileSync=function(command,args,...rest){if(command==="git"&&args?.[0]==="worktree"&&args?.[1]==="remove")throw new Error("fixture cleanup failure");return original.call(this,command,args,...rest)};`);
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${failCleanup}`].filter(Boolean).join(" ");
  const merged = runCli(state, "merge", ["--run", run.runId, "--accept-warn"], env);
  assert.equal(merged.status, 0, merged.stderr || merged.stdout); assert.equal(merged.json.run.status, "merged");
  assert.match(merged.json.cleanupWarning, /worktree cleanup failed/);
});

// C1: a repository with uncommitted work could not run a team run at all ("--repo must have a clean worktree").
test("plan --snapshot bases a dirty repository on a private ref without touching its branch or index", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-snapshot-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  fs.writeFileSync(path.join(repo, "README.md"), "base\nuser edit\n"); fs.writeFileSync(path.join(repo, "notes.txt"), "untracked user notes\n");
  fs.writeFileSync(path.join(repo, "staged.txt"), "staged\n"); git(repo, "add", "staged.txt");
  const head = git(repo, "rev-parse", "HEAD"), statusBefore = git(repo, "status", "--porcelain"), cachedBefore = git(repo, "diff", "--cached", "--name-only");
  const refused = planRun({ temp, state, repo, runId: "R-snapshot-refused", allowFailure: true });
  assert.notEqual(refused.planned.status, 0); assert.match(refused.planned.stdout + refused.planned.stderr, /--snapshot/);
  const { run } = planRun({ temp, state, repo, runId: "R-snapshot", planArgs: ["--snapshot"] });
  assert.equal(run.snapshot.ref, "refs/agentchef/snapshots/R-snapshot");
  assert.equal(git(repo, "rev-parse", run.snapshot.ref), run.baseCommit);
  assert.equal(run.baseHead, head); assert.notEqual(run.baseCommit, head);
  assert.equal(git(repo, "rev-parse", `${run.baseCommit}^`), head);
  assert.deepEqual(git(repo, "ls-tree", "-r", "--name-only", run.baseCommit).split("\n").sort(), ["README.md", "notes.txt", "staged.txt"]);
  assert.equal(git(repo, "show", `${run.baseCommit}:README.md`).replace(/\r/g, ""), "base\nuser edit");
  assert.equal(git(repo, "rev-parse", "HEAD"), head, "HEAD must not move");
  assert.equal(git(repo, "status", "--porcelain"), statusBefore, "working tree and index must be unchanged");
  assert.equal(git(repo, "diff", "--cached", "--name-only"), cachedBefore);
});

test("plan --snapshot refuses untracked credential-like files and creates no ref", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-snapshot-secret-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  git(repo, "config", "core.excludesFile", path.join(temp, "no-global-excludes")); // a global .gitignore may already ignore .env
  fs.writeFileSync(path.join(repo, ".env"), "PLACEHOLDER=1\n");
  const { planned } = planRun({ temp, state, repo, runId: "R-snapshot-secret", planArgs: ["--snapshot"], allowFailure: true });
  assert.notEqual(planned.status, 0); assert.match(planned.stdout + planned.stderr, /credential files/);
  assert.equal(spawnSync("git", ["rev-parse", "--verify", "--quiet", "refs/agentchef/snapshots/R-snapshot-secret"], { cwd: repo, windowsHide: true }).status, 1);
});

// C2: delivery used to require a clean base and always created a merge commit on the owner's branch.
test("merge --as-patch delivers a snapshot run to the working tree without a commit", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-as-patch-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-as-patch"; initRepo(repo); writeBoard(state);
  fs.writeFileSync(path.join(repo, "README.md"), "base\nuser edit\n"); fs.writeFileSync(path.join(repo, "notes.txt"), "untracked user notes\n");
  const head = git(repo, "rev-parse", "HEAD"), cachedBefore = git(repo, "diff", "--cached", "--name-only");
  const { env } = planRun({ temp, state, repo, runId, planArgs: ["--snapshot"] });
  validApproval(state, runId, "baslat", runCli(state, "status", ["--run", runId]).json.run.plannedAt);
  assert.equal(runCli(state, "start", ["--run", runId], env).status, 0);
  await waitForWorker(state, runId);
  assert.equal(runCli(state, "collect", ["--run", runId], env).status, 0);
  const integrated = runCli(state, "integrate", ["--run", runId], env); assert.equal(integrated.status, 0, integrated.stderr || integrated.stdout);
  assert.doesNotMatch(fs.readFileSync(path.join(path.dirname(state), "team-runs", runId, "integration.diff"), "utf8"), /user edit|untracked user notes/, "the snapshot itself is not part of the delivered diff");
  const verified = runCli(state, "verify", ["--run", runId], env); assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  const run = runCli(state, "status", ["--run", runId]).json.run;
  validApproval(state, runId, "birlestir", run.plannedAt);
  const plainMerge = runCli(state, "merge", ["--run", runId], env);
  assert.notEqual(plainMerge.status, 0); assert.match(plainMerge.stdout + plainMerge.stderr, /--as-patch/);
  const delivered = runCli(state, "merge", ["--run", runId, "--as-patch"], env); assert.equal(delivered.status, 0, delivered.stderr || delivered.stdout);
  assert.equal(git(repo, "rev-parse", "HEAD"), head, "no commit on the base branch");
  assert.equal(git(repo, "diff", "--cached", "--name-only"), cachedBefore, "the index is not touched");
  assert.match(fs.readFileSync(path.join(repo, "src", "change.txt"), "utf8"), /worker output/);
  assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8").replace(/\r/g, ""), "base\nuser edit\n", "the owner's uncommitted edit survives");
  assert.ok(fs.existsSync(path.join(repo, "notes.txt")));
  assert.deepEqual(delivered.json.paths, ["src/change.txt"]);
  assert.equal(delivered.json.run.status, "merged"); assert.equal(delivered.json.run.delivery.mode, "patch");
  assert.ok(JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.birlestir.json`), "utf8")).kullanildi);
  await waitForSupervisorStopped(state, runId);
  const cleaned = runCli(state, "cleanup", ["--run", runId], env); assert.equal(cleaned.status, 0, cleaned.stderr || cleaned.stdout);
  assert.equal(cleaned.json.removedSnapshotRef, `refs/agentchef/snapshots/${runId}`);
  assert.equal(spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/agentchef/snapshots/${runId}`], { cwd: repo, windowsHide: true }).status, 1, "cleanup deletes the private snapshot ref");
  assert.equal(git(repo, "rev-parse", "HEAD"), head);
});

test("merge --as-patch refuses a working tree that diverged and consumes nothing", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-as-patch-conflict-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-as-patch-conflict"; initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId });
  validApproval(state, runId, "baslat", run.plannedAt); assert.equal(runCli(state, "start", ["--run", runId], env).status, 0);
  await waitForWorker(state, runId); assert.equal(runCli(state, "collect", ["--run", runId], env).status, 0);
  assert.equal(runCli(state, "integrate", ["--run", runId], env).status, 0);
  assert.equal(runCli(state, "verify", ["--run", runId], env).status, 0);
  fs.mkdirSync(path.join(repo, "src"), { recursive: true }); fs.writeFileSync(path.join(repo, "src", "change.txt"), "owner wrote this meanwhile\n");
  validApproval(state, runId, "birlestir", run.plannedAt);
  const refused = runCli(state, "merge", ["--run", runId, "--as-patch"], env);
  assert.notEqual(refused.status, 0); assert.match(refused.stdout + refused.stderr, /does not apply cleanly/);
  assert.equal(fs.readFileSync(path.join(repo, "src", "change.txt"), "utf8"), "owner wrote this meanwhile\n");
  assert.equal(runCli(state, "status", ["--run", runId], env).json.run.status, "verified");
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(state), "approvals", `${runId}.birlestir.json`), "utf8")).kullanildi, "");
  await waitForSupervisorStopped(state, runId);
});

// C3: the cap was a fixed 4 whatever the machine had free; now it follows the live recommendation.
test("worker cap follows the live capacity recommendation and refuses a request above it", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-capacity-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const capacityFile = path.join(temp, "kapasite.json");
  const writeCapacity = (onerilen, ts = new Date().toISOString()) => fs.writeFileSync(capacityFile, JSON.stringify({ v: 1, ts, onerilen, tavan: 8, bosRamGB: 1.2, commitYuzde: 91, neden: "boş RAM 1,2 GB · commit %91" }));
  const workers = (count, base) => Array.from({ length: count }, (_, index) => ({ taskId: `TASK-${base + index}`, role: "code_mapper", briefFile: "brief.md", checks: [] }));
  const extraEnv = { AGENTCHEF_TEAM_RESOURCE_FILE: capacityFile };
  writeCapacity(1);
  const above = planRun({ temp, state, repo, runId: "R-cap-above", scenario: "read-only", workers: workers(3, 100), planArgs: ["--max-workers", "3"], extraEnv, allowFailure: true });
  assert.notEqual(above.planned.status, 0);
  assert.match(above.planned.stdout + above.planned.stderr, /above the live capacity recommendation of 1 \(beyin: boş RAM 1,2 GB · commit %91\)/);
  const capped = planRun({ temp, state, repo, runId: "R-cap-default", scenario: "read-only", workers: workers(3, 110), extraEnv });
  assert.equal(capped.run.maxWorkers, 1); assert.equal(capped.run.capacity.source, "beyin");
  writeCapacity(6);
  const wide = planRun({ temp, state, repo, runId: "R-cap-six", scenario: "read-only", workers: workers(6, 120), extraEnv });
  assert.equal(wide.run.maxWorkers, 6, "six workers run together when the machine has room for six");
  const lowered = planRun({ temp, state, repo, runId: "R-cap-lowered", scenario: "read-only", workers: workers(6, 130), planArgs: ["--max-workers", "2"], extraEnv });
  assert.equal(lowered.run.maxWorkers, 2); assert.equal(lowered.run.capacity.requested, 2);
  writeCapacity(0);
  const one = planRun({ temp, state, repo, runId: "R-cap-one", scenario: "read-only", workers: workers(2, 160), planArgs: ["--max-workers", "1"], extraEnv });
  assert.equal(one.run.maxWorkers, 1, "one worker is always allowed, as without a request");
  writeCapacity(6, new Date(Date.now() - 60 * 60_000).toISOString());
  const stale = planRun({ temp, state, repo, runId: "R-cap-stale", scenario: "read-only", workers: workers(2, 140), extraEnv });
  assert.equal(stale.run.capacity.source, "local", "a stale recommendation falls back to the local free-RAM measurement");
  const ceiling = planRun({ temp, state, repo, runId: "R-cap-ceiling", scenario: "read-only", workers: workers(9, 150), extraEnv, allowFailure: true });
  assert.notEqual(ceiling.planned.status, 0); assert.match(ceiling.planned.stdout + ceiling.planned.stderr, /1-8 workers/);
});
