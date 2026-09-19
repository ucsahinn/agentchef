#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findProblemRules } from "./lib/approval-rules.mjs";

const root = path.resolve(process.cwd());
const failures = [];
const warnings = [];

const rulesPath = path.join(root, "templates", "codex", "rules", "default.rules");
const rulesText = fs.readFileSync(rulesPath, "utf8");

// The exact MCP pin lives in the catalog; reading it here keeps this matrix from
// going stale on every version bump.
function context7Package() {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "mcp-servers.json"), "utf8"));
  const server = catalog.servers.find((entry) => entry.name === "context7");
  if (!server?.package) throw new Error("catalog/mcp-servers.json has no context7 package pin");
  return server.package;
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function run(command, args) {
  const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const commandArgs = process.platform === "win32" && command.endsWith(".cmd")
    ? ["/d", "/s", "/c", command, ...args]
    : args;
  return spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    windowsHide: true
  });
}

function codexCommand() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function envPath() {
  const key = Object.keys(process.env).find((name) => name.toLowerCase() === "path");
  return key ? process.env[key] || "" : "";
}

function candidateCommandNames(command) {
  if (process.platform !== "win32" || path.extname(command)) return [command];
  const pathExt = process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD";
  return pathExt
    .split(";")
    .filter(Boolean)
    .map((extension) => `${command}${extension.toLowerCase()}`);
}

function commandExistsOnPath(command) {
  if (/[\\/]/.test(command)) return fs.existsSync(command);
  const pathEntries = envPath().split(path.delimiter).filter(Boolean);
  const candidates = candidateCommandNames(command);
  return pathEntries.some((entry) => {
    for (const candidate of candidates) {
      if (fs.existsSync(path.join(entry, candidate))) return true;
    }
    return false;
  });
}

function inspectTemplateRules() {
  for (const issue of findProblemRules(rulesText)) {
    fail(`templates/codex/rules/default.rules:${issue.lineNumber} ${issue.reason}: ${issue.line}`);
  }
}

function assertContains(label, needle) {
  if (!rulesText.includes(needle)) fail(`default.rules missing ${label}: ${needle}`);
}

