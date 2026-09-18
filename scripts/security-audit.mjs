#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];
const warnings = [];

const ignoredDirs = new Set([
  ".git", ".serena", ".agentspace", "node_modules", "dist", "build", "coverage", ".next", "tmp", "temp",
  "agent-results"
]);
const ignoredRelativeFiles = new Set(["docs/.agent-notifications"]);
const ignoredSourceDirs = new Set(["tmp", "temp", "node_modules", "dist", "build", "coverage", ".next", "out"]);
const requiredPublicFiles = [
  "README.md",
  "README.tr.md",
  "SECURITY.md",
  "PRIVACY.md",
  "SUPPORT.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/how-to.md",
  "docs/how-to.tr.md",
  "docs/troubleshooting.md",
  "docs/troubleshooting.tr.md",
  "docs/github-settings.md",
  "docs/github-settings.tr.md",
  "docs/upgrade.md",
  "docs/upgrade.tr.md",
  "docs/release-notes.md",
  "docs/release-notes.tr.md",
  "docs/expected-output.md",
  "docs/expected-output.tr.md",
  "docs/harness-compatibility.md",
  "docs/harness-compatibility.tr.md",
  "docs/advisory-sources.md",
  "docs/advisory-sources.tr.md",
  "docs/agents.md",
  "docs/agents.tr.md",
  "docs/skills.md",
  "docs/skills.tr.md",
  "docs/mcp-catalog.md",
  "docs/mcp-catalog.tr.md",
  "assets/banner.svg",
  "assets/workflow-overview.svg",
  "assets/workflow-overview.tr.svg",
  "catalog/agent-research-corpus.json",
  "catalog/agents.json",
  "catalog/skills.json",
  "catalog/skills-lock.json",
  "plugins/codex-chef-workflows/.codex-plugin/plugin.json",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/SKILL.md",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/references/repo-maintenance.md",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/context-budget-planner/SKILL.md",
  "plugins/codex-chef-workflows/skills/context-budget-planner/references/context-strategy.md",
  "plugins/codex-chef-workflows/skills/context-budget-planner/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/SKILL.md",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/references/diagram-contract.md",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/agents/openai.yaml",
  "manifests/install-plan.json",
  "schemas/install-plan.schema.json",
  "schemas/install-state-preview.schema.json",
  "scripts/plan-install.mjs",
  "scripts/manage-direct-skill-target.mjs",
  "scripts/chef-cli.mjs",
  "scripts/validate-doc-locales.mjs",
  "scripts/validate-readme-locales.mjs",
  "scripts/validate-workflow-security.mjs",
  "scripts/validate-install-plan.mjs",
  "scripts/validate-install-state-preview.mjs",
  "scripts/validate-installer-alignment.mjs",
  "scripts/validate-agent-config.mjs",
  "scripts/validate-agent-research-corpus.mjs",
  "scripts/validate-mcp-config.mjs",
  "scripts/validate-approval-harmony.mjs",
  "scripts/validate-plugin-skills.mjs",
  "scripts/validate-chef-cli.mjs",
  "scripts/validate-package-surface.mjs",
  "scripts/validate-release-readiness.mjs",
  "scripts/scan-supply-chain-iocs.mjs",
  "scripts/lib/approval-rules.mjs",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/docs_improvement.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/question.yml",
  ".github/pull_request_template.md",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/workflows/validate.yml",
  ".gitleaks.toml"
];

const externalMcpServers = ["github", "figma", "linear", "notion", "sentry", "vercel", "supabase", "filesystem"];

