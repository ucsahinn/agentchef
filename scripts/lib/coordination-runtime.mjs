import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secretLikeCategory } from "./secret-classifier.mjs";
import { parseBrief } from "./agent-brief.mjs";

// v3 added who works a task (owner), what it may write (writeScope) and until
// when (leaseUntil), the task brief, and attached evidence. v4 adds the paths
// back from a status (rework, release, blocked, cancelled), the verifier of a
// done task, handoff ids and resolution, and a per-task history. Older state
// files are read and migrated in memory; the next write stores v4, which a
// v3-only reader refuses instead of misreading the new statuses.
export const STATE_SCHEMA_VERSION = 4;
const READABLE_SCHEMAS = [1, 2, 3, STATE_SCHEMA_VERSION];
const MAX_LEASE_MINUTES = 24 * 60;
const MAX_HISTORY = 200;
const STALE_HOURS = 24;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// Forward path of a task. Moves back or sideways are listed in MOVES and most
// of them need a reason, so the history says why work went backwards.
const STATUSES = ["backlog", "todo", "in_progress", "review", "done", "blocked", "cancelled"];
const TERMINAL = new Set(["done", "cancelled"]);
const OPEN = ["backlog", "todo", "in_progress", "review"];
const MOVES = {
  backlog: { todo: {}, blocked: { reason: true }, cancelled: { reason: true } },
  todo: { in_progress: {}, blocked: { reason: true }, cancelled: { reason: true } },
  in_progress: { review: {}, todo: { reason: true }, blocked: { reason: true }, cancelled: { reason: true } },
  review: { done: {}, in_progress: { reason: true }, blocked: { reason: true }, cancelled: { reason: true } },
  // A task blocked while in progress may also be released back to todo.
  blocked: { cancelled: { reason: true }, todo: { reason: true, from: "in_progress" } },
  done: {},
  cancelled: {}
};

const catalogPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../catalog/agents.json");
const COORDINATORS = new Set(JSON.parse(fs.readFileSync(catalogPath, "utf8")).coordinators.map((entry) => entry.name));

function fail(message) {
  throw new Error(message);
}

function required(value, label) {
  const text = String(value ?? "").trim();
  if (!text) fail(`${label} is required.`);
  return text;
}

function safeId(value, label) {
  const text = required(value, label);
  if (!SAFE_ID.test(text)) fail(`${label} must contain only letters, numbers, dot, underscore, or hyphen.`);
  return text;
}

function redactText(value) {
  // Classify the whole text first: a secret straddling the cut-off would
  // otherwise be stored in part.
  const full = required(value, "Text");
  const category = secretLikeCategory(full);
  let text = full.slice(0, 1000);
  if (category) fail(`Coordination content contains a ${category} and was rejected.`);
  text = text.replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\s"']+/g, "[redacted-path]");
  text = text.replace(/\b(?:token|api[_-]?key|password|secret)\s*[=:]\s*[^\s]+/gi, "[redacted-secret]");
  text = text.replace(/\b(?:session|memory)\b[^\n]*/gi, "[redacted-private-content]");
  return text;
}

// Briefs and evidence keep repository paths (write scopes name them) but are
// still refused when they carry a secret.
function guardedText(value, label, limit) {
  const text = required(value, label);
  if (text.length > limit) fail(`${label} is longer than ${limit} characters.`);
  const category = secretLikeCategory(text);
  if (category) fail(`${label} contains a ${category} and was rejected.`);
  return text;
}

