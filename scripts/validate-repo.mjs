#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];

const requiredFiles = [
  "README.md",
  "README.de.md",
  "README.es.md",
  "README.fr.md",
  "README.pt-BR.md",
  "README.tr.md",
  "SECURITY.md",
  "llms.txt",
  "PRIVACY.md",
  "SUPPORT.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "AGENTS.md",
  "package.json",
  "docs/how-to.md",
  "docs/how-to.tr.md",
  "docs/README.md",
  "docs/README.tr.md",
  "docs/agents.md",
  "docs/agents.tr.md",
  "docs/skills.md",
  "docs/skills.tr.md",
  "docs/mcp-catalog.md",
  "docs/mcp-catalog.tr.md",
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
  "docs/ecc-compatibility.md",
  "docs/ecc-compatibility.tr.md",
  "docs/advisory-sources.md",
  "docs/advisory-sources.tr.md",
  "docs/best-practices.md",
  "docs/best-practices.tr.md",
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
  "assets/icon.svg",
  "assets/banner.svg",
  "assets/social-preview.svg",
  "assets/social-preview.png",
  "assets/workflow-overview.svg",
  "assets/workflow-overview.tr.svg",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/docs_improvement.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/question.yml",
  ".github/pull_request_template.md",
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/workflows/validate.yml",
  ".gitleaks.toml",
  "catalog/mcp-servers.json",
  "catalog/routing-profiles.json",
  "catalog/agent-research-corpus.json",
  "catalog/agents.json",
  "catalog/skills.json",
  "catalog/skills-lock.json",
  "manifests/install-plan.json",
  "schemas/install-plan.schema.json",
  "schemas/install-state-preview.schema.json",
  "schemas/external-review-manifest.schema.json",
  "schemas/external-review-report.schema.json",
  "templates/codex/config.windows.toml",
  "templates/codex/config.unix.toml",
  "templates/codex/AGENTS.md",
  "templates/codex/profiles/full.config.toml",
  "templates/codex/profiles/multi-session.config.toml",
  "templates/codex/profiles/offline.config.toml",
  "scripts/validate-codex-config-compat.mjs",
  "templates/codex/profiles/token-safe.config.toml",
  "templates/codex/rules/default.rules",
  "scripts/install.ps1",
  "scripts/install.sh",
  "scripts/plan-install.mjs",
  "scripts/chef-cli.mjs",
  "scripts/external-review-cli.mjs",
  "scripts/codex-doctor.mjs",
  "scripts/codex-routing-board.mjs",
  "scripts/codex-status.mjs",
  "scripts/repair-install.mjs",
  "scripts/validate-doc-locales.mjs",
  "scripts/validate-readme-locales.mjs",
  "scripts/validate-kb-locales.mjs",
  "scripts/validate-workflow-security.mjs",
  "scripts/validate-install-plan.mjs",
  "scripts/validate-install-state-preview.mjs",
  "scripts/validate-installer-alignment.mjs",
  "scripts/validate-installer-smoke.mjs",
  "scripts/manage-direct-skill-target.mjs",
  "scripts/validate-agent-config.mjs",
  "scripts/validate-agent-research-corpus.mjs",
  "scripts/validate-mcp-config.mjs",
  "scripts/validate-approval-harmony.mjs",
  "scripts/validate-codex-doctor.mjs",
  "scripts/validate-codex-status.mjs",
  "scripts/validate-routing-profiles.mjs",
  "scripts/validate-repair-install.mjs",
  "scripts/validate-diagram-triplet.mjs",
  "scripts/validate-fetch-skill.mjs",
  "scripts/validate-growth-skills.mjs",
  "scripts/tests/growth-skills.test.mjs",
  "scripts/tests/cli-error-contract.test.mjs",
  "scripts/tests/release-readiness.test.mjs",
  "scripts/validate-plugin-skills.mjs",
  "scripts/validate-chef-cli.mjs",
  "scripts/validate-external-review.mjs",
  "scripts/extract-release-notes.mjs",
  "scripts/analyze-token-surfaces.mjs",
  "scripts/validate-token-surfaces.mjs",
  "scripts/validate-package-surface.mjs",
  "scripts/validate-release-readiness.mjs",
  "scripts/verify-skill-sources.mjs",
  "scripts/scan-supply-chain-iocs.mjs",
  "scripts/security-audit.mjs",
  "scripts/lib/approval-rules.mjs",
  "plugins/codex-chef-workflows/.codex-plugin/plugin.json",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/SKILL.md",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/references/repo-maintenance.md",
  "plugins/codex-chef-workflows/skills/codex-chef-operator/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/SKILL.md",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/references/diagram-contract.md",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/offline-diagram-triplet/scripts/render-diagram-triplet.mjs",
  "plugins/codex-chef-workflows/skills/fetch/SKILL.md",
  "plugins/codex-chef-workflows/skills/fetch/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/fetch/assets/fetch-report.template.json",
  "plugins/codex-chef-workflows/skills/fetch/references/capture-protocol.md",
  "plugins/codex-chef-workflows/skills/fetch/references/forward-tests.md",
  "plugins/codex-chef-workflows/skills/fetch/references/implementation-protocol.md",
  "plugins/codex-chef-workflows/skills/fetch/references/safety-boundaries.md",
  "plugins/codex-chef-workflows/skills/fetch/references/sources.md",
  "plugins/codex-chef-workflows/skills/fetch/references/verification-rubric.md",
  "plugins/codex-chef-workflows/skills/fetch/scripts/validate-fetch-report.mjs",
  "plugins/codex-chef-workflows/skills/seo/SKILL.md",
  "plugins/codex-chef-workflows/skills/seo/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/seo/assets/seo-audit-report.template.json",
  "plugins/codex-chef-workflows/skills/seo/references/sources.md",
  "plugins/codex-chef-workflows/skills/seo/scripts/validate-seo-report.mjs",
  "plugins/codex-chef-workflows/skills/evidence-research/SKILL.md",
  "plugins/codex-chef-workflows/skills/evidence-research/agents/openai.yaml",
  "plugins/codex-chef-workflows/skills/evidence-research/assets/research-report.template.json",
  "plugins/codex-chef-workflows/skills/evidence-research/references/sources.md",
  "plugins/codex-chef-workflows/skills/evidence-research/scripts/validate-research-report.mjs",
  "plugins/codex-chef-workflows/skills/context-budget-planner/SKILL.md",
  "plugins/codex-chef-workflows/skills/context-budget-planner/references/context-strategy.md",
  "plugins/codex-chef-workflows/skills/context-budget-planner/agents/openai.yaml",
  ".agents/plugins/marketplace.json"
];

