#!/usr/bin/env node
// Prints the harness map: every skill, agent role, and MCP server, its source,
// and its state on each target. Read-only. Exit 1 when AgentChef is installed
// but a harness skill or role is missing on a selected target.
//
// Usage: node scripts/harness-inventory.mjs [--target codex|claude|both] [--json] [--all]
//   --all  also list rows that are fine (installed, plugin, not-configured)
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHarnessInventory } from "./lib/harness-inventory.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function inventoryHomes(env = process.env, home = os.homedir()) {
  const claudeHome = env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(home, ".claude");
  return {
    codexHome: path.resolve(env.CODEX_HOME || path.join(home, ".codex")),
    agentsHome: path.resolve(env.AGENTS_HOME || path.join(home, ".agents")),
    claudeHome,
    // Claude Code keeps .claude.json in the config directory only when it was relocated.
    claudeJson: env.CLAUDE_CONFIG_DIR ? path.join(claudeHome, ".claude.json") : path.join(home, ".claude.json")
  };
}

const quietStates = new Set(["-", "installed", "plugin", "not-configured", "enabled", "disabled"]);

export function formatInventory(report, { all = false } = {}) {
  const lines = [];
  const header = ["COMPONENT", "KIND", "SOURCE", ...report.targets.map((target) => target.toUpperCase())];
  const rows = report.rows
    .filter((row) => all || report.targets.some((target) => !quietStates.has(row[target])) || !(row.source.startsWith("plugin") || row.source.startsWith("catalog")))
    .map((row) => [row.name, row.kind, row.source, ...report.targets.map((target) => row[target])]);
  const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => String(row[index]).length)));
  const render = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ").trimEnd();
  lines.push(render(header));
  for (const row of rows) lines.push(render(row));
  if (rows.length === 0) lines.push("(every harness row is in its expected state; --all lists them)");
  lines.push("");
  const e = report.expected;
  lines.push(`Harness: ${e.skills} skills (${e.bundledSkills} bundled + ${e.pinnedSkills} pinned) · ${e.agents} agent roles (${e.specialists} specialists + ${e.coordinators} coordinators) · ${e.mcp} MCP servers (Codex default ${e.codexMcpDefault}, Claude plugin ${e.claudePluginMcp})`);
  for (const target of report.targets) {
    const found = report.found[target];
    lines.push(`${target}: ${found.skills}/${e.skills} skills · ${found.agents}/${e.agents} roles · ${found.mcp}/${e.mcp} MCP configured${report.drift[target] ? ` · cache differs from source in ${report.drift[target]} file(s)` : ""}`);
  }
  const issues = Object.entries(report.issues).filter(([, count]) => count > 0).map(([state, count]) => `${state} ${count}`);
  lines.push(`Issues: ${issues.length > 0 ? issues.join(", ") : "none"}`);
  if (!report.installed) lines.push("AgentChef is not installed in these homes (no plugin source).");
  if (report.legacyPluginSource) lines.push(`The plugin is still installed as ${report.legacyPluginSource}; run npm run chef -- --migrate-identity --target both to move it to the 1.3.0 layout.`);
  return lines.join("\n");
}

function main(argv) {
  let target = "both";
  let json = false;
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") json = true;
    else if (arg === "--all") all = true;
    else if (arg === "--target") target = argv[++index];
    else if (arg.startsWith("--target=")) target = arg.slice("--target=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/harness-inventory.mjs [--target codex|claude|both] [--json] [--all]");
      return 0;
    } else {
      console.error(`Unknown argument: ${arg}`);
      return 2;
    }
  }
  if (!["codex", "claude", "both"].includes(target)) {
    console.error("--target must be codex, claude, or both");
    return 2;
  }
  const targets = target === "both" ? ["codex", "claude"] : [target];
  const report = buildHarnessInventory({ repoRoot, homes: inventoryHomes(), targets });
  console.log(json ? JSON.stringify(report, null, 2) : formatInventory(report, { all }));
  return report.installed && !report.complete ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
