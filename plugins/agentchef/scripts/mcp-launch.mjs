#!/usr/bin/env node
// Starts one npx-packaged MCP server for the Claude Code plugin.
//
// A plugin's .mcp.json is the same file on every platform, but Windows cannot
// spawn npx directly: npx.cmd has to go through cmd.exe, and cmd.exe must not
// resolve npx from the current (project) directory. This wrapper does that on
// Windows and runs npx directly elsewhere, with the server's stdio inherited
// so the MCP stream passes through untouched.
//
// Usage: node mcp-launch.mjs <package@exact-version> [server args...]
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Only an exact, pinned version is accepted: a range or tag would let the
// plugin start whatever the registry serves today.
const pinnedPackage = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// cmd.exe would interpret these inside an argument.
const windowsShellMeta = /[&|<>()^%!"]/;

export function launchPlan(argv, platform = process.platform) {
  const [pkg, ...serverArgs] = argv;
  if (!pkg || !pinnedPackage.test(pkg)) {
    throw new Error(`mcp-launch needs an exact package version such as name@1.2.3, got: ${pkg ?? "(none)"}`);
  }
  for (const arg of serverArgs) {
    if (!/^[A-Za-z0-9@._:=\/,+-]+$/.test(arg) || (platform === "win32" && windowsShellMeta.test(arg))) {
      throw new Error(`mcp-launch refuses an argument with shell syntax: ${arg}`);
    }
  }
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npx.cmd", "-y", pkg, ...serverArgs],
      env: { ...process.env, NoDefaultCurrentDirectoryInExePath: "1" }
    };
  }
  return { command: "npx", args: ["-y", pkg, ...serverArgs], env: process.env };
}

function main() {
  let plan;
  try {
    plan = launchPlan(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const child = spawn(plan.command, plan.args, { stdio: "inherit", env: plan.env, windowsHide: true });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    console.error(`mcp-launch could not start ${plan.command}: ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
