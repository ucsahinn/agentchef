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
export function resolveWindowsCli(name, env = process.env) {
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
// cmd.exe /s /c strips the first and last quote of the whole command line, so
// a quoted shim path with a space ("D:\tools\node global\claude.cmd") was cut
// at the space and the CLI looked missing (measured). Build the line verbatim
// and wrap it in one extra pair of quotes for /s to strip. cmd expands %VAR%
// even inside quotes, so such arguments are refused rather than passed on.
export function cmdShimInvocation(shimPath, args) {
  const quote = (value) => {
    const text = String(value);
    if (/["%\r\n]/.test(text)) throw new Error(`Refusing to pass a quote, percent sign, or newline through cmd.exe: ${text}`);
    return text === "" || /[\s&|<>^(),;=]/.test(text) ? `"${text}"` : text;
  };
  const line = [shimPath, ...args].map(quote).join(" ");
  return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], options: { windowsVerbatimArguments: true } };
}

export function spawnHarnessCli(name, args, spawnOptions = {}, platform = process.platform) {
  const options = { ...spawnOptions, shell: false };
  if (!isWindowsPlatform(platform)) return spawnSync(name, args, options);
  const resolved = resolveWindowsCli(name, options.env || process.env);
  if (!resolved) return spawnSync(name, args, options);
  if (resolved.toLowerCase().endsWith(".cmd")) {
    const invocation = cmdShimInvocation(resolved, args);
    return spawnSync(invocation.command, invocation.args, { ...options, ...invocation.options });
  }
  return spawnSync(resolved, args, options);
}
