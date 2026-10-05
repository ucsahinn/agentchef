#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs";
import { parseBrief, parseHandoff } from "./lib/agent-brief.mjs";
import {
  addEvidence,
  addHandoff,
  acquireCoordinationStateLock,
  assignTask,
  attachReport,
  createTask,
  readState,
  renewLease,
  resolveHandoff,
  setBrief,
  showTasks,
  transitionTask,
  writeInitialState,
  writeState
} from "./lib/coordination-runtime.mjs";

// Each command accepts only its own options, so a typo such as --owner-agnet
// fails instead of silently creating a task without an owner.
const COMMANDS = {
  init: [],
  create: ["id", "title", "owner-coordinator", "owner-agent", "owner-session", "write-repo", "write-paths"],
  assign: ["task", "owner-agent", "owner-session", "owner-coordinator", "by"],
  transition: ["task", "status", "verified-by", "reason", "by"],
  handoff: ["task", "source-coordinator", "target-coordinator", "question", "evidence", "conflict", "decision-needed", "verification-need"],
  "resolve-handoff": ["task", "handoff", "answer"],
  "attach-report": ["task", "report-id"],
  brief: ["task", "brief", "brief-file"],
  "brief-check": ["brief", "brief-file"],
  "handoff-check": ["handoff", "handoff-file"],
  "renew-lease": ["task", "minutes", "by"],
  "add-evidence": ["task", "evidence", "evidence-file"],
  show: ["task", "status", "owner"]
};
const STATELESS = new Set(["brief-check", "handoff-check"]);
const USAGE = `Usage: coordination-board <${Object.keys(COMMANDS).join("|")}> --state <path> [--json]`;

function parse(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") return { help: true };
  if (!COMMANDS[command]) throw new Error(`Unknown command: ${command}. ${USAGE}`);
  const accepted = new Set([...COMMANDS[command], ...(STATELESS.has(command) ? [] : ["state"])]);
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "json") { options.json = true; continue; }
    if (key === "help") return { help: true };
    if (!accepted.has(key)) throw new Error(`${command} does not accept --${key}. Accepted: ${[...accepted].map((name) => `--${name}`).join(", ")}.`);
    // A value may itself start with "--" (evidence such as "--json works");
    // only another accepted option name counts as a missing value.
    const value = rest[index + 1];
    if (value === undefined || value === "" || (value.startsWith("--") && (accepted.has(value.slice(2)) || value === "--json"))) {
      throw new Error(`Missing value for --${key}.`);
    }
    options[key] = value;
    index += 1;
  }
  // An explicit --state wins; AGENTCHEF_BOARD_STATE names a shared board.
  if (!options.state && process.env.AGENTCHEF_BOARD_STATE) options.state = process.env.AGENTCHEF_BOARD_STATE;
  if (!options.state && !STATELESS.has(command)) throw new Error("--state (or AGENTCHEF_BOARD_STATE) is required; no machine-local default is used.");
  return { command, options };
}

// Briefs and evidence are short; a file is size-checked before it is read.
const MAX_TEXT_FILE_BYTES = 64 * 1024;

function textFrom(options, inline, file) {
  if (options[file]) {
    if (fs.statSync(options[file]).size > MAX_TEXT_FILE_BYTES) throw new Error(`--${file} is larger than ${MAX_TEXT_FILE_BYTES} bytes.`);
    return fs.readFileSync(options[file], "utf8");
  }
  if (options[inline] !== undefined) return options[inline];
  throw new Error(`--${file} <path> or --${inline} <text> is required.`);
}

function output(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function mutate(statePath, callback) {
  const lock = acquireCoordinationStateLock(statePath);
  try {
    const state = readState(statePath);
    const result = callback(state);
    writeState(statePath, state);
    return result;
  } finally {
    lock.release();
  }
}

try {
  const parsedArgs = parse(process.argv.slice(2));
  if (parsedArgs.help) {
    console.log(USAGE);
  } else {
    const { command, options } = parsedArgs;
    let task;
    switch (command) {
      case "init": {
        const lock = acquireCoordinationStateLock(options.state);
        let state;
        try { state = writeInitialState(options.state); } finally { lock.release(); }
        output({ ok: true, state });
        break;
      }
      case "create":
        task = mutate(options.state, (current) => createTask(current, { id: options.id, title: options.title, ownerCoordinator: options["owner-coordinator"], ownerAgent: options["owner-agent"], ownerSession: options["owner-session"], writeRepo: options["write-repo"], writePaths: options["write-paths"] }));
        output({ ok: true, task });
        break;
      case "assign":
        task = mutate(options.state, (current) => assignTask(current, { taskId: options.task, ownerAgent: options["owner-agent"], ownerSession: options["owner-session"], ownerCoordinator: options["owner-coordinator"], by: options.by }));
        output({ ok: true, task });
        break;
      case "transition":
        task = mutate(options.state, (current) => transitionTask(current, { taskId: options.task, status: options.status, verifiedBy: options["verified-by"], reason: options.reason, by: options.by }));
        output({ ok: true, task });
        break;
      case "handoff":
        task = mutate(options.state, (current) => addHandoff(current, { taskId: options.task, sourceCoordinator: options["source-coordinator"], targetCoordinator: options["target-coordinator"], question: options.question, evidence: options.evidence, conflict: options.conflict, decisionNeeded: options["decision-needed"], verificationNeed: options["verification-need"] }));
        output({ ok: true, task });
        break;
      case "resolve-handoff":
        task = mutate(options.state, (current) => resolveHandoff(current, { taskId: options.task, handoffId: options.handoff, answer: options.answer }));
        output({ ok: true, task });
        break;
      case "attach-report":
        task = mutate(options.state, (current) => attachReport(current, { taskId: options.task, reportId: options["report-id"] }));
        output({ ok: true, task });
        break;
      case "brief": {
        const text = textFrom(options, "brief", "brief-file");
        task = mutate(options.state, (current) => setBrief(current, { taskId: options.task, brief: text }));
        output({ ok: true, task });
        break;
      }
      case "brief-check":
      case "handoff-check": {
        // Checks a brief before it is sent, or a handoff when it comes back;
        // no board state is needed.
        const parsed = command === "brief-check"
          ? parseBrief(textFrom(options, "brief", "brief-file"))
          : parseHandoff(textFrom(options, "handoff", "handoff-file"));
        output({ ok: parsed.ok, missing: parsed.missing, fields: Object.keys(parsed.fields) });
        if (!parsed.ok) process.exitCode = 1;
        break;
      }
      case "renew-lease":
        task = mutate(options.state, (current) => renewLease(current, { taskId: options.task, minutes: options.minutes, by: options.by }));
        output({ ok: true, task });
        break;
      case "add-evidence": {
        const text = textFrom(options, "evidence", "evidence-file");
        task = mutate(options.state, (current) => addEvidence(current, { taskId: options.task, evidence: text }));
        output({ ok: true, task });
        break;
      }
      case "show":
        output({ ok: true, ...showTasks(readState(options.state), options.task, { status: options.status, owner: options.owner }) });
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
}
