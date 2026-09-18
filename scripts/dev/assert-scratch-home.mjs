#!/usr/bin/env node
// Development guard: refuse to run installer, repair, verify, or remove flows
// against the live user homes. Every dev loop must point CODEX_HOME,
// AGENTS_HOME, and CLAUDE_CONFIG_DIR at a scratch root first.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requiredHomes = [
  { name: "CODEX_HOME", liveDefault: ".codex" },
  { name: "AGENTS_HOME", liveDefault: ".agents" },
  { name: "CLAUDE_CONFIG_DIR", liveDefault: ".claude" }
];

function normalize(value) {
  return path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function inspectScratchHomes(env = process.env, homeDir = os.homedir()) {
  const home = normalize(homeDir);
  const failures = [];
  const warnings = [];
  const resolved = {};

  for (const entry of requiredHomes) {
    const raw = env[entry.name];
    if (!raw || !raw.trim()) {
      failures.push(`${entry.name} is not set; export a scratch path before running installer flows.`);
      continue;
    }
    const value = normalize(raw);
    resolved[entry.name] = value;
    const liveRoot = normalize(path.join(homeDir, entry.liveDefault));
    if (value === home) {
      failures.push(`${entry.name} resolves to the user home itself.`);
    } else if (isInside(value, liveRoot)) {
      failures.push(`${entry.name} resolves inside the live ${entry.liveDefault} home (${liveRoot}).`);
    }
  }

  const gitConfigGlobal = env.GIT_CONFIG_GLOBAL;
  if (!gitConfigGlobal || !gitConfigGlobal.trim()) {
    warnings.push("GIT_CONFIG_GLOBAL is not set; git-guard flows would read and write the real global git config.");
  }
  const envHome = env.HOME;
  if (envHome && normalize(envHome) === home) {
    warnings.push("HOME points at the real user home; git-guard file targets would land in the live home.");
  }

  return { ok: failures.length === 0, failures, warnings, resolved };
}

function main() {
  const strict = process.argv.includes("--strict");
  const report = inspectScratchHomes();
  for (const [name, value] of Object.entries(report.resolved)) {
    console.log(`${name}=${value}`);
  }
  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`);
  }
  for (const failure of report.failures) {
    console.error(`error: ${failure}`);
  }
  if (!report.ok || (strict && report.warnings.length > 0)) {
    console.error("Refusing to continue against live homes. See docs/install.md (portable root) for the scratch recipe.");
    process.exit(1);
  }
  console.log("scratch homes ok");
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
