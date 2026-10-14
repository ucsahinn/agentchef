import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  acquireCoordinationStateLock,
  createState,
  createTask,
  renewLease,
  setBrief,
  showTasks,
  transitionTask,
  assignTask,
  addEvidence,
  scopeConflicts
} from "../lib/coordination-runtime.mjs";

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
  "Return format: Outcome, Evidence, Changed scope, Risks, Open questions, Next verification",
  "User's words: \"coordinate the runtime\""
].join("\n");

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, AGENTCHEF_BOARD_STATE: "", ...env }
  });
}

function ok(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function move(state, task, status, extra = []) {
  return run(["transition", "--state", state, "--task", task, "--status", status, ...extra]);
}

// Drives a fresh task to review: owner, brief, lease when it writes, evidence.
function toReview(state, task, { scope = null } = {}) {
  const scopeArgs = scope ? ["--write-repo", "agentchef", "--write-paths", scope] : [];
  ok(run(["create", "--state", state, "--id", task, "--title", `Task ${task}`, "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex", "--owner-session", `codex-${task}`, ...scopeArgs]));
  ok(move(state, task, "todo"));
  ok(run(["brief", "--state", state, "--task", task, "--brief", completeBrief]));
  if (scope) ok(run(["renew-lease", "--state", state, "--task", task, "--minutes", "90"]));
  ok(move(state, task, "in_progress"));
  ok(run(["add-evidence", "--state", state, "--task", task, "--evidence", "Verdict: pass. Mutation check: none - test fixture. node --test: pass"]));
  ok(move(state, task, "review"));
}

test("a task goes from backlog to done with a report, evidence, and a different verifier", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  toReview(state, "TASK-42");
  ok(run(["handoff", "--state", state, "--task", "TASK-42", "--source-coordinator", "qa_coordinator", "--target-coordinator", "ui_coordinator", "--question", "Can this close?", "--evidence", "tests pass", "--conflict", "none", "--verification-need", "run focused tests"]));
  ok(run(["attach-report", "--state", state, "--task", "TASK-42", "--report-id", "TASK-42-core-coordinator.md"]));
  ok(move(state, "TASK-42", "done", ["--verified-by", "claude"]));
  const task = ok(run(["show", "--state", state, "--task", "TASK-42"])).task;
  assert.equal(task.status, "done");
  assert.equal(task.handoffs[0].id, "H1");
  assert.equal(task.handoffs[0].sourceCoordinator, "qa_coordinator");
  assert.deepEqual(task.reports, ["TASK-42-core-coordinator.md"]);
  assert.deepEqual(task.history.map((entry) => entry.to ?? entry.action).slice(0, 4), ["create", "todo", "brief", "in_progress"]);
  assert.ok(task.createdAt && task.updatedAt);
});

test("rejects skipped lifecycle transitions, unknown statuses, and unknown tasks", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-43", "--title", "Safe transitions", "--owner-coordinator", "qa_coordinator"]));
  assert.match(move(state, "TASK-43", "review").stderr, /Invalid transition/);
  assert.match(move(state, "TASK-43", "finished").stderr, /Unknown status/);
  assert.match(move(state, "TASK-404", "todo").stderr, /Unknown task/);
});

test("in_progress needs an owner, a complete brief, and a live lease for a write scope", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-50", "--title", "Scoped write", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", "scripts/lib, docs"]));
  ok(move(state, "TASK-50", "todo"));
  assert.match(move(state, "TASK-50", "in_progress").stderr, /needs an owner/);
  const assigned = ok(run(["assign", "--state", state, "--task", "TASK-50", "--owner-agent", "codex", "--owner-session", "codex-chef-38"])).task;
  assert.deepEqual(assigned.owner, { agent: "codex", session: "codex-chef-38" });
  assert.deepEqual(assigned.writeScope, { repo: "agentchef", paths: ["scripts/lib", "docs"] });
  assert.match(move(state, "TASK-50", "in_progress").stderr, /brief is required/);
  const partial = run(["brief", "--state", state, "--task", "TASK-50", "--brief", "Goal: x\nEvidence: y"]);
  assert.match(partial.stderr, /missing: Write scope, Boundaries, Done when, Return format, User's words/);
  ok(run(["brief", "--state", state, "--task", "TASK-50", "--brief", completeBrief]));
  assert.match(move(state, "TASK-50", "in_progress").stderr, /live lease/);
  ok(run(["renew-lease", "--state", state, "--task", "TASK-50", "--minutes", "90"]));
  const started = ok(move(state, "TASK-50", "in_progress")).task;
  assert.equal(started.status, "in_progress");
  assert.ok(Date.parse(started.leaseUntil) > Date.now());
});

