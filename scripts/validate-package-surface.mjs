#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scaledTimeout } from "./lib/test-timeouts.mjs";

const root = path.resolve(process.cwd());
const failures = [];
const npmCacheDir = path.join(root, "tmp", "npm-cache");

function fail(message) {
  failures.push(message);
}

function posix(filePath) {
  return filePath.split(path.sep).join("/");
}

function runNpmPackDryRun() {
  fs.mkdirSync(npmCacheDir, { recursive: true });
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "pack", "--dry-run", "--json", "--ignore-scripts"]
    : ["pack", "--dry-run", "--json", "--ignore-scripts"];
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NPM_CONFIG_CACHE: npmCacheDir,
      TERM: "dumb",
      npm_config_cache: npmCacheDir,
      npm_config_loglevel: "error",
      npm_config_update_notifier: "false"
    },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: scaledTimeout(120000),
    windowsHide: true
  });
}

function gitTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: scaledTimeout(30000),
    windowsHide: true
  });
  if (result.error) {
    fail(`git ls-files failed: ${result.error.message}`);
    return new Set();
  }
  if (result.status !== 0) {
    fail(`git ls-files failed: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
    return new Set();
  }
  return new Set(result.stdout.split("\0").filter(Boolean).map(posix));
}

function requireTrackedIgnoreControls(trackedFiles) {
  const nestedCodexStateRules = ["sessions", "memories", "cache", "logs"].map(
    (stateDir) => `**/.codex/${stateDir}/**`
  );
  const requiredIgnoreControls = [
    {
      file: "templates/.npmignore",
      requiredLines: [
        "**/tmp/**",
        "**/temp/**",
        ...nestedCodexStateRules,
        "**/.codex/auth*"
      ]
    }
  ];

  for (const control of requiredIgnoreControls) {
    const absolute = path.join(root, control.file);
    if (!fs.existsSync(absolute)) {
      fail(`Required package ignore-control file is missing: ${control.file}`);
      continue;
    }
    if (!trackedFiles.has(control.file)) {
      fail(`Required package ignore-control file must be tracked before release: ${control.file}`);
    }
    const text = fs.readFileSync(absolute, "utf8");
    for (const line of control.requiredLines) {
      if (!text.split(/\r?\n/).includes(line)) {
        fail(`${control.file} must include package ignore rule: ${line}`);
      }
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.private !== true) {
  fail("package.json must keep private=true; this repo is source-first and must not be accidentally published.");
}
if (packageJson.publishConfig) {
  fail("package.json must not define publishConfig for this source-first starter.");
}
const requiredFileEntries = [
  ".agents/",
  ".github/",
  ".gitleaks.toml",
  "AGENTS.md",
  "CHANGELOG.md",
  "CHANGELOG-0.5.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "llms.txt",
  "PRIVACY.md",
  "README.md",
  "README.tr.md",
  "SECURITY.md",
  "SUPPORT.md",
  "assets/",
  "catalog/",
  "docs/",
  "kb/",
  "manifests/",
  "plugins/",
  "schemas/",
  "scripts/",
  "templates/"
];
if (!Array.isArray(packageJson.files) || packageJson.files.length === 0) {
  fail("package.json must define an explicit files allowlist for deterministic source package dry-runs.");
} else {
  const fileEntries = new Set(packageJson.files);
  for (const required of requiredFileEntries) {
    if (!fileEntries.has(required)) fail(`package.json files allowlist missing required entry: ${required}`);
  }
  for (const entry of packageJson.files) {
    if (entry.startsWith("!")) continue;
    const normalized = posix(entry).replace(/\/+$/, "");
    const absolute = path.join(root, normalized);
    if (!fs.existsSync(absolute)) fail(`package.json files allowlist references missing path: ${entry}`);
    if (/^(?:tmp|temp|node_modules|dist|build|coverage|\.next|out)(?:\/|$)/.test(normalized)) {
      fail(`package.json files allowlist must not include generated/scratch path: ${entry}`);
    }
    if (/^(?:\.serena|\.codex\/sessions|\.codex\/memories|\.codex\/cache|\.codex\/logs)(?:\/|$)/.test(normalized)) {
      fail(`package.json files allowlist must not include local agent state: ${entry}`);
    }
    if (/\.(?:zip|tar\.gz|tgz|msi|exe|dmg)$/i.test(normalized)) {
      fail(`package.json files allowlist must not include release/archive artifact: ${entry}`);
    }
  }
}
if (packageJson.scripts) {
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    if (/\bnpm\s+publish\b|\bgh\s+release\s+create\b|\bgit\s+push\b/i.test(command)) {
      fail(`package.json script must not publish, release, or push: ${name}`);
    }
  }
}

