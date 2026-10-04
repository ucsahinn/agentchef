#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs";
import { parseBrief } from "./lib/agent-brief.mjs";
import {
  addEvidence,
  addHandoff,
  acquireCoordinationStateLock,
  attachReport,
  createTask,
  readState,
  renewLease,
  setBrief,
  showTasks,
  transitionTask,
  writeInitialState,
  writeState
} from "./lib/coordination-runtime.mjs";

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (key === "json") { options.json = true; continue; }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    options[key] = value;
    index += 1;
  }
  if (!command || command === "help" || options.help) throw new Error("Usage: coordination-board <init|create|transition|handoff|attach-report|brief|renew-lease|add-evidence|show|brief-check> --state <path> [--json]");
  // An explicit --state wins; AGENTCHEF_BOARD_STATE names a shared board.
  if (!options.state && process.env.AGENTCHEF_BOARD_STATE) options.state = process.env.AGENTCHEF_BOARD_STATE;
  if (!options.state && command !== "brief-check") throw new Error("--state (or AGENTCHEF_BOARD_STATE) is required; no machine-local default is used.");
  return { command, options };
}

function briefText(options) {
  if (options["brief-file"]) return fs.readFileSync(options["brief-file"], "utf8");
  if (options.brief) return options.brief;
  throw new Error("--brief-file <path> or --brief <text> is required.");
}

function output(payload, json) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload, null, 2));
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
  const { command, options } = parse(process.argv.slice(2));
  let state;
  let task;
  switch (command) {
    case "init":
      {
        const lock = acquireCoordinationStateLock(options.state);
        try { state = writeInitialState(options.state); } finally { lock.release(); }
      }
      output({ ok: true, state }, options.json);
      break;
    case "create":
      task = mutate(options.state, (current) => createTask(current, { id: options.id, title: options.title, ownerCoordinator: options["owner-coordinator"], ownerAgent: options["owner-agent"], ownerSession: options["owner-session"], writeRepo: options["write-repo"], writePaths: options["write-paths"] }));
      output({ ok: true, task }, options.json);
      break;
    case "transition":
      task = mutate(options.state, (current) => transitionTask(current, { taskId: options.task, status: options.status }));
      output({ ok: true, task }, options.json);
      break;
    case "handoff":
      task = mutate(options.state, (current) => addHandoff(current, { taskId: options.task, sourceCoordinator: options["source-coordinator"], targetCoordinator: options["target-coordinator"], question: options.question, evidence: options.evidence, conflict: options.conflict, decisionNeeded: options["decision-needed"], verificationNeed: options["verification-need"] }));
      output({ ok: true, task }, options.json);
      break;
    case "attach-report":
      task = mutate(options.state, (current) => attachReport(current, { taskId: options.task, reportId: options["report-id"] }));
      output({ ok: true, task }, options.json);
      break;
    case "brief":
      task = mutate(options.state, (current) => setBrief(current, { taskId: options.task, brief: briefText(options) }));
      output({ ok: true, task }, options.json);
      break;
    case "brief-check": {
      // Checks a brief before it is sent; no board state is needed.
      const parsed = parseBrief(briefText(options));
      output({ ok: parsed.ok, missing: parsed.missing, fields: Object.keys(parsed.fields) }, options.json);
      if (!parsed.ok) process.exitCode = 1;
      break;
    }
    case "renew-lease":
      task = mutate(options.state, (current) => renewLease(current, { taskId: options.task, minutes: options.minutes }));
      output({ ok: true, task }, options.json);
      break;
    case "add-evidence":
      task = mutate(options.state, (current) => addEvidence(current, { taskId: options.task, evidence: options.evidence }));
      output({ ok: true, task }, options.json);
      break;
    case "show":
      state = readState(options.state);
      output({ ok: true, ...showTasks(state, options.task) }, options.json);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  const payload = { ok: false, error: error.message };
  console.error(JSON.stringify(payload));
  process.exitCode = 1;
}
