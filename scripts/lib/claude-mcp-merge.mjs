// Builds Claude Code user-scope MCP entries from catalog/mcp-servers.json and
// merges them into .claude.json without touching any other key. A server that
// already exists under the same name is left exactly as the user has it, with
// one exception: when `refresh` is requested and the current value still hashes
// to what AgentChef recorded in its own receipt, the entry is AgentChef's to
// update, so a catalog version bump can reach an installed home. An entry the
// user has edited never matches that hash and is always left alone.
//
// Since 1.3.0 the default servers (catalog `claudeSource: "plugin"`) come from
// the agentchef plugin instead. A user-scope entry of the same name outranks
// the plugin's, so the user entries AgentChef wrote before are retired here:
// only when the value still hashes to what the receipt records, or, for an
// entry somebody else owns, only with `adopt`. Otherwise it is reported as
// shadowing the plugin's server and kept.
import path from "node:path";
import { pointerFor, valueSha256 } from "./json-merge-receipt.mjs";

// Written to .claude.json by default. Empty since 1.3.0: the plugin ships them.
export const claudeDefaultServers = Object.freeze([]);

export function claudePluginServers(catalog) {
  return (catalog.servers || []).filter((server) => server.claudeSource === "plugin").map((server) => server.name);
}

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

export function planMcpMerge(current, catalog, { platform, claudeHome, serverNames = claudeDefaultServers, previousEntries = [], refresh = false, adopt = false }) {
  const next = structuredClone(current);
  if (next.mcpServers !== undefined && next.mcpServers !== null && (typeof next.mcpServers !== "object" || Array.isArray(next.mcpServers))) {
    throw new Error(".claude.json mcpServers must be an object to merge into it");
  }
  const entries = [];
  const skipped = [];
  const retired = [];
  const shadowing = [];
  // What AgentChef wrote last time, by pointer, so ownership can be proven.
  const recorded = new Map(previousEntries
    .filter((entry) => entry.kind === "object-key")
    .map((entry) => [entry.pointer, entry.valueSha256]));
  for (const name of serverNames) {
    const server = (catalog.servers || []).find((entry) => entry.name === name);
    if (!server) throw new Error(`MCP catalog is missing ${name}`);
    const pointer = pointerFor(["mcpServers", name]);
    if (next.mcpServers && name in next.mcpServers) {
      const currentSha = valueSha256(next.mcpServers[name]);
      const desired = buildClaudeMcpEntry(server, { platform, claudeHome });
      const desiredSha = valueSha256(desired);
      if (currentSha === desiredSha) {
        skipped.push({ pointer, reason: "current" });
      } else if (!refresh) {
        skipped.push({ pointer, reason: "already-present" });
      } else if (recorded.get(pointer) !== currentSha) {
        // Either AgentChef never wrote it, or it no longer looks the way it was
        // written. Both mean somebody else owns this entry now.
        skipped.push({ pointer, reason: recorded.has(pointer) ? "user-modified" : "already-present" });
      } else {
        next.mcpServers[name] = desired;
        entries.push({ kind: "object-key", pointer, valueSha256: desiredSha, preview: `${name} (refreshed)` });
      }
      continue;
    }
    const entry = buildClaudeMcpEntry(server, { platform, claudeHome });
    if (next.mcpServers === undefined || next.mcpServers === null) {
      // The container is created lazily and recorded so removal can prune it.
      next.mcpServers = {};
      entries.push({ kind: "container", pointer: pointerFor(["mcpServers"]), valueSha256: valueSha256(null), preview: "/mcpServers (created)" });
    }
    next.mcpServers[name] = entry;
    entries.push({ kind: "object-key", pointer, valueSha256: valueSha256(entry), preview: name });
  }
  for (const name of claudePluginServers(catalog)) {
    if (serverNames.includes(name) || !next.mcpServers || !(name in next.mcpServers)) continue;
    const pointer = pointerFor(["mcpServers", name]);
    const currentSha = valueSha256(next.mcpServers[name]);
    const owned = recorded.get(pointer) === currentSha;
    if (owned || adopt) {
      delete next.mcpServers[name];
      retired.push({ kind: "object-key", pointer, valueSha256: currentSha, preview: `${name} (${owned ? "retired: the plugin ships it" : "adopted: the plugin ships it"})` });
    } else {
      shadowing.push({ name, pointer, reason: recorded.has(pointer) ? "user-modified" : "user-owned" });
    }
  }
  return { next, entries, skipped, retired, shadowing, changed: entries.length > 0 || retired.length > 0 };
}
