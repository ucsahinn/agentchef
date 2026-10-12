import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { approvalIsValid } from "../lib/team-runtime.mjs";

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
  const wrapper = path.join(dir, "fake-codex-preload.cjs");
  fs.writeFileSync(wrapper, `const Module = require("node:module");\nconst fs = require("node:fs");\nconst fake = ${JSON.stringify(fakeCodex)};\nconst originalLoad = Module._load;\nconst originalWrite = fs.writeFileSync;\nfs.writeFileSync = function(file, data, ...rest) { if (String(file).endsWith(".final.json")) { try { const value = JSON.parse(String(data)); if (value.mutationCheck?.outsideScope === false) value.mutationCheck.outsideScope = []; data = JSON.stringify(value); } catch {} } return originalWrite.call(this, file, data, ...rest); };\nModule._load = function(request, parent, isMain) { const name = String(request).split(/[\\\\/]/).pop(); if (isMain && ["exec", "login"].includes(name)) { const args = process.argv.slice(1); if (name === "exec" && args[1] === "--help") { console.log("--json --output-schema -o resume"); process.exit(0); } process.argv = [process.execPath, fake, name, ...args.slice(1)]; return originalLoad.call(this, fake, parent, true); } return originalLoad.call(this, request, parent, isMain); };\n`);
  return { command: process.execPath, preload: wrapper };
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
  const env = { AGENTCHEF_TEAM_MODE: "experimental", AGENTCHEF_TEAM_CODEX_COMMAND: codex.command, NODE_OPTIONS: `--require="${codex.preload.replace(/\\/g, "/")}"`, FAKE_CODEX_SCENARIO: scenario, AGENTCHEF_TEAM_PANE: "off", TEMP: isolatedTemp, TMP: isolatedTemp, TMPDIR: isolatedTemp };
  const loginProbe = spawnSync(codex.command, ["login", "status"], { encoding: "utf8", env });
  assert.equal(loginProbe.status, 0, loginProbe.stderr || loginProbe.stdout);
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
    if (["finished", "failed", "paused_limit", "timed_out"].includes(status.json.run.workers[0].status)) return status.json.run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("worker did not finish before timeout");
}
function prepareCollectedWorker(run) {
  const wt = run.workers[0].worktree;
  fs.mkdirSync(path.join(wt, "src"), { recursive: true });
  fs.writeFileSync(path.join(wt, "src", "change.txt"), "worker output\n");
  fs.writeFileSync(path.join(run.worktreeRoot, "TASK-043.final.json"), JSON.stringify(finalHandoff()));
}

test("team run completes plan, collect, integrate, verify, and approved merge", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-full-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"), runId = "R-task043-full";
  initRepo(repo); writeBoard(state);
  const { env } = planRun({ temp, state, repo, runId });
  const denied = runCli(state, "start", ["--run", runId], env); assert.equal(denied.status, 3);
  validApproval(state, runId, "baslat", runCli(state, "status", ["--run", runId]).json.run.plannedAt);
  const started = runCli(state, "start", ["--run", runId], env); assert.equal(started.status, 0, started.stderr || started.stdout);
  let run = await waitForWorker(state, runId); prepareCollectedWorker(run);
  const collected = runCli(state, "collect", ["--run", runId], env); assert.equal(collected.status, 0, collected.stderr || collected.stdout);
  const integrated = runCli(state, "integrate", ["--run", runId, "--check", "node --version", "--check", "node --version"], env); assert.equal(integrated.status, 0, integrated.stderr || integrated.stdout);
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

test("collect detects actual outside-scope mutations and leaves the card out of review", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-scope-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-scope" });
  const runFile = path.join(path.dirname(state), "team-runs", `${run.runId}.json`);
  const record = JSON.parse(fs.readFileSync(runFile, "utf8"));
  record.status = "running"; record.workers[0].status = "finished"; record.workers[0].worktree = path.join(temp, "outside-worker");
  fs.mkdirSync(record.workers[0].worktree); git(record.workers[0].worktree, "init", "-b", "worker"); git(record.workers[0].worktree, "config", "user.name", "AgentChef Test"); git(record.workers[0].worktree, "config", "user.email", "agentchef-test@example.invalid");
  fs.writeFileSync(path.join(record.workers[0].worktree, "outside.txt"), "escape\n"); fs.writeFileSync(path.join(temp, "outside-worker", "final.json"), JSON.stringify(finalHandoff("pass", [], [])));
  fs.writeFileSync(runFile, JSON.stringify(record));
  const result = runCli(state, "collect", ["--run", run.runId], env); assert.equal(result.status, 4);
  assert.equal(result.json.run.workers[0].status, "scope_violation");
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].status, "todo");
});

test("integrate records merge conflicts and merge refuses a conflicted run", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "team-run-conflict-")); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repo = path.join(temp, "repo"), state = path.join(temp, "board.json"); initRepo(repo); writeBoard(state);
  const { env, run } = planRun({ temp, state, repo, runId: "R-task043-conflict" });
  const wt = run.integrationWorktree; git(repo, "worktree", "add", "-b", run.integrationBranch, wt);
  fs.writeFileSync(path.join(wt, "conflict.txt"), "base\n"); git(wt, "add", "conflict.txt"); git(wt, "commit", "-m", "integration edit");
  const workerDir = path.join(temp, "worker"); git(repo, "worktree", "add", "-b", "takim/R-task043-conflict-TASK-043", workerDir);
  fs.writeFileSync(path.join(workerDir, "conflict.txt"), "worker\n"); git(workerDir, "add", "conflict.txt"); git(workerDir, "commit", "-m", "worker edit");
  const recordPath = path.join(path.dirname(state), "team-runs", `${run.runId}.json`), record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  record.status = "collected"; record.workers[0] = { ...record.workers[0], status: "collected", worktree: workerDir, branch: "takim/R-task043-conflict-TASK-043", commit: git(workerDir, "rev-parse", "HEAD") }; fs.writeFileSync(recordPath, JSON.stringify(record));
  const result = runCli(state, "integrate", ["--run", run.runId], env); assert.equal(result.status, 4);
  assert.equal(result.json.run.workers[0].status, "conflict"); assert.deepEqual(result.json.conflicts, ["conflict.txt"]);
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
