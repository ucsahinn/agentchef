import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function fileSha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Claude Code loads the plugin from its own cache, refreshed by version only,
// so a same-version change to a role or skill never reaches a session unless
// the cache is reinstalled. Reports the served copies that differ.
export function inspectClaudePluginCache(claudeHome, agentsHome) {
  const source = path.join(agentsHome, "plugins", "sources", "agentchef-workflows");
  const cacheRoot = path.join(claudeHome, "plugins", "cache", "agentchef", "agentchef-workflows");
  if (!fs.existsSync(source) || !fs.existsSync(cacheRoot)) return { inspected: false };
  let versions;
  try {
    versions = fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return { inspected: false };
  }
  if (versions.length === 0) return { inspected: false };
  // Only the version this source would install is served to a session; older
  // cache directories are leftovers Claude never loads.
  let installedVersion = null;
  try {
    installedVersion = JSON.parse(fs.readFileSync(path.join(source, ".claude-plugin", "plugin.json"), "utf8")).version || null;
  } catch {
    installedVersion = null;
  }
  const served = installedVersion && versions.includes(installedVersion) ? [installedVersion] : versions.slice(-1);
  // Compare what a Claude session loads from the plugin: role definitions and
  // skills. Only comparing agents let a changed skill stay stale unnoticed;
  // scripts/ holds the Codex-only hook and is not loaded by Claude.
  if (!fs.existsSync(path.join(source, "agents"))) return { inspected: false };
  const names = [];
  const collect = (relative) => {
    const absolute = path.join(source, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) collect(child);
      else if (entry.isFile()) names.push(child);
    }
  };
  collect("agents");
  collect("skills");
  const stale = [];
  for (const version of served) {
    // A served copy missing a loaded file differs by that file, so a copy with
    // no agents directory is maximal drift rather than something to skip over.
    const differing = names.filter((name) => {
      const cached = path.join(cacheRoot, version, name);
      if (!fs.existsSync(cached)) return true;
      return fileSha256(cached) !== fileSha256(path.join(source, name));
    });
    if (differing.length > 0) stale.push({ version, differing: differing.length, total: names.length });
  }
  return { inspected: true, versions, served, stale };
}
