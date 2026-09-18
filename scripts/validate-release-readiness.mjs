#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];
const warnings = [];
const args = process.argv.slice(2);
const allowDirty = args.includes("--allow-dirty");
const unknownArgs = args.filter((arg) => arg !== "--allow-dirty");
if (unknownArgs.length > 0) {
  console.error(`Unknown release readiness argument: ${unknownArgs.join(", ")}`);
  process.exit(2);
}

const requiredFiles = [
  "README.md",
  "README.tr.md",
  "docs/release-notes.md",
  "docs/release-notes.tr.md",
  "docs/github-settings.md",
  "docs/github-settings.tr.md",
  "docs/publish.md",
  "docs/publish.tr.md",
  "docs/advisory-sources.md",
  "docs/advisory-sources.tr.md",
  "kb/README.md",
  "kb/README.tr.md",
  "kb/install-preview.md",
  "kb/install-preview.tr.md",
  "kb/runtime-verification.md",
  "kb/runtime-verification.tr.md",
  "kb/agent-mcp-routing.md",
  "kb/agent-mcp-routing.tr.md",
  "kb/public-release-hygiene.md",
  "kb/public-release-hygiene.tr.md",
  "kb/powershell-policy.md",
  "kb/powershell-policy.tr.md",
  "kb/skills-cli-cache.md",
  "kb/skills-cli-cache.tr.md",
  "kb/codex-home-drift.md",
  "kb/codex-home-drift.tr.md",
  "kb/mcp-no-tools.md",
  "kb/mcp-no-tools.tr.md",
  "kb/managed-file-drift.md",
  "kb/managed-file-drift.tr.md",
  "kb/public-visual-assets.md",
  "kb/public-visual-assets.tr.md",
  "scripts/chef-cli.mjs",
  "scripts/validate-chef-cli.mjs",
  "scripts/validate-readme-locales.mjs",
  "scripts/validate-kb-locales.mjs",
  "scripts/validate-workflow-security.mjs",
  "scripts/validate-agent-config.mjs",
  "scripts/validate-agent-research-corpus.mjs",
  "scripts/validate-approval-harmony.mjs",
  "scripts/validate-package-surface.mjs",
  "scripts/extract-release-notes.mjs",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/question.yml",
  ".gitleaks.toml",
  ".github/workflows/validate.yml"
];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

function isLocalAgentStatePath(file) {
  const normalized = file.replace(/\\/g, "/");
  const folded = normalized.toLowerCase();
  if (folded === ".serena" || folded.startsWith(".serena/")) return true;
  if (folded === ".codex" || folded.startsWith(".codex/")) return true;
  if (folded === ".agentspace" || folded.startsWith(".agentspace/")) return true;
  if (folded === ".agents" || folded.startsWith(".agents/")) {
    return normalized !== ".agents/plugins/marketplace.json";
  }
  return false;
}

function parsePorcelainZ(value) {
  const records = String(value || "").split("\0").filter(Boolean);
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4) {
      fail("Could not parse machine-readable git status output.");
      continue;
    }
    const xy = record.slice(0, 2);
    entries.push({ xy, file: record.slice(3).replace(/\\/g, "/") });
    if (/[RC]/.test(xy) && records[index + 1]) {
      entries.push({ xy: "  ", file: records[index + 1].replace(/\\/g, "/"), renameSource: true });
      index += 1;
    }
  }
  return entries;
}

for (const file of requiredFiles) {
  if (!exists(file)) fail(`Missing release-readiness file: ${file}`);
}

const packageJson = JSON.parse(read("package.json"));
const version = packageJson.version;
const expectedTag = `v${version}`;
const scripts = packageJson.scripts || {};
if (!/^\d+\.\d+\.\d+$/.test(version)) fail("package.json version must be plain semver for release");
if (packageJson.private !== true) fail("package.json must keep private=true before public source release");
if (scripts["release:notes:check"] !== "node scripts/extract-release-notes.mjs --check") {
  fail("package.json must expose release:notes:check as the read-only release notes verifier.");
}

const changelog = read("CHANGELOG.md");
const releaseNotes = read("docs/release-notes.md");
const releaseNotesTr = read("docs/release-notes.tr.md");
const githubSettings = read("docs/github-settings.md");
const githubSettingsTr = read("docs/github-settings.tr.md");
const publish = read("docs/publish.md");
const publishTr = read("docs/publish.tr.md");
const workflow = read(".github/workflows/validate.yml");

if (!changelog.includes(`## ${version} - `)) fail(`CHANGELOG.md missing dated ${version} section`);
if (!releaseNotes.includes(`## ${expectedTag} - `)) fail(`docs/release-notes.md missing ${expectedTag} section`);
if (!releaseNotesTr.includes(`## ${expectedTag} - `)) fail(`docs/release-notes.tr.md missing ${expectedTag} section`);

for (const [label, text] of [
  ["docs/github-settings.md", githubSettings],
  ["docs/github-settings.tr.md", githubSettingsTr],
  ["docs/publish.md", publish],
  ["docs/publish.tr.md", publishTr]
]) {
  if (!text.includes(expectedTag)) fail(`${label} must mention ${expectedTag}`);
  if (!text.includes("npm run check")) fail(`${label} must include npm run check release gate`);
  if (!text.includes("gitleaks detect --redact --no-banner --no-git --verbose")) {
    fail(`${label} must include current-tree Gitleaks release gate`);
  }
}

