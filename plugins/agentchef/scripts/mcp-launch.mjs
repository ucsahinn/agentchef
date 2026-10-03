#!/usr/bin/env node
// Starts one npx-packaged MCP server for the Claude Code plugin.
//
// A plugin's .mcp.json is the same file on every platform, but Windows cannot
// spawn npx directly: npx.cmd has to go through cmd.exe, and cmd.exe must not
// resolve npx from the current (project) directory. This wrapper does that on
// Windows and runs npx directly elsewhere, with the server's stdio inherited
// so the MCP stream passes through untouched.
//
// Once npx has fetched the pinned version, the server's own entry point runs
// inside this node process instead: claude -> node, rather than claude ->
// node -> cmd.exe -> npx -> node for every server in every session.
//
// Usage: node mcp-launch.mjs <package@exact-version> [server args...]
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
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

function splitPackage(pkg) {
  const at = pkg.lastIndexOf("@");
  return { name: pkg.slice(0, at), version: pkg.slice(at + 1) };
}

function npxCacheRoot(env = process.env, platform = process.platform) {
  if (env.npm_config_cache) return path.join(env.npm_config_cache, "_npx");
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "npm-cache", "_npx");
  return path.join(os.homedir(), ".npm", "_npx");
}

// The entry point of exactly this package version in npx's cache, or null.
// Only an installed package.json whose version equals the pin counts, and the
// bin must resolve inside that package's own folder.
export function cachedEntryPoint(pkg, { cacheRoot = npxCacheRoot() } = {}) {
  const { name, version } = splitPackage(pkg);
  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return null;
  }
  for (const entry of entries) {
    const packageRoot = path.join(cacheRoot, entry.name, "node_modules", ...name.split("/"));
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (manifest.name !== name || manifest.version !== version) continue;
    const bins = typeof manifest.bin === "string" ? { [name.split("/").pop()]: manifest.bin } : (manifest.bin || {});
    const values = Object.values(bins);
    const chosen = bins[name.split("/").pop()] || (values.length === 1 ? values[0] : null);
    if (!chosen) continue;
    const binPath = path.resolve(packageRoot, chosen);
    if (!binPath.startsWith(packageRoot + path.sep) || !fs.existsSync(binPath)) continue;
    return binPath;
  }
  return null;
}

function runInProcess(binPath, serverArgs) {
  // Exactly what `node <bin> <args>` does, including require.main and ESM entries.
  process.argv = [process.execPath, binPath, ...serverArgs];
  createRequire(import.meta.url)("node:module").runMain();
}

function main() {
  let plan;
  try {
    plan = launchPlan(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const [pkg, ...serverArgs] = process.argv.slice(2);
  const cached = process.env.AGENTCHEF_MCP_LAUNCH_NO_INPROCESS === "1" ? null : cachedEntryPoint(pkg);
  if (cached) {
    runInProcess(cached, serverArgs);
    return;
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
