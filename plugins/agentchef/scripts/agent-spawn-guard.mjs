#!/usr/bin/env node
// PreToolUse hook for the Agent tool. Claude Code enforces a subagent's
// Agent(<type>, ...) list only when that agent runs as the main thread
// (claude --agent); as an ordinary subagent the list is ignored, so a
// read-only coordinator could spawn any agent type. This hook enforces the
// list: an AgentChef coordinator may spawn only the workers its agent file
// names, and an AgentChef worker may not spawn at all.
//
// It never blocks the main session (unless it was started with --agent
// agentchef:<role>), a user's own agents, or anything it cannot read: on
// unknown input it exits 0 and lets Claude Code decide.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = "agentchef";
const agentsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "agents");

// Claude Code names a plugin agent "agentchef:<role>" in the Agent tool and,
// in some hook inputs, "plugin_agentchef_<role>" or "plugin:agentchef:<role>".
// All three mean the same role; anything else is not ours.
const SCOPED = new RegExp(`^(?:plugin[:_])?${PLUGIN}[:_]([a-z0-9-]+)$`);

function roleName(value) {
  return SCOPED.exec(String(value || "").trim())?.[1] ?? null;
}

// The coordinator's allowed workers come from its own agent file, so the
// hook and the frontmatter cannot drift apart.
function spawnPolicy(role) {
  if (!/^[a-z0-9-]+$/.test(role)) return null;
  let text;
  try {
    text = fs.readFileSync(path.join(agentsDirectory, `${role}.md`), "utf8");
  } catch {
    return null;
  }
  const tools = /^tools:\s*(.*)$/m.exec(text)?.[1] ?? "";
  const list = /\bAgent\(([^)]*)\)/.exec(tools);
  if (!list) return { worker: true, allowed: new Set() };
  return { worker: false, allowed: new Set(list[1].split(",").map((entry) => entry.trim()).filter(Boolean)) };
}

export function decide(input) {
  // "Task" is the Agent tool's earlier name.
  if (!["Agent", "Task"].includes(input?.tool_name) || !input.agent_type) return null;
  const caller = roleName(input.agent_type);
  if (!caller) return null;
  const policy = spawnPolicy(caller);
  // A caller that is ours but has no readable agent file fails closed: only
  // AgentChef roles are affected.
  if (!policy) return `${PLUGIN}:${caller} has no agent file in this plugin, so its spawns are refused.`;
  const requested = String(input.tool_input?.subagent_type || "").trim();
  if (policy.worker) {
    return `${PLUGIN}:${caller} is a worker and never spawns agents; name the role you need under Open questions and return to the parent session.`;
  }
  // Only the plugin-qualified name is accepted: a bare "test-verifier" would
  // resolve to a project or user agent of that name first.
  const target = roleName(requested);
  if (target && policy.allowed.has(`${PLUGIN}:${target}`)) return null;
  return `${PLUGIN}:${caller} may spawn only ${[...policy.allowed].join(", ")} (use the full ${PLUGIN}: name); "${requested || "(none)"}" is outside its workers. Escalate other domains to the parent session.`;
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    return;
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const reason = decide(input);
  if (!reason) return;
  // Exit code 2 blocks the tool call and shows stderr to the caller.
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
}

// Compare real paths: a plugin root reached through a junction, a symlink, or
// different drive-letter casing must still run the hook.
function invokedDirectly() {
  try {
    return fs.realpathSync(process.argv[1]).toLowerCase() === fs.realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (process.argv[1] && invokedDirectly()) main();