const deniedFileNames = new Set([
  ".env",
  ".env.local",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "auth.json"
]);

const deniedExtensions = new Set([
  ".pem",
  ".p12",
  ".pfx",
  ".kdbx",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".dump",
  ".msi",
  ".exe",
  ".dmg",
  ".zip",
  ".tgz"
]);

const ignoredDirs = new Set([".git", ".serena", "node_modules", "dist", "build", "coverage", ".next", "tmp", "temp"]);
const textExtensions = new Set([
  ".css",
  ".gitignore",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ps1",
  ".rules",
  ".sh",
  ".svg",
  ".toml",
  ".txt",
  ".yaml",
  ".yml"
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function isTextFile(filePath, rel) {
  if (rel === "templates/git/pre-commit") return true;
  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  return textExtensions.has(ext) || base.startsWith(".");
}

function validatePng(relativePath, expectedWidth, expectedHeight, maxBytes) {
  const full = path.join(root, relativePath);
  if (!fs.existsSync(full)) return;
  const buffer = fs.readFileSync(full);
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    failures.push(`${relativePath} must be a PNG file.`);
    return;
  }
  if (buffer.length > maxBytes) {
    failures.push(`${relativePath} must stay under ${maxBytes} bytes for GitHub social preview upload.`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(`${relativePath} must be ${expectedWidth}x${expectedHeight}; found ${width}x${height}.`);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing required file: ${file}`);
  }
}

const issueConfigPath = path.join(root, ".github/ISSUE_TEMPLATE/config.yml");
if (fs.existsSync(issueConfigPath)) {
  const issueConfig = fs.readFileSync(issueConfigPath, "utf8");
  if (!/blank_issues_enabled:\s*false/.test(issueConfig)) {
    failures.push(".github/ISSUE_TEMPLATE/config.yml must keep blank issues disabled so reporters use public-safe templates.");
  }
}

const codeownersPath = path.join(root, ".github/CODEOWNERS");
if (fs.existsSync(codeownersPath) && !fs.readFileSync(codeownersPath, "utf8").includes("@ucsahinn")) {
  failures.push(".github/CODEOWNERS must include the public repository owner @ucsahinn.");
}

const files = walk(root);
const mojibakePattern = new RegExp(
  "\\u00c3[\\u0080-\\u00bf]|" +
  "\\u00c4[\\u00b0\\u00b1\\u0178\\u017e]|" +
  "\\u00c5[\\u0178\\u017e]|" +
  "\\u00f0\\u0178|" +
  "\\u00e2[\\u20ac\\u0153\\u017e\\u2122\\u0161\\u201c\\u201d\\u2013\\u2014]"
);

const docsDir = path.join(root, "docs");
if (fs.existsSync(docsDir)) {
  const docFiles = fs.readdirSync(docsDir).filter((file) => file.endsWith(".md"));
  const docSet = new Set(docFiles);
  const docLocaleSuffixes = ["tr"];
  const localePattern = /\.tr\.md$/;
  for (const file of docFiles) {
    if (localePattern.test(file)) {
      const english = file.replace(localePattern, ".md");
      if (!docSet.has(english)) {
        failures.push(`Missing English doc pair for docs/${file}: docs/${english}`);
      }
    } else {
      const slug = file.replace(/\.md$/, "");
      for (const locale of docLocaleSuffixes) {
        const localized = `${slug}.${locale}.md`;
        if (!docSet.has(localized)) {
          failures.push(`Missing localized doc pair for docs/${file}: docs/${localized}`);
        }
      }
    }
  }
} else {
  failures.push("Missing docs directory.");
}

for (const file of files) {
  const rel = toPosix(path.relative(root, file));
  const base = path.basename(file);
  const ext = path.extname(file).toLowerCase();

  if (deniedFileNames.has(base) || deniedExtensions.has(ext)) {
    failures.push(`Denied file should not be versioned: ${rel}`);
  }

  const text = isTextFile(file, rel) ? fs.readFileSync(file, "utf8") : "";

  if (text && mojibakePattern.test(text)) {
    failures.push(`Likely mojibake or corrupted UTF-8 text in ${rel}`);
  }

  const localPathScanText = rel === "templates/.npmignore"
    ? text.replace(/^\*\*\/\.codex\/(?:sessions|memories)\/\*\*\r?\n?/gm, "")
    : text;
  const forbiddenLocalPaths = [
    /[A-Za-z]:[\\/]Users[\\/](?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i,
    /C:\\Users\\(?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i,
    /\/Users\/(?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i,
    /\/home\/(?!user\b|username\b|you\b|yourname\b|yourusername\b|runner\b)[A-Za-z0-9._-]+/i,
    /\\\.codex\\sessions\\/i,
    /\/\.codex\/sessions\//i,
    /\\\.codex\\memories\\/i,
    /\/\.codex\/memories\//i
  ];
  for (const pattern of forbiddenLocalPaths) {
    if (localPathScanText && pattern.test(localPathScanText)) {
      failures.push(`Forbidden local state/path pattern in ${rel}: ${pattern}`);
    }
  }

  const riskyAssignments = [
    /(api[_-]?key|secret|token|password|private[_-]?key)\s*=\s*["'][^"']{12,}["']/i,
    /(api[_-]?key|secret|token|password|private[_-]?key)\s*:\s*["'][^"']{12,}["']/i,
    /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/
  ];
  for (const pattern of riskyAssignments) {
    if (text && pattern.test(text)) {
      failures.push(`Secret-like assignment or private key marker in ${rel}`);
    }
  }

  if (text && rel.endsWith(".toml")) {
    const tripleQuoteCount = (text.match(/"""/g) || []).length;
    if (tripleQuoteCount % 2 !== 0) {
      failures.push(`Unbalanced TOML triple-quoted string in ${rel}`);
    }
    if (/\[[^\]\r\n]*$/.test(text)) {
      failures.push(`Suspicious TOML table header in ${rel}`);
    }
  }

  if (text && rel.endsWith(".json")) {
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`Invalid JSON in ${rel}: ${error.message}`);
    }
  }

  if (text && rel.endsWith("SKILL.md")) {
    if (!text.startsWith("---\n") || !/\nname:\s*[a-z0-9-]+/i.test(text) || !/\ndescription:\s*/i.test(text)) {
      failures.push(`Invalid skill front matter in ${rel}`);
    }
  }

  if (text && rel.startsWith("assets/") && rel.endsWith(".svg")) {
    if (!/<title[\s>]/.test(text) || !/<desc[\s>]/.test(text)) {
      failures.push(`SVG asset must include title and desc for accessibility: ${rel}`);
    }
    if (!/(?:@keyframes|<animate(?:Transform)?[\s>])/.test(text)) {
      failures.push(`SVG asset must include lightweight animation: ${rel}`);
    }
    if (!/prefers-reduced-motion/.test(text)) {
      failures.push(`SVG asset must include reduced-motion fallback: ${rel}`);
    }
  }
}

validatePng("assets/social-preview.png", 1280, 640, 1024 * 1024);

const preCommitHook = fs.readFileSync(path.join(root, "templates/git/pre-commit"), "utf8");
if (!preCommitHook.startsWith("#!/usr/bin/env node")) {
  failures.push("templates/git/pre-commit must be Node-based for Windows-safe global hooks.");
}
for (const forbidden of ["#!/usr/bin/env sh", "grep -E", "grep -Ei", "command -v gitleaks"]) {
  if (preCommitHook.includes(forbidden)) {
    failures.push(`templates/git/pre-commit must not depend on POSIX shell tooling: ${forbidden}`);
  }
}
for (const required of [
  "git\", [\"diff\", \"--cached\", \"--name-only\", \"--diff-filter=ACMR\"]",
  "gitleaks\", [\"detect\", \"--redact\", \"--no-banner\", \"--verbose\"]",
  "sqlite3",
  "Blocked staged secret-like or local-state files"
]) {
  if (!preCommitHook.includes(required)) {
    failures.push(`templates/git/pre-commit missing required guard signal: ${required}`);
  }
}

const installPlanPath = path.join(root, "manifests/install-plan.json");
if (fs.existsSync(installPlanPath)) {
  const installPlan = JSON.parse(fs.readFileSync(installPlanPath, "utf8"));
  const operationIds = new Set((installPlan.operations || []).map((operation) => operation.id));
  for (const profileName of ["default", "all"]) {
    const profile = installPlan.profiles?.[profileName];
    if (!Array.isArray(profile)) {
      failures.push(`Install plan missing ${profileName} profile.`);
      continue;
    }
    for (const operationId of profile) {
      if (!operationIds.has(operationId)) {
        failures.push(`Install plan profile ${profileName} references unknown operation: ${operationId}`);
      }
    }
  }
}

const packageJsonPath = path.join(root, "package.json");
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(packageJson.version || "")) {
    failures.push("package.json version must be a plain semver release version.");
  } else {
    const version = packageJson.version;
    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    const releaseNotes = fs.readFileSync(path.join(root, "docs/release-notes.md"), "utf8");
    const releaseNotesTr = fs.readFileSync(path.join(root, "docs/release-notes.tr.md"), "utf8");
    if (!changelog.includes(`## ${version} - `)) {
      failures.push(`CHANGELOG.md must include a dated section for ${version}.`);
    }
    if (!releaseNotes.includes(`## v${version} - `)) {
      failures.push(`docs/release-notes.md must include a dated section for v${version}.`);
    }
    if (!releaseNotesTr.includes(`## v${version} - `)) {
      failures.push(`docs/release-notes.tr.md must include a dated section for v${version}.`);
    }
  }
}

const readmeText = [
  "README.md",
  "README.de.md",
  "README.es.md",
  "README.fr.md",
  "README.pt-BR.md",
  "README.tr.md"
].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
for (const requiredPattern of [
  /README\.de\.md/,
  /README\.es\.md/,
  /README\.fr\.md/,
  /README\.pt-BR\.md/,
  /README\.tr\.md/,
  /Deutsch/,
  /Espa/,
  /Portugu/,
  /Fran/,
  /Türkçe/,
  /readme-6%20languages/,
  /English and Turkish/i,
  /Knowledge base/,
  /Bilgi bankas/,
  /assets\/banner\.svg/,
  /assets\/workflow-overview\.svg/,
  /assets\/workflow-overview\.tr\.svg/,
  /docs\/agents(?:\.tr)?\.md/,
  /docs\/skills(?:\.tr)?\.md/,
  /docs\/mcp-catalog(?:\.tr)?\.md/
]) {
  if (!requiredPattern.test(readmeText)) {
    failures.push(`README.md missing required storefront signal: ${requiredPattern}`);
  }
}

const marketplacePath = path.join(root, ".agents/plugins/marketplace.json");
let marketplacePlugins = [];
if (fs.existsSync(marketplacePath)) {
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  marketplacePlugins = marketplace.plugins || [];
  for (const plugin of marketplacePlugins) {
    const pluginPath = plugin?.source?.path;
    if (!pluginPath || !pluginPath.startsWith("./")) {
      failures.push(`Marketplace plugin ${plugin.name} must use a repo-relative ./ path`);
      continue;
    }
    if (!pluginPath.startsWith("./plugins/")) {
      failures.push(`Marketplace plugin ${plugin.name} must point at a concrete ./plugins/ subdirectory`);
    }
    const resolved = path.join(root, pluginPath.slice(2));
    if (!fs.existsSync(resolved)) {
      failures.push(`Marketplace plugin path does not exist: ${pluginPath}`);
    }
    if (!plugin?.interface?.displayName || !plugin?.interface?.shortDescription) {
      failures.push(`Marketplace plugin ${plugin.name} must include displayName and shortDescription metadata`);
    }
    if (plugin?.policy?.authentication !== "ON_INSTALL") {
      failures.push(`Marketplace plugin ${plugin.name} must use current Codex authentication policy ON_INSTALL`);
    }
  }
}

const pluginManifest = path.join(root, "plugins/codex-chef-workflows/.codex-plugin/plugin.json");
if (fs.existsSync(pluginManifest)) {
  const plugin = JSON.parse(fs.readFileSync(pluginManifest, "utf8"));
  for (const forbiddenKey of ["mcpServers", "apps"]) {
    if (Object.prototype.hasOwnProperty.call(plugin, forbiddenKey)) {
      failures.push(`Plugin manifest must not declare ${forbiddenKey}; authenticated surfaces stay disabled by default.`);
    }
  }
  const expectedHooks = ["./hooks/process-hygiene.json"];
  if (JSON.stringify(plugin.hooks || []) !== JSON.stringify(expectedHooks)) {
    failures.push(`Plugin manifest hooks must be exactly: ${expectedHooks.join(", ")}`);
  }
  const capabilities = plugin?.interface?.capabilities;
  if (Array.isArray(capabilities) && capabilities.some((capability) => String(capability).toLowerCase() === "write")) {
    failures.push("Plugin manifest must not declare Write interface capability by default.");
  }
  for (const key of ["name", "version", "description", "skills"]) {
    if (!plugin[key]) {
      failures.push(`Plugin manifest missing key: ${key}`);
    }
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (plugin.version !== packageJson.version) {
    failures.push(`Plugin manifest version must match package.json version: ${plugin.version} !== ${packageJson.version}`);
  }
  if (typeof plugin.skills !== "string") {
    failures.push("Plugin manifest skills entry must be a string path.");
  } else {
    const skillsPath = path.resolve(path.dirname(pluginManifest), "..", plugin.skills);
    if (!fs.existsSync(skillsPath)) {
      failures.push(`Plugin manifest skills path does not exist: ${plugin.skills}`);
    }
  }
  const marketplacePlugin = marketplacePlugins.find((entry) => entry.name === plugin.name);
  if (!marketplacePlugin) {
    failures.push(`Plugin manifest ${plugin.name} must be listed in .agents/plugins/marketplace.json`);
  } else if (marketplacePlugin.source?.path !== "./plugins/codex-chef-workflows") {
    failures.push(`Marketplace path for ${plugin.name} must stay ./plugins/codex-chef-workflows`);
  }
}

const skillCatalog = path.join(root, "catalog/skills.json");
if (fs.existsSync(skillCatalog)) {
  const catalog = JSON.parse(fs.readFileSync(skillCatalog, "utf8"));
  const skills = catalog.skills || [];
  if (catalog.lockSemantics !== "commit-pinned") {
    failures.push("Public skill catalog must use commit-pinned lock semantics.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(catalog.skillsCliVersion || "")) {
    failures.push("Public skill catalog must pin an exact Skills CLI version.");
  }
  if (!String(catalog.skillsCliIntegrity || "").startsWith("sha512-")) {
    failures.push("Public skill catalog must pin the Skills CLI registry integrity.");
  }
  if (skills.length !== 57) {
    failures.push(`Public skill catalog contract expects 57 entries; found ${skills.length}.`);
  }
  if (skills.filter((skill) => skill.install === true).length !== 15) {
    failures.push("Public skill catalog contract expects 15 full-install skills.");
  }
  for (const doc of ["docs/skills.md", "docs/skills.tr.md"]) {
    if (!fs.existsSync(path.join(root, doc))) continue;
    const text = fs.readFileSync(path.join(root, doc), "utf8");
    for (const skill of skills) {
      if (!text.includes(`\`${skill.name}\``)) {
        failures.push(`${doc} must name cataloged skill: ${skill.name}`);
      }
    }
  }
  for (const skill of skills) {
    if (skill.install === true) {
      if (!skill.package || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(skill.package)) {
        failures.push(`Installable skill must declare package as owner/repo: ${skill.name}`);
      }
      if (!skill.skill || /\s/.test(skill.skill)) {
        failures.push(`Installable skill must declare a single skill name: ${skill.name}`);
      }
      if (!/^[a-f0-9]{40}$/.test(skill.commit || "")) {
        failures.push(`Installable skill must declare a full commit SHA: ${skill.name}`);
      }
      if (skill.source !== `${skill.package}@${skill.skill}`) {
        failures.push(`Installable skill source must equal package@skill for ${skill.name}`);
      }
      for (const key of ["sourceUrl", "license", "risk", "lastChecked"]) {
        if (!skill[key]) {
          failures.push(`Installable skill ${skill.name} must declare ${key}`);
        }
      }
    }
  }
}

const agentCatalog = path.join(root, "catalog/agents.json");
if (fs.existsSync(agentCatalog)) {
  const catalog = JSON.parse(fs.readFileSync(agentCatalog, "utf8"));
  const agents = catalog.agents || [];
  if (agents.length !== 21) {
    failures.push(`Public agent catalog contract expects 21 entries; found ${agents.length}.`);
  }
  for (const doc of ["docs/agents.md", "docs/agents.tr.md"]) {
    if (!fs.existsSync(path.join(root, doc))) continue;
    const text = fs.readFileSync(path.join(root, doc), "utf8");
    for (const agent of agents) {
      if (!text.includes(`\`${agent.name}\``)) {
        failures.push(`${doc} must name cataloged agent: ${agent.name}`);
      }
    }
  }
}

const mcpCatalog = path.join(root, "catalog/mcp-servers.json");
if (fs.existsSync(mcpCatalog)) {
  const catalog = JSON.parse(fs.readFileSync(mcpCatalog, "utf8"));
  const servers = catalog.servers || [];
  if (servers.length !== 16) {
    failures.push(`Public MCP catalog contract expects 16 entries; found ${servers.length}.`);
  }
  const defaultEnabledServers = servers
    .filter((server) => server.defaultEnabled === true)
    .map((server) => server.name)
    .sort();
  const expectedDefaultEnabledServers = ["context7", "openaiDeveloperDocs", "serena"];
  if (JSON.stringify(defaultEnabledServers) !== JSON.stringify(expectedDefaultEnabledServers)) {
    failures.push(`Public MCP catalog default-enabled servers must be exactly: ${expectedDefaultEnabledServers.join(", ")}`);
  }
  for (const doc of ["docs/mcp-catalog.md", "docs/mcp-catalog.tr.md"]) {
    if (!fs.existsSync(path.join(root, doc))) continue;
    const text = fs.readFileSync(path.join(root, doc), "utf8");
    for (const server of servers) {
      if (!text.includes(`\`${server.name}\``)) {
        failures.push(`${doc} must name cataloged MCP server: ${server.name}`);
      }
    }
  }
  for (const server of servers) {
    for (const key of ["sourceUrl", "risk", "defaultReason"]) {
      if (!server[key]) {
        failures.push(`MCP server ${server.name} must declare ${key}`);
      }
    }
  }
}

const bundledSkillsDir = path.join(root, "plugins/codex-chef-workflows/skills");
if (fs.existsSync(bundledSkillsDir)) {
  const bundledSkills = fs.readdirSync(bundledSkillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(bundledSkillsDir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
  if (bundledSkills.length !== 11) {
    failures.push(`Public bundled workflow contract expects 11 skills; found ${bundledSkills.length}.`);
  }
  for (const doc of ["docs/skills.md", "docs/skills.tr.md"]) {
    if (!fs.existsSync(path.join(root, doc))) continue;
    const text = fs.readFileSync(path.join(root, doc), "utf8");
    for (const skill of bundledSkills) {
      if (!text.includes(`\`${skill}\``)) {
        failures.push(`${doc} must name bundled workflow: ${skill}`);
      }
    }
  }
}

for (const publicFile of [
  "README.md",
  "README.tr.md",
  "llms.txt",
  "assets/banner.svg",
  "assets/social-preview.svg",
  "assets/workflow-overview.svg",
  "assets/workflow-overview.tr.svg"
]) {
  if (!fs.existsSync(path.join(root, publicFile))) continue;
  if (/Windows-first/i.test(fs.readFileSync(path.join(root, publicFile), "utf8"))) {
    failures.push(`${publicFile} must not describe the cross-platform starter as Windows-first.`);
  }
}

if (failures.length > 0) {
  console.error("Validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Validation passed. Checked ${files.length} files.`);
