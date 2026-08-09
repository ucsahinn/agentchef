#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.cwd());
const failures = [];

function fail(message) {
  failures.push(message);
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function read(target) {
  return fs.readFileSync(target, "utf8");
}

function runInstaller(codexHome, agentsHome, extraArgs = [], {
  repoRoot = root,
  extraEnv = {}
} = {}) {
  const env = {
    ...process.env,
    ...extraEnv,
    CODEX_HOME: codexHome,
    AGENTS_HOME: agentsHome,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };

  if (process.platform === "win32") {
    return spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      ".\\scripts\\install.ps1",
      "-PlainOutput",
      ...extraArgs
    ], {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 180000
    });
  }

  return spawnSync("bash", [
    "scripts/install.sh",
    "--plain-output",
    ...extraArgs
  ], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000
  });
}

function runInstallerPreview(codexHome, agentsHome) {
  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
    AGENTS_HOME: agentsHome,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };

  if (process.platform === "win32") {
    return spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      ".\\scripts\\install.ps1",
      "-All",
      "-WhatIf",
      "-PlainOutput"
    ], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: 180000
    });
  }

  return spawnSync("bash", [
    "scripts/install.sh",
    "--all",
    "--dry-run",
    "--plain-output"
  ], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180000
  });
}

function envWithoutCodexCli() {
  const env = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1"
  };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") delete env[key];
  }

  const pathEntries = [];
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    pathEntries.push(path.dirname(process.execPath));
    pathEntries.push(path.join(systemRoot, "System32"));
    env.Path = pathEntries.join(path.delimiter);
  } else {
    pathEntries.push(path.dirname(process.execPath));
    env.PATH = pathEntries.join(path.delimiter);
  }
  return env;
}