// Repository-relative paths only: no drive, no leading slash, no "..". A
// leading "./" is dropped and "." stands for the whole repository.
function relativePath(value) {
  const text = required(value, "Write scope path").replace(/\\/g, "/").replace(/^(?:\.\/)+/, "") || ".";
  if (/^[A-Za-z]:|^\/|(^|\/)\.\.(\/|$)/.test(text)) fail(`Write scope path must be repository-relative without "..": ${text}`);
  return text;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function migrateTask(task) {
  const migrated = {
    owner: null,
    writeScope: null,
    leaseUntil: null,
    brief: null,
    verification: null,
    blockedFrom: null,
    createdAt: null,
    updatedAt: null,
    ...task
  };
  // A missing or null list in an older file must not crash a later command.
  for (const key of ["evidence", "handoffs", "reports", "history"]) migrated[key] = list(task[key]);
  // Handoffs written before v4 have no id; number them the way addHandoff
  // does, so an open decision on an old task can still be resolved.
  migrated.handoffs = migrated.handoffs.map((handoff, index) => ({ ...handoff, id: handoff.id ?? `H${index + 1}`, resolution: handoff.resolution ?? null }));
  return migrated;
}

function coordinator(value, label) {
  const id = safeId(value, label);
  if (!COORDINATORS.has(id)) {
    fail(`${label} must identify a coordinator listed in the canonical catalog; worker-to-worker and unknown coordinator handoffs are forbidden.`);
  }
  return id;
}

function taskById(state, id) {
  const task = state.tasks.find((candidate) => candidate.id === safeId(id, "Task id"));
  if (!task) fail(`Unknown task: ${id}`);
  return task;
}

// Closed tasks are the record of what was verified; nothing changes them.
function openTask(state, id, action) {
  const task = taskById(state, id);
  if (TERMINAL.has(task.status)) fail(`${task.id} is ${task.status}; ${action} is not allowed on a closed task.`);
  return task;
}

function isoNow(input) {
  return new Date(input.now ?? Date.now()).toISOString();
}

function record(task, input, entry) {
  const at = isoNow(input);
  task.updatedAt = at;
  task.history.push({ at, ...entry });
  if (task.history.length > MAX_HISTORY) task.history.splice(0, task.history.length - MAX_HISTORY);
}

// "root-cause-debugger", "agentchef:root_cause_debugger" and "ROOT_CAUSE_DEBUGGER"
// name the same agent.
function agentKey(value) {
  return String(value).toLowerCase().replace(/^[a-z0-9_-]+:/, "").replace(/-/g, "_");
}

function ownerNames(task) {
  return [task.owner?.agent, task.owner?.session].filter(Boolean).map(agentKey);
}

function leaseLive(task, now) {
  return Date.parse(task.leaseUntil || "") > now;
}

function normalizedPath(value) {
  return value.toLowerCase().replace(/^(?:\.\/)+/, "").replace(/\/+$/, "") || ".";
}

function pathsOverlap(left, right) {
  const a = normalizedPath(left);
  const b = normalizedPath(right);
  return a === "." || b === "." || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

// Two open tasks may not hold live leases on the same files: the second one
// is told which task has them.
function assertNoScopeConflict(state, task, now) {
  if (!task.writeScope) return;
  for (const other of state.tasks) {
    if (other === task || TERMINAL.has(other.status) || !other.writeScope || !leaseLive(other, now)) continue;
    if (other.writeScope.repo.toLowerCase() !== task.writeScope.repo.toLowerCase()) continue;
    const clash = task.writeScope.paths.find((mine) => other.writeScope.paths.some((theirs) => pathsOverlap(mine, theirs)));
    if (clash) fail(`${other.id} holds a live lease on ${other.writeScope.repo}:${clash}; wait for it, or narrow this task's write scope.`);
  }
}

export function createState() {
  return { schemaVersion: STATE_SCHEMA_VERSION, revision: 0, tasks: [] };
}

export function readState(statePath) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    fail(`Cannot read coordination state: ${error.message}`);
  }
  if (!READABLE_SCHEMAS.includes(state?.schemaVersion) || !Array.isArray(state.tasks)) {
    fail("Unsupported coordination state format.");
  }
  const revision = state.schemaVersion === 1 ? 0 : state.revision;
  if (!Number.isInteger(revision) || revision < 0) fail("Coordination state has an invalid revision.");
  return { ...state, schemaVersion: STATE_SCHEMA_VERSION, revision, tasks: state.tasks.map(migrateTask) };
}

