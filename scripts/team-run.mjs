#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseBrief } from "./lib/agent-brief.mjs";
import { CliUsageError, emitCliError, redactCliPaths } from "./lib/cli-error-contract.mjs";
import { isProcessAlive, openViewerPane, processCreatedAt, resolveCodexCommand, spawnCodexExec, stopChild } from "./lib/codex-exec.mjs";
import { cmdShimInvocation, resolveWindowsCli } from "./lib/platform-command.mjs";
import {
  acquireTeamOperationLock, assignTask, assertTeamTextSafe, approvalIsValid, consumeApprovalWith, createTask,
  addEvidence, attachReport, effectiveSandbox, headCommit, loadTeamContract, maxConcurrency, parseWorkerHandoff,
  composeWorkerPrompt, composeVerifierPrompt, renderHandoffMarkdown, readApproval,
  readRoleToml, readRunRecord, renewLease, setBrief, transitionRun,
  transitionTask, transitionWorker, updateRunRecord, writeRunRecord
} from "./lib/team-runtime.mjs";
import { secretLikeCategory } from "./lib/secret-classifier.mjs";
import { memoryAllowance } from "./lib/memory-guard.mjs";
import { nextResumeAt } from "./lib/usage-limit-reset.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = loadTeamContract();
const ROLE_IDS = CONTRACT.workers.allowedRoleIds;
const COMMANDS = {
  plan: ["repo", "plan-file", "state", "run", "profile", "max-minutes"],
  start: ["run", "state"], status: ["run", "state", "watch-seconds"],
  supervise: ["run", "state"], watch: ["run", "task", "state"],
  abort: ["run", "state", "reason"], collect: ["run", "task", "state"],
  integrate: ["run", "state", "check", "recheck", "covers"], verify: ["run", "state", "max-minutes", "detach"],
  merge: ["run", "state", "accept-warn", "keep-worktrees"], pause: ["run", "state"], resume: ["run", "state", "wait"],
  cleanup: ["run", "state", "delete-branches", "delete-integration", "purge-logs"],
  doctor: ["state"]
};
const USAGE = `Usage: node scripts/team-run.mjs <${Object.keys(COMMANDS).join("|")}> --state <board.json> [--json]`;
const TERMINAL_WORKERS = new Set(["finished", "failed", "paused_limit", "timed_out", "aborted", "scope_violation", "rejected_content", "collected", "integrated", "conflict"]);
const now = () => new Date().toISOString();
const safeRunId = (value) => /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(value);