test("review needs evidence; done needs evidence, a report, and resolved decisions", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-45", "--title", "Evidence gate", "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex"]));
  ok(move(state, "TASK-45", "todo"));
  ok(run(["brief", "--state", state, "--task", "TASK-45", "--brief", completeBrief]));
  ok(move(state, "TASK-45", "in_progress"));
  assert.match(move(state, "TASK-45", "review").stderr, /Evidence is required/);
  ok(run(["add-evidence", "--state", state, "--task", "TASK-45", "--evidence", "Verdict: pass. Mutation check: none - test fixture. --json output verified"]));
  ok(move(state, "TASK-45", "review"));
  assert.match(move(state, "TASK-45", "done", ["--verified-by", "claude"]).stderr, /linked report/);
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-45", "--report-id", "TASK-44-core.md"]).stderr, /must start with TASK-45-/);
  ok(run(["attach-report", "--state", state, "--task", "TASK-45", "--report-id", "TASK-45-core.md"]));
  ok(run(["handoff", "--state", state, "--task", "TASK-45", "--source-coordinator", "qa_coordinator", "--target-coordinator", "leadership_coordinator", "--question", "Ship it?", "--decision-needed", "release approval"]));
  assert.match(move(state, "TASK-45", "done", ["--verified-by", "claude"]).stderr, /Resolve the open decision first: H1/);
  ok(run(["resolve-handoff", "--state", state, "--task", "TASK-45", "--handoff", "H1", "--answer", "approved by the user"]));
  ok(move(state, "TASK-45", "done", ["--verified-by", "claude"]));
});

test("done needs a verifier other than the owner, its session, or its coordinator, and records it", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  toReview(state, "TASK-60");
  ok(run(["attach-report", "--state", state, "--task", "TASK-60", "--report-id", "TASK-60-report.md"]));
  assert.match(move(state, "TASK-60", "done").stderr, /--verified-by/);
  for (const self of ["codex", "CODEX", "codex-TASK-60", "qa_coordinator", "qa-coordinator"]) {
    const selfCheck = move(state, "TASK-60", "done", ["--verified-by", self]);
    assert.notEqual(selfCheck.status, 0, self);
    assert.match(selfCheck.stderr, /cannot verify its own work/);
  }
  const before = Date.now();
  ok(move(state, "TASK-60", "done", ["--verified-by", "test-verifier"]));
  const task = ok(run(["show", "--state", state, "--task", "TASK-60"])).task;
  assert.equal(task.verification.by, "test-verifier");
  assert.ok(Date.parse(task.verification.at) >= before - 1000);
  assert.equal(task.leaseUntil, null);
});

test("an owner named with dashes or underscores is the same agent", () => {
  const state = createState();
  createTask(state, { id: "T-1", title: "Names", ownerCoordinator: "backend_coordinator", ownerAgent: "root_cause_debugger" });
  const task = state.tasks[0];
  Object.assign(task, { status: "review", evidence: [{ at: "x", text: "y" }], reports: ["T-1-r.md"] });
  assert.throws(() => transitionTask(state, { taskId: "T-1", status: "done", verifiedBy: "root-cause-debugger" }), /cannot verify its own work/);
  delete task.owner;
  task.owner = null;
  assert.throws(() => transitionTask(state, { taskId: "T-1", status: "done", verifiedBy: "claude" }), /has no owner/);
});

test("--verified-by is only accepted on the move to done", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-61", "--title", "Early verifier", "--owner-coordinator", "qa_coordinator"]));
  assert.match(move(state, "TASK-61", "todo", ["--verified-by", "claude"]).stderr, /only with --status done/);
});

