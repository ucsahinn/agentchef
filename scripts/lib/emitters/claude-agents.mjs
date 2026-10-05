// Emits Claude Code subagent definitions (Markdown + YAML frontmatter) from
// catalog/agents.json and the Codex role files under templates/codex/agents/.
// The catalog stays the single source: sandbox and web-search flags become
// Claude tool allow/deny lists, and the Codex developer_instructions become
// the subagent system prompt. Every role runs on the catalog's worker model
// (catalog.workerModels.claude); the session the user opens keeps its own.
import fs from "node:fs";
import path from "node:path";
import { identity } from "../identity.mjs";

// No role gets the Skill tool: a skill can fork a general-purpose subagent or
// run shell commands outside the role's own tool list.
const readOnlyTools = ["Read", "Grep", "Glob"];
const writeTools = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"];
const webTools = ["WebSearch", "WebFetch"];

// `mcp__serena` grants every tool of whichever Serena entry is active. The
// AgentChef pool only serves read tools, but a user's own Serena entry (which
// AgentChef never replaces) also serves its editing and memory-writing tools,
// so a read-only role was handed them (seen live). Serena is granted by tool
// name, limited to the pool's own read allowlist.
const { TOOL_NAMES: serenaReadTools } = await import(new URL("../../../templates/codex/serena-pool.mjs", import.meta.url));

// Since 1.3.0 the plugin ships context7, playwright, and Serena, and Claude
// names a plugin server's tools mcp__plugin_<plugin>_<server>__<tool>. The
// plain name is granted too, so a role keeps working while a user entry of the
// same name shadows the plugin's (user scope outranks plugin scope).
const mcpCatalog = JSON.parse(fs.readFileSync(new URL("../../../catalog/mcp-servers.json", import.meta.url), "utf8"));
const pluginMcpServers = new Set(mcpCatalog.servers.filter((server) => server.claudeSource === "plugin").map((server) => server.name));

// A user's own chrome-devtools entry also serves script evaluation, form
// filling, and uploads; roles get only the tools the catalog reviewed.
const reviewedTools = new Map([
  ["serena", serenaReadTools],
  ["chrome-devtools", mcpCatalog.servers.find((server) => server.name === "chrome-devtools")?.enabledTools ?? []]
]);

function mcpGrants(server) {
  const prefixes = pluginMcpServers.has(server) ? [`mcp__plugin_${identity.pluginName}_${server}`, `mcp__${server}`] : [`mcp__${server}`];
  const tools = reviewedTools.get(server);
  return tools ? prefixes.flatMap((prefix) => tools.map((tool) => `${prefix}__${tool}`)) : prefixes;
}

function parseRoleToml(text) {
  const values = {};
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const multi = /^([a-z_]+)\s*=\s*"""\s*$/.exec(line);
    if (multi) {
      const body = [];
      index += 1;
      while (index < lines.length && lines[index] !== '"""') {
        body.push(lines[index]);
        index += 1;
      }
      values[multi[1]] = body.join("\n").trimEnd();
      continue;
    }
    const single = /^([a-z_]+)\s*=\s*(.*)$/.exec(line);
    if (!single) continue;
    const raw = single[2].trim();
    if (raw.startsWith('"') && raw.endsWith('"')) values[single[1]] = raw.slice(1, -1);
    else if (raw.startsWith("[")) values[single[1]] = JSON.parse(raw);
    else values[single[1]] = raw;
  }
  return values;
}

