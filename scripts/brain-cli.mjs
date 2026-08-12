#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBackupPlan,
  auditBrainVault,
  applyBrainPlan,
  applyCapturePlan,
  applyRestorePlan,
  buildBackupPlan,
  buildBrainPlan,
  buildCapturePlan,
  buildObsidianOpenUri,
  buildRestorePlan,
  retrieveBrainNotes,
  validateBrainVault
} from "./lib/brain-foundation.mjs";
import { inspectWindowsBrainPermissions } from "./lib/brain-permissions-windows.mjs";
import {
  CliUsageError,
  emitCliError,
  requireCliValue
} from "./lib/cli-error-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(root, "templates", "brain");
const ACTIONS = new Set(["init", "status", "doctor", "permissions", "audit", "capture", "retrieve", "uri", "backup", "restore"]);

function parseArgs(argv) {
  let action = "init";
  let index = 0;
  if (argv[0] && !argv[0].startsWith("-")) {
    action = argv[0];
    index = 1;
  }
  if (!ACTIONS.has(action)) throw new CliUsageError(`Unknown Brain action: ${action}`);
  const options = {
    action,
    mode: "preview",
    json: false,
    target: process.env.CODEX_CHEF_BRAIN_HOME ? path.resolve(process.env.CODEX_CHEF_BRAIN_HOME) : null,
    input: null,
    projectId: null,
    agentRole: null,
    query: "",
    note: null,
    backupId: null,
    help: false
  };
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--preview") options.mode = "preview";
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (["--target", "--vault", "--input", "--project", "--role", "--query", "--note", "--id", "--backup"].includes(arg)) {
      const value = requireCliValue(argv, index, arg);
      if (arg === "--target" || arg === "--vault") options.target = path.resolve(value);
      else if (arg === "--input") options.input = path.resolve(value);
      else if (arg === "--project") options.projectId = value;
      else if (arg === "--role") options.agentRole = value;
      else if (arg === "--query") options.query = value;
      else if (arg === "--note") options.note = value;
      else options.backupId = value;
      index += 1;
    } else {
      throw new CliUsageError(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function chefAgentRoles() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "agents.json"), "utf8"));
  return new Set((catalog.agentSpaceRoles || []).map(({ id }) => id));
}

function requireTarget(options) {
  if (!options.target) throw new Error("Brain target is required. Pass --target PATH or set CODEX_CHEF_BRAIN_HOME.");
  return options.target;
}

function print(value, json) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.action === "preview") {
    console.log(`Codex Chef Brain preview: ${value.target}`);
    console.log(`Create: ${value.createCount}; identical: ${value.identicalCount}; conflicts: ${value.conflictCount}`);
  } else if (value.action === "apply") {
    console.log(`Codex Chef Brain initialized: ${value.target}`);
    console.log(`Created: ${value.created.length}; preserved conflicts: ${value.conflicts.length}`);
  } else if (typeof value.ok === "boolean") {
    console.log(`${value.ok ? "OK" : "ATTENTION"}: ${value.target}`);
    for (const error of value.errors || []) console.log(`- ${error}`);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
}

function usage() {
  console.log(`Codex Chef Brain

Usage:
  node scripts/brain-cli.mjs init --target PATH --preview|--apply [--json]
  node scripts/brain-cli.mjs audit --target PATH [--json]
  node scripts/brain-cli.mjs status --target PATH [--json]
  node scripts/brain-cli.mjs permissions --target PATH [--json]
  node scripts/brain-cli.mjs capture --target PATH --input candidate.json --preview|--apply [--json]
  node scripts/brain-cli.mjs retrieve --target PATH --project ID [--role CHEF_ROLE] --query TEXT [--json]
  node scripts/brain-cli.mjs uri --target PATH --note RELATIVE_PATH [--json]
  node scripts/brain-cli.mjs backup --target PATH [--id ID] --preview|--apply [--json]
  node scripts/brain-cli.mjs restore --target PATH --id ID --preview|--apply [--json]

The target must be explicit or provided by CODEX_CHEF_BRAIN_HOME. Preview, status and permissions never write.`);
}

