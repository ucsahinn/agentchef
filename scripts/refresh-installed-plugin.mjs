#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { platformCommand } from "./lib/platform-command.mjs";

export const PLUGIN_ID = "codex-chef-workflows@codex-chef";
const PLUGIN_NAME = "codex-chef-workflows";
const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

function commandFailure(result, fallback, codexHome) {
  const detail = [result?.stderr, result?.stdout]
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 1200);
  const message = detail || result?.error?.message || fallback;
  return codexHome
    ? message.split(path.resolve(codexHome)).join("${CODEX_HOME}")
    : message;
}

function parseInstalledPlugins(result, codexHome, phase) {
  if (result?.error?.code === "ENOENT") {
    return {
      unavailable: true,
      warning: "Codex CLI is not available; installed plugin cache refresh was skipped."
    };
  }
  if (result?.error) {
    return {
      unavailable: true,
      warning: `Codex plugin inspection is unavailable; cache refresh was skipped (${commandFailure(result, result.error.message, codexHome)}).`
    };
  }
  if (result?.status !== 0) {
    return {
      unavailable: true,
      warning: `Codex plugin inspection is unavailable; cache refresh was skipped (${commandFailure(result, `exit code ${result?.status}`, codexHome)}).`
    };
  }

  const rawOutput = typeof result.stdout === "string" ? result.stdout.trim() : "";
  if (!rawOutput) {
    return {
      unavailable: true,
      warning: `Codex plugin ${phase} returned empty output; plugin cache refresh was skipped.`
    };
  }

  let payload;
  try {
    payload = JSON.parse(rawOutput);
  } catch (error) {
    throw new Error(`Codex plugin ${phase} returned invalid JSON: ${error.message}`);
  }
  const installed = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.installed)
      ? payload.installed
      : null;
  if (!installed) {
    throw new Error(`Codex plugin ${phase} did not return an installed plugin list.`);
  }
  return { installed };
}

function findManagedPlugin(installed) {
  return installed.find((plugin) =>
    plugin?.pluginId === PLUGIN_ID
    || (plugin?.name === PLUGIN_NAME && plugin?.marketplaceName === "codex-chef")
  );
}

export function commandInvocation(command, args, platform = process.platform) {
  if (platform === "win32" && command.toLowerCase().endsWith(".cmd")) {
    return {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args]
    };
  }
  return { executable: command, args };
}

function defaultCodexRunner({ codexHome, platform }) {
  const commandPlatform = platform === "windows"
    ? "win32"
    : platform === "unix"
      ? "linux"
      : platform;
  const command = process.env.CODEX_CHEF_CODEX_COMMAND
    || platformCommand("codex", commandPlatform);
  return (args) => {
    const invocation = commandInvocation(command, args, commandPlatform);
    return spawnSync(invocation.executable, invocation.args, {
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_HOME: codexHome
      },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      windowsHide: true
    });
  };
}

export function refreshInstalledPlugin({
  apply = false,
  codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  expectedVersion,
  platform = process.platform,
  runCodex
} = {}) {
  if (!expectedVersion) {
    throw new Error("Expected managed plugin version is required.");
  }
  const execute = runCodex || defaultCodexRunner({ codexHome, platform });
  const before = parseInstalledPlugins(
    execute(["plugin", "list", "--json"]),
    codexHome,
    "list"
  );
  if (before.unavailable) {
    return {
      inspected: false,
      status: "unavailable",
      expectedVersion,
      warning: before.warning
    };
  }

  const plugin = findManagedPlugin(before.installed);
  if (!plugin || plugin.installed === false) {
    return {
      inspected: true,
      status: "not-installed",
      expectedVersion
    };
  }
  if (plugin.version === expectedVersion) {
    return {
      inspected: true,
      status: "current",
      currentVersion: plugin.version,
      expectedVersion,
      enabled: plugin.enabled === true
    };
  }
  if (!apply) {
    return {
      inspected: true,
      status: "planned",
      currentVersion: plugin.version || null,
      expectedVersion,
      enabled: plugin.enabled === true
    };
  }

  const refresh = execute(["plugin", "add", PLUGIN_ID, "--json"]);
  if (refresh?.error || refresh?.status !== 0) {
    throw new Error(
      `Codex plugin cache refresh failed: ${commandFailure(refresh, `exit code ${refresh?.status}`, codexHome)}`
    );
  }

  let after;
  let refreshedPlugin;
  try {
    after = parseInstalledPlugins(
      execute(["plugin", "list", "--json"]),
      codexHome,
      "post-refresh verification"
    );
    refreshedPlugin = after.unavailable ? null : findManagedPlugin(after.installed);
  } catch (error) {
    return {
      inspected: true,
      status: "refresh-uncertain",
      externalMutationApplied: true,
      previousVersion: plugin.version || null,
      expectedVersion,
      warning: `Codex plugin refresh completed but post-refresh verification is uncertain: ${commandFailure({ stderr: error.message }, error.message, codexHome)}`
    };
  }
  if (after.unavailable || !refreshedPlugin || refreshedPlugin.version !== expectedVersion) {
    const detail = after.unavailable
      ? after.warning
      : `expected ${expectedVersion}; found ${refreshedPlugin?.version || "not installed"}`;
    return {
      inspected: true,
      status: "refresh-uncertain",
      externalMutationApplied: true,
      previousVersion: plugin.version || null,
      expectedVersion,
      warning: `Codex plugin refresh completed but post-refresh verification is uncertain: ${detail}`
    };
  }

  return {
    inspected: true,
    status: "refreshed",
    previousVersion: plugin.version || null,
    currentVersion: refreshedPlugin.version,
    expectedVersion,
    enabled: refreshedPlugin.enabled === true
  };
}

function printHelp() {
  console.log(`Usage: node scripts/refresh-installed-plugin.mjs [options]

Refresh the versioned Codex cache only when Codex Chef is already installed.

Options:
  --apply                 Refresh a stale installed plugin cache
  --codex-home <path>     Codex home to inspect
  --expected-version <v>  Expected plugin version; defaults to the repository manifest
  --platform <name>       Command platform override (windows, unix, win32, linux, darwin)
  --json                  Emit machine-readable JSON
  -h, --help              Show this help
`);
}

function readExpectedVersion() {
  const manifestPath = path.join(
    root,
    "plugins",
    "codex-chef-workflows",
    ".codex-plugin",
    "plugin.json"
  );
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")).version;
}

function main(argv) {
  const options = {
    apply: false,
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    expectedVersion: null,
    json: false,
    platform: process.platform
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--codex-home" || arg === "--expected-version" || arg === "--platform") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      if (arg === "--codex-home") options.codexHome = path.resolve(value);
      else if (arg === "--expected-version") options.expectedVersion = value;
      else options.platform = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const result = refreshInstalledPlugin({
    ...options,
    expectedVersion: options.expectedVersion || readExpectedVersion()
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.status === "refreshed") {
    console.log(`Plugin cache: refreshed ${result.previousVersion || "unknown"} -> ${result.currentVersion}`);
  } else if (result.status === "planned") {
    console.log(`Plugin cache: would refresh ${result.currentVersion || "unknown"} -> ${result.expectedVersion}`);
  } else if (result.status === "unavailable") {
    console.log(`Plugin cache: skipped (${result.warning})`);
  } else if (result.status === "refresh-uncertain") {
    console.warn(`Plugin cache: refresh completed but verification is uncertain (${result.warning})`);
  } else {
    console.log(`Plugin cache: ${result.status}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`Codex Chef plugin refresh error: ${error.message}`);
    process.exitCode = 1;
  }
}