function kebab(name) {
  return name.replace(/_/g, "-");
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

// A Claude subagent tools list is an allowlist, and one that names no mcp__
// entry filters MCP tools out completely. A role is granted a server only when
// catalog/agents.json says its instructions depend on that server.
function toolsFor(agent) {
  const base = agent.sandboxMode === "workspace-write" ? writeTools : readOnlyTools;
  const withWeb = agent.webSearch ? [...base, ...webTools] : base;
  const tools = [...withWeb, ...(agent.claudeMcp || []).flatMap(mcpGrants)];
  const disallowed = agent.sandboxMode === "workspace-write"
    ? ["NotebookEdit"]
    : ["Write", "Edit", "NotebookEdit", "Bash"];
  return { tools, disallowed };
}

export function emitWorkerAgent(agent, roleToml, { pluginName, workerModel }) {
  const role = parseRoleToml(roleToml);
  const { tools, disallowed } = toolsFor(agent);
  const frontmatter = [
    "---",
    `name: ${kebab(agent.name)}`,
    `description: ${yamlString(agent.templateDescription || agent.description)}`,
    `tools: ${tools.join(", ")}`,
    ...(workerModel ? [`model: ${workerModel}`] : []),
    `disallowedTools: ${disallowed.join(", ")}`,
    "---"
  ];
  const body = [
    `# ${role.nickname_candidates?.[0] || kebab(agent.name)}`,
    "",
    `${pluginName} specialist worker \`${kebab(agent.name)}\` (${agent.category}). Sandbox posture: ${agent.sandboxMode}. Risk: ${agent.risk}.`,
    "",
    `- Primary use: ${agent.primaryUse}`,
    `- Must not: ${agent.mustNot}`,
    `- Default reason: ${agent.defaultReason}`,
    "- Workers never spawn further agents; return the six handoff fields (Outcome, Evidence, Changed scope, Risks, Open questions, Next verification) to the parent session.",
    // Codex read-only still allows commands; the Claude mapping does not, so a
    // role without an execution tool has to be told to ask for command output.
    ...(disallowed.includes("Bash")
      ? ["- This role cannot run commands. When an instruction below calls for command output, such as a diff, a test run, or a scan, ask the parent session to supply it instead of inferring it. Where an instruction says `rg` or `rg --files`, use the Grep and Glob tools instead."]
      : []),
    "",
    role.developer_instructions || ""
  ];
  return `${frontmatter.join("\n")}\n\n${body.join("\n").trimEnd()}\n`;
}

export function emitCoordinatorAgent(coordinator, roleToml, { pluginName, workerModel, maxWorkers = 4 }) {
  const role = parseRoleToml(roleToml);
  const frontmatter = [
    "---",
    `name: ${kebab(coordinator.name)}`,
    `description: ${yamlString(coordinator.description)}`,
    `tools: ${readOnlyTools.join(", ")}, Agent(${coordinator.workers.map((worker) => `${pluginName}:${kebab(worker)}`).join(", ")})`,
    ...(workerModel ? [`model: ${workerModel}`] : []),
    "disallowedTools: Write, Edit, NotebookEdit, Bash",
    "---"
  ];
  const body = [
    `# ${role.nickname_candidates?.[0] || kebab(coordinator.name)}`,
    "",
    `${pluginName} coordinator \`${kebab(coordinator.name)}\` for the ${coordinator.roleId} domain.`,
    "",
    `- Delegate only to these cataloged workers: ${coordinator.workers.map((worker) => `\`${pluginName}:${kebab(worker)}\``).join(", ")}.`,
    // Claude Code enforces the Agent(...) type list only when this agent runs
    // as the main thread (claude --agent); as a subagent the list is ignored,
    // so the rule is stated here too.
    `- Spawn only the workers listed above; never \`general-purpose\`, \`fork\`, another coordinator, or any agent outside that list. Use at most ${maxWorkers} workers per task and one coordinator-to-worker level.`,
    "- Attach worker evidence (commands, paths, observations) to the handoff before reporting done.",
    "",
    role.developer_instructions || ""
  ];
  return `${frontmatter.join("\n")}\n\n${body.join("\n").trimEnd()}\n`;
}

// Claude Code names plugin agents <plugin>:<agent>; a coordinator's Agent(...)
// allowlist must use the plugin's real name or it matches no worker.
export function emitClaudeAgents({ catalog, roleDirectory, pluginName = identity.pluginName }) {
  const outputs = new Map();
  // Roles run on the lower-cost worker model; the session that orchestrates
  // them keeps its own, stronger model.
  const workerModel = catalog.workerModels?.claude;
  for (const agent of catalog.agents || []) {
    const roleToml = fs.readFileSync(path.join(roleDirectory, `${agent.name}.toml`), "utf8");
    outputs.set(`${kebab(agent.name)}.md`, emitWorkerAgent(agent, roleToml, { pluginName, workerModel: agent.modelSelection === "worker" ? workerModel : undefined }));
  }
  for (const coordinator of catalog.coordinators || []) {
    const roleToml = fs.readFileSync(path.join(roleDirectory, `${coordinator.name}.toml`), "utf8");
    outputs.set(`${kebab(coordinator.name)}.md`, emitCoordinatorAgent(coordinator, roleToml, { pluginName, workerModel, maxWorkers: catalog.coordinationPolicy?.maxWorkersPerCoordinator ?? 4 }));
  }
  return outputs;
}
