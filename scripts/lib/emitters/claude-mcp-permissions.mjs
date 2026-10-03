// Claude Code permission rules for the MCP servers AgentChef ships, from
// catalog/mcp-servers.json. Codex gates these servers per tool (approval_mode,
// enabled_tools, disabled_tools); Claude has no per-server tool allowlist, so
// the same decisions become permission rules:
//   toolApprovals "approve" -> allow, "prompt" -> ask,
//   disabledTools and claudeDeniedTools -> deny.
// A server the plugin ships is named mcp__plugin_<plugin>_<server>__<tool>;
// an optional server the user adds keeps the plain mcp__<server>__<tool> name.
import { identity } from "../identity.mjs";

export function claudeMcpToolName(server, tool, pluginName = identity.pluginName) {
  return server.claudeSource === "plugin"
    ? `mcp__plugin_${pluginName}_${server.name}__${tool}`
    : `mcp__${server.name}__${tool}`;
}

export function emitClaudeMcpPermissions(mcpCatalog, { pluginName = identity.pluginName } = {}) {
  const allow = new Set();
  const ask = new Set();
  const deny = new Set();
  for (const server of mcpCatalog.servers || []) {
    for (const [tool, decision] of Object.entries(server.toolApprovals || {})) {
      (decision === "approve" ? allow : ask).add(claudeMcpToolName(server, tool, pluginName));
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
