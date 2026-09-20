// Emits Claude Code subagent definitions (Markdown + YAML frontmatter) from
// catalog/agents.json and the Codex role files under templates/codex/agents/.
// The catalog stays the single source: sandbox and web-search flags become
// Claude tool allow/deny lists, and the Codex developer_instructions become
// the subagent system prompt. Model pins are never emitted.
import fs from "node:fs";
import path from "node:path";

const readOnlyTools = ["Read", "Grep", "Glob"];
const writeTools = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"];
const webTools = ["WebSearch", "WebFetch"];

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
  const tools = [...withWeb, ...(agent.claudeMcp || []).map((server) => `mcp__${server}`)];
  const disallowed = agent.sandboxMode === "workspace-write"
    ? ["NotebookEdit"]
    : ["Write", "Edit", "NotebookEdit", "Bash"];
  return { tools, disallowed };
}

export function emitWorkerAgent(agent, roleToml, { pluginName }) {
  const role = parseRoleToml(roleToml);
  const { tools, disallowed } = toolsFor(agent);
  const frontmatter = [
    "---",
    `name: ${kebab(agent.name)}`,
    `description: ${yamlString(agent.templateDescription || agent.description)}`,
    `tools: ${tools.join(", ")}`,
    `disallowedTools: ${disallowed.join(", ")}`,
    "permissionMode: default",
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
    "- Workers never spawn further agents; return a bounded evidence handoff to the parent session.",
    // Codex read-only still allows commands; the Claude mapping does not, so a
    // role without an execution tool has to be told to ask for command output.
    ...(disallowed.includes("Bash")
      ? ["- This role cannot run commands. When an instruction below calls for command output, such as a diff, a test run, or a scan, ask the parent session to supply it instead of inferring it."]
      : []),
    "",
    role.developer_instructions || ""
  ];
  return `${frontmatter.join("\n")}\n\n${body.join("\n").trimEnd()}\n`;
}

export function emitCoordinatorAgent(coordinator, roleToml, { pluginName }) {
  const role = parseRoleToml(roleToml);
  const frontmatter = [
    "---",
    `name: ${kebab(coordinator.name)}`,
    `description: ${yamlString(coordinator.description)}`,
    `tools: ${readOnlyTools.join(", ")}, Agent(${coordinator.workers.map((worker) => `${pluginName}:${kebab(worker)}`).join(", ")})`,
    "disallowedTools: Write, Edit, NotebookEdit, Bash",
    "permissionMode: default",
    "---"
  ];
  const body = [
    `# ${role.nickname_candidates?.[0] || kebab(coordinator.name)}`,
    "",
    `${pluginName} coordinator \`${kebab(coordinator.name)}\` for the ${coordinator.roleId} domain.`,
    "",
    `- Delegate only to these cataloged workers: ${coordinator.workers.map((worker) => `\`${pluginName}:${kebab(worker)}\``).join(", ")}.`,
    "- Use at most four workers and one coordinator-to-worker level; never spawn peer coordinators.",
    "- Attach worker evidence (commands, paths, observations) to the handoff before reporting done.",
    "",
    role.developer_instructions || ""
  ];
  return `${frontmatter.join("\n")}\n\n${body.join("\n").trimEnd()}\n`;
}

export function emitClaudeAgents({ catalog, roleDirectory, pluginName = "agentchef" }) {
  const outputs = new Map();
  for (const agent of catalog.agents || []) {
    const roleToml = fs.readFileSync(path.join(roleDirectory, `${agent.name}.toml`), "utf8");
    outputs.set(`${kebab(agent.name)}.md`, emitWorkerAgent(agent, roleToml, { pluginName }));
  }
  for (const coordinator of catalog.coordinators || []) {
    const roleToml = fs.readFileSync(path.join(roleDirectory, `${coordinator.name}.toml`), "utf8");
    outputs.set(`${kebab(coordinator.name)}.md`, emitCoordinatorAgent(coordinator, roleToml, { pluginName }));
  }
  return outputs;
}