const result = runNpmPackDryRun();
if (result.error) {
  fail(`npm pack dry-run failed: ${result.error.message}`);
} else if (result.status !== 0) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(`npm pack dry-run failed: ${output || `exit ${result.status}`}`);
} else {
  let packs = [];
  try {
    packs = JSON.parse(result.stdout);
  } catch (error) {
    fail(`npm pack dry-run did not return JSON: ${error.message}`);
  }

  const files = packs.flatMap((pack) => pack.files || []).map((file) => posix(file.path || ""));
  const fileSet = new Set(files);
  const trackedFiles = gitTrackedFiles();
  requireTrackedIgnoreControls(trackedFiles);

  for (const required of [
    "README.md",
    "llms.txt",
    "README.tr.md",
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
    ".agents/plugins/marketplace.json",
    ".github/workflows/validate.yml",
    "catalog/agent-research-corpus.json",
    "catalog/agents.json",
    "catalog/routing-profiles.json",
    "scripts/chef-cli.mjs",
    "scripts/codex-doctor.mjs",
    "scripts/codex-routing-board.mjs",
    "scripts/codex-status.mjs",
    "scripts/repair-install.mjs",
    "scripts/validate-diagram-triplet.mjs",
    "scripts/validate-content-safety.mjs",
    "scripts/validate-agent-config.mjs",
    "scripts/validate-agent-research-corpus.mjs",
    "scripts/validate-codex-doctor.mjs",
    "scripts/validate-codex-status.mjs",
    "scripts/validate-installer-smoke.mjs",
    "scripts/validate-routing-profiles.mjs",
    "scripts/validate-repair-install.mjs",
    "scripts/validate-chef-cli.mjs",
    "scripts/analyze-token-surfaces.mjs",
    "scripts/validate-token-surfaces.mjs",
    "scripts/validate-package-surface.mjs",
    "scripts/validate-kb-locales.mjs",
    "scripts/validate-readme-locales.mjs",
    "scripts/validate-workflow-security.mjs",
    "scripts/codex-process-hygiene.mjs",
    "scripts/tests/process-hygiene.test.mjs",
    "manifests/install-plan.json",
    "catalog/mcp-servers.json",
    "templates/codex/serena-pool.mjs",
    "plugins/codex-chef-workflows/hooks/process-hygiene.json",
    "plugins/codex-chef-workflows/scripts/codex-process-hygiene.mjs",
    "templates/codex/profiles/ci.config.toml",
    "templates/codex/profiles/development.config.toml",
    "templates/codex/profiles/full.config.toml",
    "templates/codex/profiles/multi-session.config.toml",
    "templates/codex/profiles/offline.config.toml",
    "scripts/tests/serena-pool.test.mjs",
    "scripts/validate-codex-config-compat.mjs",
    "templates/codex/profiles/review.config.toml",
    "templates/codex/profiles/token-safe.config.toml"
  ]) {
    if (!fileSet.has(required)) fail(`npm pack dry-run surface missing required source file: ${required}`);
  }

  const forbiddenPathPatterns = [
    /(?:^|\/)(?:tmp|temp|node_modules|dist|build|coverage|\.next|out)(?:\/|$)/,
    /(?:^|\/)(?:\.serena|\.codebase-memory|\.codex\/sessions|\.codex\/memories|\.codex\/cache|\.codex\/logs)(?:\/|$)/,
    /\.(?:zip|tar\.gz|tgz|msi|exe|dmg)$/i,
    /(?:^|\/)(?:auth|credentials|cookies)\.(?:json|toml|txt)$/i,
    /(?:^|\/)\.env(?:\.|$)/i
  ];

  for (const file of files) {
    if (!trackedFiles.has(file)) {
      fail(`npm pack dry-run includes untracked or ignored file: ${file}`);
    }
    for (const pattern of forbiddenPathPatterns) {
      if (pattern.test(file)) fail(`npm pack dry-run includes forbidden source surface path: ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Package surface validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Package surface validation passed.");
