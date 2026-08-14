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
  for (const status of ["todo", "in_progress", "review"]) {
    assert.equal(run(["transition", "--state", state, "--task", "TASK-42", "--status", status]).status, 0);
  }
  const handoff = run(["handoff", "--state", state, "--task", "TASK-42", "--source-coordinator", "qa_coordinator", "--target-coordinator", "security_coordinator", "--question", "Can this close?", "--evidence", "tests pass", "--conflict", "none", "--decision-needed", "release approval", "--verification-need", "run focused tests"]);
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
  const accepted = run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "qa_coordinator", "--target-coordinator", "security_coordinator", "--question", `See ${privatePath}`, "--evidence", "token=abc123"]);
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
  assert.equal(saved.schemaVersion, 2);
});