test("failed review goes back to in_progress with a reason; blocked returns to where it was; cancelled is final", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  toReview(state, "TASK-70", { scope: "docs" });
  assert.match(move(state, "TASK-70", "in_progress").stderr, /needs --reason/);
  const reworked = ok(move(state, "TASK-70", "in_progress", ["--reason", "verifier found a failing test", "--by", "test-verifier"])).task;
  assert.equal(reworked.history.at(-1).reason, "verifier found a failing test");
  assert.equal(reworked.history.at(-1).by, "test-verifier");
  const blocked = ok(move(state, "TASK-70", "blocked", ["--reason", "waiting for the user's approval"])).task;
  assert.equal(blocked.blockedFrom, "in_progress");
  assert.match(move(state, "TASK-70", "review").stderr, /Invalid transition: blocked -> review/);
  // blocked releases the lease (2026-10-14 decision), so resuming needs a fresh one
  ok(run(["renew-lease", "--state", state, "--task", "TASK-70", "--minutes", "30"]));
  ok(move(state, "TASK-70", "in_progress"));
  ok(move(state, "TASK-70", "cancelled", ["--reason", "superseded by TASK-71"]));
  const cancelled = ok(run(["show", "--state", state, "--task", "TASK-70"])).task;
  assert.equal(cancelled.leaseUntil, null);
  assert.match(move(state, "TASK-70", "todo").stderr, /Invalid transition/);
  for (const args of [
    ["add-evidence", "--evidence", "late"],
    ["attach-report", "--report-id", "TASK-70-late.md"],
    ["renew-lease", "--minutes", "5"],
    ["assign", "--owner-agent", "claude"]
  ]) {
    const [command, ...rest] = args;
    assert.match(run([command, "--state", state, "--task", "TASK-70", ...rest]).stderr, /closed task/, command);
  }
});

test("releasing a task frees its lease; two open tasks cannot lease overlapping paths", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  toReview(state, "TASK-80", { scope: "scripts/lib" });
  ok(move(state, "TASK-80", "in_progress", ["--reason", "rework"]));
  ok(run(["create", "--state", state, "--id", "TASK-81", "--title", "Overlap", "--owner-coordinator", "qa_coordinator", "--owner-agent", "claude", "--write-repo", "AgentChef", "--write-paths", "Scripts/lib/board.mjs"]));
  assert.match(run(["renew-lease", "--state", state, "--task", "TASK-81", "--minutes", "30"]).stderr, /TASK-80 holds a live lease on agentchef:Scripts\/lib\/board\.mjs/);
  ok(move(state, "TASK-80", "todo", ["--reason", "handing over"]));
  assert.equal(ok(run(["show", "--state", state, "--task", "TASK-80"])).task.leaseUntil, null);
  ok(run(["renew-lease", "--state", state, "--task", "TASK-81", "--minutes", "30"]));
});

test("renew-lease --by refuses a non-owner; show reports lease state and filters", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-90", "--title", "Lease owner", "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex", "--write-repo", "agentchef", "--write-paths", "docs"]));
  assert.match(run(["renew-lease", "--state", state, "--task", "TASK-90", "--minutes", "10", "--by", "claude"]).stderr, /cannot renew its lease/);
  ok(run(["renew-lease", "--state", state, "--task", "TASK-90", "--minutes", "10", "--by", "codex"]));
  ok(run(["create", "--state", state, "--id", "TASK-91", "--title", "Other", "--owner-coordinator", "qa_coordinator", "--owner-agent", "claude"]));
  const mine = ok(run(["show", "--state", state, "--owner", "codex"])).tasks;
  assert.deepEqual(mine.map((task) => task.id), ["TASK-90"]);
  assert.equal(mine[0].leaseState, "live");
  assert.equal(ok(run(["show", "--state", state, "--status", "open"])).tasks.length, 2);
});

test("an expired lease blocks in_progress and marks a working task stale", () => {
  const state = createState();
  const start = Date.parse("2026-10-05T08:00:00Z");
  createTask(state, { id: "T-2", title: "Clock", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "docs", now: start });
  state.tasks[0].status = "todo";
  setBrief(state, { taskId: "T-2", brief: completeBrief, now: start });
  renewLease(state, { taskId: "T-2", minutes: 10, now: start });
  assert.throws(() => transitionTask(state, { taskId: "T-2", status: "in_progress", now: start + 11 * 60_000 }), /live lease/);
  transitionTask(state, { taskId: "T-2", status: "in_progress", now: start + 5 * 60_000 });
  const view = showTasks(state, "T-2", { now: start + 30 * 60_000 }).task;
  assert.equal(view.leaseState, "expired");
  assert.equal(view.stale, true);
  assert.equal(state.tasks[0].leaseState, undefined, "computed fields are not stored");
});

test("unknown options are rejected and --help prints usage", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  assert.match(run(["create", "--state", state, "--id", "T-9", "--title", "Typo", "--owner-coordinator", "qa_coordinator", "--owner-agnet", "codex"]).stderr, /does not accept --owner-agnet/);
  const help = spawnSync(process.execPath, [cli, "create", "--help"], { cwd: root, encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: coordination-board/);
  assert.match(run(["create", "--state", state, "--id", "T-9", "--title", "x", "--owner-coordinator", "qa_coordinator", "--write-paths", "docs"]).stderr, /needs --write-repo/);
});

