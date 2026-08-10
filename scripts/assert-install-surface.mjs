#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { resolveInstallContract } from "./lib/install-contract.mjs";

export function assertInstallSurface(codexHome, agentsHome) {
  const codexRoot = path.resolve(codexHome);
  const agentsRoot = path.resolve(agentsHome);
  const contract = resolveInstallContract({
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome: codexRoot,
    agentsHome: agentsRoot,
    home: os.homedir()
  });
  const codexTargets = contract.preflightTargets.filter((target) =>
    path.relative(codexRoot, path.resolve(target)).split(path.sep)[0] !== ".."
  );
  const agentsTargets = contract.preflightTargets.filter((target) =>
    path.relative(agentsRoot, path.resolve(target)).split(path.sep)[0] !== ".."
  );
  for (const target of contract.preflightTargets) {
    assertManagedTargetPath(target, [codexRoot, agentsRoot]);
  }
  return { codexTargets: codexTargets.length, agentsTargets: agentsTargets.length };
}

function main() {
  const args = process.argv.slice(2);
  const codexIndex = args.indexOf("--codex-home");
  const agentsIndex = args.indexOf("--agents-home");
  const codexHome = codexIndex >= 0 ? args[codexIndex + 1] : null;
  const agentsHome = agentsIndex >= 0 ? args[agentsIndex + 1] : null;
  const known = new Set(["--codex-home", "--agents-home"]);
  const unknown = args.filter((arg, index) => !known.has(arg) && !known.has(args[index - 1]));
  if (!codexHome || !agentsHome || unknown.length > 0) {
    console.error("Usage: node scripts/assert-install-surface.mjs --codex-home <path> --agents-home <path>");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(assertInstallSurface(codexHome, agentsHome)));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