function parse(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") return { help: true };
  if (!COMMANDS[command]) throw new CliUsageError(`Unknown command: ${command}. ${USAGE}`);
  const options = {};
  const accepted = new Set(COMMANDS[command]);
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--json") { options.json = true; continue; }
    if (!token.startsWith("--")) throw new CliUsageError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!accepted.has(key)) throw new CliUsageError(`${command} does not accept --${key}.`);
    if (["delete-branches", "delete-integration", "purge-logs", "accept-warn", "keep-worktrees", "detach", "wait", "recheck"].includes(key)) { options[key] = true; continue; }
    const value = rest[i + 1];
    if (!value || value === "--json" || (value.startsWith("--") && accepted.has(value.slice(2)))) throw new CliUsageError(`--${key} requires a value.`);
    if (key === "check") (options.check ||= []).push(value); else options[key] = value;
    i += 1;
  }
  options.state ||= process.env.AGENTCHEF_BOARD_STATE;
  if (!options.state && !["plan", "doctor"].includes(command)) throw new CliUsageError("--state (or AGENTCHEF_BOARD_STATE) is required.");
  if (command === "plan" && !options.state) throw new CliUsageError("--state (or AGENTCHEF_BOARD_STATE) is required.");
  if (!['plan', 'doctor'].includes(command) && !options.run) throw new CliUsageError(`${command} requires --run.`);
  if (command === "watch" && !options.task) throw new CliUsageError("watch requires --task.");
  if (command === "abort" && !options.reason) throw new CliUsageError("abort requires --reason.");
  return { command, options };
}
function output(value, json = true) { if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); else process.stdout.write(`${String(value)}\n`); }
function runFile(state, runId) { return path.join(path.dirname(path.resolve(state)), "team-runs", `${runId}.json`); }
function readRun(state, runId) {
  if (typeof runId !== "string" || !safeRunId(runId)) throw new CliUsageError("Invalid run identifier.");
  return readRunRecord(runFile(state, runId));
}
function git(args, cwd) { return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function resolveRepo(value) { const repo = path.resolve(value); if (!fs.statSync(repo).isDirectory()) throw new Error("--repo must be a directory."); git(["rev-parse", "--show-toplevel"], repo); return git(["rev-parse", "--show-toplevel"], repo); }
function readPlan(file) {
  const stat = fs.statSync(file); if (stat.size > 128 * 1024) throw new Error("Plan file exceeds 128 KiB.");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(data.workers) || data.workers.length < 1 || data.workers.length > CONTRACT.workers.maxWorkers) throw new Error(`Plan must contain 1-${CONTRACT.workers.maxWorkers} workers.`);
  return data;
}
function normalizeScope(scope, repo) {
  const raw = Array.isArray(scope) ? scope : String(scope ?? "").split(/[;,\n]/);
  if (!raw.length || raw.some((x) => !String(x).trim())) throw new Error("Each worker must define writeScope as one or more paths.");
  return raw.map((entry) => {
    const value = String(entry).trim().replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
    if (!value || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.split("/").includes("..")) throw new Error(`Invalid repository-relative write scope: ${entry}`);
    return value.replace(/\/$/, "") || ".";
  });
}
function containsPath(parent, candidate) {
  let relative = path.relative(parent, candidate);
  if (process.platform === "win32") relative = relative.toLocaleLowerCase("en-US");
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function scopesOverlap(left, right) {
  const norm = (x) => x.toLocaleLowerCase("en-US");
  return left.some((a) => right.some((b) => { const x = norm(a), y = norm(b); return x === "." || y === "." || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`); }));
}
function ensureTeamExecutionEnabled() {
  if (!teamExecutionEnabled()) {
    const error = new Error(`Team execution is switched off; unset ${CONTRACT.execution.optInEnv}=off to use it.`); error.exitCode = 1; error.code = "team-mode-disabled"; throw error;
  }
}
function validateStateFile(state) { if (!fs.existsSync(state)) throw new Error("Board state file does not exist; initialize the coordination board first."); }
function planCommand(options) {
  ensureTeamExecutionEnabled(); validateStateFile(options.state);
  if (!options.repo) throw new CliUsageError("plan requires --repo.");
  if (!options["plan-file"]) throw new CliUsageError("plan requires --plan-file.");
  const repo = resolveRepo(options.repo || ROOT);
  if (git(["status", "--porcelain"], repo)) throw new Error("--repo must have a clean worktree before planning.");
  const plan = readPlan(options["plan-file"]);
  const id = options.run || `R${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(2).toString("hex")}`;
  if (!safeRunId(id)) throw new CliUsageError("--run must match the documented run identifier format.");
  const profile = options.profile || CONTRACT.workers.defaultProfile;
  if (!["offline", "full"].includes(profile)) throw new CliUsageError("--profile must be offline or full.");
  const maxMinutes = Number(options["max-minutes"] || CONTRACT.limits.workerMinutes);
  if (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 24 * 60) throw new CliUsageError("--max-minutes must be an integer from 1 to 1440.");
  const planDirectory = path.dirname(path.resolve(options["plan-file"]));
  const workers = plan.workers.map((item) => {
    if (!item.taskId || !/^TASK-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.taskId)) throw new Error("Each worker requires a valid taskId.");
    if (!ROLE_IDS.includes(item.role)) throw new Error(`Role is not allowed: ${item.role}`);
    const briefFile = path.resolve(path.dirname(path.resolve(options["plan-file"])), item.briefFile || "");
    // Lexical check first (a missing outside file must not surface as ENOENT), then realpath for links and junctions.
    if (!containsPath(planDirectory, briefFile)) throw new Error(`briefFile for ${item.taskId} must stay inside the plan directory.`);
    const realPlanDirectory = fs.realpathSync(planDirectory);
    const realBriefFile = fs.realpathSync(briefFile);
    if (!containsPath(realPlanDirectory, realBriefFile)) throw new Error(`briefFile for ${item.taskId} must stay inside the plan directory.`);
    const briefText = fs.readFileSync(briefFile, "utf8");
    const brief = parseBrief(briefText); if (!brief.ok) throw new Error(`Brief for ${item.taskId} is missing: ${brief.missing.join(", ")}.`);
    assertTeamTextSafe(briefText);
    const role = readRoleToml(item.role);
    const sandbox = effectiveSandbox(item.role, role.sandboxMode);
    return { taskId: item.taskId, role: item.role, coordinator: item.coordinator || null, checks: item.checks || [], briefFile, briefText, brief: brief.fields, writeScope: sandbox === "read-only" ? [] : normalizeScope(item.writeScope || brief.fields.scope, repo), sandbox, model: role.model, roleInstructions: role.developerInstructions };
  });
  if (new Set(workers.map((w) => w.taskId)).size !== workers.length) throw new Error("Worker taskId values must be unique.");
  for (let i = 0; i < workers.length; i += 1) for (let j = i + 1; j < workers.length; j += 1) if (scopesOverlap(workers[i].writeScope, workers[j].writeScope)) throw new Error(`Write scopes overlap: ${workers[i].taskId} and ${workers[j].taskId}.`);
  const baseBranch = git(["branch", "--show-current"], repo); if (!baseBranch) throw new Error("Repository must be on a named branch.");
  const plannedAt = now(); const root = path.resolve(path.dirname(repo), ".agentchef-worktrees", id);
  const canonicalRepo = fs.realpathSync(repo), canonicalRootParent = fs.realpathSync(path.dirname(path.dirname(root)));
  const canonicalRoot = path.join(canonicalRootParent, ".agentchef-worktrees", id);
  const canonicalTemp = fs.realpathSync(os.tmpdir());
  if (containsPath(canonicalTemp, canonicalRoot) || containsPath(canonicalRepo, canonicalRoot) || containsPath(canonicalRoot, canonicalRepo)) throw new Error("Resolved worktree root is not permitted.");
  const run = { schemaVersion: 1, revision: 0, runId: id, status: "planned", planHash: hashPlan(workers), repo, repoName: path.basename(repo), baseBranch, baseCommit: headCommit(repo), integrationBranch: `${CONTRACT.branches.integrationPrefix}${id}`, integrationWorktree: path.join(root, "_integration"), worktreeRoot: root, planFile: path.resolve(options["plan-file"]), profile, model: "gpt-6-luna", maxWorkers: maxConcurrency(CONTRACT, workers.length), maxMinutes, checks: [...new Set(workers.flatMap((w) => w.checks))], plannedAt, startedAt: null, approvals: { start: null, merge: null }, supervisor: { pid: null, createdAt: null, heartbeatAt: null }, workers: workers.map((w) => ({ taskId: w.taskId, role: w.role, coordinator: w.coordinator, sandbox: w.sandbox, writeScope: w.writeScope, worktree: null, branch: null, promptHash: null, status: "planned", pid: null, cmdShim: null, processCreatedAt: null, codexThreadId: null, pane: null, startedAt: null, finishedAt: null, lastEventAt: null, exitCode: null, failure: null, usage: null, verdict: null, changedPaths: [], outsideScope: [], leaseRenewedAt: null })), usage: {}, history: [{ at: plannedAt, event: "planned" }] };
  const directory = path.dirname(runFile(options.state, id)); fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(runFile(options.state, id))) throw new Error(`Run already exists: ${id}.`);
  writeRunRecord(runFile(options.state, id), run);
  const briefDirectory = path.join(directory, id, "briefs"); fs.mkdirSync(briefDirectory, { recursive: true });
  for (const worker of workers) fs.writeFileSync(path.join(briefDirectory, `${worker.taskId}.md`), assertTeamTextSafe(worker.briefText), "utf8");
  try {
    for (const w of workers) {
      const taskInfo = { id: w.taskId, title: `Team run ${id}: ${w.role}`, ownerCoordinator: w.coordinator || "leadership_coordinator", ownerAgent: "codex", ownerSession: `team-${id}`, ...(w.sandbox === "read-only" ? {} : { writeRepo: path.basename(repo), writePaths: w.writeScope.join(", ") }) };
      createTask(options.state, taskInfo);
      setBrief(options.state, { taskId: w.taskId, brief: w.briefText });
      assignTask(options.state, { taskId: w.taskId, ownerAgent: "codex", ownerSession: `team-${id}`, ownerCoordinator: w.coordinator || "leadership_coordinator" });
      transitionTask(options.state, { taskId: w.taskId, status: "todo" });
    }
  } catch (error) { updateRunRecord(runFile(options.state, id), (current) => ({ ...current, status: "failed", failure: error.message, history: [...current.history, { at: now(), event: "planning_failed" }] })); throw error; }
  output({ ok: true, planHash: run.planHash.slice(0, 12), run: readRun(options.state, id) }, options.json); return 0;
}
function hashPlan(workers) {
  const payload = workers.map((worker) => [worker.taskId, worker.role, worker.writeScope, worker.briefText]);
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
function approvalPath(state, id) { return path.join(path.dirname(path.resolve(state)), "approvals", `${id}.baslat.json`); }
// Resume a run that a usage limit paused: the same plan (hash-checked), the same worktrees and branches, and each
// paused worker continues its saved Codex thread. The user's start approval already covered this plan; resume
// does not change it, so no second approval is required. Collecting a paused run instead stays available.
// A run left "running" by a crash, sleep or restart has no live supervisor and workers whose processes are gone.
// resume recovers it the same way: orphaned workers go back to the queue on their saved Codex thread (or start
// fresh in the same worktree when no thread was recorded). A live worker process blocks recovery.
const RECOVER_HEARTBEAT_MS = 60_000;
function workerProcessAlive(worker) { return Number.isInteger(worker.pid) && isPidAlive(worker.pid) && (!worker.processCreatedAt || processCreatedAt(worker.pid) === worker.processCreatedAt); }
function supervisorLockHeld(file) {
  try { const owner = JSON.parse(fs.readFileSync(path.join(path.dirname(file), path.basename(file, ".json"), "supervisor.lock"), "utf8")); const createdAt = processCreatedAt(owner.pid); return isPidAlive(owner.pid) && (!owner.createdAt || !createdAt || createdAt === owner.createdAt); } catch { return false; }
}
const RESUME_WAIT_MAX_MS = 12 * 60 * 60_000;
function resumeCommand(options) {
  ensureTeamExecutionEnabled(); const file = runFile(options.state, options.run); let run = readRun(options.state, options.run);
  if (options.wait && run.status === "paused") {
    // Re-read the run every few seconds: stop waiting as soon as it is no longer paused (aborted, collected or resumed
    // elsewhere), and recompute the target so a later limit message moves it. Never resume before the reset.
    const capAt = Date.now() + RESUME_WAIT_MAX_MS; let announced = null;
    for (;;) {
      const at = nextResumeAt(run, new Date()); if (!at || at.getTime() <= Date.now()) break;
      if (at.getTime() > capAt) throw new Error(`The usage limit resets at ${at.toISOString()}, more than 12 hours away; run resume --wait again later.`);
      if (!options.json && announced !== at.getTime()) { announced = at.getTime(); process.stdout.write(`Waiting for the usage limit to reset: resuming at ${at.toISOString()}.\n`); }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(5000, Math.max(1, at.getTime() - Date.now())));
      run = readRun(options.state, options.run);
      if (run.status !== "paused") throw new Error(`Stopped waiting: ${run.runId} is now ${run.status}.`);
    }
  }
  if (!["paused", "running"].includes(run.status)) throw new Error(`Only a paused run can be resumed; ${run.runId} is ${run.status}.`);
  if (run.status === "running" && !run.workers.some((worker) => ["planned", "queued", "spawning", "running", "paused_limit"].includes(worker.status))) throw new Error(`Only a paused run can be resumed; ${run.runId} is running and has no orphaned worker to recover.`);
  const supervisorIdentity = !run.supervisor?.createdAt || processCreatedAt(run.supervisor?.pid) === run.supervisor.createdAt;
  if (isPidAlive(run.supervisor?.pid) && supervisorIdentity) throw new Error("The run's supervisor is still running; wait for it to stop before resuming.");
  // The reset below stamps a fresh heartbeat, so a second, concurrent resume refuses instead of recovering twice.
  const recovering = run.status === "running";
  if (recovering) {
    const lastLaunch = [...(run.history || [])].reverse().find((item) => ["started", "resumed", "recovered"].includes(item.event))?.at;
    const beat = run.supervisor?.heartbeatAt || lastLaunch;
    const age = beat ? Date.now() - Date.parse(beat) : Infinity;
    if (age < RECOVER_HEARTBEAT_MS || supervisorLockHeld(file)) throw new Error("The run's supervisor is still running; wait for it to stop before resuming.");
    const live = run.workers.filter((worker) => ["spawning", "running"].includes(worker.status) && workerProcessAlive(worker));
    if (live.length) throw new Error(`Worker ${live.map((worker) => worker.taskId).join(", ")} is still running without a supervisor; abort the run or wait for it to finish before resuming.`);
  }
  const persistedPlan = readPlanForRun(options.state, run);
  const byTask = new Map(run.workers.map((worker) => [worker.taskId, worker]));
  const currentPlanHash = hashPlan(persistedPlan.workers.map((worker) => ({ ...worker, role: byTask.get(worker.taskId).role, writeScope: byTask.get(worker.taskId).writeScope })));
  if (currentPlanHash !== run.planHash) throw new Error("plan changed after approval; plan again");
  const resumable = (worker) => worker.status === "paused_limit" || (recovering && ["planned", "queued", "spawning", "running"].includes(worker.status));
  const paused = run.workers.filter(resumable);
  if (!paused.length) throw new Error(recovering ? `Only a paused run can be resumed; ${run.runId} is running and has no orphaned worker to recover.` : "No worker is paused by a usage limit.");
  for (const worker of paused) if (worker.sandbox !== "read-only") { try { renewLease(options.state, { taskId: worker.taskId, minutes: CONTRACT.limits.leaseMinutes }); } catch { /* the supervisor renews leases while it runs */ } }
  updateRunRecord(file, (current) => { if (current.status !== run.status || (recovering && (current.supervisor?.heartbeatAt || null) !== (run.supervisor?.heartbeatAt || null))) throw new Error("The run changed while resuming; check its status and try again."); return ({ ...(current.status === "running" ? current : transitionRun(current, "running")), workers: current.workers.map((worker) => resumable(worker) ? { ...(["planned", "queued"].includes(worker.status) ? worker : transitionWorker(worker, "queued")), resumeThreadId: worker.codexThreadId || null, failure: null, pid: null, cmdShim: null, processCreatedAt: null } : worker), supervisor: { pid: null, createdAt: null, heartbeatAt: now() }, history: [...current.history, { at: now(), event: recovering ? "recovered" : "resumed", workers: paused.map((worker) => worker.taskId) }] }); });
  const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervise", "--run", run.runId, "--state", path.resolve(options.state), "--json"], { cwd: run.repo, detached: true, stdio: "ignore", windowsHide: true });
  supervisor.unref();
  updateRunRecord(file, (current) => ({ ...current, supervisor: { ...current.supervisor, pid: supervisor.pid, createdAt: processCreatedAt(supervisor.pid) } }));
  output({ ok: true, run: readRun(options.state, run.runId), resumed: paused.map((worker) => worker.taskId), recovered: recovering }, options.json); return 0;
}
function startCommand(options) {
  const lock = path.join(path.dirname(runFile(options.state, options.run)), options.run, "start.lock");
  let operation;
  try { operation = acquireTeamOperationLock(lock); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Another start operation owns lock ${lock}.`); throw error; }
  let interrupted = false;
  const onSignal = () => { interrupted = true; };
  process.on("SIGINT", onSignal); process.on("SIGTERM", onSignal);
  try { return startCommandLocked(options, () => interrupted, operation.lockedAt); }
  finally { process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal); operation.release(); }
}
function startCommandLocked(options, wasInterrupted = () => false, lockedAt = now()) {
  ensureTeamExecutionEnabled(); const file = runFile(options.state, options.run); const run = readRun(options.state, options.run);
  const persistedPlan = readPlanForRun(options.state, run);
  const byTask = new Map(run.workers.map((worker) => [worker.taskId, worker]));
  const currentPlanHash = hashPlan(persistedPlan.workers.map((worker) => ({ ...worker, role: byTask.get(worker.taskId).role, writeScope: byTask.get(worker.taskId).writeScope })));
  if (currentPlanHash !== run.planHash) throw new Error("plan changed after approval; plan again");
  const approval = readApproval(path.dirname(path.resolve(options.state)), run.runId, "baslat");
  if (!approvalIsValid(approval, { runId: run.runId, tur: "baslat", plannedAt: run.plannedAt, now: now() })) { const e = new Error("A valid start approval is required."); e.code = "approval-required"; e.exitCode = 3; throw e; }
  const command = resolveCodexCommand();
  const invocation = process.platform === "win32" && command.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(command, ["login", "status"]) : { command, args: ["login", "status"] };
  const login = spawnSync(invocation.command, invocation.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments });
  if (login.status !== 0) throw new Error("Codex is not logged in: run `codex login` (workers use your Codex subscription).");
  if (run.status !== "planned") throw new Error(`Cannot start run in ${run.status} state.`);
  const controlDir = path.join(path.dirname(file), run.runId, "control");
  fs.mkdirSync(controlDir, { recursive: true });
  for (const name of ["abort.json", "pause.json"]) try {
    const controlFile = path.join(controlDir, name);
    const control = JSON.parse(fs.readFileSync(controlFile, "utf8"));
    if (Date.parse(control.requestedAt) >= Date.parse(lockedAt)) continue;
    fs.rmSync(controlFile);
  } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  const createdBranches = [], createdWorktrees = [], activatedTasks = [], generatedFiles = [];
  let supervisor = null;
  const runDir = path.join(path.dirname(file), run.runId), emptyHooks = path.join(runDir, "empty-hooks");
  const addWorktree = (args) => { git(["-c", `core.hooksPath=${emptyHooks}`, ...args], run.repo); };
  try {
    fs.mkdirSync(run.worktreeRoot, { recursive: true }); fs.mkdirSync(emptyHooks, { recursive: true });
    addWorktree(["worktree", "add", "-b", run.integrationBranch, run.integrationWorktree]);
    createdBranches.push(run.integrationBranch); createdWorktrees.push(run.integrationWorktree);
    const plan = readPlanForRun(options.state, run);
    for (const worker of run.workers) {
      const brief = plan.workers.find((w) => w.taskId === worker.taskId), wt = path.join(run.worktreeRoot, worker.taskId);
      const branch = CONTRACT.branches.workerBranchFormat.replace("{runId}", run.runId).replace("{taskId}", worker.taskId);
      addWorktree(["worktree", "add", "-b", branch, wt, run.baseCommit]);
      createdBranches.push(branch); createdWorktrees.push(wt);
      const { developerInstructions } = readRoleToml(worker.role), prompt = composePrompt(developerInstructions, run, worker, brief);
      const schema = path.join(run.worktreeRoot, `${worker.taskId}.handoff.schema.json`), promptPath = path.join(run.worktreeRoot, `${worker.taskId}.prompt.md`);
      fs.writeFileSync(promptPath, prompt, "utf8"); fs.writeFileSync(schema, JSON.stringify(HANDOFF_SCHEMA, null, 2), "utf8"); generatedFiles.push(promptPath, schema);
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, worktree: wt, branch, promptHash: crypto.createHash("sha256").update(prompt).digest("hex") } : w) }));
      if (worker.sandbox !== "read-only") renewLease(options.state, { taskId: worker.taskId, minutes: CONTRACT.limits.leaseMinutes });
      transitionTask(options.state, { taskId: worker.taskId, status: "in_progress" }); activatedTasks.push(worker.taskId);
    }
    supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervise", "--run", run.runId, "--state", path.resolve(options.state), "--json"], { cwd: run.repo, detached: true, stdio: "ignore", windowsHide: true });
    supervisor.unref();
    updateRunRecord(file, (current) => ({ ...transitionRun(current, "running"), startedAt: now(), supervisor: { pid: supervisor.pid, createdAt: processCreatedAt(supervisor.pid), heartbeatAt: null }, history: [...current.history, { at: now(), event: "started" }] }));
    const deadline = Date.now() + 10_000;
    let heartbeatSeen = false;
    while (Date.now() < deadline) { if (wasInterrupted()) throw new Error("Start interrupted; rollback was requested."); const current = readRun(options.state, run.runId); if (current.supervisor.heartbeatAt) { heartbeatSeen = true; break; } Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
    if (!heartbeatSeen) throw new Error("Supervisor did not publish its startup heartbeat within 10 seconds.");
    consumeApprovalWith(approvalPath(options.state, run.runId), `team-run start pid=${process.pid}`, (consumedStart) => updateRunRecord(file, (current) => ({ ...current, approvals: { ...current.approvals, start: { consumedAt: consumedStart.kullanildi } } })));
    output({ ok: true, run: readRun(options.state, run.runId) }, options.json); return 0;
  } catch (error) {
    if (supervisor?.pid) {
      const identity = processCreatedAt(supervisor.pid) || readRun(options.state, run.runId).supervisor?.createdAt;
      if (identity && processCreatedAt(supervisor.pid) === identity) stopChild({ pid: supervisor.pid, agentChefCmdShim: true, kill: () => { try { process.kill(supervisor.pid); return true; } catch { return false; } } }, { createdAt: identity, cmdShim: process.platform === "win32" });
      else process.stderr.write(`Could not confirm supervisor identity for pid ${supervisor.pid}; it was left running.\n`);
      const stopBy = Date.now() + 3000;
      while (Date.now() < stopBy && isPidAlive(supervisor.pid)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    for (const wt of createdWorktrees.reverse()) try { addWorktree(["worktree", "remove", "--force", wt]); } catch {}
    for (const branch of createdBranches.reverse()) try { git(["branch", "-D", branch], run.repo); } catch {}
    for (const generated of generatedFiles) try { fs.rmSync(generated, { force: true }); } catch {}
    try { fs.rmdirSync(run.worktreeRoot); } catch { /* retain any unrelated or non-empty directory */ }
    for (const name of ["abort.json", "pause.json"]) try { fs.rmSync(path.join(controlDir, name)); } catch { /* best effort after rollback */ }
    for (const taskId of activatedTasks) try { transitionTask(options.state, { taskId, status: "todo", reason: "Team run start rolled back." }); } catch {}
    try { updateRunRecord(file, (current) => ({ ...current, status: "planned", startedAt: null, supervisor: { pid: null, createdAt: null, heartbeatAt: null }, workers: current.workers.map((worker) => ({ ...worker, worktree: null, branch: null, pid: null, cmdShim: null, processCreatedAt: null, codexThreadId: null, pane: null, idleWarningAt: null, status: "planned", startedAt: null, finishedAt: null, lastEventAt: null, exitCode: null, failure: null, usage: null, verdict: null, changedPaths: [], outsideScope: [], leaseRenewedAt: null })), history: [...current.history, { at: now(), event: "start_rolled_back" }] })); } catch {}
    throw error;
  }
}
const HANDOFF_SCHEMA = { type: "object", additionalProperties: false, required: ["outcome", "evidence", "changedScope", "risks", "openQuestions", "needs", "nextVerification", "verdict", "mutationCheck"], properties: { outcome: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, changedScope: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, openQuestions: { type: "array", items: { type: "string" } }, needs: { type: "array", items: { type: "object", additionalProperties: false, required: ["role", "why"], properties: { role: { type: "string" }, why: { type: "string" } } } }, nextVerification: { type: "string" }, verdict: { enum: ["pass", "warn", "partial", "blocked", "fail"] }, mutationCheck: { type: "object", additionalProperties: false, required: ["claimedPaths", "outsideScope"], properties: { claimedPaths: { type: "array", items: { type: "string" } }, outsideScope: { type: "array", items: { type: "string" } } } } } };
function composePrompt(roleInstructions, run, worker, item) {
  const text = item.briefText || fs.readFileSync(path.resolve(path.dirname(run.planFile), item.briefFile || ""), "utf8");
  return composeWorkerPrompt({ roleInstructions, runId: run.runId, taskId: worker.taskId, role: worker.role, brief: text });
}
function readPlanForRun(state, run) {
  // Planned metadata stores validated brief content without storing filesystem paths.
  // Start resolves the original plan beside the board only when it still exists.
  const briefDir = path.join(path.dirname(path.resolve(state)), "team-runs", run.runId, "briefs");
  if (!fs.existsSync(briefDir)) throw new Error("Validated plan briefs are unavailable; re-plan this run.");
  return { workers: run.workers.map((worker) => {
    const briefFile = path.join(briefDir, `${worker.taskId}.md`);
    const briefText = fs.readFileSync(briefFile, "utf8"); assertTeamTextSafe(briefText);
    if (!parseBrief(briefText).ok) throw new Error(`Persisted brief for ${worker.taskId} is invalid.`);
    return { taskId: worker.taskId, briefFile, briefText };
  }) };
}
async function statusCommand(options) {
  const watchSeconds = Number(options["watch-seconds"] || 0);
  if (!Number.isInteger(watchSeconds) || watchSeconds < 0 || watchSeconds > 3600) throw new CliUsageError("--watch-seconds must be an integer from 0 to 3600.");
  const deadline = Date.now() + watchSeconds * 1000;
  const snapshots = [];
  do {
  const run = readRun(options.state, options.run);
  const supervisorAge = run.supervisor.heartbeatAt ? Date.now() - Date.parse(run.supervisor.heartbeatAt) : Infinity;
  const supervisorIdentityMatches = !run.supervisor.createdAt || processCreatedAt(run.supervisor.pid) === run.supervisor.createdAt;
  const supervisorAlive = Number.isInteger(run.supervisor.pid) ? isPidAlive(run.supervisor.pid) && supervisorIdentityMatches && supervisorAge < 30_000 : false;
  const warnings = [];
  for (const worker of run.workers) {
    if (!worker.worktree || !fs.existsSync(worker.worktree)) continue;
    const changed = porcelainPaths(worker.worktree);
    const outside = changed.filter((file) => !pathWithinScope(file, worker.writeScope));
    if (outside.length) warnings.push({ taskId: worker.taskId, outsideScope: outside });
  }
  const resumeAt = run.status === "paused" ? nextResumeAt(run, new Date())?.toISOString() || null : null;
  const snapshot = { ok: true, run, planHash: run.planHash?.slice(0, 12) || null, supervisor: { alive: supervisorAlive, heartbeatAgeMs: Number.isFinite(supervisorAge) ? supervisorAge : null }, resumeAt, warnings };
  if (options.json) snapshots.push(snapshot); else output(snapshot, false);
  if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  if (options.json) output(watchSeconds ? { ok: true, snapshots } : snapshots[0], true);
  return 0;
}
function isPidAlive(pid) { return isProcessAlive(pid); }
function acquireSupervisorLock(file) {
  const lockFile = path.join(path.dirname(file), path.basename(file, ".json"), "supervisor.lock");
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const owner = { pid: process.pid, createdAt: processCreatedAt(process.pid) };
  const acquire = () => { const fd = fs.openSync(lockFile, "wx"); fs.writeFileSync(fd, `${JSON.stringify(owner)}\n`); fs.closeSync(fd); };
  try { acquire(); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(lockFile, "utf8")); } catch { throw new Error("A supervisor lock exists and cannot be verified."); }
    const alive = isPidAlive(existing.pid);
    const createdAt = processCreatedAt(existing.pid);
    if (alive && (!existing.createdAt || !createdAt || createdAt === existing.createdAt)) throw new Error("A supervisor is already active for this run.");
    fs.rmSync(lockFile, { force: true }); acquire();
  }
  return () => {
    try { const current = JSON.parse(fs.readFileSync(lockFile, "utf8")); if (current.pid === owner.pid && current.createdAt === owner.createdAt) fs.rmSync(lockFile, { force: true }); } catch { /* lock was already removed or replaced */ }
  };
}
function superviseCommand(options) {
  const file = runFile(options.state, options.run), releaseSupervisorLock = acquireSupervisorLock(file); let stopping = false; let timer = null;
  const active = new Map(); const started = Date.now();
  const stop = () => { stopping = true; if (timer) clearTimeout(timer); timer = null; for (const entry of active.values()) stopChild(entry.child, { createdAt: entry.createdAt }); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  let tickFailures = 0; let memoryHeld = 0; let memoryHoldLoggedAt = 0;
  const tick = async () => {
    timer = null;
    if (stopping) return;
    try {
    let run = readRun(options.state, options.run);
    const heartbeatAt = now();
    updateRunRecord(file, (current) => ({ ...current, supervisor: { ...current.supervisor, heartbeatAt } }));
    run = readRun(options.state, options.run);
    if (run.status === "paused") {
      if (active.size) { timer = setTimeout(tick, 1000); return; }
      return;
    }
    for (const worker of run.workers) {
      if (worker.sandbox !== "read-only" && active.has(worker.taskId) && Date.now() - Date.parse(worker.leaseRenewedAt || worker.startedAt || heartbeatAt) > CONTRACT.limits.leaseRenewMinutes * 60_000) {
        renewLease(options.state, { taskId: worker.taskId, minutes: CONTRACT.limits.leaseMinutes });
        updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, leaseRenewedAt: heartbeatAt } : w) }));
      }
    }
    for (const worker of run.workers.filter((item) => item.status === "running" && Date.now() - Date.parse(item.startedAt) > run.maxMinutes * 60_000)) {
      const entry = active.get(worker.taskId);
      if (entry) stopChild(entry.child, { createdAt: entry.createdAt });
      active.delete(worker.taskId);
      settleWorker(file, worker.taskId, "timed_out", 1, "worker_time_limit_exceeded");
    }
    const controlDir = path.join(path.dirname(file), run.runId, "control");
    const abortFile = path.join(controlDir, "abort.json"), pauseFile = path.join(controlDir, "pause.json");
    if (fs.existsSync(abortFile)) { stop(); abortWorkers(options.state, file, run, JSON.parse(fs.readFileSync(abortFile, "utf8")).reason || "aborted"); return; }
    if (fs.existsSync(pauseFile)) { stop(); updateRunRecord(file, (current) => ({ ...transitionRun(current, "paused"), history: [...current.history, { at: now(), event: "paused" }] })); return; }
    for (const worker of run.workers) {
      if (worker.status === "running" && worker.lastEventAt && Date.now() - Date.parse(worker.lastEventAt) >= CONTRACT.limits.idleWarningMinutes * 60_000 && !worker.idleWarningAt) {
        appendEvent(file, worker.taskId, { type: "idle_warning", at: now() });
        updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, idleWarningAt: now() } : w) }));
      }
      if (worker.status !== "running" || !worker.lastEventAt) continue;
      const idle = Date.now() - Date.parse(worker.lastEventAt);
      if (idle >= Number(process.env.AGENTCHEF_TEAM_IDLE_KILL_MINUTES || CONTRACT.limits.idleStopMinutes) * 60_000) { const item = active.get(worker.taskId); if (item) stopChild(item.child, { createdAt: item.createdAt }); settleWorker(file, worker.taskId, "timed_out", 1, "idle_timeout"); }
    }
    run = readRun(options.state, options.run);
    const available = Math.max(0, run.maxWorkers - active.size);
    const pending = run.workers.filter((w) => w.status === "planned" || w.status === "queued");
    let launchable = Math.min(available, pending.length);
    // Memory guard: hold queued workers while free RAM is short. One worker may always start when none is active,
    // so a low-memory machine slows the run down instead of deadlocking it. AGENTCHEF_TEAM_MEMORY_GUARD=off disables it.
    if (launchable > 0 && process.env.AGENTCHEF_TEAM_MEMORY_GUARD !== "off") {
      const memory = memoryAllowance({ wanted: launchable });
      const allowed = active.size === 0 ? Math.max(1, memory.allowed) : memory.allowed;
      // Log a hold only when the held count changes, and at most once a minute, so RAM hovering at the threshold
      // does not flood the run history.
      const held = launchable - allowed;
      if (held > 0 && held !== memoryHeld && Date.now() - memoryHoldLoggedAt >= 60_000) { memoryHeld = held; memoryHoldLoggedAt = Date.now(); updateRunRecord(file, (current) => ({ ...current, history: [...current.history, { at: now(), event: "memory_hold", held, freeMb: Math.round(memory.freeBytes / 1048576) }] })); }
      if (held === 0) memoryHeld = 0;
      launchable = allowed;
    }
    for (const worker of pending.slice(0, launchable)) launchWorker(options, run, worker, file, active);
    run = readRun(options.state, options.run);
    if (run.workers.every((w) => TERMINAL_WORKERS.has(w.status))) { updateRunRecord(file, (current) => ({ ...current, history: [...current.history, { at: now(), event: "supervisor_complete" }] })); return; }
    tickFailures = 0;
    timer = setTimeout(tick, 1000);
    } catch (error) {
      if (stopping) {
        const message = String(error?.message || error).slice(0, 500);
        try { assertTeamTextSafe(message); } catch { /* do not persist sensitive error text */ }
        try { updateRunRecord(file, (current) => ({ ...current, status: "failed", failure: "supervisor could not finish abort or pause bookkeeping", history: [...current.history, { at: now(), event: "supervisor_stop_failed" }] })); } catch { /* durable storage failure cannot be repaired here */ }
        timer = null;
        return;
      }
      // A transient file-system error (for example a status panel holding the run record open on Windows) must not
      // kill healthy workers: retry the tick, and fail closed only after repeated consecutive failures.
      tickFailures += 1;
      if (tickFailures < SUPERVISOR_TICK_FAILURE_LIMIT) { timer = setTimeout(tick, 2000); return; }
      for (const entry of active.values()) stopChild(entry.child, { createdAt: entry.createdAt });
      const message = String(error?.message || error).slice(0, 500);
      let failure = message;
      try { assertTeamTextSafe(failure); } catch { failure = "supervisor error omitted by content safety filter"; }
      try { updateRunRecord(file, (current) => ({ ...current, status: "failed", failure, history: [...current.history, { at: now(), event: "supervisor_tick_failed" }], workers: current.workers.map((worker) => ["spawning", "running"].includes(worker.status) ? { ...worker, status: "failed", failure, finishedAt: now() } : worker) })); } catch { /* the original supervisor failure is already fail-closed */ }
      for (const worker of run.workers) if (["spawning", "running"].includes(worker.status)) releaseFailedWorkerLease(options.state, worker.taskId);
      active.clear();
    }
  };
  const launchWorker = (options, run, worker, file, activeMap) => {
    const plan = readPlanForRun(options.state, run); const item = plan.workers.find((w) => w.taskId === worker.taskId);
    const promptPath = path.join(run.worktreeRoot, `${worker.taskId}.prompt.md`);
    const prompt = fs.readFileSync(promptPath, "utf8"); const schema = path.join(run.worktreeRoot, `${worker.taskId}.handoff.schema.json`); const resultPath = path.join(run.worktreeRoot, `${worker.taskId}.final.json`);
    updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => {
      if (w.taskId !== worker.taskId) return w;
      const queued = w.status === "planned" ? transitionWorker(w, "queued") : w;
      return { ...transitionWorker(queued, "spawning"), startedAt: now(), lastEventAt: now() };
    }) }));
    let execution;
    try { execution = spawnCodexExec({ resumeThreadId: worker.resumeThreadId || undefined, prompt, worktree: worker.worktree, runDir: path.join(path.dirname(file), run.runId, worker.taskId), schema, output: resultPath, runId: run.runId, taskId: worker.taskId, role: worker.role, boardState: path.resolve(options.state), sandbox: worker.sandbox, model: run.model, profile: run.profile, onActivity: () => updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, lastEventAt: now(), idleWarningAt: null } : w) })) }); }
    catch (error) { settleWorker(file, worker.taskId, "failed", 1, error.message); return; }
    const child = execution.child; const createdAt = processCreatedAt(child?.pid) || null; activeMap.set(worker.taskId, { child, createdAt });
    try { updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...transitionWorker(w, "running"), pid: child?.pid || null, cmdShim: child?.agentChefCmdShim === true, processCreatedAt: createdAt, startedAt: now() } : w) })); }
    catch { /* keep the spawned child owned and monitored */ }
    try {
      const pane = openViewerPane({ root: ROOT, state: path.resolve(options.state), worktree: worker.worktree, runId: run.runId, taskId: worker.taskId });
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, pane } : w) }));
    } catch { /* viewer panes are optional */ }
    execution.then((result) => {
      activeMap.delete(worker.taskId);
      const abortFile = path.join(path.dirname(file), run.runId, "control", "abort.json");
      if (fs.existsSync(abortFile)) { settleWorker(file, worker.taskId, "aborted", result.exitCode, "abort_requested", result); return; }
      if (result.failure?.kind === "usage_limit" && result.exitCode !== 0) { settleWorker(file, worker.taskId, "paused_limit", result.exitCode, result.failure.message, result); updateRunRecord(file, (current) => ({ ...current, status: "paused", history: [...current.history, { at: now(), event: "usage_limit" }] })); }
      else settleWorker(file, worker.taskId, result.exitCode === 0 && !result.failure ? "finished" : "failed", result.exitCode, result.failure?.message || null, result);
    }).catch((error) => { activeMap.delete(worker.taskId); const abortFile = path.join(path.dirname(file), run.runId, "control", "abort.json"); settleWorker(file, worker.taskId, fs.existsSync(abortFile) ? "aborted" : "failed", 1, fs.existsSync(abortFile) ? "abort_requested" : error.message); });
  };
  tick();
  return new Promise((resolve) => { const poll = () => { if (!timer && active.size === 0 && Date.now() - started > 500) resolve(0); else setTimeout(poll, 250); }; poll(); }).finally(releaseSupervisorLock);
}
function settleWorker(file, taskId, status, exitCode, failure, result = {}) {
  updateRunRecord(file, (current) => {
    const worker = current.workers.find((w) => w.taskId === taskId);
    if (!worker || ["failed", "paused_limit", "timed_out", "aborted", "scope_violation", "rejected_content", "collected", "integrated", "conflict"].includes(worker.status)) return current;
    return { ...current, workers: current.workers.map((w) => w.taskId === taskId ? { ...transitionWorker(w, status), exitCode, failure, finishedAt: now(), usage: result.usage || null, codexThreadId: result.threadId || null, lastEventAt: now() } : w), history: [...current.history, { at: now(), event: `worker_${status}`, taskId }] };
  });
}
function appendEvent(file, taskId, event) { const location = path.join(path.dirname(file), path.basename(file, ".json"), taskId, "events.jsonl"); fs.mkdirSync(path.dirname(location), { recursive: true }); fs.appendFileSync(location, `${JSON.stringify(event)}\n`); }
function abortWorkers(state, file, run, reason) {
  for (const w of run.workers) {
    if (["planned", "queued", "running", "spawning", "paused_limit"].includes(w.status)) {
      stopRecordedWorker(w);
      try { transitionTask(state, { taskId: w.taskId, status: "todo", reason: "Team run work was aborted; release its lease." }); } catch { /* task may already be terminal */ }
    } else if (["failed", "timed_out", "scope_violation", "rejected_content", "aborted"].includes(w.status)) releaseFailedWorkerLease(state, w.taskId);
  }
  updateRunRecord(file, (current) => ({ ...current, status: "aborted", workers: current.workers.map((w) => ["planned", "queued", "running", "spawning", "paused_limit"].includes(w.status) ? { ...w, status: "aborted", finishedAt: now(), failure: reason } : w), history: [...current.history, { at: now(), event: "aborted", reason }] }));
}
function stopRecordedWorker(worker) {
  if (!Number.isInteger(worker.pid) || !worker.processCreatedAt) return false;
  const child = { pid: worker.pid, agentChefCmdShim: worker.cmdShim === true, kill: () => {
    if (process.platform === "win32" && processCreatedAt(worker.pid) !== worker.processCreatedAt) return false;
    try { process.kill(worker.pid); return true; } catch { return false; }
  } };
  return stopChild(child, { createdAt: worker.processCreatedAt, cmdShim: worker.cmdShim === true });
}
function abortCommand(options) {
  const file = runFile(options.state, options.run); const run = readRun(options.state, options.run);
  const reason = options.reason || "cancelled by conductor"; assertTeamTextSafe(reason);
  const startLock = path.join(path.dirname(file), run.runId, "start.lock");
  if (fs.existsSync(startLock)) {
    const controlDir = path.join(path.dirname(file), run.runId, "control"); fs.mkdirSync(controlDir, { recursive: true });
    fs.writeFileSync(path.join(controlDir, "abort.json"), JSON.stringify({ runId: run.runId, reason, requestedAt: now() }, null, 2));
    output({ ok: true, requested: "abort", runId: run.runId, deferred: true }, options.json); return 0;
  }
  if (run.status === "planned" || !isPidAlive(run.supervisor?.pid)) { abortWorkers(options.state, file, run, reason); output({ ok: true, requested: "abort", runId: run.runId }, options.json); return 0; }
  const controlDir = path.join(path.dirname(file), run.runId, "control"); fs.mkdirSync(controlDir, { recursive: true });
  fs.writeFileSync(path.join(controlDir, "abort.json"), JSON.stringify({ runId: run.runId, reason, requestedAt: now() }, null, 2));
  output({ ok: true, requested: "abort", runId: run.runId }, options.json); return 0;
}
function watchCommand(options) {
  const run = readRun(options.state, options.run);
  const worker = run.workers.find((entry) => entry.taskId === options.task);
  if (!worker) throw new CliUsageError(`Unknown task in run: ${options.task}.`);
  const file = runFile(options.state, options.run);
  const events = path.join(path.dirname(file), options.run, options.task, "events.jsonl"); let offset = 0;
  const started = Date.now(); const maxMs = Number(process.env.AGENTCHEF_TEAM_WATCH_MS || (run.maxMinutes + 5) * 60_000);
  const tick = () => { if (fs.existsSync(events)) { const content = fs.readFileSync(events, "utf8"); const fresh = content.slice(offset); offset = content.length; for (const line of fresh.split(/\r?\n/).filter(Boolean)) {
    let display = redactCliPaths(line, { root: run.repo, pathRedactions: [{ target: worker.worktree, replacement: "${WORKTREE}" }, { target: run.worktreeRoot, replacement: "${WORKTREE_ROOT}" }] });
    try { assertTeamTextSafe(display); } catch { display = "[sensitive event omitted]"; }
    process.stdout.write(`${display}\n`);
  } } const latest = readRun(options.state, options.run).workers.find((entry) => entry.taskId === worker.taskId); if (latest && TERMINAL_WORKERS.has(latest.status)) return; if (Date.now() - started < maxMs) setTimeout(tick, 500); };
  tick(); return new Promise((resolve) => { const finish = () => { const latest = readRun(options.state, options.run).workers.find((entry) => entry.taskId === worker.taskId); if ((latest && TERMINAL_WORKERS.has(latest.status)) || Date.now() - started >= maxMs) resolve(0); else setTimeout(finish, 250); }; finish(); });
}