test("a stale lock left by a crashed process is taken over; a live one is waited on", () => {
  const { state } = fixture();
  fs.writeFileSync(state, JSON.stringify(createState()));
  const lockPath = `${path.resolve(state)}.coordination.lock`;
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({ token: "old", pid: 1, at: new Date(Date.now() - 120_000).toISOString() }));
  ok(run(["create", "--state", state, "--id", "T-10", "--title", "After crash", "--owner-coordinator", "qa_coordinator"]));
  assert.equal(fs.existsSync(lockPath), false);
  const held = acquireCoordinationStateLock(state);
  try {
    assert.throws(() => acquireCoordinationStateLock(state, { attempts: 3, waitMs: 5 }), (error) => error.code === "COORDINATION_LOCKED");
  } finally {
    held.release();
  }
  assert.equal(fs.readdirSync(path.dirname(state)).filter((name) => name.endsWith(".tmp")).length, 0);
});

test("rejects worker-to-worker handoffs and does not persist local paths or tokens", () => {
  const { state } = fixture();
  const privatePath = path.join(path.dirname(state), "private", "session");
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-44", "--title", "Safe handoff", "--owner-coordinator", "qa_coordinator"]));
  assert.match(run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "frontend-worker", "--target-coordinator", "backend-worker", "--question", "delegate this"]).stderr, /coordinator/);
  assert.match(run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "qa_coordinator", "--target-coordinator", "qa_coordinator", "--question", "self"]).stderr, /two different coordinators/);
  assert.match(run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "ui_coordinator", "--target-coordinator", "backend_coordinator", "--question", "elsewhere"]).stderr, /owner coordinator qa_coordinator/);
  ok(run(["handoff", "--state", state, "--task", "TASK-44", "--source-coordinator", "qa_coordinator", "--target-coordinator", "ui_coordinator", "--question", `See ${privatePath}`, "--evidence", "token=abc123"]));
  const saved = fs.readFileSync(state, "utf8");
  assert.doesNotMatch(saved, new RegExp(`${privatePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|abc123`, "i"));
});

test("rejects raw credential-shaped coordination content before it reaches state", () => {
  const { state } = fixture();
  const githubTokenFixture = ["github", "pat", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  const bearerFixture = ["Authorization: Bearer", "abcdefghijklmnopqrstuvwxyz0123456789"].join(" ");
  ok(run(["init", "--state", state]));
  const result = run(["create", "--state", state, "--id", "TASK-SECRET", "--title", githubTokenFixture, "--owner-coordinator", "qa_coordinator"]);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(githubTokenFixture));
  ok(run(["create", "--state", state, "--id", "TASK-EV", "--title", "Evidence", "--owner-coordinator", "qa_coordinator"]));
  assert.match(run(["add-evidence", "--state", state, "--task", "TASK-EV", "--evidence", bearerFixture]).stderr, /bearer-token/);
  const saved = fs.readFileSync(state, "utf8");
  assert.doesNotMatch(saved, new RegExp(githubTokenFixture));
  assert.doesNotMatch(saved, /abcdefghijklmnopqrstuvwxyz0123456789/);
});

test("rejects coordinator-like names absent from the canonical catalog", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  assert.match(run(["create", "--state", state, "--id", "TASK-UNKNOWN", "--title", "Unknown owner", "--owner-coordinator", "core-coordinator"]).stderr, /catalog|coordinator/i);
});

test("coordination mutations publish an incremented revision and schema 4", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).revision, 0);
  ok(run(["create", "--state", state, "--id", "TASK-REVISION", "--title", "Revisioned state", "--owner-coordinator", "qa_coordinator"]));
  const saved = JSON.parse(fs.readFileSync(state, "utf8"));
  assert.equal(saved.revision, 1);
  assert.equal(saved.schemaVersion, 4);
});

