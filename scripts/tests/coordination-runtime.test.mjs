import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = path.join(root, "scripts", "coordination-board.mjs");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coordination-runtime-"));
  return { directory, state: path.join(directory, "board.json") };
}

const completeBrief = [
  "Goal: close the runtime task",
  "Evidence: tests pass",
  "Write scope: scripts/lib",
  "Boundaries: no installer changes",
  "Done when: focused tests pass",
  "Return format: Outcome, Evidence, Changed scope, Risk, Open questions, Next verification",
  "User's words: \"coordinate the runtime\""
].join("\n");

function withBrief(state, taskId) {
  const result = run(["brief", "--state", state, "--task", taskId, "--brief", completeBrief]);
  assert.equal(result.status, 0, result.stderr);
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args, "--json"], {
    cwd: root,
    encoding: "utf8"
  });
}

test("coordinates an explicit task lifecycle, parent-routed handoff, and report link", () => {
  const { state } = fixture();
  assert.equal(run(["init", "--state", state]).status, 0);
  assert.equal(run(["create", "--state", state, "--id", "TASK-42", "--title", "Coordinate runtime", "--owner-coordinator", "qa_coordinator"]).status, 0);
  withBrief(state, "TASK-42");
  for (const status of ["todo", "in_progress", "review"]) {
    assert.equal(run(["transition", "--state", state, "--task", "TASK-42", "--status", status]).status, 0);
  }
  const handoff = run(["handoff", "--state", state, "--task", "TASK-42", "--source-coordinator", "qa_coordinator", "--target-coordinator", "ui_coordinator", "--question", "Can this close?", "--evidence", "tests pass", "--conflict", "none", "--decision-needed", "release approval", "--verification-need", "run focused tests"]);
  assert.equal(handoff.status, 0, handoff.stderr);
  const report = run(["attach-report", "--state", state, "--task", "TASK-42", "--report-id", "TASK-42-core-coordinator.md"]);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(run(["transition", "--state", state, "--task", "TASK-42", "--status", "done"]).status, 0);
  const shown = run(["show", "--state", state, "--task", "TASK-42"]);
  assert.equal(shown.status, 0, shown.stderr);
  const task = JSON.parse(shown.stdout).task;
  assert.equal(task.status, "done");
  assert.equal(task.handoffs[0].sourceCoordinator, "qa_coordinator");
  assert.deepEqual(task.reports, ["TASK-42-core-coordinator.md"]);
});

test("rejects skipped lifecycle transitions and unknown tasks", () => {
  const { state } = fixture();
  run(["init", "--state", state]);
  run(["create", "--state", state, "--id", "TASK-43", "--title", "Safe transitions", "--owner-coordinator", "qa_coordinator"]);
  const skipped = run(["transition", "--state", state, "--task", "TASK-43", "--status", "review"]);
  assert.notEqual(skipped.status, 0);
  assert.match(skipped.stderr, /Invalid transition/);
  const unknown = run(["transition", "--state", state, "--task", "TASK-404", "--status", "todo"]);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown task/);
});

test("requires a task-bound report before review can close", () => {
  const { state } = fixture();
  run(["init", "--state", state]);
  run(["create", "--state", state, "--id", "TASK-45", "--title", "Evidence gate", "--owner-coordinator", "qa_coordinator"]);
  run(["transition", "--state", state, "--task", "TASK-45", "--status", "todo"]);
  withBrief(state, "TASK-45");
  run(["transition", "--state", state, "--task", "TASK-45", "--status", "in_progress"]);
  run(["transition", "--state", state, "--task", "TASK-45", "--status", "review"]);
  const withoutReport = run(["transition", "--state", state, "--task", "TASK-45", "--status", "done"]);
  assert.notEqual(withoutReport.status, 0);
  assert.match(withoutReport.stderr, /linked report/);
  const wrongReport = run(["attach-report", "--state", state, "--task", "TASK-45", "--report-id", "TASK-44-core-coordinator.md"]);
  assert.notEqual(wrongReport.status, 0);
  assert.match(wrongReport.stderr, /must start with TASK-45-/);
  assert.equal(run(["attach-report", "--state", state, "--task", "TASK-45", "--report-id", "TASK-45-core-coordinator.md"]).status, 0);
  assert.equal(run(["transition", "--state", state, "--task", "TASK-45", "--status", "done"]).status, 0);
});

test("rejects worker-to-worker handoffs and does not persist local paths or tokens", () => {
  const { state } = fixture();
  const privatePath = path.join(path.dirname(state), "private", "session");
  run(["init", "--state", state]);
  run(["create", "--state", state, "--id", "TASK-44", "--title", "Safe handoff", "--owner-coordinator", "qa_coordinator"]);
  const forbidden = run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "frontend-worker", "--target-coordinator", "backend-worker", "--question", "delegate this"]);
  assert.notEqual(forbidden.status, 0);
  assert.match(forbidden.stderr, /coordinator/);
  assert.equal(path.isAbsolute(privatePath), true);
  const accepted = run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "qa_coordinator", "--target-coordinator", "ui_coordinator", "--question", `See ${privatePath}`, "--evidence", "token=abc123"]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const saved = fs.readFileSync(state, "utf8");
  assert.doesNotMatch(saved, new RegExp(`${privatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|abc123`, "i"));
});

