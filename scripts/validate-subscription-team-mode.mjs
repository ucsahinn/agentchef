#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function exactKeys(value, keys, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of keys) if (!(key in value)) errors.push(`${label}.${key} is required`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push(`${label}.${key} is unknown`);
}

export function validateCatalog(catalog, root = process.cwd()) {
const errors = [];

exactKeys(catalog, ["schemaVersion", "stability", "execution", "conductor", "workers", "verification", "approval", "limits", "branches"], "catalog", errors);
if (catalog.schemaVersion !== 2) errors.push("schemaVersion must be 2");
if (catalog.stability !== "experimental") errors.push("stability must be experimental");
exactKeys(catalog.execution, ["enabled", "optInEnv", "engineGeneratesApprovals", "roleModeCeilings"], "execution", errors);
if (catalog.execution?.enabled !== false) errors.push("execution.enabled must remain false");
if (catalog.execution?.optInEnv !== "AGENTCHEF_TEAM_MODE=experimental") errors.push("execution.optInEnv must be AGENTCHEF_TEAM_MODE=experimental");
if (catalog.execution?.engineGeneratesApprovals !== false) errors.push("execution.engineGeneratesApprovals must remain false");

const agentCatalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/agents.json"), "utf8"));
const roles = new Map(agentCatalog.agents.map((role) => [role.name, role]));
const ceilings = catalog.execution?.roleModeCeilings || {};
const writableRoles = new Set(["root_cause_debugger", "docs_author", "spec_author", "qa_lead"]);
for (const roleId of roles.keys()) {
  const ceiling = ceilings[roleId];
  const expected = writableRoles.has(roleId) ? "workspace-write" : "read-only";
  if (ceiling !== expected) errors.push(`roleModeCeilings.${roleId} must be ${expected}`);
  const modeRank = { "read-only": 0, "workspace-write": 1, "danger-full-access": 2 };
  const roleMode = roles.get(roleId).sandboxMode;
  if (modeRank[ceiling] === undefined || modeRank[ceiling] > modeRank[roleMode]) errors.push(`roleModeCeilings.${roleId} exceeds catalog sandboxMode ${roleMode}`);
  const roleFile = path.join(root, "templates/codex", roles.get(roleId).configFile);
  if (!fs.existsSync(roleFile)) errors.push(`Missing role TOML: ${path.relative(root, roleFile)}`);
}
for (const roleId of Object.keys(ceilings)) if (!roles.has(roleId)) errors.push(`Unknown role ceiling: ${roleId}`);

exactKeys(catalog.conductor, ["type", "spawnsWorkersDirectly", "editsWorkerScopeDuringRun"], "conductor", errors);
if (catalog.conductor?.type !== "interactive-session" || catalog.conductor?.spawnsWorkersDirectly !== false || catalog.conductor?.editsWorkerScopeDuringRun !== false) errors.push("conductor contract is invalid");
exactKeys(catalog.workers, ["command", "promptTransport", "minWorkers", "maxWorkers", "maxDepth", "workerMayPush", "isolation", "defaultProfile", "allowedRoleIds"], "workers", errors);
if (catalog.workers?.command !== "codex exec --json" || catalog.workers?.promptTransport !== "stdin" || catalog.workers?.minWorkers !== 1 || catalog.workers?.maxWorkers !== 4 || catalog.workers?.maxDepth !== 1 || catalog.workers?.workerMayPush !== false || catalog.workers?.isolation !== "git-worktree-per-worker" || catalog.workers?.defaultProfile !== "offline") errors.push("workers contract is invalid");
if (JSON.stringify([...(catalog.workers?.allowedRoleIds || [])].sort()) !== JSON.stringify([...roles.keys()].sort())) errors.push("workers.allowedRoleIds must exactly match catalog roles");
exactKeys(catalog.verification, ["roleId", "sandboxMode", "branch"], "verification", errors);
if (catalog.verification?.roleId !== "test_verifier" || catalog.verification?.sandboxMode !== "read-only" || ceilings.test_verifier !== "read-only") errors.push("verification must use read-only test_verifier");

exactKeys(catalog.approval, ["startFile", "mergeFile", "sentenceForStart", "sentenceForMerge", "sentenceForPushApproval", "validityDays", "singleUse", "plannedAtMustPrecedeApproval"], "approval", errors);
if (catalog.approval?.startFile !== "{runId}.baslat.json" || catalog.approval?.mergeFile !== "{runId}.birlestir.json") errors.push("approval filenames must use .baslat.json and .birlestir.json");
if (catalog.approval?.validityDays !== 7 || catalog.approval?.singleUse !== true || catalog.approval?.plannedAtMustPrecedeApproval !== true) errors.push("approval validity must be 7 days, single-use, and follow planning");
if (catalog.approval?.sentenceForStart !== "baslat <runId>" || catalog.approval?.sentenceForMerge !== "birlestir <runId>" || catalog.approval?.sentenceForPushApproval !== "onayla TASK-x") errors.push("approval sentences do not match the contract");

exactKeys(catalog.limits, ["workerMinutes", "idleWarningMinutes", "idleStopMinutes", "leaseMinutes", "leaseRenewMinutes", "ramPerWorkerMb"], "limits", errors);
const limits = catalog.limits || {};
if (!(limits.leaseRenewMinutes < limits.leaseMinutes && limits.leaseMinutes <= 1440)) errors.push("lease limits must satisfy renew < lease <= 1440 minutes");
if (limits.workerMinutes !== 60 || limits.idleWarningMinutes !== 15 || limits.idleStopMinutes !== 30 || limits.ramPerWorkerMb !== 1536) errors.push("worker limits do not match the contract");
exactKeys(catalog.branches, ["integrationPrefix", "workerBranchFormat", "worktreeRootFormat", "rejectTemp", "rejectInsideRepository"], "branches", errors);
if (catalog.branches?.integrationPrefix !== "takim/" || catalog.branches?.workerBranchFormat !== "takim/{runId}-{taskId}" || catalog.branches?.worktreeRootFormat !== "{repoParent}/.agentchef-worktrees/{runId}" || catalog.branches?.rejectTemp !== true || catalog.branches?.rejectInsideRepository !== true) errors.push("branch and worktree contract is invalid");

return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length) {
    console.error(`Unknown argument: ${args.join(", ")}`);
    process.exit(2);
  }
  try {
    const root = path.resolve(process.cwd());
    const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog/subscription-team-mode.json"), "utf8"));
    const errors = validateCatalog(catalog, root);
    if (errors.length) {
      console.error(errors.map((error) => `- ${error}`).join("\n"));
      process.exit(1);
    }
    console.log("Team mode v2 contract is valid.");
  } catch (error) {
    console.error(`Could not validate team mode catalog: ${error.message}`);
    process.exit(1);
  }
}