for (const required of [
  "permissions:",
  "contents: read",
  "persist-credentials: false",
  "node --check scripts/validate-doc-locales.mjs",
  "node --check scripts/validate-readme-locales.mjs",
  "node --check scripts/validate-kb-locales.mjs",
  "node --check scripts/validate-workflow-security.mjs",
  "node --check scripts/validate-agent-config.mjs",
  "node --check scripts/validate-agent-research-corpus.mjs",
  "node --check scripts/validate-approval-harmony.mjs",
  "node --check scripts/validate-package-surface.mjs",
  "npm run check",
  "bash scripts/install.sh --all --dry-run",
  "./scripts/install.ps1 -All -WhatIf"
]) {
  if (!workflow.includes(required)) fail(`validate workflow missing release gate signal: ${required}`);
}

if (!publish.includes("npm run verify:skills:online")) fail("docs/publish.md must include online skill verification before release");
if (!publishTr.includes("npm run verify:skills:online")) fail("docs/publish.tr.md must include online skill verification before release");
if (!publish.includes("node scripts/plan-install.mjs --all --json --redact-paths")) fail("docs/publish.md must include redacted install-state preview command");
if (!publishTr.includes("node scripts/plan-install.mjs --all --json --redact-paths")) fail("docs/publish.tr.md must include redacted install-state preview command");
if (!publish.includes("npm run release:notes")) fail("docs/publish.md must generate current-section release notes before release");
if (!publishTr.includes("npm run release:notes")) fail("docs/publish.tr.md must generate current-section release notes before release");
if (!publish.includes("npm run release:notes:check")) fail("docs/publish.md must include read-only release notes check before artifact generation");
if (!publishTr.includes("npm run release:notes:check")) fail("docs/publish.tr.md must include read-only release notes check before artifact generation");

for (const [label, text] of [
  ["docs/publish.md", publish],
  ["docs/publish.tr.md", publishTr],
  ["docs/github-settings.md", githubSettings],
  ["docs/github-settings.tr.md", githubSettingsTr]
]) {
  if (/--notes-file\s+docs\/release-notes(?:\.tr)?\.md/.test(text)) {
    fail(`${label} must not publish the full historical release notes file; use tmp/release-notes-current.md`);
  }
}

const status = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
if (status.status !== 0) {
  fail(`Could not inspect git status: ${status.error?.message || status.stderr || status.stdout || "git status failed"}`);
} else {
  const statusEntries = parsePorcelainZ(status.stdout);
  if (!allowDirty && statusEntries.length > 0) {
    fail("Release candidate must have a clean index and worktree; commit or intentionally discard reviewed changes before release validation.");
  }
  const mixedPaths = [];
  for (const entry of statusEntries) {
    if (!entry.renameSource && entry.xy[0] !== " " && entry.xy[0] !== "?" && entry.xy[1] !== " " && entry.xy[1] !== "?") {
      mixedPaths.push(entry.file);
    }
    const { file } = entry;
    if (/^(tmp|temp|node_modules|dist|build|coverage|\.next|out)\//.test(file)) {
      fail(`Release candidate includes scratch/build/dependency path in git status: ${file}`);
    }
    if (isLocalAgentStatePath(file)) {
      fail(`Release candidate includes local agent state in git status: ${file}`);
    }
  }
  if (mixedPaths.length > 0) {
    const message = `Paths contain both staged and unstaged changes: ${mixedPaths.join(", ")}`;
    if (allowDirty) warn(message);
    else fail(message);
  }
}

const tracked = run("git", ["ls-files", "-z"]);
if (tracked.status !== 0) {
  fail(`Could not inspect tracked files: ${tracked.error?.message || tracked.stderr || tracked.stdout || "git ls-files failed"}`);
} else {
  for (const file of tracked.stdout.split("\0").filter(Boolean)) {
    if (/^(tmp|temp|node_modules|dist|build|coverage|\.next|out)\//.test(file)) {
      fail(`Tracked release file must not live under ignored output path: ${file}`);
    }
    if (/\.(?:zip|tar\.gz|tgz|msi|exe|dmg)$/i.test(file)) {
      fail(`Release artifact must not be committed to source: ${file}`);
    }
    if (isLocalAgentStatePath(file)) {
      fail(`Tracked release file must not contain local agent state: ${file}`);
    }
  }
}

const currentTag = run("git", ["tag", "--list", expectedTag]);
if (currentTag.status !== 0) {
  fail(`Could not inspect existing tag ${expectedTag}: ${currentTag.error?.message || currentTag.stderr || currentTag.stdout || "git tag failed"}`);
} else if (currentTag.stdout.trim() === expectedTag) {
  const message = `Tag ${expectedTag} already exists locally; bump the release version before preparing another candidate`;
  if (allowDirty) warn(message);
  else fail(message);
}

if (failures.length > 0) {
  console.error("Release readiness validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const message of warnings) console.warn(`Warning: ${message}`);
console.log(`Release readiness validation passed for ${expectedTag}.`);
