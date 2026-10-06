// The routing board's policy and boundary sentences, in one place: the board,
// `codex-status`, and the validators that pin them import these instead of
// carrying their own copies.

export const routingPolicyLine = "Policy: route matches are recommendations; delegation is conditional; roles run on the catalog worker model and inherit reasoning effort.";

export const routingPlanLine = "Routing plan: selected agents, skills, MCPs, commands, and skips in one initial line.";
export const routingResultLine = "Routing result: completion state and evidence in one final table or line.";
export const routingCliLine = "Use /agent in Codex CLI to inspect active agent threads, switch to one, or steer/close it.";

export const routingLifecycleLines = Object.freeze([
  "Close completed subagent threads when they are no longer needed.",
  "Use /agent before finalizing large work to inspect, switch, steer, or close agent threads.",
  "Use /ps for background terminals and /stop to cancel terminal work started by the current session.",
  "Close browser/MCP pages or sessions when the selected tool exposes a close operation.",
  "If an external MCP process such as Serena persists after the task, report it and ask before killing processes or deleting state."
]);

// The spawn conditions come from the catalog so this sentence cannot drift
// from the working agreement, which renders the same list.
export function buildRoutingBoundary(delegationPolicy) {
  const conditions = (delegationPolicy?.spawnWhen || []).join("; ");
  return `A route match recommends a specialist and spawns one only when ${conditions}; subagent spawning still requires the current runtime to permit delegation, at most ${delegationPolicy?.autoSpawnCap ?? 2} agents start per task without the user naming them, and destructive, credentialed, publishing, deployment, database, broad filesystem, and broad/destructive graph-indexing actions remain approval-gated.`;
}