test("rejects raw credential-shaped coordination content before it reaches state", () => {
  const { state } = fixture();
  const githubTokenFixture = ["github", "pat", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  assert.equal(run(["init", "--state", state]).status, 0);
  const result = run(["create", "--state", state, "--id", "TASK-SECRET", "--title", githubTokenFixture, "--owner-coordinator", "qa_coordinator"]);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(githubTokenFixture));
  const saved = fs.readFileSync(state, "utf8");
  assert.doesNotMatch(saved, new RegExp(githubTokenFixture));
});

test("rejects coordinator-like names absent from the canonical catalog", () => {
  const { state } = fixture();
  assert.equal(run(["init", "--state", state]).status, 0);
  const result = run(["create", "--state", state, "--id", "TASK-UNKNOWN", "--title", "Unknown owner", "--owner-coordinator", "core-coordinator"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /catalog|coordinator/i);
});

test("coordination mutations publish an incremented revision", () => {
  const { state } = fixture();
  assert.equal(run(["init", "--state", state]).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).revision, 0);
  assert.equal(run(["create", "--state", state, "--id", "TASK-REVISION", "--title", "Revisioned state", "--owner-coordinator", "qa_coordinator"]).status, 0);
  const saved = JSON.parse(fs.readFileSync(state, "utf8"));
  assert.equal(saved.revision, 1);
  assert.equal(saved.schemaVersion, 3);
});

test("in_progress needs a complete brief, and a write scope needs a live lease", () => {
  const { state } = fixture();
  run(["init", "--state", state]);
  const created = run(["create", "--state", state, "--id", "TASK-50", "--title", "Scoped write", "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex", "--owner-session", "codex-chef-38", "--write-repo", "agentchef", "--write-paths", "scripts/lib, docs"]);
  assert.equal(created.status, 0, created.stderr);
  const task = JSON.parse(created.stdout).task;
  assert.deepEqual(task.owner, { agent: "codex", session: "codex-chef-38" });
  assert.deepEqual(task.writeScope, { repo: "agentchef", paths: ["scripts/lib", "docs"] });
  run(["transition", "--state", state, "--task", "TASK-50", "--status", "todo"]);
  const noBrief = run(["transition", "--state", state, "--task", "TASK-50", "--status", "in_progress"]);
  assert.notEqual(noBrief.status, 0);
  assert.match(noBrief.stderr, /brief is required/);
  const partial = run(["brief", "--state", state, "--task", "TASK-50", "--brief", "Goal: x\nEvidence: y"]);
  assert.notEqual(partial.status, 0);
  assert.match(partial.stderr, /missing: Write scope, Boundaries, Done when, Return format, User's words/);
  withBrief(state, "TASK-50");
  const noLease = run(["transition", "--state", state, "--task", "TASK-50", "--status", "in_progress"]);
  assert.notEqual(noLease.status, 0);
  assert.match(noLease.stderr, /live lease/);
  assert.equal(run(["renew-lease", "--state", state, "--task", "TASK-50", "--minutes", "90"]).status, 0);
  assert.equal(run(["transition", "--state", state, "--task", "TASK-50", "--status", "in_progress"]).status, 0);
  const evidence = run(["add-evidence", "--state", state, "--task", "TASK-50", "--evidence", "node --test scripts/tests/coordination-runtime.test.mjs: pass"]);
  assert.equal(evidence.status, 0, evidence.stderr);
  const saved = JSON.parse(evidence.stdout).task;
  assert.equal(saved.evidence.length, 1);
  assert.ok(Date.parse(saved.leaseUntil) > Date.now());
});

test("write scope paths stay repository-relative and the lease is bounded", () => {
  const { state } = fixture();
  run(["init", "--state", state]);
  for (const bad of ["../outside", "/opt/elsewhere", "D:/elsewhere"]) {
    const result = run(["create", "--state", state, "--id", "TASK-51", "--title", "Bad scope", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", bad]);
    assert.notEqual(result.status, 0, bad);
    assert.match(result.stderr, /repository-relative/);
  }
  run(["create", "--state", state, "--id", "TASK-52", "--title", "Lease bounds", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", "docs"]);
  assert.notEqual(run(["renew-lease", "--state", state, "--task", "TASK-52", "--minutes", "100000"]).status, 0);
  run(["create", "--state", state, "--id", "TASK-53", "--title", "No scope", "--owner-coordinator", "qa_coordinator"]);
  assert.match(run(["renew-lease", "--state", state, "--task", "TASK-53", "--minutes", "5"]).stderr, /Only a task with a write scope/);
});

test("a v2 board migrates on read, brief-check works without state, and AGENTCHEF_BOARD_STATE names the board", () => {
  const { state } = fixture();
  fs.writeFileSync(state, JSON.stringify({ schemaVersion: 2, revision: 4, tasks: [{ id: "OLD-1", title: "old", ownerCoordinator: "qa_coordinator", status: "todo", handoffs: [], reports: [] }] }));
  const shown = spawnSync(process.execPath, [cli, "show", "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, AGENTCHEF_BOARD_STATE: state } });
  assert.equal(shown.status, 0, shown.stderr);
  const migrated = JSON.parse(shown.stdout).tasks[0];
  assert.equal(migrated.brief, null);
  assert.deepEqual(migrated.evidence, []);
  assert.equal(migrated.writeScope, null);
  const good = spawnSync(process.execPath, [cli, "brief-check", "--brief", completeBrief, "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, AGENTCHEF_BOARD_STATE: "" } });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).ok, true);
  const bad = spawnSync(process.execPath, [cli, "brief-check", "--brief", "Hedef: x", "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, AGENTCHEF_BOARD_STATE: "" } });
  assert.equal(bad.status, 1);
  assert.ok(JSON.parse(bad.stdout).missing.includes("Evidence"));
});