export function writeInitialState(statePath) {
  fs.writeFileSync(statePath, `${JSON.stringify(createState(), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return createState();
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function storedRevision(statePath) {
  try {
    const stored = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return stored.schemaVersion === 1 ? 0 : stored.revision;
  } catch {
    return undefined;
  }
}

export function writeState(statePath, state) {
  const next = { ...state, schemaVersion: STATE_SCHEMA_VERSION, revision: (state.revision ?? 0) + 1 };
  const temporary = `${statePath}.coordination-${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    // Compare-and-swap on the revision: if another writer got in (for
    // example after a stale-lock takeover), refuse instead of losing its change.
    const current = storedRevision(statePath);
    if (current !== undefined && current !== (state.revision ?? 0)) {
      const conflict = new Error(`The board changed while this command ran (revision ${state.revision ?? 0} -> ${current}); run it again.`);
      conflict.code = "COORDINATION_CONFLICT";
      throw conflict;
    }
    try {
      fs.renameSync(temporary, statePath);
    } catch (error) {
      // Windows refuses a rename while another process (a reader, antivirus)
      // has the file open; one short retry covers that.
      if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code)) throw error;
      pause(100);
      fs.renameSync(temporary, statePath);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return next;
}

// A mutation takes milliseconds, so a lock older than this was left by a
// process that died before releasing it.
const STALE_LOCK_MS = 30_000;

export function acquireCoordinationStateLock(statePath, { attempts = 40, waitMs = 50, now = () => Date.now() } = {}) {
  const lockPath = `${path.resolve(statePath)}.coordination.lock`;
  const ownerFile = path.join(lockPath, "owner.json");
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(ownerFile, JSON.stringify({ token, pid: process.pid, at: new Date(now()).toISOString() }));
      return {
        // Only the holder removes its own lock. An unreadable owner file may
        // belong to a process that just took the lock over, so it is left to
        // the stale-lock rule. A cleanup failure never hides the result.
        release: () => {
          let holder = null;
          try { holder = JSON.parse(fs.readFileSync(ownerFile, "utf8")).token; } catch { holder = null; }
          if (holder !== token) return;
          try { fs.rmSync(lockPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); } catch { /* stale rule recovers it */ }
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let since = null;
      let staleToken = null;
      try {
        const holder = JSON.parse(fs.readFileSync(ownerFile, "utf8"));
        since = Date.parse(holder.at);
        staleToken = holder.token ?? null;
      } catch { since = null; }
      if (!Number.isFinite(since)) {
        try { since = fs.statSync(lockPath).mtimeMs; } catch { continue; }
      }
      if (now() - since > STALE_LOCK_MS) {
        // Take a stale lock over by renaming it aside, which only one process
        // can do. If what was renamed is not the lock judged stale (another
        // process replaced it meanwhile), put it back.
        const tombstone = `${lockPath}.stale-${crypto.randomUUID()}`;
        try { fs.renameSync(lockPath, tombstone); } catch { continue; }
        let moved = null;
        try { moved = JSON.parse(fs.readFileSync(path.join(tombstone, "owner.json"), "utf8")).token ?? null; } catch { moved = null; }
        if (moved !== staleToken) {
          try { fs.renameSync(tombstone, lockPath); } catch { /* the stale rule recovers it */ }
          continue;
        }
        try { fs.rmSync(tombstone, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); } catch { /* harmless leftover */ }
        continue;
      }
      if (attempt < attempts - 1) pause(waitMs);
    }
  }
  const lockError = new Error("Another coordination mutation is already in progress for this state file.");
  lockError.code = "COORDINATION_LOCKED";
  throw lockError;
}

export function createTask(state, input) {
  const id = safeId(input.id, "Task id");
  if (state.tasks.some((task) => task.id === id)) fail(`Task already exists: ${id}`);
  if (input.writePaths && !input.writeRepo) fail("--write-paths needs --write-repo.");
  const task = {
    id,
    title: redactText(input.title),
    ownerCoordinator: coordinator(input.ownerCoordinator, "Owner coordinator"),
    status: "backlog",
    owner: input.ownerAgent ? { agent: safeId(input.ownerAgent, "Owner agent"), session: input.ownerSession ? safeId(input.ownerSession, "Owner session") : null } : null,
    writeScope: input.writeRepo || input.writePaths
      ? { repo: safeId(input.writeRepo, "Write scope repo"), paths: String(input.writePaths || "").split(",").map((entry) => entry.trim()).filter(Boolean).map(relativePath) }
      : null,
    leaseUntil: null,
    brief: null,
    evidence: [],
    verification: null,
    blockedFrom: null,
    handoffs: [],
    reports: [],
    createdAt: isoNow(input),
    updatedAt: null,
    history: []
  };
  if (task.writeScope && task.writeScope.paths.length === 0) fail("A write scope needs at least one path.");
  record(task, input, { action: "create" });
  state.tasks.push(task);
  return task;
}

export function assignTask(state, input) {
  const task = openTask(state, input.taskId, "assign");
  if (!input.ownerAgent && !input.ownerCoordinator) fail("assign needs --owner-agent or --owner-coordinator.");
  const from = task.owner?.agent ?? null;
  if (input.ownerAgent) {
    task.owner = { agent: safeId(input.ownerAgent, "Owner agent"), session: input.ownerSession ? safeId(input.ownerSession, "Owner session") : null };
  }
  if (input.ownerCoordinator) task.ownerCoordinator = coordinator(input.ownerCoordinator, "Owner coordinator");
  record(task, input, { action: "assign", from, to: task.owner?.agent ?? null, ...(input.by ? { by: safeId(input.by, "Actor") } : {}) });
  return task;
}

function verifierFor(task, input) {
  // A handoff is a report, not proof: the agent that did the work cannot
  // close its own task, so done names a different verifier.
  if (input.verifiedBy === undefined) {
    fail("review -> done needs --verified-by <agent>: an agent other than the owner that checked the work.");
  }
  if (!task.owner) fail(`${task.id} has no owner; assign it (coordination-board assign) so the verifier can be checked against the owner.`);
  const verifier = safeId(input.verifiedBy, "Verifier");
  // The owner coordinator assigned and merged the work, so it is not
  // independent either. Names are typed by the caller: this stops honest
  // slips, it is not authentication.
  if ([...ownerNames(task), agentKey(task.ownerCoordinator)].includes(agentKey(verifier))) {
    fail(`${verifier} owns or coordinated this task and cannot verify its own work; name a different verifier.`);
  }
  return verifier;
}

export function transitionTask(state, input) {
  const task = taskById(state, input.taskId);
  const target = required(input.status, "Status");
  const now = input.now ?? Date.now();
  if (!STATUSES.includes(task.status)) fail(`${task.id} has an unknown status ${task.status}; update AgentChef before changing it.`);
  if (!STATUSES.includes(target)) fail(`Unknown status: ${target}. Use one of ${STATUSES.join(", ")}.`);
  // A blocked task goes back only to the status it was blocked from.
  let move = task.status === "blocked" && target === task.blockedFrom ? {} : MOVES[task.status][target];
  if (move?.from && move.from !== task.blockedFrom) move = null;
  if (!move) fail(`Invalid transition: ${task.status} -> ${target}.`);
  if (input.verifiedBy !== undefined && target !== "done") fail("--verified-by is accepted only with --status done.");
  const reason = input.reason === undefined ? null : guardedText(input.reason, "Reason", 500);
  if (move.reason && !reason) fail(`${task.status} -> ${target} needs --reason "<why>".`);

  let verification = null;
  if (target === "in_progress") {
    // Work starts only from a complete brief and a named owner, and a task
    // that writes holds a live lease nobody else holds on the same files.
    if (!task.owner) fail("A task needs an owner before in_progress (coordination-board assign --owner-agent <agent>).");
    if (!task.brief) fail("A brief is required before todo can transition to in_progress (coordination-board brief).");
    const parsed = parseBrief(task.brief);
    if (!parsed.ok) fail(`The brief is missing: ${parsed.missing.join(", ")}.`);
    if (task.writeScope && !leaseLive(task, now)) {
      fail("A task with a write scope needs a live lease before in_progress (coordination-board renew-lease).");
    }
    assertNoScopeConflict(state, task, now);
  }
  if (target === "review" && task.evidence.length === 0) {
    fail("Evidence is required before in_progress can transition to review (coordination-board add-evidence).");
  }
  if (target === "done") {
    if (task.evidence.length === 0) fail("Evidence is required before review can transition to done (coordination-board add-evidence).");
    if (task.reports.length === 0) fail("A linked report is required before review can transition to done.");
    const open = task.handoffs.filter((handoff) => handoff.decisionNeeded && !handoff.resolution);
    if (open.length) fail(`Resolve the open decision first: ${open.map((handoff) => handoff.id ?? "handoff").join(", ")} (coordination-board resolve-handoff).`);
    verification = { by: verifierFor(task, input), at: new Date(now).toISOString() };
  }

  const from = task.status;
  task.blockedFrom = target === "blocked" ? from : null;
  task.status = target;
  if (verification) task.verification = verification;
  // A closed or released task frees its write scope for other agents.
  if (TERMINAL.has(target) || (target === "todo" && (from === "in_progress" || from === "blocked"))) task.leaseUntil = null;
  record(task, input, {
    action: "transition",
    from,
    to: target,
    ...(verification ? { by: verification.by } : input.by ? { by: safeId(input.by, "Actor") } : {}),
    ...(reason ? { reason } : {})
  });
  return task;
}

export function addHandoff(state, input) {
  const task = openTask(state, input.taskId, "handoff");
  const sourceCoordinator = coordinator(input.sourceCoordinator, "Source coordinator");
  const targetCoordinator = coordinator(input.targetCoordinator, "Target coordinator");
  if (sourceCoordinator === targetCoordinator) fail("A handoff goes between two different coordinators.");
  if (![sourceCoordinator, targetCoordinator].includes(task.ownerCoordinator)) {
    fail(`A handoff on ${task.id} must start from or go to its owner coordinator ${task.ownerCoordinator}.`);
  }
  const handoff = {
    id: `H${task.handoffs.length + 1}`,
    at: isoNow(input),
    sourceCoordinator,
    targetCoordinator,
    question: redactText(input.question),
    evidence: input.evidence ? redactText(input.evidence) : null,
    conflict: input.conflict ? redactText(input.conflict) : null,
    decisionNeeded: input.decisionNeeded ? redactText(input.decisionNeeded) : null,
    verificationNeed: input.verificationNeed ? redactText(input.verificationNeed) : null,
    resolution: null
  };
  task.handoffs.push(handoff);
  record(task, input, { action: "handoff", to: handoff.id });
  return task;
}

export function resolveHandoff(state, input) {
  const task = openTask(state, input.taskId, "resolve-handoff");
  const id = safeId(input.handoffId, "Handoff id");
  const handoff = task.handoffs.find((entry) => entry.id === id);
  if (!handoff) fail(`Unknown handoff ${id} on ${task.id}.`);
  if (handoff.resolution) fail(`${id} is already resolved.`);
  handoff.resolution = { answer: redactText(input.answer), at: isoNow(input) };
  record(task, input, { action: "resolve-handoff", to: id });
  return task;
}

export function attachReport(state, input) {
  const task = openTask(state, input.taskId, "attach-report");
  const reportId = safeId(input.reportId, "Report id");
  if (!reportId.endsWith(".md")) fail("Report id must be a Markdown filename, not a path.");
  if (!reportId.startsWith(`${task.id}-`)) fail(`Report id must start with ${task.id}-.`);
  if (!task.reports.includes(reportId)) {
    task.reports.push(reportId);
    record(task, input, { action: "attach-report", to: reportId });
  }
  return task;
}

export function setBrief(state, input) {
  const task = openTask(state, input.taskId, "brief");
  const text = guardedText(input.brief, "Brief", 8000);
  const parsed = parseBrief(text);
  if (!parsed.ok) fail(`The brief is missing: ${parsed.missing.join(", ")}.`);
  task.brief = text;
  record(task, input, { action: "brief" });
  return task;
}

export function renewLease(state, input) {
  const task = openTask(state, input.taskId, "renew-lease");
  if (!task.writeScope) fail("Only a task with a write scope holds a lease.");
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LEASE_MINUTES) fail(`Lease minutes must be a whole number from 1 to ${MAX_LEASE_MINUTES}.`);
  // --by catches renewing someone else's lease by mistake. Names are typed by
  // the caller, so this is a guard against slips, not authentication.
  const by = input.by === undefined ? null : safeId(input.by, "Actor");
  if (by && task.owner && !ownerNames(task).includes(agentKey(by))) {
    fail(`${task.id} is owned by ${task.owner.agent}; ${by} cannot renew its lease (reassign it first).`);
  }
  const now = input.now ?? Date.now();
  assertNoScopeConflict(state, task, now);
  task.leaseUntil = new Date(now + minutes * 60_000).toISOString();
  record(task, input, { action: "renew-lease", to: task.leaseUntil, ...(by ? { by } : {}) });
  return task;
}

