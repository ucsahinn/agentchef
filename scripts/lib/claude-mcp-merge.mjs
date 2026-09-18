// Builds Claude Code user-scope MCP entries from catalog/mcp-servers.json and
// merges them into .claude.json without touching any other key. A server that
// already exists under the same name is left exactly as the user has it.
import path from "node:path";
import { pointerFor, valueSha256 } from "./json-merge-receipt.mjs";

// Claude Code has no per-target enable flag, so only the servers the catalog
// marks as Claude defaults are written; everything else stays documented.
export const claudeDefaultServers = Object.freeze(["context7", "serena"]);

function npxLaunch(pkg, platform) {
  if (platform === "windows") {
    return {
      type: "stdio",
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npx.cmd", "-y", pkg],
      env: { NoDefaultCurrentDirectoryInExePath: "1" }
    };
  }
  return { type: "stdio", command: "npx", args: ["-y", pkg] };
}

export function buildClaudeMcpEntry(server, { platform, claudeHome }) {
  if (server.name === "serena") {
    const bridge = path.join(claudeHome, "agentchef", "serena-pool.mjs");
    return { type: "stdio", command: "node", args: [bridge, "bridge"] };
  }
  if (server.transport === "stdio" && server.package) return npxLaunch(server.package, platform);
  if (["streamable_http", "http", "remote"].includes(server.transport) && server.url) {
    return { type: "http", url: server.url };
  }
  throw new Error(`Cannot build a Claude Code MCP entry for ${server.name}`);
}

export function planMcpMerge(current, catalog, { platform, claudeHome, serverNames = claudeDefaultServers }) {
  const next = structuredClone(current);
  if (next.mcpServers !== undefined && next.mcpServers !== null && (typeof next.mcpServers !== "object" || Array.isArray(next.mcpServers))) {
    throw new Error(".claude.json mcpServers must be an object to merge into it");
  }
  const entries = [];
  const skipped = [];
  for (const name of serverNames) {
    const server = (catalog.servers || []).find((entry) => entry.name === name);
    if (!server) throw new Error(`MCP catalog is missing ${name}`);
    if (next.mcpServers && name in next.mcpServers) {
      skipped.push({ pointer: pointerFor(["mcpServers", name]), reason: "already-present" });
      continue;
    }
    const entry = buildClaudeMcpEntry(server, { platform, claudeHome });
    if (next.mcpServers === undefined || next.mcpServers === null) {
      // The container is created lazily and recorded so removal can prune it.
      next.mcpServers = {};
      entries.push({ kind: "container", pointer: pointerFor(["mcpServers"]), valueSha256: valueSha256(null), preview: "/mcpServers (created)" });
    }
    next.mcpServers[name] = entry;
    entries.push({ kind: "object-key", pointer: pointerFor(["mcpServers", name]), valueSha256: valueSha256(entry), preview: name });
  }
  return { next, entries, skipped, changed: entries.length > 0 };
}
