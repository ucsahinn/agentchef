// Claude Code permission rules for the MCP servers AgentChef ships, from
// catalog/mcp-servers.json. Codex gates these servers per tool (approval_mode,
// enabled_tools, disabled_tools); Claude has no per-server tool allowlist, so
// the same decisions become permission rules:
//   toolApprovals "approve" -> allow, "prompt" -> no rule (see below),
//   disabledTools and claudeDeniedTools -> deny.
// A server the plugin ships is named mcp__plugin_<plugin>_<server>__<tool>;
// an optional server the user adds keeps the plain mcp__<server>__<tool> name.
import { identity } from "../identity.mjs";

export function claudeMcpToolName(server, tool, pluginName = identity.pluginName) {
  return server.claudeSource === "plugin"
    ? `mcp__plugin_${pluginName}_${server.name}__${tool}`
    : `mcp__${server.name}__${tool}`;
}

// Claude Code asks on every `ask` rule in every permission mode, so a
// prompted browser tool (navigate, screenshot, close) was a question on each
// call. No MCP ask rule is emitted: a prompted tool is neither allowed nor
// asked, and the permission mode the user chose decides; `deny` is unchanged.
export function emitClaudeMcpPermissions(mcpCatalog, { pluginName = identity.pluginName } = {}) {
  const allow = new Set();
  const ask = new Set();
  const deny = new Set();
  for (const server of mcpCatalog.servers || []) {
    for (const [tool, decision] of Object.entries(server.toolApprovals || {})) {
      if (decision === "approve") allow.add(claudeMcpToolName(server, tool, pluginName));
    }
    for (const tool of [...(server.disabledTools || []), ...(server.claudeDeniedTools || [])]) {
      deny.add(claudeMcpToolName(server, tool, pluginName));
    }
  }
  for (const rule of deny) {
    allow.delete(rule);
    ask.delete(rule);
  }
  for (const rule of ask) allow.delete(rule);
  return { allow: [...allow].sort(), ask: [...ask].sort(), deny: [...deny].sort() };
}
