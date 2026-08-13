import fs from "node:fs";

export const STATE_SCHEMA_VERSION = 1;
const LIFECYCLE = ["backlog", "todo", "in_progress", "review", "done"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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
  text = text.replace(/(?:[A-Za-z]:\\|\\\\|\/)[^\s"']+/g, "[redacted-path]");
  text = text.replace(/\b(?:token|api[_-]?key|password|secret)\s*[=:]\s*[^\s]+/gi, "[redacted-secret]");
  text = text.replace(/\b(?:session|memory)\b[^\n]*/gi, "[redacted-private-content]");
  return text;
}

function coordinator(value, label) {
  const id = safeId(value, label);
  if (!id.toLowerCase().endsWith("coordinator")) {
    fail(`${label} must identify a coordinator; worker-to-worker and worker delegation handoffs are forbidden.`);
  }
  return id;
}

function taskById(state, id) {
  const task = state.tasks.find((candidate) => candidate.id === safeId(id, "Task id"));
  if (!task) fail(`Unknown task: ${id}`);
  return task;
}

export function createState() {
  return { schemaVersion: STATE_SCHEMA_VERSION, tasks: [] };
}

export function readState(statePath) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    fail(`Cannot read coordination state: ${error.message}`);
  }
  if (state?.schemaVersion !== STATE_SCHEMA_VERSION || !Array.isArray(state.tasks)) {
    fail("Unsupported coordination state format.");
  }
  return state;
}

export function writeInitialState(statePath) {
  fs.writeFileSync(statePath, `${JSON.stringify(createState(), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return createState();
}

export function writeState(statePath, state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
