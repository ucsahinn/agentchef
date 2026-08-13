#!/usr/bin/env node
import process from "node:process";
import {
  addHandoff,
  attachReport,
  createTask,
  readState,
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
  if (!command || command === "help" || options.help) throw new Error("Usage: coordination-board <init|create|transition|handoff|attach-report|show> --state <path> [--json]");
  if (!options.state) throw new Error("--state is required; no machine-local default is used.");
  return { command, options };
}

function output(payload, json) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(JSON.stringify(payload, null, 2));
}

try {
  const { command, options } = parse(process.argv.slice(2));
  let state;
  let task;
  switch (command) {
    case "init":
      state = writeInitialState(options.state);
      output({ ok: true, state }, options.json);
      break;
    case "create":
      state = readState(options.state);
      task = createTask(state, { id: options.id, title: options.title, ownerCoordinator: options["owner-coordinator"] });
      writeState(options.state, state);
      output({ ok: true, task }, options.json);
      break;
    case "transition":
      state = readState(options.state);
      task = transitionTask(state, { taskId: options.task, status: options.status });
      writeState(options.state, state);
      output({ ok: true, task }, options.json);
      break;
    case "handoff":
      state = readState(options.state);
      task = addHandoff(state, { taskId: options.task, sourceCoordinator: options["source-coordinator"], targetCoordinator: options["target-coordinator"], question: options.question, evidence: options.evidence, conflict: options.conflict, decisionNeeded: options["decision-needed"], verificationNeed: options["verification-need"] });
      writeState(options.state, state);
      output({ ok: true, task }, options.json);
      break;
    case "attach-report":
      state = readState(options.state);
      task = attachReport(state, { taskId: options.task, reportId: options["report-id"] });
      writeState(options.state, state);
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