function assertExecDecision(label, commandTokens, expectedDecision) {
  const result = run(codexCommand(), ["execpolicy", "check", "--rules", rulesPath, ...commandTokens]);
  if (result.error) {
    warn(`Skipped execpolicy matrix because Codex CLI could not run: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    fail(`${label} execpolicy check exited ${result.status}: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`);
    return true;
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    fail(`${label} execpolicy check did not emit JSON: ${error.message}`);
    return true;
  }

  const actual = parsed.decision || "no-match";
  const acceptedDecisions = Array.isArray(expectedDecision) ? expectedDecision : [expectedDecision];
  if (!acceptedDecisions.includes(actual)) {
    fail(`${label} expected ${acceptedDecisions.join(" or ")}, got ${actual}: ${commandTokens.join(" ")}`);
  } else if (actual === "no-match" && acceptedDecisions.includes("allow")) {
    warn(`${label} returned no-match on this Codex CLI; the direct read-only command remains explicitly allowed.`);
  }
  return true;
}

inspectTemplateRules();

assertContains(
  "npm.cmd run prompt",
  'prefix_rule(pattern = ["npm.cmd", "run"], decision = "prompt"'
);
assertContains(
  "npm run prompt",
  'prefix_rule(pattern = ["npm", "run"], decision = "prompt"'
);
assertContains(
  "npm.cmd test prompt",
  'prefix_rule(pattern = ["npm.cmd", "test"], decision = "prompt"'
);
assertContains(
  "npm.cmd audit prompt",
  'prefix_rule(pattern = ["npm.cmd", "audit"], decision = "prompt"'
);

for (const script of [
  "clean",
  "reset",
  "delete",
  "remove",
  "prune",
  "wipe",
  "destroy",
  "drop",
  "truncate",
  "deploy",
  "publish",
  "release",
  "ship",
  "migrate",
  "seed",
  "db:drop",
  "db:migrate"
]) {
  assertContains(`npm.cmd run ${script} prompt`, `prefix_rule(pattern = ["npm.cmd", "run", "${script}"], decision = "prompt"`);
  assertContains(`npm run ${script} prompt`, `prefix_rule(pattern = ["npm", "run", "${script}"], decision = "prompt"`);
}

const matrix = [
  ["direct read-only PowerShell command", ["Get-Content", "-LiteralPath","package.json"], ["allow", "no-match"]],
  ["read-only PowerShell wrapper", ["powershell.exe", "-Command", "Get-Content", "-LiteralPath", "package.json"], ["allow", "no-match"]],
  ["read-only PowerShell wrapper single-token command", ["powershell.exe", "-Command", "Get-Content -LiteralPath package.json"], ["allow", "no-match"]],
  ["git rev-parse", ["git", "rev-parse", "HEAD"], "allow"],
  ["git cat-file", ["git", "cat-file", "-t", "HEAD"], "allow"],
  ["git branch show-current", ["git", "branch", "--show-current"], "allow"],
  ["git branch list", ["git", "branch", "--list"], "allow"],
  ["git remote get-url", ["git", "remote", "get-url", "origin"], "allow"],
  ["git tag list", ["git", "tag", "--list"], "allow"],
  ["git branch delete", ["git", "branch", "-D", "obsolete"], "prompt"],
  ["git remote add", ["git", "remote", "add", "backup", "https://example.invalid/repo.git"], "prompt"],
  ["git tag delete", ["git", "tag", "-d", "v0.0.0"], "prompt"],
  ["git fetch", ["git", "fetch"], "prompt"],
  ["npm pack dry-run", ["npm.cmd", "pack", "--dry-run", "--json", "--ignore-scripts"], "allow"],
  ["npm audit fix", ["npm.cmd", "audit", "fix"], "prompt"],
  ["npm build", ["npm.cmd", "run", "build"], "prompt"],
  ["npm check", ["npm.cmd", "run", "check"], "prompt"],
  ["npm package-surface", ["npm.cmd", "run", "validate:package-surface"], "prompt"],
  ["npm release notes check", ["npm.cmd", "run", "release:notes:check"], "prompt"],
  ["npm online skill verify", ["npm.cmd", "run", "verify:skills:online"], "prompt"],
  ["npm runtime verify", ["npm.cmd", "run", "verify:install:runtime"], "prompt"],
  ["npm security audit script", ["npm.cmd", "run", "audit:security"], "prompt"],
  ["npm repair preview", ["npm.cmd", "run", "repair:install", "--", "--preview", "--json", "--redact-paths"], "prompt"],
  ["npm clean", ["npm.cmd", "run", "clean"], "prompt"],
  ["npm deploy", ["npm.cmd", "run", "deploy"], "prompt"],
  ["npm repair apply", ["npm.cmd", "run", "repair:install", "--", "--apply"], "prompt"],
  ["npm repair prune", ["npm.cmd", "run", "repair:install", "--", "--prune-managed-plugin-extras"], "prompt"],
  ["npm arbitrary script", ["npm.cmd", "run", "postinstall"], "prompt"],
  ["npm Unix arbitrary script", ["npm", "run", "postinstall"], "prompt"],
  ["npm test lifecycle", ["npm.cmd", "test"], "prompt"],
  ["codex mcp list", ["codex.cmd", "mcp", "list"], "allow"],
  ["codex doctor json", ["codex.cmd", "doctor", "--json"], "allow"],
  ["codex execpolicy check", ["codex.cmd", "execpolicy", "check", "--rules", "templates/codex/rules/default.rules", "git", "status"], "allow"],
  ["exact Context7 MCP startup requires approval", ["npx.cmd", "-y", context7Package()], "prompt"],
  ["ad-hoc npx package", ["npx.cmd", "-y", "left-pad@1.3.0"], "no-match"],
  ["read-only GitHub PR view", ["gh", "pr", "view", "1"], "allow"],
  ["read-only GitHub run watch", ["gh", "run", "watch", "1"], "allow"],
  ["GitHub release create", ["gh", "release", "create", "v0.0.0"], "prompt"],
  ["GitHub auth status", ["gh", "auth", "status"], "prompt"],
  ["GitHub auth show token", ["gh", "auth", "status", "--show-token"], "prompt"],
  ["GitHub auth show token json", ["gh", "auth", "status", "--json", "hosts", "--show-token"], "prompt"],
  ["GitHub auth token", ["gh", "auth", "token"], "prompt"],
  ["GitHub auth refresh", ["gh", "auth", "refresh"], "prompt"],
  ["GitHub auth setup git", ["gh", "auth", "setup-git"], "prompt"],
  ["GitHub auth switch", ["gh", "auth", "switch"], "prompt"],
  ["read-only git config", ["git", "config", "--get", "user.name"], "allow"],
  ["read-only git config core excludes", ["git", "config", "--get", "core.excludesfile"], "allow"],
  ["read-only git safe directory", ["git", "config", "--get-all", "safe.directory"], "allow"],
  ["git config list", ["git", "config", "--list"], "no-match"],
  ["git config show origin list", ["git", "config", "--show-origin", "--list"], "no-match"],
  ["git config credential dump", ["git", "config", "--get-all", "http.https://github.com/.extraheader"], "no-match"],
  ["mutating git config", ["git", "config", "--unset", "user.name"], "prompt"],
  ["direct deletion", ["Remove-Item", "foo", "-Recurse", "-Force"], "prompt"],
  ["PowerShell deletion wrapper", ["powershell.exe", "-Command", "Remove-Item", "foo", "-Recurse", "-Force"], "prompt"]
];

let matrixRan = false;
if (!commandExistsOnPath(codexCommand())) {
  warn(`Skipped execpolicy matrix because Codex CLI could not run: ${codexCommand()} was not found on PATH.`);
} else {
  for (const [label, commandTokens, expected] of matrix) {
    matrixRan = assertExecDecision(label, commandTokens, expected) || matrixRan;
  }
}

if (!matrixRan && (process.env.AGENTCHEF_REQUIRE_CODEX === "1" || process.env.CODEX_CHEF_REQUIRE_CODEX === "1")) {
  fail("Codex CLI is required by AGENTCHEF_REQUIRE_CODEX=1 but execpolicy matrix could not run.");
}

if (failures.length > 0) {
  console.error("Approval harmony validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  for (const warning of warnings) console.error(`Warning: ${warning}`);
  process.exit(1);
}

for (const warning of warnings) console.error(`Warning: ${warning}`);
console.log("Approval harmony validation passed.");