function runApprovalHarmonyWithoutCodexCli() {
  return spawnSync(process.execPath, ["scripts/validate-approval-harmony.mjs"], {
    cwd: root,
    env: envWithoutCodexCli(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    windowsHide: true
  });
}

function assertIncludes(text, snippet, label) {
  if (!text.includes(snippet)) fail(`${label} missing snippet: ${snippet}`);
}

function assertRootAssignment(text, key, expectedValue, label) {
  const firstTableIndex = text.search(/^\s*\[/m);
  const rootText = firstTableIndex >= 0 ? text.slice(0, firstTableIndex) : text;
  const pattern = new RegExp(`^${key}\\s*=\\s*${expectedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m");
  if (!pattern.test(rootText)) {
    fail(`${label} must define root-level ${key} = ${expectedValue}.`);
  }
}

function assertFileExists(target, label) {
  if (!fs.existsSync(target)) fail(`${label} missing expected file: ${target}`);
}

function canonicalPathForCompare(target) {
  const resolved = path.resolve(target || "");
  const real = fs.existsSync(resolved)
    ? fs.realpathSync.native(resolved)
    : resolved;
  const normalized = real.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function profileRootBlock(text, serverName) {
  const escaped = serverName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\[mcp_servers\\.${escaped}\\]\\r?\\n([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, "m").exec(text);
  return match ? match[1] : "";
}

function assertBundledMcpProfiles(codexHome, label) {
  const bundledLocalServers = [
    "context7",
    "sequential-thinking",
    "playwright",
    "chrome-devtools",
    "serena",
    "memory",
    "codebase-memory"
  ];
  for (const [profileName, enabled] of [["full", true], ["multi-session", false]]) {
    const profilePath = path.join(codexHome, `${profileName}.config.toml`);
    const profile = read(profilePath);
    for (const serverName of bundledLocalServers) {
      const block = profileRootBlock(profile, serverName);
      if (!block) fail(`${label} ${profileName} profile is missing ${serverName}.`);
      const expectedEnabled = serverName === "serena" ? true : enabled;
      if (!new RegExp(`^\\s*enabled\\s*=\\s*${expectedEnabled}$`, "m").test(block)) {
        fail(`${label} ${profileName} profile has the wrong enabled state for ${serverName}.`);
      }
      if (!/^\s*command\s*=/m.test(block)) {
        fail(`${label} ${profileName} profile must retain ${serverName} transport details.`);
      }
    }
  }
}

function hasOnlyEmptyArg0RunnerFootprint(target) {
  // The Codex Windows command runner can create its own empty arg0 scratch
  // directory as soon as a child inherits CODEX_HOME. This happens before
  // install.ps1 executes, so it is not evidence that the installer followed
  // a linked home. Keep this exception deliberately exact: any file or any
  // other directory remains a failed no-write assertion.
  if (process.platform !== "win32") return false;
  const topLevel = fs.readdirSync(target).sort();
  if (topLevel.join(",") !== "sentinel.txt,tmp") return false;
  const tempRoot = path.join(target, "tmp");
  if (!fs.lstatSync(tempRoot).isDirectory()) return false;
  const tempEntries = fs.readdirSync(tempRoot).sort();
  if (tempEntries.join(",") !== "arg0") return false;
  const arg0Root = path.join(tempRoot, "arg0");
  return fs.lstatSync(arg0Root).isDirectory() && fs.readdirSync(arg0Root).length === 0;
}

function assertInstalledBaseline(codexHome, agentsHome, label) {
  const configPath = path.join(codexHome, "config.toml");
  const agentsPath = path.join(codexHome, "AGENTS.md");
  const rulesPath = path.join(codexHome, "rules", "default.rules");
  const marketplacePath = path.join(agentsHome, "plugins", "marketplace.json");
  const pluginManifestPath = path.join(codexHome, "plugins", "codex-chef-workflows", ".codex-plugin", "plugin.json");
  const directSkills = JSON.parse(read(path.join(root, "catalog", "skills.json")))
    .skills
    .filter((skill) => skill.directInstall === true);
  const expectedProfiles = [
    "ci.config.toml",
    "development.config.toml",
    "full.config.toml",
    "multi-session.config.toml",
    "offline.config.toml",
    "review.config.toml",
    "token-safe.config.toml"
  ];
  const expectedAgents = JSON.parse(read(path.join(root, "catalog", "agents.json"))).agents.map((agent) => `${agent.name}.toml`);

  assertFileExists(configPath, `${label} explicit CODEX_HOME`);
  assertFileExists(agentsPath, `${label} explicit CODEX_HOME`);
  assertFileExists(rulesPath, `${label} explicit CODEX_HOME`);
  assertFileExists(pluginManifestPath, `${label} explicit CODEX_HOME`);
  assertFileExists(marketplacePath, `${label} explicit AGENTS_HOME`);
  for (const skill of directSkills) {
    const directSkillPath = path.join(agentsHome, "skills", skill.name, "SKILL.md");
    const directMarkerPath = path.join(agentsHome, "skills", skill.name, ".codex-chef-managed.json");
    assertFileExists(directSkillPath, `${label} direct $${skill.name} skill`);
    assertFileExists(directMarkerPath, `${label} direct $${skill.name} ownership marker`);
    if (
      fs.existsSync(directSkillPath)
      && read(directSkillPath) !== read(path.join(root, "plugins", "codex-chef-workflows", "skills", skill.name, "SKILL.md"))
    ) {
      fail(`${label} direct $${skill.name} skill must match its canonical plugin source.`);
    }
  }
  for (const profile of expectedProfiles) {
    assertFileExists(path.join(codexHome, profile), `${label} profile install`);
  }
  if (expectedProfiles.every((profile) => fs.existsSync(path.join(codexHome, profile)))) {
    assertBundledMcpProfiles(codexHome, label);
  }
  for (const agent of expectedAgents) {
    assertFileExists(path.join(codexHome, "agents", agent), `${label} specialist agent install`);
  }

  if (fs.existsSync(configPath)) {
    const config = read(configPath);
    assertIncludes(config, 'approval_policy = "on-request"', `${label} config`);
    assertIncludes(config, 'sandbox_mode = "workspace-write"', `${label} config`);
    assertIncludes(config, 'model_reasoning_effort = "medium"', `${label} config`);
    assertIncludes(config, "multi_agent = true", `${label} config`);
    assertIncludes(config, '[agents.code_mapper]', `${label} config`);
    assertIncludes(config, '[agents.codex_doctor]', `${label} config`);
    assertRootAssignment(config, "approval_policy", '"on-request"', `${label} config`);
    assertRootAssignment(config, "sandbox_mode", '"workspace-write"', `${label} config`);
    assertRootAssignment(config, "model_reasoning_effort", '"medium"', `${label} config`);
    assertIncludes(config, "[mcp_servers.openaiDeveloperDocs]", `${label} config`);
    assertIncludes(config, "[mcp_servers.context7]", `${label} config`);
    assertIncludes(config, "[mcp_servers.sequential-thinking]", `${label} config`);
    assertIncludes(config, "[mcp_servers.serena]", `${label} config`);
    assertIncludes(config, "[mcp_servers.codebase-memory]", `${label} config`);
    assertIncludes(config, "[mcp_servers.supabase]", `${label} config`);
    assertIncludes(config, 'url = "https://mcp.supabase.com/mcp?read_only=true&features=database,docs"', `${label} config`);
    if (/SUPABASE_DB_URL|@modelcontextprotocol\/server-postgres/.test(config)) {
      fail(`${label} config must use the official hosted, read-only Supabase OAuth connector.`);
    }
  }

  if (fs.existsSync(marketplacePath)) {
    try {
      const marketplace = JSON.parse(read(marketplacePath));
      const chefEntries = (marketplace.plugins || []).filter((plugin) => plugin?.name === "codex-chef-workflows");
      if (chefEntries.length !== 1) fail(`${label} marketplace must contain exactly one Codex Chef plugin entry.`);
      const chef = chefEntries[0];
      const marketplaceRoot = path.resolve(agentsHome, "..");
      const expectedPluginSource = `./${path.relative(
        marketplaceRoot,
        path.join(agentsHome, "plugins", "sources", "codex-chef-workflows")
      ).replaceAll(path.sep, "/")}`;
      if (chef && chef.source?.path !== expectedPluginSource) {
        fail(`${label} marketplace Codex Chef plugin path must be portable and marketplace-root-relative.`);
      }
    } catch (error) {
      fail(`${label} marketplace is not parseable JSON: ${error.message}`);
    }
  }
}

function assertDefaultBoundaries(output, label) {
  if (!output.includes("Skills: skipped unless")) {
    fail(`${label} default install must not install curated skills unless -All or skill flag is used.`);
  }
  if (!output.includes("Git guards: disabled by default")) {
    fail(`${label} default install must keep Git guards disabled by default.`);
  }
  if (!output.includes("Account, database, production, broad filesystem, and broad/destructive graph-indexing connectors stay disabled until explicitly enabled.")) {
    fail(`${label} must print the account/database connector approval boundary.`);
  }
}

function assertRunOk(result, label) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.error) {
    fail(`${label} could not run: ${result.error.message}`);
  } else if (result.status !== 0) {
    fail(`${label} exited ${result.status}: ${output.trim()}`);
  }
  return output;
}

function progress(label) {
  process.stdout.write(`[installer-smoke] ${label}\n`);
}

function initializeCuratedSkillInstallerFixture() {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "Codex Chef Install Smoke [curated-status] #-")
  );
  const sourceRepo = path.join(fixtureRoot, "source");
  const catalogPath = path.join(fixtureRoot, "skills.json");

  const skillRoot = path.join(sourceRepo, "skills", "example-skill");
  ensureDir(skillRoot);
  const git = (args) => spawnSync("git", ["-C", sourceRepo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  for (const args of [
    ["init", "-q"],
    ["config", "core.hooksPath", path.join(fixtureRoot, "disabled-hooks")],
    ["config", "commit.gpgsign", "false"]
  ]) {
    assertRunOk(git(args), `Curated skill fixture git ${args[0]}`);
  }
  fs.writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    "---\nname: example-skill\ndescription: Curated status fixture.\n---\n",
    "utf8"
  );
  assertRunOk(git(["add", "."]), "Curated skill fixture git add");
  assertRunOk(
    git([
      "-c",
      "user.name=Codex Chef",
      "-c",
      "user.email=chef@example.invalid",
      "commit",
      "-qm",
      "fixture"
    ]),
    "Curated skill fixture git commit"
  );
  const commitResult = git(["rev-parse", "HEAD"]);
  const commitOutput = assertRunOk(commitResult, "Curated skill fixture git rev-parse").trim();
  fs.writeFileSync(
    catalogPath,
    `${JSON.stringify({
      schemaVersion: "codex-chef.skills.v1",
      skillsCliVersion: "1.5.20",
      skills: [{
        name: "example-skill",
        package: "owner/repository",
        commit: commitOutput,
        skill: "example-skill",
        install: true
      }]
    }, null, 2)}\n`,
    "utf8"
  );

  return {
    fixtureRoot,
    catalogPath,
    sourceRepo,
    sourceUrl: process.platform === "win32"
      ? sourceRepo.replaceAll("\\", "/")
      : pathToFileURL(sourceRepo).href
  };
}

const zeroRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [zero] #-"));
const zeroCodexHome = path.join(zeroRoot, ".codex");
const zeroAgentsHome = path.join(zeroRoot, ".agents");
const previewRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [preview] #-"));
const previewCodexHome = path.join(previewRoot, ".codex");
const previewAgentsHome = path.join(previewRoot, ".agents");

const curatedStatusFixture = initializeCuratedSkillInstallerFixture();
const curatedStatusCodexHome = path.join(curatedStatusFixture.fixtureRoot, ".codex");
const curatedStatusAgentsHome = path.join(curatedStatusFixture.fixtureRoot, ".agents");
const curatedForeignTarget = path.join(curatedStatusAgentsHome, "skills", "example-skill");
ensureDir(curatedForeignTarget);
fs.writeFileSync(
  path.join(curatedForeignTarget, "SKILL.md"),
  "---\nname: example-skill\ndescription: User-owned fixture.\n---\n",
  "utf8"
);
fs.writeFileSync(path.join(curatedForeignTarget, "user-owned.txt"), "preserve me\n", "utf8");
progress("curated user-owned skill preservation");
const curatedStatusOutput = assertRunOk(
  runInstaller(
    curatedStatusCodexHome,
    curatedStatusAgentsHome,
    [process.platform === "win32" ? "-InstallSkills" : "--install-skills"],
    {
      extraEnv: {
        CODEX_CHEF_TEST_MODE: "1",
        CODEX_CHEF_TEST_SKILLS_CATALOG: curatedStatusFixture.catalogPath,
        GIT_ALLOW_PROTOCOL: "file",
        GIT_CONFIG_COUNT: "2",
        GIT_CONFIG_KEY_0: "http.sslBackend",
        GIT_CONFIG_VALUE_0: "openssl",
        GIT_CONFIG_KEY_1: `url.${curatedStatusFixture.sourceUrl}.insteadOf`,
        GIT_CONFIG_VALUE_1: "https://github.com/owner/repository.git"
      }
    }
  ),
  "Installer curated user-owned status smoke"
);
assertIncludes(
  curatedStatusOutput,
  "preserved user-owned skill: example-skill",
  "Installer curated user-owned status smoke"
);
if (/installed skill:\s*example-skill/i.test(curatedStatusOutput)) {
  fail("Installer curated user-owned status smoke must not claim that the preserved skill was installed.");
}
if (read(path.join(curatedForeignTarget, "user-owned.txt")) !== "preserve me\n") {
  fail("Installer curated user-owned status smoke must preserve the user-owned target byte-for-byte.");
}
progress("approval harmony without Codex CLI");
const approvalHarmonyNoCodexOutput = assertRunOk(
  runApprovalHarmonyWithoutCodexCli(),
  "Approval harmony without Codex CLI smoke"
);
assertIncludes(
  approvalHarmonyNoCodexOutput,
  "Skipped execpolicy matrix because Codex CLI could not run",
  "Approval harmony without Codex CLI smoke"
);
progress("full preview");
const previewOutput = assertRunOk(runInstallerPreview(previewCodexHome, previewAgentsHome), "Installer full preview smoke");
if (!previewOutput.includes("Dry run: no files") && !previewOutput.includes("Dry run: no files, Git settings, or skills will be changed")) {
  fail("Installer full preview smoke must clearly state that no files, Git settings, or skills are changed.");
}
if (fs.existsSync(path.join(previewCodexHome, "config.toml")) || fs.existsSync(path.join(previewAgentsHome, "plugins", "marketplace.json"))) {
  fail("Installer full preview smoke must not write Codex or Agents files.");
}

progress("zero-config install");
const zeroOutput = assertRunOk(runInstaller(zeroCodexHome, zeroAgentsHome), "Installer zero-config smoke");
assertInstalledBaseline(zeroCodexHome, zeroAgentsHome, "Installer zero-config smoke");
assertDefaultBoundaries(zeroOutput, "Installer zero-config smoke");

const existingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [existing] #-"));
const codexHome = path.join(existingRoot, ".codex");
const agentsHome = path.join(existingRoot, ".agents");
ensureDir(codexHome);
ensureDir(agentsHome);

fs.writeFileSync(
  path.join(codexHome, "config.toml"),
  [
    "# user config must survive install",
    "model = \"local-custom-model\"",
    "",
    "[mcp_servers.user-local]",
    "command = \"node\"",
    "args = [\"server.js\"]",
    ""
  ].join("\n"),
  "utf8"
);

progress("existing-config install");
const firstExistingOutput = assertRunOk(runInstaller(codexHome, agentsHome), "Installer existing-config smoke");
assertInstalledBaseline(codexHome, agentsHome, "Installer existing-config smoke");
assertDefaultBoundaries(firstExistingOutput, "Installer existing-config smoke");

const configPath = path.join(codexHome, "config.toml");
const pluginManifestPath = path.join(codexHome, "plugins", "codex-chef-workflows", ".codex-plugin", "plugin.json");
const pluginExtraPath = path.join(codexHome, "plugins", "codex-chef-workflows", "user-extra.txt");
if (fs.existsSync(configPath)) {
  const config = read(configPath);
  assertIncludes(config, 'model = "local-custom-model"', "Installer smoke config");
  assertIncludes(config, "[mcp_servers.user-local]", "Installer smoke config");
}

if (fs.existsSync(pluginManifestPath)) {
  fs.writeFileSync(pluginManifestPath, "{\"name\":\"stale-plugin\"}\n", "utf8");
}
if (fs.existsSync(path.dirname(pluginExtraPath))) {
  fs.writeFileSync(pluginExtraPath, "user extra file must survive default reinstall\n", "utf8");
} else {
  fail("Installer existing-config smoke did not create the managed plugin directory before idempotent refresh.");
}

progress("idempotent refresh");
const secondExistingOutput = assertRunOk(runInstaller(codexHome, agentsHome), "Installer idempotent smoke");
assertInstalledBaseline(codexHome, agentsHome, "Installer idempotent smoke");
assertDefaultBoundaries(secondExistingOutput, "Installer idempotent smoke");
if (fs.existsSync(pluginManifestPath)) {
  const sourcePluginManifest = read(path.join(root, "plugins", "codex-chef-workflows", ".codex-plugin", "plugin.json"));
  if (read(pluginManifestPath) !== sourcePluginManifest) {
    fail("Installer idempotent smoke must refresh stale managed plugin files on reinstall.");
  }
}
if (!fs.existsSync(pluginExtraPath)) {
  fail("Installer idempotent smoke must preserve extra files in the managed plugin directory unless prune is explicit.");
}

const splitCodexRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [split-codex] #-"));
const splitAgentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [split-agents] #-"));
const splitCodexHome = path.join(splitCodexRoot, ".codex");
const splitAgentsHome = path.join(splitAgentsRoot, ".agents");
progress("independent-home install");
const splitOutput = assertRunOk(
  runInstaller(splitCodexHome, splitAgentsHome),
  "Installer independent-home smoke"
);
assertInstalledBaseline(splitCodexHome, splitAgentsHome, "Installer independent-home smoke");
assertDefaultBoundaries(splitOutput, "Installer independent-home smoke");

if (process.argv.includes("--core")) {
  if (failures.length > 0) {
    console.error("Installer core smoke validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Installer core smoke validation passed: preview, zero-config, existing-config, idempotent, and independent-home scenarios.");
  process.exit(0);
}

const collisionRoots = [];
const directAdoptionScenarios = [
  {
    name: "fetch",
    display: "Fetch",
    flagArgs: [process.platform === "win32" ? "-AdoptFetchSkill" : "--adopt-fetch-skill"]
  },
  {
    name: "seo",
    display: "SEO",
    flagArgs: [process.platform === "win32" ? "-AdoptSeoSkill" : "--adopt-seo-skill"]
  },
  {
    name: "evidence-research",
    display: "Evidence Research",
    flagArgs: [process.platform === "win32" ? "-AdoptEvidenceResearchSkill" : "--adopt-evidence-research-skill"]
  },
  {
    name: "context-budget-planner",
    display: "Context Budget Planner",
    flagArgs: process.platform === "win32"
      ? ["-AdoptDirectSkill", "context-budget-planner"]
      : ["--adopt-direct-skill=context-budget-planner"]
  }
];
for (const scenario of directAdoptionScenarios) {
  const collisionRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `Codex Chef Install Smoke [foreign-${scenario.name}] #-`)
  );
  collisionRoots.push(collisionRoot);
  const collisionCodexHome = path.join(collisionRoot, ".codex");
  const collisionAgentsHome = path.join(collisionRoot, ".agents");
  const foreignSkillRoot = path.join(collisionAgentsHome, "skills", scenario.name);
  ensureDir(foreignSkillRoot);
  const foreignSkill = `---\nname: ${scenario.name}\n---\n\nUser-owned unrelated ${scenario.display} workflow.\n`;
  const foreignSentinel = "preserve this user-owned file\n";
  fs.writeFileSync(path.join(foreignSkillRoot, "SKILL.md"), foreignSkill, "utf8");
  fs.writeFileSync(path.join(foreignSkillRoot, "user-owned.txt"), foreignSentinel, "utf8");
  const collisionResult = runInstaller(collisionCodexHome, collisionAgentsHome);
  if (collisionResult.error) {
    fail(`Installer foreign ${scenario.display} collision could not run: ${collisionResult.error.message}`);
  } else if (collisionResult.status === 0) {
    fail(`Installer must fail closed before writes when AGENTS_HOME/skills/${scenario.name} is not Codex Chef-managed.`);
  }
  if (
    fs.existsSync(collisionCodexHome)
    || fs.existsSync(path.join(collisionAgentsHome, "plugins", "marketplace.json"))
  ) {
    fail(`Installer foreign ${scenario.display} collision must perform zero managed writes before failing.`);
  }
  if (
    read(path.join(foreignSkillRoot, "SKILL.md")) !== foreignSkill
    || read(path.join(foreignSkillRoot, "user-owned.txt")) !== foreignSentinel
  ) {
    fail(`Installer foreign ${scenario.display} collision must preserve every user-owned file byte-for-byte.`);
  }
  const adoptedOutput = assertRunOk(
    runInstaller(collisionCodexHome, collisionAgentsHome, scenario.flagArgs),
    `Installer explicit ${scenario.display} adoption smoke`
  );
  assertInstalledBaseline(collisionCodexHome, collisionAgentsHome, `Installer explicit ${scenario.display} adoption smoke`);
  assertDefaultBoundaries(adoptedOutput, `Installer explicit ${scenario.display} adoption smoke`);
  if (
    read(path.join(foreignSkillRoot, "SKILL.md"))
    !== read(path.join(root, "plugins", "codex-chef-workflows", "skills", scenario.name, "SKILL.md"))
  ) {
    fail(`Installer explicit ${scenario.display} adoption must replace the selected skill with the canonical managed source.`);
  }
  if (read(path.join(foreignSkillRoot, "user-owned.txt")) !== foreignSentinel) {
    fail(`Installer explicit ${scenario.display} adoption must preserve unrelated files inside the adopted target.`);
  }
}
const adoptFlag = process.platform === "win32" ? "-AdoptFetchSkill" : "--adopt-fetch-skill";
const foreignSkill = "---\nname: fetch\n---\n\nUser-owned unrelated Fetch workflow.\n";

for (const variant of ["root-link", "nested-link"]) {
  const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), `Codex Chef Install Smoke [fetch-${variant}] #-`));
  const linkCodexHome = path.join(linkRoot, ".codex");
  const linkAgentsHome = path.join(linkRoot, ".agents");
  const linkFetchRoot = path.join(linkAgentsHome, "skills", "fetch");
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `Codex Chef External Fetch [${variant}] #-`));
  const externalSkill = "---\nname: external-fetch\n---\n\nMust remain unchanged.\n";
  ensureDir(path.dirname(linkFetchRoot));
  if (variant === "root-link") {
    fs.writeFileSync(path.join(externalRoot, "SKILL.md"), externalSkill, "utf8");
    fs.symlinkSync(externalRoot, linkFetchRoot, process.platform === "win32" ? "junction" : "dir");
  } else {
    ensureDir(linkFetchRoot);
    fs.writeFileSync(path.join(linkFetchRoot, "SKILL.md"), foreignSkill, "utf8");
    const externalAgents = path.join(externalRoot, "agents");
    ensureDir(externalAgents);
    fs.writeFileSync(path.join(externalAgents, "openai.yaml"), "external: true\n", "utf8");
    fs.symlinkSync(externalAgents, path.join(linkFetchRoot, "agents"), process.platform === "win32" ? "junction" : "dir");
  }
  const before = variant === "root-link"
    ? read(path.join(externalRoot, "SKILL.md"))
    : read(path.join(externalRoot, "agents", "openai.yaml"));
  const linkedResult = runInstaller(linkCodexHome, linkAgentsHome, [adoptFlag]);
  if (linkedResult.error) {
    fail(`Installer ${variant} Fetch collision could not run: ${linkedResult.error.message}`);
  } else if (linkedResult.status === 0) {
    fail(`Installer must reject unsafe ${variant} Fetch targets even with explicit adoption.`);
  }
  if (
    fs.existsSync(linkCodexHome)
    || fs.existsSync(path.join(linkAgentsHome, "plugins", "marketplace.json"))
  ) {
    fail(`Installer ${variant} Fetch collision must perform zero managed writes.`);
  }
  const after = variant === "root-link"
    ? read(path.join(externalRoot, "SKILL.md"))
    : read(path.join(externalRoot, "agents", "openai.yaml"));
  if (after !== before) {
    fail(`Installer ${variant} Fetch collision must not write through a link.`);
  }
}

const danglingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [fetch-dangling-root] #-"));
const danglingCodexHome = path.join(danglingRoot, ".codex");
const danglingAgentsHome = path.join(danglingRoot, ".agents");
const danglingFetchRoot = path.join(danglingAgentsHome, "skills", "fetch");
const missingExternalRoot = path.join(danglingRoot, "missing-external-fetch");
ensureDir(path.dirname(danglingFetchRoot));
fs.symlinkSync(missingExternalRoot, danglingFetchRoot, process.platform === "win32" ? "junction" : "dir");
for (const args of [[], [adoptFlag]]) {
  const danglingResult = runInstaller(danglingCodexHome, danglingAgentsHome, args);
  if (danglingResult.error) {
    fail(`Installer dangling Fetch collision could not run: ${danglingResult.error.message}`);
  } else if (danglingResult.status === 0) {
    fail("Installer must reject a dangling Fetch root with or without explicit adoption.");
  }
  if (
    fs.existsSync(danglingCodexHome)
    || fs.existsSync(path.join(danglingAgentsHome, "plugins", "marketplace.json"))
  ) {
    fail("Installer dangling Fetch collision must perform zero managed writes.");
  }
  if (fs.existsSync(missingExternalRoot) || !fs.lstatSync(danglingFetchRoot).isSymbolicLink()) {
    fail("Installer dangling Fetch collision must preserve the dangling link without creating its target.");
  }
}

