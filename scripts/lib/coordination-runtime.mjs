import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { secretLikeCategory } from "./secret-classifier.mjs";

export const STATE_SCHEMA_VERSION = 2;
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
  if ((state?.schemaVersion !== 1 && state?.schemaVersion !== STATE_SCHEMA_VERSION) || !Array.isArray(state.tasks)) {
    fail("Unsupported coordination state format.");
  }
  if (state.schemaVersion === 1) return { ...state, schemaVersion: STATE_SCHEMA_VERSION, revision: 0 };
  if (!Number.isInteger(state.revision) || state.revision < 0) fail("Coordination state has an invalid revision.");
  return state;
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
    handoffs: [],
    reports: []
  };
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

export function showTasks(state, taskId = null) {
  if (!taskId) return { tasks: state.tasks };
  return { task: taskById(state, taskId) };
}