export function addEvidence(state, input) {
  const task = openTask(state, input.taskId, "add-evidence");
  task.evidence.push({ at: isoNow(input), text: guardedText(input.evidence, "Evidence", 2000) });
  record(task, input, { action: "add-evidence" });
  return task;
}

// show adds computed fields (never stored): leaseState and stale, so a team
// can see who is working and which open task nobody has touched for a day.
function withView(task, now) {
  const leaseState = !task.leaseUntil ? "none" : leaseLive(task, now) ? "live" : "expired";
  const last = Date.parse(task.updatedAt || task.createdAt || "");
  const working = task.status === "in_progress" || task.status === "review";
  const stale = working && ((task.writeScope && leaseState !== "live") || (Number.isFinite(last) && now - last > STALE_HOURS * 3_600_000));
  return { ...task, leaseState, stale: Boolean(stale) };
}

export function showTasks(state, taskId = null, filters = {}) {
  const now = filters.now ?? Date.now();
  if (taskId) return { task: withView(taskById(state, taskId), now) };
  let tasks = state.tasks;
  if (filters.status) {
    const wanted = filters.status === "open" ? OPEN.concat("blocked") : String(filters.status).split(",").map((entry) => entry.trim());
    tasks = tasks.filter((task) => wanted.includes(task.status));
  }
  if (filters.owner) {
    const owner = agentKey(filters.owner);
    tasks = tasks.filter((task) => ownerNames(task).includes(owner));
  }
  return { tasks: tasks.map((task) => withView(task, now)) };
}
