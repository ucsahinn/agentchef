#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseBrief } from "./lib/agent-brief.mjs";
import { CliUsageError, emitCliError, redactCliPaths } from "./lib/cli-error-contract.mjs";
import { openViewerPane, resolveCodexCommand, spawnCodexExec, stopChild } from "./lib/codex-exec.mjs";
import { cmdShimInvocation } from "./lib/platform-command.mjs";
import {
  assignTask, assertTeamTextSafe, approvalIsValid, consumeApproval, createTask,
  effectiveSandbox, headCommit, loadTeamContract, maxConcurrency, readApproval,
  readRoleToml, readRunRecord, renewLease, setBrief, transitionRun,
  transitionTask, transitionWorker, updateRunRecord, writeRunRecord
} from "./lib/team-runtime.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = loadTeamContract();
const ROLE_IDS = CONTRACT.workers.allowedRoleIds;
const COMMANDS = {
  plan: ["repo", "plan-file", "state", "run", "profile", "max-minutes"],
  start: ["run", "state"], status: ["run", "state", "watch-seconds"],
  supervise: ["run", "state"], watch: ["run", "task", "state"],
  abort: ["run", "state", "reason"], collect: ["run", "task", "state"],
  integrate: ["run", "state", "check"], verify: ["run", "state"],
  merge: ["run", "state"], pause: ["run", "state"], resume: ["run", "state"],
  cleanup: ["run", "state", "delete-branches", "delete-integration", "purge-logs"],
  doctor: ["state"]
};
const USAGE = `Usage: node scripts/team-run.mjs <${Object.keys(COMMANDS).join("|")}> --state <board.json> [--json]`;
const TERMINAL_WORKERS = new Set(["finished", "failed", "paused_limit", "timed_out", "aborted"]);
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
    if (["delete-branches", "delete-integration", "purge-logs"].includes(key)) { options[key] = true; continue; }
    const value = rest[i + 1];
    if (!value || value === "--json" || (value.startsWith("--") && accepted.has(value.slice(2)))) throw new CliUsageError(`--${key} requires a value.`);
    options[key] = value; i += 1;
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
function boardTask(state, fn) { return fn(state); }
function git(args, cwd) { return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
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
function scopesOverlap(left, right) {
  const norm = (x) => x.toLocaleLowerCase("en-US");
  return left.some((a) => right.some((b) => { const x = norm(a), y = norm(b); return x === "." || y === "." || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`); }));
}
function ensureExperimentEnabled() {
  if (!CONTRACT.execution.enabled && process.env.AGENTCHEF_TEAM_MODE !== "experimental") {
    const error = new Error("Team execution is disabled; set AGENTCHEF_TEAM_MODE=experimental to opt in."); error.exitCode = 1; error.code = "team-mode-disabled"; throw error;
  }
}
function validateStateFile(state) { if (!fs.existsSync(state)) throw new Error("Board state file does not exist; initialize the coordination board first."); }
function planCommand(options) {
  ensureExperimentEnabled(); validateStateFile(options.state);
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
  const workers = plan.workers.map((item) => {
    if (!item.taskId || !/^TASK-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.taskId)) throw new Error("Each worker requires a valid taskId.");
    if (!ROLE_IDS.includes(item.role)) throw new Error(`Role is not allowed: ${item.role}`);
    const briefFile = path.resolve(path.dirname(path.resolve(options["plan-file"])), item.briefFile || "");
    const briefText = fs.readFileSync(briefFile, "utf8");
    const brief = parseBrief(briefText); if (!brief.ok) throw new Error(`Brief for ${item.taskId} is missing: ${brief.missing.join(", ")}.`);
    assertTeamTextSafe(briefText);
    const role = readRoleToml(item.role);
    return { taskId: item.taskId, role: item.role, coordinator: item.coordinator || null, checks: item.checks || [], briefFile, briefText, brief: brief.fields, writeScope: normalizeScope(item.writeScope || brief.fields.scope, repo), sandbox: effectiveSandbox(item.role, role.sandboxMode), model: role.model, roleInstructions: role.developerInstructions };
  });
  if (new Set(workers.map((w) => w.taskId)).size !== workers.length) throw new Error("Worker taskId values must be unique.");
  for (let i = 0; i < workers.length; i += 1) for (let j = i + 1; j < workers.length; j += 1) if (scopesOverlap(workers[i].writeScope, workers[j].writeScope)) throw new Error(`Write scopes overlap: ${workers[i].taskId} and ${workers[j].taskId}.`);
  const baseBranch = git(["branch", "--show-current"], repo); if (!baseBranch) throw new Error("Repository must be on a named branch.");
  const plannedAt = now(); const root = path.join(path.dirname(repo), ".agentchef-worktrees", id);
  if (root.startsWith(`${os.tmpdir()}${path.sep}`) || root === repo || root.startsWith(`${repo}${path.sep}`)) throw new Error("Resolved worktree root is not permitted.");
  const run = { schemaVersion: 1, revision: 0, runId: id, status: "planned", repo, repoName: path.basename(repo), baseBranch, baseCommit: headCommit(repo), integrationBranch: `${CONTRACT.branches.integrationPrefix}${id}`, worktreeRoot: root, planFile: path.resolve(options["plan-file"]), profile, model: "gpt-6-luna", maxWorkers: maxConcurrency(CONTRACT, workers.length), maxMinutes, checks: [...new Set(workers.flatMap((w) => w.checks))], plannedAt, startedAt: null, approvals: { start: null, merge: null }, supervisor: { pid: null, createdAt: null, heartbeatAt: null }, workers: workers.map((w) => ({ taskId: w.taskId, role: w.role, coordinator: w.coordinator, sandbox: w.sandbox, writeScope: w.writeScope, worktree: null, branch: null, promptHash: null, status: "planned", pid: null, processCreatedAt: null, codexThreadId: null, pane: null, startedAt: null, finishedAt: null, lastEventAt: null, exitCode: null, failure: null, usage: null, verdict: null, changedPaths: [], outsideScope: [], leaseRenewedAt: null })), usage: {}, history: [{ at: plannedAt, event: "planned" }] };
  const directory = path.dirname(runFile(options.state, id)); fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(runFile(options.state, id))) throw new Error(`Run already exists: ${id}.`);
  writeRunRecord(runFile(options.state, id), run);
  try {
    for (const w of workers) {
      const taskInfo = { id: w.taskId, title: `Team run ${id}: ${w.role}`, ownerCoordinator: w.coordinator || "leadership_coordinator", ownerAgent: "codex", ownerSession: `team-${id}`, writeRepo: path.basename(repo), writePaths: w.writeScope.join(", ") };
      boardTask(options.state, createTask)(options.state, taskInfo);
      boardTask(options.state, setBrief)(options.state, { taskId: w.taskId, brief: w.briefText });
      boardTask(options.state, assignTask)(options.state, { taskId: w.taskId, ownerAgent: "codex", ownerSession: `team-${id}`, ownerCoordinator: w.coordinator || "leadership_coordinator" });
      boardTask(options.state, transitionTask)(options.state, { taskId: w.taskId, status: "todo" });
    }
  } catch (error) { updateRunRecord(runFile(options.state, id), (current) => ({ ...current, status: "failed", failure: error.message, history: [...current.history, { at: now(), event: "planning_failed" }] })); throw error; }
  output({ ok: true, run: readRun(options.state, id) }, options.json); return 0;
}
function approvalPath(state, id) { return path.join(path.dirname(path.resolve(state)), "approvals", `${id}.baslat.json`); }
function startCommand(options) {
  ensureExperimentEnabled(); const file = runFile(options.state, options.run); const run = readRun(options.state, options.run);
  const approval = readApproval(path.dirname(path.resolve(options.state)), run.runId, "baslat");
  if (!approvalIsValid(approval, { runId: run.runId, tur: "baslat", plannedAt: run.plannedAt })) { const e = new Error("A valid start approval is required."); e.code = "approval-required"; e.exitCode = 3; throw e; }
  const command = resolveCodexCommand();
  const invocation = process.platform === "win32" && command.toLowerCase().endsWith(".cmd") ? cmdShimInvocation(command, ["login", "status"]) : { command, args: ["login", "status"] };
  const login = spawnSync(invocation.command, invocation.args, { encoding: "utf8", timeout: 10_000, windowsHide: true, windowsVerbatimArguments: invocation.options?.windowsVerbatimArguments });
  if (login.status !== 0) throw new Error("Codex login status failed.");
  if (run.status !== "planned") throw new Error(`Cannot start run in ${run.status} state.`);
  fs.mkdirSync(run.worktreeRoot, { recursive: true });
  git(["worktree", "add", "-b", run.integrationBranch, run.worktreeRoot], run.repo);
  const plan = readPlanForRun(options.state, run);
  for (const worker of run.workers) {
    const brief = plan.workers.find((w) => w.taskId === worker.taskId);
    const wt = path.join(run.worktreeRoot, worker.taskId);
    const branch = `takim/${run.runId}/${worker.taskId}`;
    git(["worktree", "add", "-b", branch, wt, run.baseCommit], run.repo);
    const { developerInstructions } = readRoleToml(worker.role);
    const prompt = composePrompt(developerInstructions, run, worker, brief);
    const schema = path.join(run.worktreeRoot, `${worker.taskId}.handoff.schema.json`);
    const promptPath = path.join(run.worktreeRoot, `${worker.taskId}.prompt.md`);
    fs.writeFileSync(promptPath, prompt, "utf8"); fs.writeFileSync(schema, JSON.stringify(HANDOFF_SCHEMA, null, 2), "utf8");
    updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, worktree: wt, branch, promptHash: crypto.createHash("sha256").update(prompt).digest("hex") } : w) }));
      boardTask(options.state, transitionTask)(options.state, { taskId: worker.taskId, status: "todo" });
    boardTask(options.state, renewLease)(options.state, { taskId: worker.taskId, minutes: CONTRACT.limits.leaseMinutes });
      boardTask(options.state, transitionTask)(options.state, { taskId: worker.taskId, status: "in_progress" });
  }
  consumeApproval(approvalPath(options.state, run.runId), `team-run start pid=${process.pid}`);
  const supervisor = spawn(process.execPath, [fileURLToPath(import.meta.url), "supervise", "--run", run.runId, "--state", path.resolve(options.state), "--json"], { cwd: run.repo, detached: true, stdio: "ignore", windowsHide: true });
  supervisor.unref();
  updateRunRecord(file, (current) => ({ ...transitionRun(current, "running"), startedAt: now(), supervisor: { pid: supervisor.pid, createdAt: now(), heartbeatAt: null }, history: [...current.history, { at: now(), event: "started" }] }));
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) { const current = readRun(options.state, run.runId); if (current.supervisor.heartbeatAt) break; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); }
  output({ ok: true, run: readRun(options.state, run.runId) }, options.json); return 0;
}
const HANDOFF_SCHEMA = { type: "object", additionalProperties: false, required: ["outcome", "evidence", "changedScope", "risks", "openQuestions", "needs", "nextVerification", "verdict", "mutationCheck"], properties: { outcome: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, changedScope: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } }, openQuestions: { type: "array", items: { type: "string" } }, needs: { type: "array", items: { type: "object", additionalProperties: false, required: ["role", "why"], properties: { role: { type: "string" }, why: { type: "string" } } } }, nextVerification: { type: "string" }, verdict: { enum: ["pass", "partial", "blocked", "fail"] }, mutationCheck: { type: "object", additionalProperties: false, required: ["claimedPaths", "outsideScope"], properties: { claimedPaths: { type: "array", items: { type: "string" } }, outsideScope: { type: "array", items: { type: "string" } } } } } };
function composePrompt(roleInstructions, run, worker, item) {
  const text = fs.readFileSync(path.resolve(path.dirname(run.planFile), item.briefFile || ""), "utf8");
  return [roleInstructions, `# Team run ${run.runId} - ${worker.taskId} (${worker.role})`, `## Brief\n${text}`, "## Team rules\n- Work only in your assigned worktree and write scope.\n- Do not commit, push, checkout, create worktrees, or create branches.\n- Do not spawn agents; write needs: <role> - <why> if needed.\n- Do not install packages or change global settings.\n- Never print, repeat, or persist secrets.\n- Return only JSON matching the supplied schema.", "## Return contract\nReturn outcome, evidence[], changedScope[], risks[], openQuestions[], needs[{role,why}], nextVerification, verdict, mutationCheck{claimedPaths[],outsideScope}."] .filter(Boolean).join("\n\n");
}
function readPlanForRun(state, run) {
  // Planned metadata stores validated brief content without storing filesystem paths.
  // Start resolves the original plan beside the board only when it still exists.
  const pathHint = run.planFile;
  if (pathHint && fs.existsSync(pathHint)) return readPlan(pathHint);
  const briefDir = path.join(path.dirname(path.resolve(state)), "team-runs", run.runId, "briefs");
  if (!fs.existsSync(briefDir)) throw new Error("Validated plan briefs are unavailable; re-plan this run.");
  return { workers: run.workers.map((worker) => ({ taskId: worker.taskId, briefFile: path.join(briefDir, `${worker.taskId}.md`) })) };
}
async function statusCommand(options) {
  const watchSeconds = Number(options["watch-seconds"] || 0);
  if (!Number.isInteger(watchSeconds) || watchSeconds < 0 || watchSeconds > 3600) throw new CliUsageError("--watch-seconds must be an integer from 0 to 3600.");
  const deadline = Date.now() + watchSeconds * 1000;
  do {
  const run = readRun(options.state, options.run);
  const supervisorAge = run.supervisor.heartbeatAt ? Date.now() - Date.parse(run.supervisor.heartbeatAt) : Infinity;
  const supervisorAlive = Number.isInteger(run.supervisor.pid) ? isPidAlive(run.supervisor.pid) && supervisorAge < 30_000 : false;
  const warnings = [];
  for (const worker of run.workers) {
    if (!worker.worktree) continue;
    const changed = git(["status", "--porcelain"], worker.worktree).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
    const outside = changed.filter((file) => !worker.writeScope.some((scope) => scope === "." || file === scope || file.startsWith(`${scope}/`)));
    if (outside.length) warnings.push({ taskId: worker.taskId, outsideScope: outside });
  }
  output({ ok: true, run, supervisor: { alive: supervisorAlive, heartbeatAgeMs: Number.isFinite(supervisorAge) ? supervisorAge : null }, warnings }, options.json);
  if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  } while (Date.now() < deadline);
  return 0;
}
function isPidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function superviseCommand(options) {
  const file = runFile(options.state, options.run); let stopping = false; let timer = null;
  const active = new Map(); const started = Date.now();
  const stop = () => { stopping = true; if (timer) clearTimeout(timer); for (const entry of active.values()) stopChild(entry.child, { createdAt: entry.createdAt }); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  const tick = async () => {
    if (stopping) return;
    timer = null;
    let run = readRun(options.state, options.run);
    const heartbeatAt = now();
    updateRunRecord(file, (current) => ({ ...current, supervisor: { ...current.supervisor, heartbeatAt } }));
    run = readRun(options.state, options.run);
    if (run.status === "paused") { stop(); return; }
    for (const worker of run.workers) {
      const log = path.join(path.dirname(file), run.runId, worker.taskId, "events.jsonl");
      if (worker.status === "running" && fs.existsSync(log)) {
        const stamp = fs.statSync(log).mtime.toISOString();
        if (!worker.lastEventAt || Date.parse(stamp) > Date.parse(worker.lastEventAt)) updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, lastEventAt: stamp } : w) }));
      }
      if (active.has(worker.taskId) && Date.now() - Date.parse(worker.leaseRenewedAt || worker.startedAt || heartbeatAt) > CONTRACT.limits.leaseRenewMinutes * 60_000) {
        boardTask(options.state, renewLease)(options.state, { taskId: worker.taskId, minutes: CONTRACT.limits.leaseMinutes });
        updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, leaseRenewedAt: heartbeatAt } : w) }));
      }
    }
    if (Date.now() - Date.parse(run.startedAt) > run.maxMinutes * 60_000) { for (const entry of active.values()) stopChild(entry.child, { createdAt: entry.createdAt }); updateRunRecord(file, (current) => ({ ...current, status: "failed", failure: "max_minutes_exceeded", history: [...current.history, { at: now(), event: "max_minutes_exceeded" }] })); return; }
    const controlDir = path.join(path.dirname(file), run.runId, "control");
    const abortFile = path.join(controlDir, "abort.json"), pauseFile = path.join(controlDir, "pause.json");
    if (fs.existsSync(abortFile)) { stop(); abortWorkers(options.state, file, run, JSON.parse(fs.readFileSync(abortFile, "utf8")).reason || "aborted"); return; }
    if (fs.existsSync(pauseFile)) { stop(); updateRunRecord(file, (current) => ({ ...transitionRun(current, "paused"), history: [...current.history, { at: now(), event: "paused" }] })); return; }
    for (const worker of run.workers) {
      if (worker.status === "running" && worker.lastEventAt && Date.now() - Date.parse(worker.lastEventAt) >= CONTRACT.limits.idleWarningMinutes * 60_000) appendEvent(file, worker.taskId, { type: "idle_warning", at: now() });
      if (worker.status !== "running" || !worker.lastEventAt) continue;
      const idle = Date.now() - Date.parse(worker.lastEventAt);
      if (idle >= Number(process.env.AGENTCHEF_TEAM_IDLE_KILL_MINUTES || CONTRACT.limits.idleStopMinutes) * 60_000) { const item = active.get(worker.taskId); if (item) stopChild(item.child, { createdAt: item.createdAt }); settleWorker(file, worker.taskId, "timed_out", 1, "idle_timeout"); }
    }
    run = readRun(options.state, options.run);
    const available = Math.max(0, run.maxWorkers - active.size);
    for (const worker of run.workers.filter((w) => w.status === "planned" || w.status === "queued").slice(0, available)) launchWorker(options, run, worker, file, active);
    run = readRun(options.state, options.run);
    if (run.workers.every((w) => TERMINAL_WORKERS.has(w.status))) { updateRunRecord(file, (current) => ({ ...current, history: [...current.history, { at: now(), event: "supervisor_complete" }] })); return; }
    timer = setTimeout(tick, 1000);
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
    const execution = spawnCodexExec({ prompt, worktree: worker.worktree, runDir: path.join(path.dirname(file), run.runId, worker.taskId), schema, output: resultPath, runId: run.runId, taskId: worker.taskId, role: worker.role, boardState: path.resolve(options.state), sandbox: worker.sandbox, model: run.model, profile: run.profile });
    const child = execution.child; const createdAt = now(); activeMap.set(worker.taskId, { child, createdAt });
    updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...transitionWorker(w, "running"), pid: child?.pid || null, processCreatedAt: createdAt, startedAt: now() } : w) }));
    const pane = openViewerPane({ worktree: worker.worktree, runId: run.runId, taskId: worker.taskId });
    updateRunRecord(file, (current) => ({ ...current, workers: current.workers.map((w) => w.taskId === worker.taskId ? { ...w, pane } : w) }));
    execution.then((result) => { activeMap.delete(worker.taskId); if (result.failure?.kind === "usage_limit") { settleWorker(file, worker.taskId, "paused_limit", result.exitCode, result.failure.message, result); updateRunRecord(file, (current) => ({ ...current, status: "paused", history: [...current.history, { at: now(), event: "usage_limit" }] })); } else settleWorker(file, worker.taskId, result.exitCode === 0 ? "finished" : "failed", result.exitCode, result.failure?.message || null, result); }).catch((error) => { activeMap.delete(worker.taskId); settleWorker(file, worker.taskId, "failed", 1, error.message); });
  };
  tick();
  return new Promise((resolve) => { const poll = () => { if (stopping || !timer && active.size === 0 && Date.now() - started > 500) resolve(0); else setTimeout(poll, 250); }; poll(); });
}
function settleWorker(file, taskId, status, exitCode, failure, result = {}) {
  updateRunRecord(file, (current) => {
    const worker = current.workers.find((w) => w.taskId === taskId);
    if (!worker || TERMINAL_WORKERS.has(worker.status)) return current;
    return { ...current, workers: current.workers.map((w) => w.taskId === taskId ? { ...transitionWorker(w, status), exitCode, failure, finishedAt: now(), usage: result.usage || null, codexThreadId: result.threadId || null, lastEventAt: now() } : w), history: [...current.history, { at: now(), event: `worker_${status}`, taskId }] };
  });
}
function appendEvent(file, taskId, event) { const location = path.join(path.dirname(file), path.basename(file, ".json"), taskId, "events.jsonl"); fs.mkdirSync(path.dirname(location), { recursive: true }); fs.appendFileSync(location, `${JSON.stringify(event)}\n`); }
function abortWorkers(state, file, run, reason) {
  for (const w of run.workers) {
    if (["planned", "queued", "running", "spawning", "paused_limit"].includes(w.status)) {
      if (w.pid && isPidAlive(w.pid)) { try { process.kill(w.pid); } catch {} }
      try { transitionTask(state, { taskId: w.taskId, status: "cancelled", reason }); } catch { /* already terminal or unavailable */ }
    }
  }
  updateRunRecord(file, (current) => ({ ...current, status: "aborted", workers: current.workers.map((w) => ["planned", "queued", "running", "spawning", "paused_limit"].includes(w.status) ? { ...w, status: "aborted", finishedAt: now(), failure: reason } : w), history: [...current.history, { at: now(), event: "aborted", reason }] }));
}
function abortCommand(options) {
  const file = runFile(options.state, options.run); const run = readRun(options.state, options.run);
  const reason = options.reason || "cancelled by conductor"; assertTeamTextSafe(reason);
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
  const started = Date.now(); const maxMs = Number(process.env.AGENTCHEF_TEAM_WATCH_MS || 10 * 60_000);
  const tick = () => { if (fs.existsSync(events)) { const content = fs.readFileSync(events, "utf8"); const fresh = content.slice(offset); offset = content.length; for (const line of fresh.split(/\r?\n/).filter(Boolean)) {
    let display = redactCliPaths(line, { root: run.repo, pathRedactions: [{ target: worker.worktree, replacement: "${WORKTREE}" }, { target: run.worktreeRoot, replacement: "${WORKTREE_ROOT}" }] });
    try { assertTeamTextSafe(display); } catch { display = "[sensitive event omitted]"; }
    process.stdout.write(`${display}\n`);
  } } if (Date.now() - started < maxMs) setTimeout(tick, 500); };
  tick(); return new Promise((resolve) => { setTimeout(() => resolve(0), maxMs); });
}
function dispatch(parsed) {
  const { command, options } = parsed;
  if (command === "plan") return planCommand(options);
  if (command === "start") return startCommand(options);
  if (command === "status") return statusCommand(options);
  if (command === "supervise") return superviseCommand(options);
  if (command === "watch") return watchCommand(options);
  if (command === "abort") return abortCommand(options);
  if (["pause", "resume"].includes(command)) { const error = new Error(`${command} is reserved for a later version.`); error.exitCode = 1; throw error; }
  if (["collect", "integrate", "verify", "merge", "cleanup", "doctor"].includes(command)) { const error = new Error(`${command} is not implemented in TASK-042; see TASK-043.`); error.exitCode = 1; throw error; }
  throw new CliUsageError(USAGE);
}
try {
  const parsed = parse(process.argv.slice(2));
  if (parsed.help) { process.stdout.write(`${USAGE}\n`); process.exitCode = 0; }
  else process.exitCode = await dispatch(parsed);
} catch (error) {
  process.exitCode = emitCliError({ tool: "team-run", error, argv: process.argv.slice(2), root: ROOT, json: process.argv.includes("--json") });
}
