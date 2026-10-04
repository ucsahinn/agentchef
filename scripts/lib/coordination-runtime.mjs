import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secretLikeCategory } from "./secret-classifier.mjs";
import { parseBrief } from "./agent-brief.mjs";

// v3 adds who works a task (owner), what it may write (writeScope) and until
// when (leaseUntil), the task brief, and attached evidence. v1 and v2 state
// files are read and migrated in memory; the next write stores v3.
export const STATE_SCHEMA_VERSION = 3;
const MAX_LEASE_MINUTES = 24 * 60;
const LIFECYCLE = ["backlog", "todo", "in_progress", "review", "done"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
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
  let text = required(value, "Text").slice(0, 1000);
  const category = secretLikeCategory(text);
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

// Repository-relative paths only: no drive, no leading slash, no "..".
function relativePath(value) {
  const text = required(value, "Write scope path").replace(/\\/g, "/");
  if (/^[A-Za-z]:|^\/|(^|\/)\.\.(\/|$)/.test(text)) fail(`Write scope path must be repository-relative without "..": ${text}`);
  return text;
}

function migrateTask(task) {
  return {
    owner: null,
    writeScope: null,
    leaseUntil: null,
    brief: null,
    evidence: [],
    ...task
  };
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
  if (![1, 2, STATE_SCHEMA_VERSION].includes(state?.schemaVersion) || !Array.isArray(state.tasks)) {
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

export function writeState(statePath, state) {
  const next = { ...state, schemaVersion: STATE_SCHEMA_VERSION, revision: (state.revision ?? 0) + 1 };
  const temporary = `${statePath}.coordination-${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporary, statePath);
  return next;
}

export function acquireCoordinationStateLock(statePath) {
  const lockPath = `${path.resolve(statePath)}.coordination.lock`;
  try {
    fs.mkdirSync(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const lockError = new Error("Another coordination mutation is already in progress for this state file.");
      lockError.code = "COORDINATION_LOCKED";
      throw lockError;
    }
    throw error;
  }
  return { release: () => fs.rmSync(lockPath, { recursive: true, force: true }) };
}

export function createTask(state, input) {
  const id = safeId(input.id, "Task id");
  if (state.tasks.some((task) => task.id === id)) fail(`Task already exists: ${id}`);
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
    handoffs: [],
    reports: []
  };
  if (task.writeScope && task.writeScope.paths.length === 0) fail("A write scope needs at least one path.");
  state.tasks.push(task);
  return task;
}

export function transitionTask(state, input) {
  const task = taskById(state, input.taskId);
  const target = required(input.status, "Status");
  const currentIndex = LIFECYCLE.indexOf(task.status);
  if (LIFECYCLE[currentIndex + 1] !== target) {
    fail(`Invalid transition: ${task.status} -> ${target}.`);
  }
  if (target === "done" && task.reports.length === 0) {
    fail("A linked report is required before review can transition to done.");
  }
  if (target === "in_progress") {
    // Work starts only from a complete brief, and a task that writes holds a
    // live lease so other agents can see the write scope is taken.
    if (!task.brief) fail("A brief is required before todo can transition to in_progress (coordination-board brief).");
    const parsed = parseBrief(task.brief);
    if (!parsed.ok) fail(`The brief is missing: ${parsed.missing.join(", ")}.`);
    if (task.writeScope && !(Date.parse(task.leaseUntil || "") > (input.now ?? Date.now()))) {
      fail("A task with a write scope needs a live lease before in_progress (coordination-board renew-lease).");
    }
  }
  task.status = target;
  return task;
}

export function addHandoff(state, input) {
  const task = taskById(state, input.taskId);
  const sourceCoordinator = coordinator(input.sourceCoordinator, "Source coordinator");
  const targetCoordinator = coordinator(input.targetCoordinator, "Target coordinator");
  task.handoffs.push({
    sourceCoordinator,
    targetCoordinator,
    question: redactText(input.question),
    evidence: input.evidence ? redactText(input.evidence) : null,
    conflict: input.conflict ? redactText(input.conflict) : null,
    decisionNeeded: input.decisionNeeded ? redactText(input.decisionNeeded) : null,
    verificationNeed: input.verificationNeed ? redactText(input.verificationNeed) : null
  });
  return task;
}

export function attachReport(state, input) {
  const task = taskById(state, input.taskId);
  const reportId = safeId(input.reportId, "Report id");
  if (!reportId.endsWith(".md")) fail("Report id must be a Markdown filename, not a path.");
  if (!reportId.startsWith(`${task.id}-`)) fail(`Report id must start with ${task.id}-.`);
  if (!task.reports.includes(reportId)) task.reports.push(reportId);
  return task;
}

export function setBrief(state, input) {
  const task = taskById(state, input.taskId);
  const text = guardedText(input.brief, "Brief", 8000);
  const parsed = parseBrief(text);
  if (!parsed.ok) fail(`The brief is missing: ${parsed.missing.join(", ")}.`);
  task.brief = text;
  return task;
}

export function renewLease(state, input) {
  const task = taskById(state, input.taskId);
  if (!task.writeScope) fail("Only a task with a write scope holds a lease.");
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LEASE_MINUTES) fail(`Lease minutes must be a whole number from 1 to ${MAX_LEASE_MINUTES}.`);
  task.leaseUntil = new Date((input.now ?? Date.now()) + minutes * 60_000).toISOString();
  return task;
}

export function addEvidence(state, input) {
  const task = taskById(state, input.taskId);
  task.evidence.push({ at: new Date(input.now ?? Date.now()).toISOString(), text: guardedText(input.evidence, "Evidence", 2000) });
  return task;
}

export function showTasks(state, taskId = null) {
  if (!taskId) return { tasks: state.tasks };
  return { task: taskById(state, taskId) };
}