function gitBytes(args, cwd) { return execFileSync("git", args, { cwd, encoding: "buffer", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
function porcelainPaths(cwd) {
  const fields = gitBytes(["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd).toString("utf8").split("\0");
  const paths = [];
  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i]; if (!entry) continue;
    const status = entry.slice(0, 2), file = entry.slice(3);
    paths.push(file.replace(/\\/g, "/"));
    if (status.includes("R") || status.includes("C")) {
      const previous = fields[++i];
      if (previous) paths.push(previous.replace(/\\/g, "/"));
    }
  }
  return [...new Set(paths)];
}
const BOARD_EVIDENCE_LIMIT = 1900;
function boardEvidence(text) {
  const value = String(text);
  if (value.length <= BOARD_EVIDENCE_LIMIT) return value;
  const end = value.charCodeAt(BOARD_EVIDENCE_LIMIT - 1);
  const cut = end >= 0xD800 && end <= 0xDBFF ? BOARD_EVIDENCE_LIMIT - 1 : BOARD_EVIDENCE_LIMIT;
  return `${value.slice(0, cut)} [truncated: ${value.length} characters; full text in the worker report]`;
}
function committedPaths(cwd, base) {
  return [...new Set(gitBytes(["-c", "core.quotePath=false", "diff", "--name-only", "-z", base, "HEAD"], cwd).toString("utf8").split("\0").filter(Boolean).map((item) => item.replace(/\\/g, "/")))];
}
const SUPERVISOR_TICK_FAILURE_LIMIT = 5;
function teamExecutionEnabled(env = process.env) {
  const value = String(env[CONTRACT.execution.optInEnv] ?? "").trim().toLowerCase();
  if (!value) return CONTRACT.execution.enabled === true;
  return ["on", "1", "true", "yes", "enabled", "experimental"].includes(value) && CONTRACT.execution.enabled === true;
}
function pathWithinScope(file, scopes) {
  const candidate = file.replace(/\\/g, "/").toLocaleLowerCase("en-US");
  return scopes.some((scope) => {
    const allowed = scope.replace(/\\/g, "/").replace(/\/$/, "").toLocaleLowerCase("en-US");
    return allowed === "." || candidate === allowed || candidate.startsWith(`${allowed}/`);
  });
}
function workerFinalPath(run, worker) {
  const candidates = [path.join(run.worktreeRoot, `${worker.taskId}.final.json`), path.join(worker.worktree, "final.json")];
  return candidates.find((candidate) => fs.existsSync(candidate));
}
function assertAddedDiffTextSafe(diff) {
  let file = "unknown", oldLine = 0, newLine = 0;
  for (const line of String(diff).split(/\r?\n/)) {
    if (line.startsWith("+++ ")) { file = line.slice(4).replace(/^b\//, ""); continue; }
    if (line.startsWith("--- ")) continue;
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); continue; }
    if (line.startsWith("+")) {
      const category = secretLikeCategory(line.slice(1));
      if (category) throw new Error(`Team content in ${file}:${newLine} contains a ${category} and was rejected.`);
      newLine++;
    } else if (line.startsWith("-")) oldLine++;
    else if (line.startsWith(" ")) { oldLine++; newLine++; }
  }
}
function releaseFailedWorkerLease(state, taskId) {
  try { transitionTask(state, { taskId, status: "todo", reason: "Worker did not produce a collectable change; release its lease." }); } catch { /* already transitioned or terminal */ }
}
function releaseRunFailedLeases(state, run) {
  for (const worker of run.workers) if (["failed", "timed_out", "scope_violation", "rejected_content", "aborted"].includes(worker.status)) releaseFailedWorkerLease(state, worker.taskId);
}
function collectCommand(options) {
  const file = runFile(options.state, options.run), run = readRun(options.state, options.run);
  if (!["running", "paused", "collected"].includes(run.status)) throw new Error(`Cannot collect a run in ${run.status} state.`);
  const selected = options.task ? run.workers.filter((worker) => worker.taskId === options.task) : run.workers;
  if (options.task && !selected.length) throw new CliUsageError(`Unknown task in run: ${options.task}.`);
  let partial = false;
  for (const worker of selected) {
    if (worker.status === "collected") continue;
    if (worker.status !== "finished") { partial = true; if (["failed", "timed_out", "scope_violation", "rejected_content", "aborted"].includes(worker.status)) releaseFailedWorkerLease(options.state, worker.taskId); continue; }
    const final = workerFinalPath(run, worker);
    if (!final) { partial = true; settleWorker(file, worker.taskId, "failed", 1, "final handoff file is missing"); releaseFailedWorkerLease(options.state, worker.taskId); continue; }
    let handoff;
    try { handoff = parseWorkerHandoff(fs.readFileSync(final, "utf8")).data; }
    catch (error) { partial = true; settleWorker(file, worker.taskId, "failed", 1, `invalid final handoff: ${error.message}`); releaseFailedWorkerLease(options.state, worker.taskId); continue; }
    const deliverySubject = `feat(team-mode): ${worker.taskId} worker delivery`;
    let changed = [...new Set([...committedPaths(worker.worktree, run.baseCommit), ...porcelainPaths(worker.worktree)])], priorCommit = null;
    if (worker.sandbox !== "read-only") {
      const head = git(["rev-parse", "HEAD"], worker.worktree);
      if (head !== run.baseCommit) priorCommit = head;
    }
    const outside = changed.filter((item) => !pathWithinScope(item, worker.writeScope));
    if (outside.length) {
      partial = true;
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "scope_violation"), changedPaths: changed, outsideScope: [...new Set([...outside, ...handoff.mutationCheck.outsideScope])], verdict: handoff.verdict, failure: "actual worktree changes exceed the declared write scope" } : item), history: [...current.history, { at: now(), event: "scope_violation", taskId: worker.taskId }] }));
      releaseFailedWorkerLease(options.state, worker.taskId);
      continue;
    }
    if (worker.sandbox === "read-only") {
      const reportId = `${worker.taskId}-${worker.role}.md`;
      const reportDir = path.join(path.dirname(file), run.runId, "reports"); fs.mkdirSync(reportDir, { recursive: true });
      const report = renderHandoffMarkdown(handoff); assertTeamTextSafe(report);
      fs.writeFileSync(path.join(reportDir, reportId), `${report}\n\n## Actual Git mutations\n- None (read-only worker)\n`, "utf8");
      try {
        const evidence = boardEvidence(`Verdict: ${handoff.verdict}. Mutation check: none - read-only report collected; no commit created. Evidence: ${handoff.evidence.join("; ") || "none"}.`);
        const task = JSON.parse(fs.readFileSync(options.state, "utf8")).tasks.find((item) => item.id === worker.taskId);
        if (!task?.evidence?.some((item) => item.text === evidence)) addEvidence(options.state, { taskId: worker.taskId, evidence });
        attachReport(options.state, { taskId: worker.taskId, reportId });
        if (task?.status !== "review") transitionTask(options.state, { taskId: worker.taskId, status: "review" });
      } catch (error) {
        partial = true;
        updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "failed"), failure: `coordination board rejected collection: ${error.message}` } : item) }));
        continue;
      }
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "collected"), verdict: handoff.verdict, changedPaths: [], outsideScope: [], reportId, commit: null } : item), history: [...current.history, { at: now(), event: "worker_collected_read_only", taskId: worker.taskId }] }));
      if (handoff.verdict !== "pass") partial = true;
      continue;
    }
    if (!changed.length) { partial = true; settleWorker(file, worker.taskId, "failed", 1, "worker produced no Git changes"); releaseFailedWorkerLease(options.state, worker.taskId); continue; }
    const emptyHooks = path.join(path.dirname(file), run.runId, "empty-hooks"); fs.mkdirSync(emptyHooks, { recursive: true });
    const dirtyPaths = porcelainPaths(worker.worktree);
    if (dirtyPaths.length) git(["add", "-A"], worker.worktree);
    const report = renderHandoffMarkdown(handoff);
    const evidenceText = boardEvidence(`Verdict: ${handoff.verdict}. Mutation check: ${changed.join(", ")}. Evidence: ${handoff.evidence.join("; ") || "none"}.`);
    try {
      // Index vs base covers the worker's own commits and the files it left dirty (both are staged above).
      assertAddedDiffTextSafe(git(["-c", "core.quotePath=false", "diff", "--cached", "--no-ext-diff", "--no-textconv", "--unified=0", run.baseCommit], worker.worktree));
      if (priorCommit && dirtyPaths.length) assertAddedDiffTextSafe(git(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", "--cached"], worker.worktree));
      assertTeamTextSafe(report); assertTeamTextSafe(evidenceText);
    } catch (error) {
      if (!/contains a .+ and was rejected\.$/.test(error.message)) throw error;
      partial = true;
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "rejected_content"), failure: error.message } : item), history: [...current.history, { at: now(), event: "worker_content_rejected", taskId: worker.taskId }] }));
      releaseFailedWorkerLease(options.state, worker.taskId);
      continue;
    }
    if (!priorCommit || dirtyPaths.length) git(["-c", `core.hooksPath=${emptyHooks}`, "commit", "--no-verify", "-m", deliverySubject], worker.worktree);
    const commit = dirtyPaths.length || !priorCommit ? git(["rev-parse", "HEAD"], worker.worktree) : priorCommit;
    const reportId = `${worker.taskId}-${worker.role}.md`;
    const reportDir = path.join(path.dirname(file), run.runId, "reports"); fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, reportId), `${report}\n\n## Actual Git mutations\n${changed.map((item) => `- ${item}`).join("\n")}\n`, "utf8");
    try {
      const board = JSON.parse(fs.readFileSync(options.state, "utf8"));
      const task = board.tasks.find((item) => item.id === worker.taskId);
      // Evidence and report first: the board's review gate (1.7.0) needs the latest evidence before the transition.
      if (!task?.evidence?.some((item) => item.text === evidenceText)) addEvidence(options.state, { taskId: worker.taskId, evidence: evidenceText });
      attachReport(options.state, { taskId: worker.taskId, reportId });
      if (task?.status !== "review") transitionTask(options.state, { taskId: worker.taskId, status: "review" });
    } catch (error) {
      partial = true;
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "failed"), failure: `coordination board rejected collection: ${error.message}` } : item) }));
      continue;
    }
    updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "collected"), verdict: handoff.verdict, changedPaths: changed, outsideScope: [], reportId, commit } : item), history: [...current.history, { at: now(), event: priorCommit ? "worker_collected_existing_commit" : "worker_collected", taskId: worker.taskId }] }));
    if (handoff.verdict !== "pass") partial = true;
  }
  const current = readRun(options.state, options.run);
  if (current.workers.every((worker) => ["collected", "scope_violation", "rejected_content", "failed", "aborted", "timed_out", "paused_limit"].includes(worker.status))) {
    if (current.status !== "collected") updateRunRecord(file, (record) => ({ ...transitionRun(record, "collected"), history: [...record.history, { at: now(), event: "collection_complete" }] }));
  }
  output({ ok: !partial, run: readRun(options.state, options.run) }, options.json);
  return partial ? 4 : 0;
}
function conflictPaths(cwd) { return gitBytes(["diff", "--name-only", "--diff-filter=U", "-z"], cwd).toString("utf8").split("\0").filter(Boolean).map((item) => item.replace(/\\/g, "/")); }
function runCheck(command, cwd, timeoutMs) {
  const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) || [];
  if (!parts.length) throw new Error("An integration check cannot be empty.");
  let invocation = { command: parts[0], args: parts.slice(1) };
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(invocation.command)) invocation = cmdShimInvocation(invocation.command, invocation.args);
  const result = spawnSync(invocation.command, invocation.args, { cwd, encoding: "utf8", timeout: timeoutMs, windowsHide: true, windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments });
  const safeOutput = (value) => { try { return assertTeamTextSafe(String(value || "")).slice(0, 10_000); } catch { return "[sensitive command output omitted]"; } };
  return { command, status: result.status ?? 1, signal: result.signal || null, stdout: safeOutput(result.stdout), stderr: safeOutput(result.stderr), error: result.error?.message ? safeOutput(result.error.message) : null };
}
function integrateCommand(options) {
  const file = runFile(options.state, options.run), run = readRun(options.state, options.run);
  if (options.recheck) return recheckIntegration(options, file, run);
  if (run.status !== "collected") throw new Error(`Cannot integrate a run in ${run.status} state.${run.status === "integrated" && run.integration && !run.integration.ok ? " After repairing the integration branch, rerun its checks with --recheck." : ""}`);
  const cwd = run.integrationWorktree || path.join(run.worktreeRoot, "_integration");
  if (!fs.existsSync(path.join(cwd, ".git"))) throw new Error("Integration worktree is missing.");
  const merged = [], conflicts = [];
  for (const worker of run.workers.filter((entry) => entry.status === "collected")) {
    if (worker.sandbox === "read-only") {
      merged.push(worker.taskId);
      continue;
    }
    try {
      const emptyHooks = path.join(path.dirname(file), run.runId, "empty-hooks"); fs.mkdirSync(emptyHooks, { recursive: true });
      git(["-c", `core.hooksPath=${emptyHooks}`, "merge", "--no-ff", "--no-edit", worker.branch], cwd);
      merged.push(worker.taskId);
    } catch {
      const paths = conflictPaths(cwd);
      try { git(["merge", "--abort"], cwd); } catch { /* preserve the recorded conflict as the primary result */ }
      conflicts.push(...paths);
      updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((item) => item.taskId === worker.taskId ? { ...transitionWorker(item, "conflict"), outsideScope: [...new Set([...item.outsideScope, ...paths])] } : item) }));
    }
  }
  const checks = [], checkList = options.check ? (Array.isArray(options.check) ? options.check : [options.check]) : run.checks;
  let checksOk = conflicts.length === 0;
  const checkDeadline = Date.now() + 20 * 60_000;
  if (checksOk) for (const check of checkList) {
    const remaining = checkDeadline - Date.now();
    if (remaining <= 0) { checks.push({ command: check, status: 1, error: "integration check deadline exceeded" }); checksOk = false; break; }
    const result = runCheck(check, cwd, remaining); checks.push(result);
    if (result.status !== 0) checksOk = false;
  }
  const diff = git(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", run.baseCommit], cwd), stat = git(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", "--stat", run.baseCommit], cwd);
  assertAddedDiffTextSafe(diff); assertAddedDiffTextSafe(stat);
  const integrationCommit = git(["rev-parse", "HEAD"], cwd);
  const runDir = path.join(path.dirname(file), run.runId); fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "integration.diff"), diff, "utf8"); fs.writeFileSync(path.join(runDir, "integration.stat"), stat, "utf8");
  const ok = conflicts.length === 0 && checksOk && merged.length === run.workers.length;
  updateRunRecord(file, (current) => ({ ...transitionRun(current, "integrated"), workers: current.workers.map((item) => merged.includes(item.taskId) && item.status === "collected" ? transitionWorker(item, "integrated") : item), integration: { worktree: cwd, merged, conflicts: [...new Set(conflicts)], checks, ok, diffStat: stat, commit: integrationCommit }, history: [...current.history, { at: now(), event: "integration_complete" }] }));
  output({ ok, run: readRun(options.state, options.run), conflicts: [...new Set(conflicts)], checks }, options.json);
  return ok ? 0 : 4;
}
// After a failed integration the conductor may repair the integration branch (a recorded conductor commit). --recheck
// reruns the run's checks on that branch without merging again, rescans the added diff and records the new result.
// Only a failed integration without conflicts can be rechecked; every worker must already be integrated.
function recheckIntegration(options, file, run) {
  if (run.status !== "integrated" || !run.integration || run.integration.ok) throw new Error("Only a failed integration can be rechecked.");
  if ((run.integration.conflicts || []).length) throw new Error("An integration with merge conflicts cannot be rechecked; resolve the conflicts and integrate again.");
  const cwd = run.integration.worktree || run.integrationWorktree || path.join(run.worktreeRoot, "_integration");
  if (!fs.existsSync(path.join(cwd, ".git"))) throw new Error("Integration worktree is missing.");
  if (git(["status", "--porcelain"], cwd).trim()) throw new Error("The integration worktree has uncommitted changes; commit the repair first.");
  const checks = [], checkList = options.check ? (Array.isArray(options.check) ? options.check : [options.check]) : run.checks;
  let checksOk = true; const checkDeadline = Date.now() + 20 * 60_000;
  for (const check of checkList) {
    const remaining = checkDeadline - Date.now();
    if (remaining <= 0) { checks.push({ command: check, status: 1, error: "integration check deadline exceeded" }); checksOk = false; break; }
    const result = runCheck(check, cwd, remaining); checks.push(result); if (result.status !== 0) checksOk = false;
  }
  const diff = git(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", run.baseCommit], cwd), stat = git(["-c", "core.quotePath=false", "diff", "--no-ext-diff", "--no-textconv", "--unified=0", "--stat", run.baseCommit], cwd);
  assertAddedDiffTextSafe(diff); assertAddedDiffTextSafe(stat);
  const integrationCommit = git(["rev-parse", "HEAD"], cwd);
  const runDir = path.join(path.dirname(file), run.runId); fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "integration.diff"), diff, "utf8"); fs.writeFileSync(path.join(runDir, "integration.stat"), stat, "utf8");
  // --covers TASK-x: the conductor completed a FAILED worker's scope in the integration branch (for example a worker that
  // only diagnosed). Accepted only when the repair commits since the recorded integration touch that worker's write
  // scope and nothing outside the plan's write scopes. Verification and the user's merge approval still apply.
  const covers = (options.covers ? String(options.covers).split(",") : []).map((value) => value.trim()).filter(Boolean);
  const covered = [];
  if (covers.length) {
    const repairPaths = git(["-c", "core.quotePath=false", "diff", "--name-only", `${run.integration.commit}..HEAD`], cwd).split(/\r?\n/).filter(Boolean);
    const planScopes = run.workers.flatMap((worker) => worker.writeScope || []);
    const outside = repairPaths.filter((file) => !pathWithinScope(file, planScopes));
    if (outside.length) throw new Error(`Conductor repair changed files outside the plan's write scopes: ${outside.join(", ")}`);
    for (const taskId of covers) {
      const worker = run.workers.find((item) => item.taskId === taskId);
      if (!worker) throw new Error(`Unknown worker in --covers: ${taskId}`);
      if (!["failed", "timed_out", "rejected_content"].includes(worker.status)) throw new Error(`--covers accepts only a failed worker; ${taskId} is ${worker.status}.`);
      if (!repairPaths.some((file) => pathWithinScope(file, worker.writeScope || []))) throw new Error(`The conductor repair does not touch ${taskId}'s write scope.`);
      covered.push(taskId);
    }
  }
  const ok = checksOk && run.workers.every((worker) => worker.status === "integrated" || covered.includes(worker.taskId));
  updateRunRecord(file, (current) => ({ ...current, integration: { ...current.integration, checks, ok, diffStat: stat, commit: integrationCommit, ...(covered.length ? { coveredByConductor: covered } : {}) }, history: [...current.history, { at: now(), event: "integration_rechecked", ok, commit: integrationCommit, ...(covered.length ? { coveredByConductor: covered } : {}) }] }));
  output({ ok, run: readRun(options.state, options.run), conflicts: [], checks, rechecked: true }, options.json);
  return ok ? 0 : 4;
}
async function verifyCommand(options) {
  const file = runFile(options.state, options.run), run = readRun(options.state, options.run);
  if (run.status !== "integrated" || !run.integration?.ok) throw new Error("Verification requires a successful integration.");
  if (options.detach) {
    const args = [fileURLToPath(import.meta.url), "verify", "--run", run.runId, "--state", path.resolve(options.state), "--json", "--max-minutes", String(options["max-minutes"] || 30)];
    const child = spawn(process.execPath, args, { cwd: run.repo, detached: true, stdio: "ignore", windowsHide: true }); child.unref();
    output({ ok: true, detached: true, pid: child.pid }, options.json); return 0;
  }
  const minutes = Number(options["max-minutes"] || 30);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) throw new CliUsageError("--max-minutes must be an integer from 1 to 30.");
  const task = run.workers[0];
  const brief = readPlanForRun(options.state, run).workers.find((worker) => worker.taskId === task.taskId)?.briefText;
  if (!brief) throw new Error("Validated verifier brief is unavailable.");
  // Hand the verifier the host's integration results: its read-only sandbox cannot create temp directories, so it
  // must not depend on re-running suites that write (2026-10-14: every Codex verification came back partial).
  const hostResults = (run.integration?.checks || []).map((check) => ({ command: check.command, status: check.status, tail: Number(check.status) === 0 ? "" : `${check.stdout || ""}${check.stderr || ""}` }));
  const prompt = composeVerifierPrompt({ runId: run.runId, brief, checks: run.checks, hostResults });
  const integrationCommit = git(["rev-parse", "HEAD"], run.integrationWorktree);
  if (run.integration.commit && integrationCommit !== run.integration.commit) throw new Error("Integration worktree changed after integration checks.");
  const schema = path.join(run.worktreeRoot, "verifier.schema.json"), final = path.join(run.worktreeRoot, "verification.final.json");
  fs.writeFileSync(schema, JSON.stringify(HANDOFF_SCHEMA, null, 2));
  let exec;
  try { exec = spawnCodexExec({ prompt, worktree: run.integrationWorktree, runDir: path.join(path.dirname(file), run.runId, "verification"), schema, output: final, runId: run.runId, taskId: "TASK-VERIFIER", role: "test_verifier", boardState: path.resolve(options.state), sandbox: "read-only", model: run.model, profile: run.profile }); }
  catch (error) { exec = Promise.resolve({ exitCode: 1, threadId: null, failure: { message: error.message } }); exec.child = null; }
  const verifierCreatedAt = processCreatedAt(exec.child?.pid) || null;
  const timer = setTimeout(() => stopChild(exec.child, { createdAt: verifierCreatedAt }), minutes * 60_000);
  let result;
  try { result = await exec; } finally { clearTimeout(timer); }
  let verdict = "fail", failure = result.failure?.message || null;
  if (result.exitCode === 0 && fs.existsSync(final)) {
    try { verdict = parseWorkerHandoff(fs.readFileSync(final, "utf8")).data.verdict; } catch (error) { failure = error.message; }
  }
  const handoff = result.exitCode === 0 && fs.existsSync(final) ? (() => { try { return parseWorkerHandoff(fs.readFileSync(final, "utf8")).data; } catch { return null; } })() : null;
  try { fs.rmSync(final, { force: true }); } catch {}
  const reportId = `verification-${run.runId}.md`, reportDir = path.join(path.dirname(file), run.runId, "reports"); fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, reportId), `# Independent verification\n\nVerdict: ${verdict}\n\nOutcome: ${handoff?.outcome || "Verifier did not provide a valid handoff."}\n\nEvidence:\n${(handoff?.evidence || []).map((item) => `- ${item}`).join("\n") || "- None"}\n\nRisks:\n${(handoff?.risks || []).map((item) => `- ${item}`).join("\n") || "- None"}\n\nChecks: ${run.checks.join(", ") || "No commands specified; integration diff compared with briefs."}\n\n${failure || "No execution failure."}\n`, "utf8");
  if (verdict === "pass" || verdict === "warn") for (const worker of run.workers) addEvidence(options.state, { taskId: worker.taskId, evidence: `verified-by: test_verifier - ${verdict}` });
  updateRunRecord(file, (current) => ({ ...(verdict === "pass" || verdict === "warn" ? transitionRun(current, "verified") : current), verification: { verdict, reportId, threadId: result.threadId || null, at: now(), failure, integrationCommit }, history: [...current.history, { at: now(), event: "verification_complete", verdict }] }));
  output({ ok: verdict === "pass" || verdict === "warn", run: readRun(options.state, options.run) }, options.json);
  return verdict === "pass" || verdict === "warn" ? 0 : 4;
}
function removeWorktrees(run) {
  const removed = [];
  for (const worker of run.workers) if (worker.worktree && fs.existsSync(worker.worktree)) { git(["worktree", "remove", "--force", worker.worktree], run.repo); removed.push(worker.worktree); }
  const integration = run.integrationWorktree || path.join(run.worktreeRoot, "_integration");
  if (fs.existsSync(integration)) { git(["worktree", "remove", "--force", integration], run.repo); removed.push(integration); }
  git(["worktree", "prune"], run.repo);
  return removed;
}
function mergeCommand(options) {
  const lock = path.join(path.dirname(runFile(options.state, options.run)), options.run, "merge.lock");
  let operation;
  try { operation = acquireTeamOperationLock(lock); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Another merge operation owns lock ${lock}.`); throw error; }
  try { return mergeCommandLocked(options); } finally { operation.release(); }
}
function mergeCommandLocked(options) {
  const file = runFile(options.state, options.run), run = readRun(options.state, options.run);
  const approval = readApproval(path.dirname(path.resolve(options.state)), run.runId, "birlestir");
  if (!run.verification?.at || !approvalIsValid(approval, { runId: run.runId, tur: "birlestir", plannedAt: run.verification.at, now: now() })) { const error = new Error("A valid merge approval is required."); error.code = "approval-required"; error.exitCode = 3; throw error; }
  if (run.workers.some((worker) => worker.status === "conflict")) throw new Error("A run with conflicted workers cannot be merged.");
  if (run.status !== "verified" || !["pass", "warn"].includes(run.verification?.verdict) || (run.verification.verdict === "warn" && !options["accept-warn"])) throw new Error("Merge requires a passing verification or --accept-warn for a warning verdict.");
  if (git(["status", "--porcelain=v1"], run.repo) || git(["branch", "--show-current"], run.repo) !== run.baseBranch) throw new Error("Merge requires a clean repository on the recorded base branch.");
  const worktreeCommit = git(["rev-parse", "HEAD"], run.integrationWorktree), branchCommit = git(["rev-parse", run.integrationBranch], run.repo);
  if (!run.verification.integrationCommit || worktreeCommit !== run.verification.integrationCommit || branchCommit !== run.verification.integrationCommit) throw new Error("Verified integration changed before merge.");
  const emptyHooks = path.join(path.dirname(file), run.runId, "empty-hooks"); fs.mkdirSync(emptyHooks, { recursive: true });
  try { git(["-c", `core.hooksPath=${emptyHooks}`, "merge", "--no-ff", run.integrationBranch], run.repo); }
  catch (error) { try { git(["merge", "--abort"], run.repo); } catch {} throw new Error(`Integration merge failed and was aborted: ${error.message}`); }
  try {
    consumeApprovalWith(path.join(path.dirname(path.resolve(options.state)), "approvals", `${run.runId}.birlestir.json`), `team-run merge pid=${process.pid}`, (consumedMerge) => updateRunRecord(file, (current) => ({ ...transitionRun(current, "merged"), approvals: { ...current.approvals, merge: { consumedAt: consumedMerge.kullanildi } }, history: [...current.history, { at: now(), event: "merged" }] })));
  } catch (error) {
    try { git(["merge", "--abort"], run.repo); } catch { /* preserve the state update failure as the primary result */ }
    throw error;
  }
  if (!options["keep-worktrees"]) try { removeWorktrees(run); } catch (error) { output({ ok: true, run: readRun(options.state, options.run), cleanupWarning: `Run merged; worktree cleanup failed: ${error.message}` }, options.json); return 0; }
  output({ ok: true, run: readRun(options.state, options.run) }, options.json); return 0;
}
function cleanupCommand(options) {
  const file = runFile(options.state, options.run), run = readRun(options.state, options.run);
  if (!["merged", "aborted", "failed"].includes(run.status)) throw new Error("Cleanup is allowed only for merged, aborted, or failed runs.");
  const removed = removeWorktrees(run);
  if (options["delete-integration"]) { try { git(["branch", "-D", run.integrationBranch], run.repo); } catch {} }
  if (options["delete-branches"]) for (const worker of run.workers) { try { git(["branch", "-D", worker.branch], run.repo); } catch {} }
  if (options["purge-logs"]) fs.rmSync(path.join(path.dirname(file), run.runId), { recursive: true, force: true });
  output({ ok: true, removedWorktrees: removed, purgedLogs: Boolean(options["purge-logs"]) }, options.json); return 0;
}
function doctorCommand(options) {
  const checks = [], check = (id, ok, details = "") => checks.push({ id, status: ok ? "pass" : "fail", details });
  check("contract", CONTRACT.schemaVersion === 2, `enabled=${CONTRACT.execution.enabled}; switch=${CONTRACT.execution.optInEnv}`);
  const switchValue = process.env[CONTRACT.execution.optInEnv];
  check("execution", teamExecutionEnabled(), `${teamExecutionEnabled() ? "enabled by contract" : "switched off"}; ${CONTRACT.execution.optInEnv}=${switchValue === undefined ? "<unset>" : switchValue}${switchValue && !["on", "1", "true", "yes", "enabled", "experimental"].includes(String(switchValue).trim().toLowerCase()) ? " (unrecognized value treated as off)" : ""}`);
  let codex = null;
  try {
    codex = resolveCodexCommand();
    const versionInvocation = process.platform === "win32" && codex.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(codex, ["--version"]) : { command: codex, args: ["--version"] };
    const version = spawnSync(versionInvocation.command, versionInvocation.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: versionInvocation.options?.windowsVerbatimArguments });
    check("codex.version", version.status === 0, ((version.stdout || "") + (version.stderr || "") || version.error?.message || `exit=${version.status}`).trim());
  }
  catch (error) { check("codex.version", false, error.message); }
  if (codex) {
    const loginArgs = process.platform === "win32" && codex.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(codex, ["login", "status"]) : { command: codex, args: ["login", "status"] };
    const login = spawnSync(loginArgs.command, loginArgs.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: loginArgs.options?.windowsVerbatimArguments }); check("codex.login", login.status === 0, login.status === 0 ? "logged in" : "not logged in: run `codex login` (workers use your Codex subscription)");
    const execHelpArgs = process.platform === "win32" && codex.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(codex, ["exec", "--help"]) : { command: codex, args: ["exec", "--help"] };
    const execHelp = spawnSync(execHelpArgs.command, execHelpArgs.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: execHelpArgs.options?.windowsVerbatimArguments });
    const execFlags = execHelp.stdout || execHelp.stderr || "";
    const resumeHelpArgs = process.platform === "win32" && codex.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(codex, ["exec", "resume", "--help"]) : { command: codex, args: ["exec", "resume", "--help"] };
    const resumeHelp = spawnSync(resumeHelpArgs.command, resumeHelpArgs.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: resumeHelpArgs.options?.windowsVerbatimArguments });
    const resumeFlags = resumeHelp.stdout || resumeHelp.stderr || "";
    const execOk = execHelp.status === 0 && ["--json", "--output-schema", "-o"].every((item) => execFlags.includes(item));
    const resumeOk = resumeHelp.status === 0 && ["--json", "-c", "-m", "--output-schema", "-o", "--ignore-rules"].every((item) => resumeFlags.includes(item));
    check("codex.exec-flags", execOk, "first execution requires --json, --output-schema, and -o");
    check("codex.resume-flags", resumeOk, "resume supports --json, -c, -m, --output-schema, -o, and --ignore-rules; cwd comes from the process working directory; -s, -p, and -C are unavailable");
  }
  // Never launch wt.exe to probe it: Windows Terminal 1.24 answers an unknown flag such as --version with a modal Help dialog
  // instead of an exit code, so a doctor run left dialogs on the user's screen (observed 2026-10-14). Presence on PATH is enough.
  const wtCommand = process.platform === "win32" ? resolveWindowsCli("wt") : null;
  check("windows-terminal", process.platform !== "win32" || Boolean(wtCommand), process.platform === "win32" ? (wtCommand ? `found: ${wtCommand} (not launched)` : "wt.exe not found on PATH; viewer panes unavailable") : "viewer panes are optional on this platform");
  const gitName = spawnSync("git", ["config", "user.name"], { encoding: "utf8", windowsHide: true }), gitEmail = spawnSync("git", ["config", "user.email"], { encoding: "utf8", windowsHide: true });
  check("git.identity", gitName.status === 0 && gitEmail.status === 0 && gitName.stdout.trim() && gitEmail.stdout.trim(), "Git user.name and user.email are required");
  const lastRun = options.state && fs.existsSync(options.state) ? (() => { const dir = path.join(path.dirname(path.resolve(options.state)), "team-runs"); try { return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().at(-1) || null; } catch { return null; } })() : null;
  let maxWorkers = CONTRACT.workers.maxWorkers;
  if (lastRun) try { maxWorkers = readRunRecord(path.join(path.dirname(path.resolve(options.state)), "team-runs", lastRun)).maxWorkers; } catch {}
  const availableMb = Math.floor(os.freemem() / (1024 * 1024)), requiredMb = maxWorkers * CONTRACT.limits.ramPerWorkerMb;
  check("memory", availableMb >= requiredMb, `${availableMb} MiB free; ${requiredMb} MiB required for ${maxWorkers} workers`);
  // Informational: a fresh install has no prior run, which is not a failure (it made every new user's doctor red).
  check("last-run", true, lastRun || "none yet (informational)");
  // Board and approvals: the engine reads approvals from <dirname(state)>/approvals, and only an approval writer
  // (the dual-agent-brain chat hook) creates them. A board elsewhere than Beyin's never receives the chat approvals.
  const statePath = options.state ? path.resolve(options.state) : "";
  check("board", Boolean(statePath) && fs.existsSync(statePath), statePath ? (fs.existsSync(statePath) ? `${statePath}; approvals in ${path.join(path.dirname(statePath), "approvals")}` : `${statePath} is missing; run coordination-board init --state "${statePath}" (beyin takim creates it)`) : "no board state: pass --state or set AGENTCHEF_BOARD_STATE (beyin takim supplies it)");
  const beyinVaultFile = path.join(os.homedir(), ".beyin", "vault.txt");
  let beyinBoard = "";
  try { const vault = fs.readFileSync(beyinVaultFile, "utf8").replace(/^\uFEFF/, "").trim(); if (vault) beyinBoard = path.join(vault, "motor", "scripts", ".state", "board.json"); } catch {}
  const canonical = (value) => { try { return fs.realpathSync.native(value); } catch { return path.resolve(value); } };
  const normalizedBoard = canonical(beyinBoard), normalizedState = canonical(statePath);
  const sameBoard = Boolean(beyinBoard && statePath) && (process.platform === "win32" ? normalizedBoard.toLowerCase() === normalizedState.toLowerCase() : normalizedBoard === normalizedState);
  check("approval-writer", sameBoard, !beyinBoard ? "no approval writer: start and merge need the dual-agent-brain chat hook (github.com/ucsahinn/dual-agent-brain); run team commands through `beyin takim`" : sameBoard ? "dual-agent-brain chat hook writes `baslat <runId>` / `birlestir <runId>` approvals for this board" : `this board is not Beyin's (${beyinBoard}); chat approvals land there, so run team commands through \`beyin takim\``);
  output({ ok: checks.every((entry) => entry.status === "pass"), checks, lastRun }, options.json);
  return checks.some((entry) => entry.id === "codex.version" || entry.id === "codex.login" ? entry.status !== "pass" : false) ? 1 : 0;
}
function dispatch(parsed) {
  const { command, options } = parsed;
  if (command === "plan") return planCommand(options);
  if (command === "start") return startCommand(options);
  if (command === "status") return statusCommand(options);
  if (command === "supervise") return superviseCommand(options);
  if (command === "watch") return watchCommand(options);
  if (command === "abort") return abortCommand(options);
  if (command === "collect") return collectCommand(options);
  if (command === "integrate") return integrateCommand(options);
  if (command === "verify") return verifyCommand(options);
  if (command === "merge") return mergeCommand(options);
  if (command === "cleanup") return cleanupCommand(options);
  if (command === "doctor") return doctorCommand(options);
  if (command === "resume") return resumeCommand(options);
  if (command === "pause") { const error = new Error("pause is reserved for a later version."); error.exitCode = 1; throw error; }
  throw new CliUsageError(USAGE);
}
try {
  const parsed = parse(process.argv.slice(2));
  if (parsed.help) { process.stdout.write(`${USAGE}\n`); process.exitCode = 0; }
  else process.exitCode = await dispatch(parsed);
} catch (error) {
  process.exitCode = emitCliError({ tool: "team-run", error, argv: process.argv.slice(2), root: ROOT, json: process.argv.includes("--json") });
}
