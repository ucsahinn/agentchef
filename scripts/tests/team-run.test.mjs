import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { approvalIsValid, updateRunRecord } from "../lib/team-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "team-run.mjs");
const boardCli = path.join(root, "scripts", "coordination-board.mjs");
const fakeCodex = path.join(root, "scripts", "tests", "fixtures", "fake-codex", "fake-codex.cjs");
const scale = Number(process.env.AGENTCHEF_TEST_TIMEOUT_SCALE || 1);
const scaledTimeout = (ms) => Math.ceil(ms * scale);

function runNode(file, args, options = {}) {
  return spawnSync(process.execPath, [file, ...args], { encoding: "utf8", timeout: scaledTimeout(30_000), ...options });
}
function runCli(state, command, args = [], env = {}) {
  const result = runNode(cli, [command, "--state", state, "--json", ...args], { env: { ...process.env, ...env } });
  let json;
  try { json = JSON.parse(result.stdout); } catch { /* report captured below */ }
  return { ...result, json };
}
function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout: scaledTimeout(30_000) });
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
  else { fs.writeFileSync(wrapper, `#!/usr/bin/env node\nconst result = require("node:child_process").spawnSync(${JSON.stringify(process.execPath)}, [${JSON.stringify(fakeCodex)}, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });\nprocess.exit(result.status ?? 1);\n`); fs.chmodSync(wrapper, 0o755); }
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
function planRun({ temp, state, repo, runId, scenario = "ok", role = "docs_author" }) {
  const planPath = path.join(temp, "plan.json"), briefPath = path.join(temp, "brief.md");
  fs.writeFileSync(briefPath, brief);
  fs.writeFileSync(planPath, JSON.stringify({ workers: [{ taskId: "TASK-043", role, briefFile: "brief.md", writeScope: ["src/"], checks: ["node --version"] }] }));
  const isolatedTemp = path.join(temp, "os-temp"); fs.mkdirSync(isolatedTemp, { recursive: true });
  const codex = fixtureCommand(temp);
  const env = { AGENTCHEF_TEAM_MODE: "experimental", AGENTCHEF_TEAM_CODEX_COMMAND: codex.command, FAKE_CODEX_SCENARIO: scenario, AGENTCHEF_TEAM_PANE: "off", TEMP: isolatedTemp, TMP: isolatedTemp, TMPDIR: isolatedTemp };
  const loginProbe = spawnSync(process.execPath, [fakeCodex, "login", "status"], { encoding: "utf8", env });
  assert.equal(loginProbe.status, 0, loginProbe.error?.message || loginProbe.stderr || loginProbe.stdout);
  const planned = runCli(state, "plan", ["--repo", repo, "--plan-file", planPath, "--run", runId], env);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  return { env, run: planned.json.run, planPath };
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
  while (Date.now() < deadline) {
    if (!fs.existsSync(lockFile)) return;
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

test("collect detects actual outside-scope mutations and leaves the card out of review", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-scope-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-scope", scenario: "outside-scope" });
  validApproval(state, run.runId, "baslat", run.plannedAt);
  assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  await waitForWorker(state, run.runId);
  const result = runCli(state, "collect", ["--run", run.runId], env); assert.equal(result.status, 4);
  assert.equal(result.json.run.workers[0].status, "scope_violation");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].status, "in_progress");
  await waitForSupervisorStopped(state, run.runId);
});

test("read-only workers collect a report without a commit or write scope", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-readonly-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-team-readonly", role: "code_mapper", scenario: "read-only" });
  assert.deepEqual(run.workers[0].writeScope, []);
  validApproval(state, run.runId, "baslat", run.plannedAt);
  assert.equal(runCli(state, "start", ["--run", run.runId], env).status, 0);
  await waitForWorker(state, run.runId);
  const collected = runCli(state, "collect", ["--run", run.runId], env);
  assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  assert.equal(collected.json.run.workers[0].status, "collected");
  assert.equal(collected.json.run.workers[0].commit, null);
  assert.match(fs.readFileSync(path.join(path.dirname(state), "team-runs", run.runId, "reports", "TASK-043-code_mapper.md"), "utf8"), /read-only worker/);
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

test("failed independent verifier blocks merge and doctor emits JSON checks", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-verify-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-verifier", scenario: "verifier-fail" });
  const integration = run.integrationWorktree; git(repo, "worktree", "add", "-b", run.integrationBranch, integration);
  fs.writeFileSync(path.join(integration, "src.txt"), "integration\n"); git(integration, "add", "src.txt"); git(integration, "commit", "-m", "integrated change");
  const recordPath = path.join(path.dirname(state), "team-runs", `${run.runId}.json`), record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  fs.mkdirSync(run.worktreeRoot, { recursive: true }); fs.writeFileSync(path.join(run.worktreeRoot, "TASK-043.prompt.md"), brief);
  record.status = "integrated"; record.workers[0].status = "integrated"; record.integration = { merged: [record.workers[0].taskId], conflicts: [], checks: [], ok: true }; fs.writeFileSync(recordPath, JSON.stringify(record));
  const verified = runCli(state, "verify", ["--run", run.runId], env); assert.equal(verified.status, 4, verified.stderr || verified.stdout);
  validApproval(state, run.runId, "birlestir", run.plannedAt);
  const rejected = runCli(state, "merge", ["--run", run.runId], env); assert.notEqual(rejected.status, 0);
  const doctor = runCli(state, "doctor", [], { ...env, FAKE_CODEX_LOGIN: "fail" });
  assert.ok(doctor.json && Array.isArray(doctor.json.checks));
  assert.equal(doctor.json.checks.find((entry) => entry.id === "codex.login").status, "fail");
  assert.doesNotThrow(() => JSON.parse(doctor.stdout));
});