test("write scope paths stay repository-relative and the lease is bounded", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  for (const bad of ["../outside", "/opt/elsewhere", "D:/elsewhere"]) {
    const result = run(["create", "--state", state, "--id", "TASK-51", "--title", "Bad scope", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", bad]);
    assert.match(result.stderr, /repository-relative/, bad);
  }
  ok(run(["create", "--state", state, "--id", "TASK-52", "--title", "Lease bounds", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", "docs"]));
  assert.notEqual(run(["renew-lease", "--state", state, "--task", "TASK-52", "--minutes", "100000"]).status, 0);
  ok(run(["create", "--state", state, "--id", "TASK-53", "--title", "No scope", "--owner-coordinator", "qa_coordinator"]));
  assert.match(run(["renew-lease", "--state", state, "--task", "TASK-53", "--minutes", "5"]).stderr, /Only a task with a write scope/);
});

test("v1, v2, and v3 boards migrate on read; brief-check and handoff-check work without state", () => {
  const { state } = fixture();
  fs.writeFileSync(state, JSON.stringify({ schemaVersion: 1, tasks: [{ id: "OLD-0", title: "v1", ownerCoordinator: "qa_coordinator", status: "review" }] }));
  const v1 = ok(run(["show", "--state", state])).tasks[0];
  assert.deepEqual([v1.reports, v1.handoffs, v1.evidence, v1.history], [[], [], [], []]);
  fs.writeFileSync(state, JSON.stringify({ schemaVersion: 3, revision: 4, tasks: [{ id: "OLD-1", title: "v3", ownerCoordinator: "qa_coordinator", status: "todo", evidence: null, handoffs: [], reports: [] }] }));
  const shown = spawnSync(process.execPath, [cli, "show", "--json"], { cwd: root, encoding: "utf8", env: { ...process.env, AGENTCHEF_BOARD_STATE: state } });
  const migrated = ok(shown).tasks[0];
  assert.equal(migrated.brief, null);
  assert.equal(migrated.verification, null);
  assert.deepEqual(migrated.evidence, []);
  assert.equal(ok(run(["brief-check", "--brief", completeBrief])).ok, true);
  const bad = run(["brief-check", "--brief", "Hedef: x"]);
  assert.equal(bad.status, 1);
  assert.ok(JSON.parse(bad.stdout).missing.includes("Evidence"));
  const handoff = "Outcome: done\nEvidence: npm test\nChanged scope: none\nRisks: none\nOpen questions: none\nNext verification: CI";
  assert.equal(ok(run(["handoff-check", "--handoff", handoff])).ok, true);
  assert.deepEqual(JSON.parse(run(["handoff-check", "--handoff", "Outcome: done"]).stdout).missing, ["Evidence", "Changed scope", "Risks", "Open questions", "Next verification"]);
});

test("assign changes the owner and records who did it", () => {
  const state = createState();
  createTask(state, { id: "T-3", title: "Reassign", ownerCoordinator: "qa_coordinator", ownerAgent: "codex" });
  assignTask(state, { taskId: "T-3", ownerAgent: "claude", by: "user" });
  addEvidence(state, { taskId: "T-3", evidence: "Verdict: pass. Mutation check: none - test fixture. handed over" });
  const entry = state.tasks[0].history.find((item) => item.action === "assign");
  assert.deepEqual([entry.from, entry.to, entry.by], ["codex", "claude", "user"]);
});

test("a v3 handoff without an id gets one on read, so its open decision can be resolved", () => {
  const { state } = fixture();
  fs.writeFileSync(state, JSON.stringify({ schemaVersion: 3, revision: 2, tasks: [{
    id: "OLD-2", title: "Old decision", ownerCoordinator: "qa_coordinator", status: "review",
    owner: { agent: "codex", session: null }, evidence: [{ at: "2026-10-01T00:00:00Z", text: "tests pass" }], reports: ["OLD-2-r.md"],
    handoffs: [{ sourceCoordinator: "qa_coordinator", targetCoordinator: "ui_coordinator", question: "Ship?", decisionNeeded: "approval" }]
  }] }));
  assert.match(move(state, "OLD-2", "done", ["--verified-by", "claude"]).stderr, /Resolve the open decision first: H1/);
  ok(run(["resolve-handoff", "--state", state, "--task", "OLD-2", "--handoff", "H1", "--answer", "approved"]));
  ok(move(state, "OLD-2", "done", ["--verified-by", "claude"]));
});

test("a write that lost the race to another writer is refused instead of overwriting it", async () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  const runtime = await import("../lib/coordination-runtime.mjs");
  const mine = runtime.readState(state);
  ok(run(["create", "--state", state, "--id", "T-RACE", "--title", "Other writer", "--owner-coordinator", "qa_coordinator"]));
  runtime.createTask(mine, { id: "T-MINE", title: "Mine", ownerCoordinator: "qa_coordinator" });
  assert.throws(() => runtime.writeState(state, mine), (error) => error.code === "COORDINATION_CONFLICT");
  assert.deepEqual(JSON.parse(fs.readFileSync(state, "utf8")).tasks.map((task) => task.id), ["T-RACE"]);
});

test("a task blocked while in progress can be released to todo, which frees its lease", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  toReview(state, "TASK-75", { scope: "docs" });
  ok(move(state, "TASK-75", "in_progress", ["--reason", "rework"]));
  ok(move(state, "TASK-75", "blocked", ["--reason", "waiting"]));
  assert.match(move(state, "TASK-75", "todo").stderr, /needs --reason/);
  const released = ok(move(state, "TASK-75", "todo", ["--reason", "handing over"])).task;
  assert.deepEqual([released.status, released.leaseUntil], ["todo", null]);
  ok(run(["create", "--state", state, "--id", "TASK-76", "--title", "Blocked from todo", "--owner-coordinator", "qa_coordinator"]));
  ok(move(state, "TASK-76", "todo"));
  ok(move(state, "TASK-76", "blocked", ["--reason", "waiting"]));
  ok(move(state, "TASK-76", "todo"));
  ok(run(["create", "--state", state, "--id", "TASK-77", "--title", "Blocked from backlog", "--owner-coordinator", "qa_coordinator"]));
  ok(move(state, "TASK-77", "blocked", ["--reason", "waiting"]));
  assert.match(move(state, "TASK-77", "todo", ["--reason", "x"]).stderr, /Invalid transition: blocked -> todo/);
});

test("a whole-repository scope and ./ paths overlap with the paths they contain", () => {
  const state = createState();
  createTask(state, { id: "T-A", title: "Whole repo", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "." });
  createTask(state, { id: "T-B", title: "Docs", ownerCoordinator: "qa_coordinator", ownerAgent: "claude", writeRepo: "agentchef", writePaths: "./docs" });
  assert.deepEqual(state.tasks[1].writeScope.paths, ["docs"]);
  renewLease(state, { taskId: "T-A", minutes: 10 });
  assert.throws(() => renewLease(state, { taskId: "T-B", minutes: 10 }), /T-A holds a live lease/);
});

test("a lock whose owner file cannot be read is not removed by another holder", () => {
  const { state } = fixture();
  fs.writeFileSync(state, JSON.stringify(createState()));
  const held = acquireCoordinationStateLock(state);
  const lockPath = `${path.resolve(state)}.coordination.lock`;
  fs.writeFileSync(path.join(lockPath, "owner.json"), "{ not json");
  held.release();
  assert.equal(fs.existsSync(lockPath), true, "an unreadable owner is left to the stale rule");
  fs.rmSync(lockPath, { recursive: true, force: true });
});

test("more credential shapes are refused", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "T-SEC", "--title", "Secrets", "--owner-coordinator", "qa_coordinator"]));
  const samples = [
    ["authorization: bearer", "abcdefghijklmnopqrstuvwxyz012345"].join(" "),
    ["sk", "live", "abcdefghijklmnop1234"].join("_"),
    ["glpat", "abcdefghijklmnopqrstuvwx"].join("-"),
    ["token", "abcdefghijklmnop"].join("="),
    ["postgres://admin", "hunter2hunter2@db.example.test/app"].join(":")
  ];
  for (const sample of samples) {
    assert.notEqual(run(["add-evidence", "--state", state, "--task", "T-SEC", "--evidence", sample]).status, 0, sample.slice(0, 12));
  }
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).tasks[0].evidence.length, 0);
});

