#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { normalizeTargets, resolveInstallContract } from "./lib/install-contract.mjs";
import { resolveClaudeHomes } from "./lib/targets/claude.mjs";

function insideRoot(target, root) {
  return path.relative(root, path.resolve(target)).split(path.sep)[0] !== "..";
}

export function assertInstallSurface(codexHome, agentsHome, { claudeHome = null, claudeJson = null, targets = "codex" } = {}) {
  const codexRoot = path.resolve(codexHome);
  const agentsRoot = path.resolve(agentsHome);
  const selectedTargets = normalizeTargets(targets);
  const home = os.homedir();
  const claudeHomes = resolveClaudeHomes({ env: process.env, home, claudeHome, claudeJson });
  const claudeRoot = claudeHomes.claudeHome;
  const claudeJsonPath = claudeHomes.claudeJson;
  const claudeSelected = selectedTargets.has("claude");
  const contract = resolveInstallContract({
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome: codexRoot,
    agentsHome: agentsRoot,
    claudeHome: claudeRoot,
    claudeJson: claudeJsonPath,
    targets: selectedTargets,
    home
  });
  const roots = [codexRoot, agentsRoot, ...(claudeSelected ? [claudeRoot] : [])];
  for (const target of contract.preflightTargets) {
    const isClaudeJson = claudeSelected && path.resolve(target) === claudeJsonPath;
    assertManagedTargetPath(target, isClaudeJson ? [path.dirname(claudeJsonPath)] : roots);
  }
  return {
    targets: contract.targets,
    codexTargets: contract.preflightTargets.filter((target) => insideRoot(target, codexRoot)).length,
    agentsTargets: contract.preflightTargets.filter((target) => insideRoot(target, agentsRoot)).length,
    claudeTargets: claudeSelected
      ? contract.preflightTargets.filter((target) => insideRoot(target, claudeRoot) || path.resolve(target) === claudeJsonPath).length
      : 0
  };
}

function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const codexHome = valueOf("--codex-home");
  const agentsHome = valueOf("--agents-home");
  const known = new Set(["--codex-home", "--agents-home", "--claude-home", "--claude-json", "--target"]);
  const unknown = args.filter((arg, index) => !known.has(arg) && !known.has(args[index - 1]));
  if (!codexHome || !agentsHome || unknown.length > 0) {
    console.error("Usage: node scripts/assert-install-surface.mjs --codex-home <path> --agents-home <path> [--claude-home <path>] [--claude-json <path>] [--target codex|claude|both]");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(assertInstallSurface(codexHome, agentsHome, {
      claudeHome: valueOf("--claude-home"),
      claudeJson: valueOf("--claude-json"),
      targets: valueOf("--target") || "codex"
    })));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
