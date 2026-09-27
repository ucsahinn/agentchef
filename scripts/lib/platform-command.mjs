import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Callers pass either Node's spelling ("win32") or the installer's ("windows").
export function isWindowsPlatform(platform = process.platform) {
  return platform === "win32" || platform === "windows";
}

export function platformCommand(name, platform = process.platform) {
  if (!isWindowsPlatform(platform)) return name;
  const windowsCommands = {
    npm: "npm.cmd",
    npx: "npx.cmd",
    codex: "codex.cmd",
    claude: "claude.cmd"
  };
  return windowsCommands[name] || name;
}

function pathEntries(env) {
  const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === "path");
  return String((key && env[key]) || "").split(path.delimiter).filter(Boolean);
}

// The first PATH directory holding name.exe or name.cmd wins, as in a shell.
function resolveWindowsCli(name, env) {
  for (const directory of pathEntries(env)) {
    for (const extension of [".exe", ".cmd"]) {
      const candidate = path.join(directory, `${name}${extension}`);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not in this directory
      }
    }
  }
  return null;
}

// Runs a harness CLI (codex, claude) without a shell. On Windows Node's spawn
// ignores PATHEXT, so a bare name only finds a real .exe, and a .cmd shim
// cannot be spawned directly at all (EINVAL): an npm-installed CLI looked
// missing and every plugin step was skipped. Resolve it the way a shell would
// and run a .cmd shim through cmd.exe.
export function spawnHarnessCli(name, args, spawnOptions = {}, platform = process.platform) {
  const options = { ...spawnOptions, shell: false };
  if (!isWindowsPlatform(platform)) return spawnSync(name, args, options);
  const resolved = resolveWindowsCli(name, options.env || process.env);
  if (!resolved) return spawnSync(name, args, options);
  if (resolved.toLowerCase().endsWith(".cmd")) {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", resolved, ...args], options);
  }
  return spawnSync(resolved, args, options);
}