for (const scenario of [
  { name: "codex-plugin-parent", home: "codex" },
  { name: "agents-plugin-parent", home: "agents" }
]) {
  const linkedAncestorRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `Codex Chef Install Smoke [${scenario.name}] #-`)
  );
  const linkedAncestorCodexHome = path.join(linkedAncestorRoot, ".codex");
  const linkedAncestorAgentsHome = path.join(linkedAncestorRoot, ".agents");
  const selectedHome = scenario.home === "codex" ? linkedAncestorCodexHome : linkedAncestorAgentsHome;
  const untouchedHome = scenario.home === "codex" ? linkedAncestorAgentsHome : linkedAncestorCodexHome;
  const externalRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `Codex Chef Install Smoke [${scenario.name}-external] #-`)
  );
  ensureDir(selectedHome);
  fs.symlinkSync(externalRoot, path.join(selectedHome, "plugins"), process.platform === "win32" ? "junction" : "dir");

  const linkedAncestorResult = runInstaller(linkedAncestorCodexHome, linkedAncestorAgentsHome);
  if (linkedAncestorResult.error) {
    fail(`Installer ${scenario.name} safety check could not run: ${linkedAncestorResult.error.message}`);
  } else if (linkedAncestorResult.status === 0) {
    fail(`Installer must reject the linked ${scenario.home} managed-path ancestor.`);
  }
  if (fs.readdirSync(externalRoot).length > 0) {
    fail(`Installer must not write through the linked ${scenario.home} managed-path ancestor.`);
  }
  if (fs.existsSync(untouchedHome)) {
    fail(`Installer linked ${scenario.home} ancestor preflight must fail before writing the other managed home.`);
  }
}