test("scope conflicts include all live leases and conservatively overlap glob prefixes", () => {
  const state = createState();
  const first = createTask(state, { id: "TASK-A", title: "Glob", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "docs/**" });
  const second = createTask(state, { id: "TASK-B", title: "File", ownerCoordinator: "qa_coordinator", ownerAgent: "claude", writeRepo: "agentchef", writePaths: "docs/a.md" });
  const third = createTask(state, { id: "TASK-C", title: "Other", ownerCoordinator: "qa_coordinator", ownerAgent: "claude", writeRepo: "agentchef", writePaths: "src/**" });
  renewLease(state, { taskId: first.id, minutes: 10 });
  renewLease(state, { taskId: third.id, minutes: 10 });
  assert.deepEqual(scopeConflicts(state, second).map((entry) => entry.taskId), ["TASK-A"]);
  assert.throws(() => renewLease(state, { taskId: second.id, minutes: 10 }), /TASK-A holds a live lease/);
});

test("glob scopes overlap literal paths sharing their prefix and empty-prefix globs", () => {
  const state = createState();
  const add = (id, scope) => createTask(state, { id, title: id, ownerCoordinator: "qa_coordinator", ownerAgent: id, writeRepo: "agentchef", writePaths: scope });
  const glob = add("TASK-PREFIX", "src/a*");
  const file = add("TASK-FILE", "src/abc.js");
  renewLease(state, { taskId: glob.id, minutes: 10 });
  assert.deepEqual(scopeConflicts(state, file).map((entry) => entry.taskId), ["TASK-PREFIX"]);
  const broadState = createState();
  const broad = createTask(broadState, { id: "TASK-BROAD", title: "broad", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "*.js" });
  const another = createTask(broadState, { id: "TASK-ANOTHER", title: "another", ownerCoordinator: "qa_coordinator", ownerAgent: "claude", writeRepo: "agentchef", writePaths: "a.js" });
  renewLease(broadState, { taskId: broad.id, minutes: 10 });
  assert.deepEqual(scopeConflicts(broadState, another).map((entry) => entry.taskId), ["TASK-BROAD"]);
});

