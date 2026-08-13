#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CliUsageError,
  installCliErrorBoundary,
  requireCliValue
} from "./lib/cli-error-contract.mjs";
import { recommendProfiles } from "./lib/routing-recommendation.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "codex-routing-board",
  argv: args,
  root,
  prefix: "Codex Chef routing error"
});
const options = {
  json: false,
  profile: null,
  task: null
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--json") options.json = true;
  else if (arg === "--profile") {
    options.profile = requireCliValue(args, index, "--profile");
    index += 1;
  } else if (arg === "--task") {
    options.task = requireCliValue(args, index, "--task");
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/codex-routing-board.mjs [options]

Show the Codex Chef enterprise routing board.

Options:
  --json                Emit machine-readable JSON
  --profile <id>        Show one routing profile by id
  --task <description>  Recommend up to three profiles; never spawns agents or enables MCPs
`);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function listOrFallback(values, fallback) {
  return values.length ? values.join(", ") : fallback;
}

function terminalWidth() {
  const requested = Number(process.stdout.columns || process.env.COLUMNS || 96);
  return Math.max(72, Math.min(120, Number.isFinite(requested) ? requested : 96));
}

function printWrapped(value, { prefix = "", continuationPrefix = " ".repeat(prefix.length) } = {}) {
  const width = terminalWidth();
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  let current = prefix;
  let currentPrefix = prefix;
  for (const word of words) {
    const separator = current === currentPrefix ? "" : " ";
    if (current.length + separator.length + word.length <= width) {
      current += `${separator}${word}`;
      continue;
    }
    if (current !== currentPrefix) console.log(current);
    currentPrefix = continuationPrefix;
    current = `${currentPrefix}${word}`;
  }
  if (current !== currentPrefix || words.length === 0) console.log(current);
}

const routing = readJson("catalog/routing-profiles.json");
const agentCatalog = readJson("catalog/agents.json");
const agentIndex = new Map(agentCatalog.agents.map((agent) => [agent.name, agent]));
const ownerIndex = new Map(agentCatalog.agentSpaceRoles.flatMap((role) => role.specialists.map((name) => [name, role.id])));
const coordinatorByRole = new Map((agentCatalog.coordinators || []).map((coordinator) => [coordinator.roleId, coordinator]));
function workerFor(name) {
  const agent = agentIndex.get(name);
  return {
    name,
    agentSpaceOwner: ownerIndex.get(name),
    knowledgeRef: name,
    workerApprovalProfile: {
      approvalPolicy: agentCatalog.workerApprovalProfile.approvalPolicy,
      approvalsReviewer: agentCatalog.workerApprovalProfile.approvalsReviewer,
      sandboxMode: agentCatalog.workerApprovalProfile.sandboxMode,
      roleSandboxMode: agent.sandboxMode,
      rules: agentCatalog.workerApprovalProfile.rules
    }
  };
}

function coordinationFor(profiles) {
  const selectedWorkers = [...new Set(profiles.flatMap((profile) => profile.agents))];
  const workerOrder = new Map(selectedWorkers.map((worker, index) => [worker, index]));
  const workersByRole = new Map();
  for (const name of selectedWorkers) {
    const roleId = ownerIndex.get(name);
    if (!roleId) continue;
    const workers = workersByRole.get(roleId) || [];
    workers.push(name);
    workersByRole.set(roleId, workers);
  }
  const candidates = [...workersByRole.entries()]
    .map(([roleId, workers]) => ({
      coordinator: coordinatorByRole.get(roleId),
      workers,
      firstWorkerOrder: Math.min(...workers.map((worker) => workerOrder.get(worker)))
    }))
    .filter((entry) => entry.coordinator)
    .sort((left, right) => right.workers.length - left.workers.length
      || left.firstWorkerOrder - right.firstWorkerOrder
      || left.coordinator.name.localeCompare(right.coordinator.name));
  const primary = candidates[0] || null;
  return {
    policy: agentCatalog.coordinationPolicy || null,
    primaryCoordinator: primary ? {
      name: primary.coordinator.name,
      roleId: primary.coordinator.roleId,
      workers: primary.workers
    } : null,
    peerHandoffs: candidates.slice(1).map(({ coordinator, workers }) => ({
      toCoordinator: coordinator.name,
      roleId: coordinator.roleId,
      workers,
      via: agentCatalog.coordinationPolicy?.peerCommunication || "parent-routed-handoff",
      reason: "Selected work crosses the primary coordinator's bounded worker group."
    }))
  };
}
if (options.profile && options.task) throw new CliUsageError("Use either --profile or --task, not both.");
const recommendations = options.task ? recommendProfiles(routing.profiles, options.task) : [];
const profiles = options.profile
  ? routing.profiles.filter((profile) => profile.id === options.profile)
  : (options.task ? recommendations.map((entry) => entry.profile) : routing.profiles);

if (options.profile && profiles.length === 0) {
  throw new CliUsageError(`Unknown routing profile: ${options.profile}`);
}

const report = {
  schemaVersion: "codex-chef.routing.v2",
  generatedAt: new Date().toISOString(),
  sourcePolicy: routing.sourcePolicy,
  delegationPolicy: routing.delegationPolicy,
  agentRuntimePolicy: routing.agentRuntimePolicy,
  visibilityContract: {
    routingPlan: "Routing plan: one compact initial line with selected agents, skills, MCPs, commands, and skips.",
    routingResult: "Routing result: one compact final table or line with state and evidence for each selected surface.",
    cli: "Use /agent in Codex CLI to inspect active agent threads, switch to one, or steer/close it.",
    lifecycle: [
      "Close completed subagent threads when the task no longer needs them.",
      "Use /agent to inspect, switch, steer, or close agent threads before finalizing large work.",
      "Use /ps to inspect background terminals and /stop to cancel terminal work started by the current session.",
      "Close browser/MCP pages or sessions when the selected tool exposes a close operation.",
      "If an external MCP process such as Serena persists after the task, report it and ask before killing processes or deleting state."
    ],
    boundary: "A route match recommends a specialist but spawns only for independent parallel work, noisy isolation, or explicit user-requested delegation."
  },
  profileCount: profiles.length,
  taskRecommendation: options.task ? { algorithm: "weighted-catalog-v1", task: options.task, recommendations: recommendations.map(({ profile, matchedTerms, matchedPhrases, excludedTerms, score, priority, confidence }) => ({ id: profile.id, title: profile.title, matchedTerms, matchedPhrases, excludedTerms, score, priority, confidence, advisory: true })) } : null,
  coordination: coordinationFor(profiles),
  profiles: profiles.map((profile) => ({ ...profile, workers: profile.agents.map(workerFor) }))
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Codex Chef enterprise routing board");
  console.log(`Profiles: ${profiles.length}`);
  if (options.task) {
    printWrapped(`Recommended for: ${options.task}`, { prefix: "[info] ", continuationPrefix: "       " });
    if (recommendations.length === 0) printWrapped("No confident route match. Use the full board or select a profile explicitly; no agent or MCP was activated.", { prefix: "[info] ", continuationPrefix: "       " });
    for (const recommendation of recommendations) {
      const signals = [...recommendation.matchedPhrases, ...recommendation.matchedTerms].join(", ");
      printWrapped(`${recommendation.profile.id}: ${recommendation.confidence} confidence; signals: ${signals}`, { prefix: "[signal] ", continuationPrefix: "         " });
    }
    for (const recommendation of recommendations) printWrapped(`${recommendation.profile.id} — matched: ${recommendation.matchedTerms.join(", ")}`, { prefix: "[recommend] ", continuationPrefix: "            " });
  }
  printWrapped("Policy: route matches are recommendations; delegation is conditional and inherits the active user profile.");
  console.log("");
  console.log("Routing visibility contract:");
  printWrapped("Routing plan: selected agents, skills, MCPs, commands, and skips in one initial line.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Routing result: completion state and evidence in one final table or line.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Use /agent in Codex CLI to inspect active agent threads, switch to one, or steer/close it.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Boundary: routing profiles make specialists visible, not hidden permission to spawn agents or enable risky tools.", { prefix: "- ", continuationPrefix: "  " });
  if (report.coordination.primaryCoordinator) {
    console.log("");
    printWrapped(`${report.coordination.primaryCoordinator.name} owns: ${report.coordination.primaryCoordinator.workers.join(", ")}`, { prefix: "Coordinator: ", continuationPrefix: "             " });
    for (const handoff of report.coordination.peerHandoffs) {
      printWrapped(`${handoff.toCoordinator} via ${handoff.via}: ${handoff.workers.join(", ")}`, { prefix: "Peer handoff: ", continuationPrefix: "              " });
    }
  }
  console.log("");
  console.log("Lifecycle hygiene:");
  printWrapped("Close completed subagent threads when they are no longer needed.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Use /agent before finalizing large work to inspect, switch, steer, or close agent threads.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Use /ps for background terminals and /stop to cancel terminal work started by the current session.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("Close browser/MCP pages or sessions when the selected tool exposes a close operation.", { prefix: "- ", continuationPrefix: "  " });
  printWrapped("If an external MCP process such as Serena persists after the task, report it and ask before killing processes or deleting state.", { prefix: "- ", continuationPrefix: "  " });
  for (const profile of profiles) {
    console.log("");
    printWrapped(`${profile.title} (${profile.id})`, { prefix: "- ", continuationPrefix: "  " });
    printWrapped(profile.trigger, { prefix: "  Trigger: ", continuationPrefix: "    " });
    printWrapped(listOrFallback(profile.agents, "No specialist agent route"), { prefix: "  Agents: ", continuationPrefix: "    " });
    printWrapped(listOrFallback(profile.skills, "No matching skill route"), { prefix: "  Skills: ", continuationPrefix: "    " });
    printWrapped(listOrFallback(profile.mcp, "No MCP route"), { prefix: "  MCP: ", continuationPrefix: "    " });
    printWrapped(listOrFallback(profile.flags, "No extra flags/checks"), { prefix: "  Flags/checks: ", continuationPrefix: "    " });
    printWrapped(profile.delegationMode, { prefix: "  Delegation mode: ", continuationPrefix: "    " });
    printWrapped(profile.skillMode, { prefix: "  Skill mode: ", continuationPrefix: "    " });
    printWrapped(profile.mcpMode, { prefix: "  MCP mode: ", continuationPrefix: "    " });
    printWrapped(profile.owner, { prefix: "  Owner: ", continuationPrefix: "    " });
    printWrapped(profile.primarySurface, { prefix: "  Surface: ", continuationPrefix: "    " });
    printWrapped(profile.durability, { prefix: "  Durability: ", continuationPrefix: "    " });
    printWrapped(profile.privilegeDelta, { prefix: "  Privilege delta: ", continuationPrefix: "    " });
    printWrapped(profile.validationGate, { prefix: "  Validation: ", continuationPrefix: "    " });
    printWrapped(profile.rollback, { prefix: "  Rollback: ", continuationPrefix: "    " });
    printWrapped(profile.boundary, { prefix: "  Boundary: ", continuationPrefix: "    " });
  }
}