function posix(filePath) {
  return filePath.split(path.sep).join("/");
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function isPinnedPackageSpec(spec) {
  return /^@[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9][A-Za-z0-9_.+~-]*$/.test(spec)
    || /^[A-Za-z0-9_.-]+@[0-9][A-Za-z0-9_.+~-]*$/.test(spec);
}

function isHookSurfacePath(rel) {
  if (rel === "templates/git/pre-commit") return false;
  if (rel === "plugins/codex-chef-workflows/hooks/process-hygiene.json") return false;
  return /(?:^|\/)hooks(?:\/|$)/i.test(rel)
    || /(?:^|\/)hooks\.json$/i.test(rel)
    || /^scripts\/hooks\//i.test(rel)
    || /^\.opencode\/plugins\/.*hook/i.test(rel);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (ignoredRelativeFiles.has(posix(path.relative(root, full)))) continue;
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const file of requiredPublicFiles) {
  if (!exists(file)) failures.push(`Missing public-readiness file: ${file}`);
}

if (exists(".github/ISSUE_TEMPLATE/config.yml")) {
  const issueConfig = read(".github/ISSUE_TEMPLATE/config.yml");
  if (!/blank_issues_enabled:\s*false/.test(issueConfig)) {
    failures.push("Blank GitHub issues must stay disabled to guide users through public-safe templates.");
  }
}

if (exists(".github/CODEOWNERS") && !read(".github/CODEOWNERS").includes("@ucsahinn")) {
  failures.push(".github/CODEOWNERS must keep @ucsahinn as the default public owner.");
}

const docsDir = path.join(root, "docs");
if (fs.existsSync(docsDir)) {
  const docFiles = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md"));
  const docSet = new Set(docFiles);
  const docLocaleSuffixes = ["tr"];
  const localePattern = /\.tr\.md$/;
  for (const file of docFiles) {
    if (localePattern.test(file)) {
      const english = file.replace(localePattern, ".md");
      if (!docSet.has(english)) failures.push(`Missing English doc pair for docs/${file}: docs/${english}`);
    } else {
      const slug = file.replace(/\.md$/, "");
      for (const locale of docLocaleSuffixes) {
        const localized = `${slug}.${locale}.md`;
        if (!docSet.has(localized)) failures.push(`Missing localized doc pair for docs/${file}: docs/${localized}`);
      }
    }
  }
} else {
  failures.push("Missing docs directory.");
}

const files = walk(root);

const secretPatterns = [
  { name: "OpenAI/API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key marker", pattern: /-----BEGIN (?:(?:ENCRYPTED |RSA |EC |OPENSSH |DSA )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/ },
  { name: "Long secret assignment", pattern: /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"']{16,}["']/i }
];

const forbiddenStatePatterns = [
  { name: "non-placeholder drive user path", pattern: /[A-Za-z]:[\\/]Users[\\/](?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i },
  { name: "non-placeholder Windows user path", pattern: /C:\\Users\\(?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i },
  { name: "non-placeholder macOS user path", pattern: /\/Users\/(?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i },
  { name: "non-placeholder Linux home path", pattern: /\/home\/(?!user\b|username\b|you\b|yourname\b|yourusername\b|runner\b)[A-Za-z0-9._-]+/i },
  { name: "Codex sessions", pattern: /(?:^|[\\/])\.codex[\\/]sessions[\\/]/i },
  { name: "Codex memories", pattern: /(?:^|[\\/])\.codex[\\/]memories[\\/]/i },
  { name: "auth file", pattern: /(?:^|[\\/])(?:auth|credentials|cookies)\.(?:json|toml|txt)$/i }
];

for (const file of files) {
  const rel = posix(path.relative(root, file));
  const text = fs.readFileSync(file, "utf8");
  const reviewedProcessHygieneSurface = [
    "plugins/codex-chef-workflows/hooks/process-hygiene.json",
    "plugins/codex-chef-workflows/scripts/codex-process-hygiene.mjs"
  ].includes(rel);

  if (isHookSurfacePath(rel)) {
    failures.push(`Codex lifecycle hook runtime must not be introduced without explicit review: ${rel}`);
  }

  if (/^plugins\/.+\/\.codex-plugin\/plugin\.json$/i.test(rel)) {
    try {
      const plugin = JSON.parse(text);
      for (const forbiddenKey of ["hooks", "mcpServers", "apps"]) {
        if (Object.prototype.hasOwnProperty.call(plugin, forbiddenKey)) {
          if (
            rel === "plugins/codex-chef-workflows/.codex-plugin/plugin.json"
            && forbiddenKey === "hooks"
            && JSON.stringify(plugin.hooks) === JSON.stringify(["./hooks/process-hygiene.json"])
          ) {
            continue;
          }
          failures.push(`Plugin manifest must not declare ${forbiddenKey} by default: ${rel}`);
        }
      }
      const capabilities = plugin?.interface?.capabilities;
      if (Array.isArray(capabilities) && capabilities.some((capability) => String(capability).toLowerCase() === "write")) {
        failures.push(`Plugin manifest must not declare Write interface capability by default: ${rel}`);
      }
    } catch (error) {
      failures.push(`Plugin manifest must be parseable JSON: ${rel} (${error.message})`);
    }
  }

  if (/^(?:templates|plugins)\//.test(rel)) {
    const hookInjectionPatterns = [
      /\b(?:SessionStart|PreCompact|SessionEnd)\b/,
      /\bhookSpecificOutput\b/,
      /\badditionalContext\b/,
      /\bECC_SESSION_START_CONTEXT\b/,
      /(?:^|[\\/])instincts[\\/]/i,
      /\blearned skills?\b/i
    ];
    for (const [index, pattern] of hookInjectionPatterns.entries()) {
      if (pattern.test(text)) {
        if (reviewedProcessHygieneSurface && index === 0) continue;
        failures.push(`Automatic hook/session context injection pattern found in ${rel}: ${pattern}`);
      }
    }
  }

  if (rel === "plugins/codex-chef-workflows/hooks/process-hygiene.json") {
    try {
      const hookConfig = JSON.parse(text);
      const events = Object.keys(hookConfig.hooks || {});
      const group = hookConfig.hooks?.SessionEnd?.[0];
      const handler = group?.hooks?.[0];
      if (JSON.stringify(events) !== JSON.stringify(["SessionEnd"])) {
        failures.push("Process hygiene hook must declare only SessionEnd.");
      }
      if (!Array.isArray(hookConfig.hooks?.SessionEnd)
        || hookConfig.hooks.SessionEnd.length !== 1
        || group?.matcher !== "other") {
        failures.push("Process hygiene hook must keep one matcher=other SessionEnd group.");
      }
      if (!Array.isArray(group?.hooks)
        || group.hooks.length !== 1
        || handler?.type !== "command"
        || handler.timeout !== 3) {
        failures.push("Process hygiene hook must keep one bounded command handler with the SessionEnd maximum timeout=3.");
      }
      for (const field of ["command", "commandWindows"]) {
        const command = String(handler?.[field] || "");
        if (!/PLUGIN_ROOT/.test(command)
          || !/scripts[\\/]codex-process-hygiene\.mjs/.test(command)
          || !/--session-end/.test(command)) {
          failures.push(`Process hygiene hook ${field} must target the plugin-owned SessionEnd script.`);
        }
      }
    } catch (error) {
      failures.push(`Process hygiene hook must be parseable JSON: ${error.message}`);
    }
  }

  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(text)) failures.push(`${name} pattern found in ${rel}`);
  }

  for (const { name, pattern } of forbiddenStatePatterns) {
    const scanText = rel === "templates/.npmignore"
      ? text.replace(/^\*\*\/\.codex\/(?:sessions|memories)\/\*\*\r?\n?/gm, "")
      : text;
    if (pattern.test(rel) || pattern.test(scanText)) failures.push(`${name} pattern found in ${rel}`);
  }
}

if (exists(".agents/plugins/marketplace.json")) {
  const marketplace = JSON.parse(read(".agents/plugins/marketplace.json"));
  for (const plugin of marketplace.plugins || []) {
    if (plugin?.policy?.authentication !== "ON_INSTALL") {
      failures.push(`Marketplace plugin ${plugin.name} must use current Codex authentication policy ON_INSTALL`);
    }
  }
}

const readme = read("README.md");
if (!/unofficial community starter/i.test(readme)) {
  failures.push("README.md must clearly state this is an unofficial community starter.");
}
if (!/official Codex documentation/i.test(readme)) {
  failures.push("README.md must state that guidance is based on official Codex documentation.");
}

for (const configFile of ["templates/codex/config.windows.toml", "templates/codex/config.unix.toml"]) {
  const config = read(configFile);
  if (/approval_policy\s*=\s*"never"/.test(config)) {
    failures.push(`${configFile} must not set approval_policy = "never"`);
  }
  if (/\[profiles\.yolo\]/.test(config) || /profile\s*=\s*"yolo"/.test(config)) {
    failures.push(`${configFile} must not define or select a yolo profile`);
  }
  if (/@latest/.test(config)) {
    failures.push(`${configFile} must not use @latest package specs in active config`);
  }
  for (const match of config.matchAll(/"-y",\s*"([^"]+)"/g)) {
    const packageSpec = match[1];
    if (!isPinnedPackageSpec(packageSpec)) {
      failures.push(`${configFile} must pin npx MCP package specs to exact versions: ${packageSpec}`);
    }
  }
  if (!/approval_policy\s*=\s*"on-request"/.test(config)) {
    failures.push(`${configFile} must keep approval_policy = "on-request"`);
  }
  if (!/sandbox_mode\s*=\s*"workspace-write"/.test(config)) {
    failures.push(`${configFile} must keep sandbox_mode = "workspace-write"`);
  }
  if (!/network_access\s*=\s*false/.test(config)) {
    failures.push(`${configFile} must keep workspace network access disabled`);
  }
  if (!/\[shell_environment_policy\]/.test(config) || !/ignore_default_excludes\s*=\s*false/.test(config)) {
    failures.push(`${configFile} must define a shell_environment_policy that keeps default secret exclusions`);
  }
  const appDefaults = config.match(/\[apps\._default\]([\s\S]*?)(?=\n\[|$)/);
  if (!appDefaults) {
    failures.push(`${configFile} must define [apps._default] connector defaults`);
  } else {
    if (!/enabled\s*=\s*false/.test(appDefaults[1])) {
      failures.push(`${configFile} must keep apps._default.enabled = false`);
    }
    if (!/destructive_enabled\s*=\s*false/.test(appDefaults[1])) {
      failures.push(`${configFile} must keep apps._default.destructive_enabled = false`);
    }
    if (!/open_world_enabled\s*=\s*false/.test(appDefaults[1])) {
      failures.push(`${configFile} must keep apps._default.open_world_enabled = false`);
    }
  }
  for (const server of externalMcpServers) {
    const block = config.match(new RegExp(`\\[mcp_servers\\.${server}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    if (!block) {
      failures.push(`${configFile} missing MCP block for ${server}`);
      continue;
    }
    if (!/enabled\s*=\s*false/.test(block[1])) {
      failures.push(`${configFile} must keep ${server} disabled by default`);
    }
  }
}

const catalog = JSON.parse(read("catalog/mcp-servers.json"));
for (const server of catalog.servers || []) {
  if (["external-account", "database", "filesystem"].includes(server.category) && server.defaultEnabled !== false) {
    failures.push(`MCP catalog must keep ${server.name} disabled by default`);
  }
  if (server.auth && server.auth !== "none" && server.defaultEnabled !== false) {
    failures.push(`Authenticated MCP ${server.name} must not be enabled by default`);
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.private !== true) {
  failures.push("package.json must keep private=true to prevent accidental npm publish.");
}

for (const installer of ["scripts/install.ps1", "scripts/install.sh"]) {
  const text = read(installer);
  if (/\bnpm(?:\.cmd)?\s+(?:install|ci)\b/i.test(text)) {
    failures.push(`${installer} must not run implicit npm install or npm ci`);
  }
}

const defaultRules = read("templates/codex/rules/default.rules");
if (/prefix_rule\(pattern\s*=\s*\["npx\.cmd",\s*"-y",\s*"[^"]+@latest"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow floating @latest npx packages");
}
if (/prefix_rule\(pattern\s*=\s*\["npm\.cmd",\s*"run",\s*"clean"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow cleanup scripts");
}
if (/prefix_rule\(pattern\s*=\s*\["npm\.cmd",\s*"run"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)
  || /prefix_rule\(pattern\s*=\s*\["npm",\s*"run"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow all repository-controlled npm scripts");
}
if (/prefix_rule\(pattern\s*=\s*\["git",\s*"config"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow broad git config commands");
}
if (/prefix_rule\(pattern\s*=\s*\["gitleaks",\s*"dir"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow bare gitleaks dir without redaction");
}
if (/prefix_rule\(pattern\s*=\s*\["npx\.cmd",\s*"skills",\s*"add"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow global skill installation");
}
if (/prefix_rule\(pattern\s*=\s*\["npx\.cmd",\s*"skills"\],\s*decision\s*=\s*"allow"\)/.test(defaultRules)) {
  failures.push("templates/codex/rules/default.rules must not auto-allow broad Skills CLI commands");
}

for (const configFile of ["templates/codex/config.windows.toml", "templates/codex/config.unix.toml"]) {
  const configText = read(configFile);
  const playwrightBlock = configText.match(/\[mcp_servers\.playwright\]([\s\S]*?)(?=\r?\n\[|$)/)?.[1] || "";
  for (const flag of ["--isolated", "--block-service-workers"]) {
    if (!playwrightBlock.includes(`"${flag}"`)) {
      failures.push(`${configFile} must launch Playwright with ${flag} to avoid persistent browser state`);
    }
  }
  for (const [server, tool] of [
    ["playwright", "browser_network_requests"],
    ["chrome-devtools", "list_network_requests"]
  ]) {
    const blockPattern = new RegExp(
      `\\[mcp_servers\\.${server.replace("-", "\\-")}\\.tools\\.${tool}\\]([\\s\\S]*?)(?=\\r?\\n\\[|$)`,
      ""
    );
    const block = configText.match(blockPattern)?.[1] || "";
    if (!block) {
      failures.push(`${configFile} must define the current ${server}.${tool} approval block`);
    } else if (!/approval_mode\s*=\s*"prompt"/.test(block)) {
      failures.push(`${configFile} must keep ${server}.${tool} prompt-gated because request details can include sensitive data`);
    }
  }
}

const installPlan = JSON.parse(read("manifests/install-plan.json"));
for (const operation of installPlan.operations || []) {
  if (operation.risk === "high" && !operation.requiresFlag && operation.target !== "claude") {
    failures.push(`High-risk install plan operation must require an explicit flag: ${operation.id}`);
  }
  if (
    operation.kind === "skill-install"
    && (
      operation.collision !== "preserve-foreign-update-owned-mandatory-backup-explicit-adoption-required"
      || operation.backup !== true
      || !/foreign|unmarked/i.test(operation.conflictPolicy || "")
      || !/--adopt-existing/.test(operation.conflictPolicy || "")
    )
  ) {
    failures.push(
      `Skill install operation must preserve foreign targets, backup managed upgrades, and require explicit per-skill adoption: ${operation.id}`
    );
  }
}

if (fs.existsSync(path.join(root, ".git"))) {
  const result = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    warnings.push(`Could not inspect tracked files under ignored directories: ${result.stderr || result.stdout || "git ls-files failed"}`);
  } else {
    for (const file of result.stdout.split(/\r?\n/).filter(Boolean)) {
      const firstPart = file.split("/")[0];
      if (ignoredSourceDirs.has(firstPart)) {
        failures.push(`Tracked file must not live under ignored source/output directory: ${file}`);
      }
    }
  }
}

if (!read(".gitignore").includes("tmp/")) warnings.push(".gitignore should ignore tmp/ smoke-test output.");

if (failures.length > 0) {
  console.error("Security audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(`Security audit passed. Checked ${files.length} files, ${catalog.servers.length} MCP entries.`);