for (const home of ["codex", "agents"]) {
  const linkedHomeRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `Codex Chef Install Smoke [${home}-home-link] #-`)
  );
  const linkedHomeCodex = path.join(linkedHomeRoot, ".codex");
  const linkedHomeAgents = path.join(linkedHomeRoot, ".agents");
  const selectedHome = home === "codex" ? linkedHomeCodex : linkedHomeAgents;
  const untouchedHome = home === "codex" ? linkedHomeAgents : linkedHomeCodex;
  const externalRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `Codex Chef Install Smoke [${home}-home-link-external] #-`)
  );
  fs.writeFileSync(path.join(externalRoot, "sentinel.txt"), "unchanged\n", "utf8");
  fs.symlinkSync(externalRoot, selectedHome, process.platform === "win32" ? "junction" : "dir");

  const linkedHomeResult = runInstaller(linkedHomeCodex, linkedHomeAgents);
  if (linkedHomeResult.error) {
    fail(`Installer ${home} home-link safety check could not run: ${linkedHomeResult.error.message}`);
  } else if (linkedHomeResult.status === 0) {
    fail(`Installer must reject a linked ${home.toUpperCase()}_HOME root.`);
  }
  if (
    fs.readdirSync(externalRoot).sort().join(",") !== "sentinel.txt" &&
    !hasOnlyEmptyArg0RunnerFootprint(externalRoot)
  ) {
    fail(`Installer must not write through a linked ${home.toUpperCase()}_HOME root.`);
  }
  if (fs.existsSync(untouchedHome)) {
    fail(`Installer linked ${home.toUpperCase()}_HOME preflight must fail before writing the other managed home.`);
  }
}

if (failures.length > 0) {
  console.error("Installer smoke validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Installer smoke validation passed with temp targets: ${previewRoot}, ${zeroRoot}, ${existingRoot}, ${splitCodexRoot}, ${splitAgentsRoot}, ${collisionRoots.join(", ")}`);