test("show derives evidenceMissing without persisting it, and blocked releases the lease", () => {
  const state = createState();
  createTask(state, { id: "TASK-SHOW", title: "Gate", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "docs/**" });
  const task = state.tasks[0];
  task.status = "review";
  task.evidence = [{ at: "2026-01-01", text: "ok" }];
  task.handoffs = [{ decisionNeeded: "approval", resolution: null }];
  task.leaseUntil = new Date(Date.now() + 60_000).toISOString();
  assert.deepEqual(showTasks(state, task.id).task.evidenceMissing, ["report", "decision", "verifier"]);
  assert.equal(task.evidenceMissing, undefined);
  task.status = "in_progress";
  transitionTask(state, { taskId: task.id, status: "blocked", reason: "waiting" });
  assert.equal(task.leaseUntil, null);
});

test("blocked to in_progress still requires a newly acquired live lease", () => {
  const state = createState();
  createTask(state, { id: "TASK-RETURN", title: "Return", ownerCoordinator: "qa_coordinator", ownerAgent: "codex", writeRepo: "agentchef", writePaths: "docs/**" });
  setBrief(state, { taskId: "TASK-RETURN", brief: completeBrief });
  const task = state.tasks[0];
  task.status = "todo";
  renewLease(state, { taskId: task.id, minutes: 10 });
  transitionTask(state, { taskId: task.id, status: "in_progress" });
  transitionTask(state, { taskId: task.id, status: "blocked", reason: "waiting" });
  assert.equal(task.leaseUntil, null);
  assert.throws(() => transitionTask(state, { taskId: task.id, status: "in_progress" }), /live lease/);
  renewLease(state, { taskId: task.id, minutes: 10 });
  assert.equal(transitionTask(state, { taskId: task.id, status: "in_progress" }).status, "in_progress");
});