function execute(options) {
  if (options.help) return usage();
  const target = requireTarget(options);
  if (options.action === "status" || options.action === "doctor") {
    const contentStatus = validateBrainVault(target);
    const securityStatus = inspectWindowsBrainPermissions(target);
    const securityOk = securityStatus.supported ? securityStatus.ok : true;
    const result = {
      action: options.action,
      ok: contentStatus.ok && securityOk,
      target: contentStatus.target,
      errors: [
        ...contentStatus.errors,
        ...(securityStatus.supported ? securityStatus.errors : [])
      ],
      contentStatus: { ok: contentStatus.ok, errors: contentStatus.errors },
      securityStatus
    };
    print(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (options.action === "permissions") {
    const result = inspectWindowsBrainPermissions(target);
    print(result, options.json);
    if (result.supported && !result.ok) process.exitCode = 1;
    return;
  }
  if (options.action === "audit") {
    const result = auditBrainVault({ target });
    print(result, options.json);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (options.action === "init") {
    const plan = buildBrainPlan({ templateRoot, target });
    if (options.mode === "preview") {
      print({ action: "preview", target: plan.target, createCount: plan.operations.length, identicalCount: plan.identical.length, conflictCount: plan.conflicts.length, conflicts: plan.conflicts.map((entry) => entry.relativePath), approvalRequired: true }, options.json);
    } else {
      print({ action: "apply", ...applyBrainPlan(plan) }, options.json);
    }
    return;
  }
  if (options.action === "capture") {
    if (!options.input) throw new Error("capture requires --input candidate.json.");
    const candidate = JSON.parse(fs.readFileSync(options.input, "utf8").replace(/^\uFEFF+/, ""));
    if (candidate.agentRoles && candidate.agentRoles.some((role) => role !== "shared" && !chefAgentRoles().has(role))) {
      throw new Error(`capture agentRoles must use shared or a Chef role: ${[...chefAgentRoles()].join(", ")}.`);
    }
    const plan = buildCapturePlan({ target, candidate });
    print(options.mode === "apply" ? applyCapturePlan(plan) : { ...plan, content: undefined, destinationPath: undefined }, options.json);
    return;
  }
  if (options.action === "retrieve") {
    if (!options.projectId) throw new Error("retrieve requires --project ID.");
    if (options.agentRole && !chefAgentRoles().has(options.agentRole)) {
      throw new Error(`retrieve --role must be a Chef role: ${[...chefAgentRoles()].join(", ")}.`);
    }
    print(retrieveBrainNotes({ target, projectId: options.projectId, agentRole: options.agentRole, query: options.query }), options.json);
    return;
  }
  if (options.action === "uri") {
    if (!options.note) throw new Error("uri requires --note RELATIVE_PATH.");
    print(buildObsidianOpenUri({ target, note: options.note }), options.json);
    return;
  }
  if (options.action === "backup") {
    const plan = buildBackupPlan({ target, backupId: options.backupId || undefined });
    print(options.mode === "apply" ? applyBackupPlan(plan) : { schemaVersion: plan.schemaVersion, kind: plan.kind, target: plan.target, backupId: plan.backupId, fileCount: plan.files.length, approvalRequired: true }, options.json);
    return;
  }
  if (!options.backupId) throw new Error("restore requires --id BACKUP_ID.");
  const plan = buildRestorePlan({ target, backupId: options.backupId });
  print(options.mode === "apply" ? applyRestorePlan(plan) : { schemaVersion: plan.schemaVersion, kind: plan.kind, target: plan.target, backupId: plan.backupId, operations: plan.operations.map(({ relativePath, status, currentHash, backupHash }) => ({ relativePath, status, currentHash, backupHash })), approvalRequired: true }, options.json);
}

try {
  execute(parseArgs(process.argv.slice(2)));
} catch (error) {
  process.exitCode = emitCliError({
    tool: "brain",
    error,
    argv: process.argv.slice(2),
    root,
    prefix: "Codex Chef Brain error"
  });
}