test("attach-report validates report files and records their byte count", () => {
  const { directory, state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-RPT", "--title", "Report", "--owner-coordinator", "qa_coordinator"]));
  const good = path.join(directory, "TASK-RPT-result.md");
  fs.writeFileSync(good, "Verification report\n");
  const attached = ok(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", good])).task;
  assert.equal(attached.reports[0], "TASK-RPT-result.md");
  assert.equal(attached.history.at(-1).bytes, Buffer.byteLength("Verification report\n"));
  const approvals = path.join(directory, "approvals");
  fs.mkdirSync(approvals);
  const approvalReport = path.join(approvals, "TASK-RPT-approval.md");
  fs.writeFileSync(approvalReport, "Approval note\n");
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", approvalReport]).stderr, /approvals/);
  const wrongExtension = path.join(directory, "TASK-RPT-state.json");
  fs.writeFileSync(wrongExtension, "not a report\n");
  assert.notEqual(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", wrongExtension]).status, 0);
  const empty = path.join(directory, "TASK-RPT-empty.md");
  fs.writeFileSync(empty, "");
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", empty]).stderr, /must not be empty/);
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", good, "--report-id", "TASK-RPT-other.md"]).stderr, /must match/);
  const outside = path.join(os.tmpdir(), "TASK-RPT-outside.md");
  fs.writeFileSync(outside, "outside\n");
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", outside]).stderr, /inside the coordination state directory/);
  const secret = path.join(directory, "TASK-RPT-secret.md");
  fs.writeFileSync(secret, ["Author", "ization: Bea", "rer "].join("") + "abcdefghijklmnopqrstuvwxyz012345"); // built at runtime so the fixture itself is not a labeled secret
  assert.match(run(["attach-report", "--state", state, "--task", "TASK-RPT", "--report-path", secret]).stderr, /contains a .* rejected/);
});

test("create reports live scope conflicts and strict-scope rejects them", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-GLOB", "--title", "Glob", "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex", "--write-repo", "agentchef", "--write-paths", "docs/**"]));
  ok(run(["renew-lease", "--state", state, "--task", "TASK-GLOB", "--minutes", "10"]));
  const result = ok(run(["create", "--state", state, "--id", "TASK-FILE", "--title", "File", "--owner-coordinator", "qa_coordinator", "--owner-agent", "claude", "--write-repo", "agentchef", "--write-paths", "docs/a.md"]));
  assert.deepEqual(result.scopeConflicts.map((entry) => entry.taskId), ["TASK-GLOB"]);
  assert.match(run(["create", "--state", state, "--id", "TASK-STRICT", "--title", "Strict", "--owner-coordinator", "qa_coordinator", "--write-repo", "agentchef", "--write-paths", "docs/b.md", "--strict-scope"]).stderr, /TASK-GLOB/);
});

test("replaceFileSync retries transient Windows sharing errors and rethrows the rest", async () => {
  const { replaceFileSync } = await import("../lib/coordination-runtime.mjs");
  const failing = (codes) => { let calls = 0; return { fn: () => { const code = codes[calls++]; if (code) { const error = new Error(code); error.code = code; throw error; } }, calls: () => calls }; };
  // EACCES is retried only on Windows (on POSIX it is a lasting permission error).
  const flaky = failing(["EPERM", "EBUSY", process.platform === "win32" ? "EACCES" : "EBUSY"]);
  assert.equal(replaceFileSync("a", "b", { rename: flaky.fn, delayMs: 1 }), 4);
  const fatal = failing(["ENOENT"]);
  assert.throws(() => replaceFileSync("a", "b", { rename: fatal.fn, delayMs: 1 }), /ENOENT/);
  assert.equal(fatal.calls(), 1);
  const stuck = failing(Array(10).fill("EPERM"));
  assert.throws(() => replaceFileSync("a", "b", { rename: stuck.fn, attempts: 3, delayMs: 1 }), /EPERM/);
  assert.equal(stuck.calls(), 3);
  const bounded = failing(Array(100).fill("EPERM"));
  const start = Date.now();
  assert.throws(() => replaceFileSync("a", "b", { attempts: 100, delayMs: 50, maxWaitMs: 40, rename: bounded.fn }), /EPERM/);
  assert.ok(Date.now() - start < 500);
  const denied = failing(["EACCES"]);
  assert.throws(() => replaceFileSync("a", "b", { platform: "linux", rename: denied.fn }), /EACCES/);
  assert.equal(denied.calls(), 1);
  const windowsDenied = failing(["EACCES", undefined]);
  assert.equal(replaceFileSync("a", "b", { platform: "win32", delayMs: 1, rename: windowsDenied.fn }), 2);
});

test("review needs a Verdict and a Mutation check in the latest evidence (K4b)", () => {
  const { state } = fixture();
  ok(run(["init", "--state", state]));
  ok(run(["create", "--state", state, "--id", "TASK-GATE", "--title", "Gate", "--owner-coordinator", "qa_coordinator", "--owner-agent", "codex"]));
  ok(move(state, "TASK-GATE", "todo"));
  ok(run(["brief", "--state", state, "--task", "TASK-GATE", "--brief", completeBrief]));
  ok(move(state, "TASK-GATE", "in_progress"));
  ok(run(["add-evidence", "--state", state, "--task", "TASK-GATE", "--evidence", "tests pass"]));
  assert.match(run(["transition", "--state", state, "--task", "TASK-GATE", "--status", "review"]).stderr, /needs a Verdict and a Mutation check/);
  ok(run(["add-evidence", "--state", state, "--task", "TASK-GATE", "--evidence", "Verdict: maybe. Mutation check: src/a.js"]));
  assert.match(run(["transition", "--state", state, "--task", "TASK-GATE", "--status", "review"]).stderr, /Verdict must be one of/);
  ok(run(["add-evidence", "--state", state, "--task", "TASK-GATE", "--evidence", "Sonuç sınıfı: DOĞRULANDI. Mutasyon kontrolü: none - yalnız belge"]));
  ok(run(["transition", "--state", state, "--task", "TASK-GATE", "--status", "review"]));
});

test("reviewGate ignores quoted labels after the initial gate fields", async () => {
  const { reviewGate } = await import("../lib/coordination-runtime.mjs");
  const result = reviewGate('Verdict: pass. Mutation check: scripts/a.mjs. Evidence:\n"Verdict: pass"\n"Mutation check: none"');
  assert.deepEqual(result.errors, []);
  assert.equal(result.verdict, "PASS");
  assert.equal(result.mutationCheck, "scripts/a.mjs");
});
