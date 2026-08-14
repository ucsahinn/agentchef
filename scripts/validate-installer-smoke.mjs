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
    const fixtureStateRoot = path.dirname(codexHome);
    env.LOCALAPPDATA = path.join(fixtureStateRoot, ".local-app-data");
    env.PSModuleAnalysisCachePath = path.join(fixtureStateRoot, ".powershell-module-analysis-cache");
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
  const agentCatalog = JSON.parse(read(path.join(root, "catalog", "agents.json")));
  const expectedAgents = [
    ...agentCatalog.agents.map((agent) => `${agent.name}.toml`),
    ...(agentCatalog.coordinators || []).map((coordinator) => `${coordinator.name}.toml`)
  ];

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
    assertIncludes(config, '[agents.leadership_coordinator]', `${label} config`);
    assertIncludes(config, '[agents.support_coordinator]', `${label} config`);
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

function assertHomeContainsOnly(home, allowedTopLevel, label) {
  if (!fs.existsSync(home)) return;
  const allowed = new Set(allowedTopLevel);
  const entries = fs.readdirSync(home).sort();
  const unexpected = entries.filter((entry) => !allowed.has(entry) && entry !== "tmp");
  if (unexpected.length > 0) {
    fail(`${label} performed managed writes before failing: ${unexpected.join(", ")}`);
  }
  const tempRoot = path.join(home, "tmp");
  if (fs.existsSync(tempRoot)) {
    const tempEntries = fs.readdirSync(tempRoot).sort();
    const arg0Root = path.join(tempRoot, "arg0");
    if (
      process.platform !== "win32"
      || tempEntries.join(",") !== "arg0"
      || !fs.lstatSync(arg0Root).isDirectory()
      || fs.readdirSync(arg0Root).length !== 0
    ) {
      fail(`${label} created an unexpected temp footprint before failing.`);
    }
  }
}

function expectInstallerFailure(result, label) {
  if (result.error) {
    fail(`${label} could not run: ${result.error.message}`);
  } else if (result.status === 0) {
    fail(`${label} must fail closed.`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function runSafetyPreflight(codexHome, agentsHome, extraArgs = [], extraEnv = {}) {
  return spawnSync(process.execPath, [
    "scripts/lib/installer-safety-preflight.mjs",
    "--codex-home",
    codexHome,
    "--agents-home",
    agentsHome,
    ...extraArgs
  ], {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
}

function runInstallSurfacePreflight(codexHome, agentsHome) {
  return spawnSync(process.execPath, [
    "scripts/assert-install-surface.mjs",
    "--codex-home",
    codexHome,
    "--agents-home",
    agentsHome
  ], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
}

function runDirectSkillTargetPreflight(source, target, allowAdopt = false) {
  return spawnSync(process.execPath, [
    "scripts/manage-direct-skill-target.mjs",
    source,
    target,
    "--check",
    ...(allowAdopt ? ["--allow-adopt"] : [])
  ], {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true
  });
}

function assertNoBackupInventoryGate() {
  const scenarios = [
    {
      name: "existing managed directory under force/update semantics",
      prepare: ({ codexHome }) => ensureDir(path.join(codexHome, "plugins", "codex-chef-workflows")),
      args: []
    },
    {
      name: "existing marketplace",
      prepare: ({ agentsHome }) => {
        const target = path.join(agentsHome, "plugins", "marketplace.json");
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, "{}\n", "utf8");
      },
      args: []
    },
    {
      name: "existing plugin cache",
      prepare: ({ codexHome }) => ensureDir(path.join(codexHome, "plugins", "cache")),
      args: []
    },
    {
      name: "curated skill mutation",
      prepare: () => {},
      args: ["--install-skills"]
    },
    {
      name: "direct skill adoption",
      prepare: () => {},
      args: ["--adoption-requested"]
    }
  ];
  for (const scenario of scenarios) {
    const fixtureSlug = scenario.name.replace(/[^a-z0-9-]+/gi, "-");
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `Codex Chef No Backup [${fixtureSlug}] #-`));
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    scenario.prepare({ codexHome, agentsHome, fixtureRoot });
    const result = runSafetyPreflight(codexHome, agentsHome, ["--no-backup", ...scenario.args]);
    const output = expectInstallerFailure(result, `No-backup ${scenario.name} preflight`);
    assertIncludes(output, "creation-only", `No-backup ${scenario.name} preflight`);
  }

  const gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef No Backup [git-global] #-"));
  const gitHome = path.join(gitRoot, "home");
  const globalConfig = path.join(gitRoot, "global.gitconfig");
  ensureDir(gitHome);
  const gitResult = runSafetyPreflight(
    path.join(gitRoot, ".codex"),
    path.join(gitRoot, ".agents"),
    ["--no-backup", "--install-git-guards", "--home", gitHome],
    { HOME: gitHome, USERPROFILE: gitHome, GIT_CONFIG_GLOBAL: globalConfig }
  );
  const gitOutput = expectInstallerFailure(gitResult, "No-backup global Git setting preflight");
  assertIncludes(gitOutput, "creation-only", "No-backup global Git setting preflight");
}

function runGitGuardAdoptionScenario() {
  progress("Git guard narrow adoption receipt and restore");
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Git Guard Adoption #-"));
  const home = path.join(fixtureRoot, "home");
  const codexHome = path.join(fixtureRoot, ".codex");
  const agentsHome = path.join(fixtureRoot, ".agents");
  const globalConfig = path.join(fixtureRoot, "global.gitconfig");
  const ignorePath = path.join(home, ".gitignore_global");
  const hookPath = path.join(home, ".githooks", "pre-commit");
  ensureDir(path.dirname(hookPath));
  const foreignIgnore = "# foreign ignore must be restorable\n";
  const foreignHook = "#!/bin/sh\necho foreign hook\n";
  fs.writeFileSync(ignorePath, foreignIgnore, "utf8");
  fs.writeFileSync(hookPath, foreignHook, "utf8");

  const gitEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1"
  };
  const runGit = (args) => spawnSync("git", args, {
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  for (const [key, value] of [
    ["core.excludesfile", path.join(fixtureRoot, "foreign-ignore-a")],
    ["core.excludesfile", path.join(fixtureRoot, "foreign-ignore-b")],
    ["core.hooksPath", path.join(fixtureRoot, "foreign-hooks")]
  ]) {
    assertRunOk(
      runGit(["config", "--global", "--no-includes", "--add", key, value]),
      `Git guard fixture config ${key}`
    );
  }
  const priorValues = (key) => assertRunOk(
    runGit(["config", "--global", "--no-includes", "--get-all", key]),
    `Git guard fixture read ${key}`
  ).trim().split(/\r?\n/).filter(Boolean);
  const expectedPriorExcludes = priorValues("core.excludesfile");
  const expectedPriorHooks = priorValues("core.hooksPath");

  const gitGuardsArg = process.platform === "win32" ? "-InstallGitGuards" : "--install-git-guards";
  const adoptionArgs = process.platform === "win32"
    ? ["-AdoptGitIgnore", "-AdoptGitHook", "-AdoptGitExcludesFile", "-AdoptGitHooksPath"]
    : ["--adopt-git-ignore", "--adopt-git-hook", "--adopt-git-excludes-file", "--adopt-git-hooks-path"];
  const extraEnv = process.platform === "win32" ? envWithoutCodexCli() : {};
  if (process.platform === "win32") {
    const gitLookup = spawnSync("where.exe", ["git.exe"], { encoding: "utf8", windowsHide: true });
    const gitExecutable = (gitLookup.stdout || "").split(/\r?\n/).find(Boolean);
    if (gitExecutable) {
      extraEnv.Path = [extraEnv.Path, path.dirname(gitExecutable)].filter(Boolean).join(path.delimiter);
    }
  }
  const output = assertRunOk(
    runInstaller(codexHome, agentsHome, [gitGuardsArg, ...adoptionArgs], {
      extraEnv: { ...extraEnv, ...gitEnv }
    }),
    "Installer Git guard adoption smoke"
  );
  assertIncludes(output, "receipt", "Installer Git guard adoption smoke");
  if (read(ignorePath) !== read(path.join(root, "templates", "git", ".gitignore_global"))) {
    fail("Installer Git guard adoption must write the canonical ignore file.");
  }
  if (read(hookPath) !== read(path.join(root, "templates", "git", "pre-commit"))) {
    fail("Installer Git guard adoption must write the canonical hook file.");
  }
  const receiptRoot = path.join(codexHome, "backups");
  const receipts = fs.existsSync(receiptRoot)
    ? fs.readdirSync(receiptRoot).filter((name) => name.endsWith("-git-guards.json"))
    : [];
  if (receipts.length !== 1) {
    fail(`Installer Git guard adoption must create exactly one typed receipt; found ${receipts.length}.`);
    return;
  }
  const receiptPath = path.join(receiptRoot, receipts[0]);
  const restore = spawnSync(process.execPath, [
    path.join(root, "scripts", "manage-global-git-guards.mjs"),
    "restore",
    "--home", home,
    "--git-config-global", globalConfig,
    "--receipt", receiptPath,
    "--json"
  ], {
    cwd: root,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000
  });
  assertRunOk(restore, "Installer Git guard receipt restore");
  if (read(ignorePath) !== foreignIgnore || read(hookPath) !== foreignHook) {
    fail("Installer Git guard restore must recover exact prior file bytes.");
  }
  if (
    JSON.stringify(priorValues("core.excludesfile")) !== JSON.stringify(expectedPriorExcludes)
    || JSON.stringify(priorValues("core.hooksPath")) !== JSON.stringify(expectedPriorHooks)
  ) {
    fail("Installer Git guard restore must recover exact ordered prior Git config values.");
  }
}

function runInstallerSafetyScenarios() {
  const noBackupArg = process.platform === "win32" ? "-NoBackup" : "--no-backup";
  const forceArg = process.platform === "win32" ? "-Force" : "--force";
  const updateArg = process.platform === "win32" ? "-Update" : "--update";
  const gitGuardsArg = process.platform === "win32" ? "-InstallGitGuards" : "--install-git-guards";
  const safetyEnv = process.platform === "win32" ? envWithoutCodexCli() : {};
  if (process.platform === "win32") {
    const gitLookup = spawnSync("where.exe", ["git.exe"], { encoding: "utf8", windowsHide: true });
    const gitExecutable = (gitLookup.stdout || "").split(/\r?\n/).find(Boolean);
    if (gitExecutable) {
      safetyEnv.Path = [safetyEnv.Path, path.dirname(gitExecutable)].filter(Boolean).join(path.delimiter);
    }
  }
  const runSafetyInstaller = (codexHome, agentsHome, args = [], options = {}) =>
    runInstaller(codexHome, agentsHome, args, {
      ...options,
      extraEnv: {
        ...safetyEnv,
        ...(options.extraEnv || {})
      }
    });

  progress("no-backup creation-only install");
  const creationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Safety [creation] #-"));
  const creationCodexHome = path.join(creationRoot, ".codex");
  const creationAgentsHome = path.join(creationRoot, ".agents");
  const creationOutput = assertRunOk(
    runSafetyInstaller(creationCodexHome, creationAgentsHome, [noBackupArg]),
    "Installer no-backup creation-only smoke"
  );
  assertInstalledBaseline(creationCodexHome, creationAgentsHome, "Installer no-backup creation-only smoke");
  assertDefaultBoundaries(creationOutput, "Installer no-backup creation-only smoke");

  progress("no-backup existing-target rejection");
  const existingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Safety [no-backup-existing] #-"));
  const existingCodexHome = path.join(existingRoot, ".codex");
  const existingAgentsHome = path.join(existingRoot, ".agents");
  ensureDir(existingCodexHome);
  const existingConfig = "model = \"user-owned\"\n";
  fs.writeFileSync(path.join(existingCodexHome, "config.toml"), existingConfig, "utf8");
  const existingOutput = expectInstallerFailure(
    runSafetyInstaller(existingCodexHome, existingAgentsHome, [noBackupArg]),
    "Installer no-backup existing-target smoke"
  );
  assertIncludes(existingOutput, "creation-only", "Installer no-backup existing-target smoke");
  if (read(path.join(existingCodexHome, "config.toml")) !== existingConfig) {
    fail("Installer no-backup rejection must preserve the existing target byte-for-byte.");
  }
  assertHomeContainsOnly(existingCodexHome, ["config.toml"], "Installer no-backup existing-target smoke");
  if (fs.existsSync(existingAgentsHome)) {
    fail("Installer no-backup existing-target smoke must fail before creating AGENTS_HOME.");
  }

  progress("force and update preserve unrelated directory files");
  const extraPlugin = path.join(creationCodexHome, "plugins", "codex-chef-workflows", "user-extra.txt");
  const extraMarketplacePlugin = path.join(creationAgentsHome, "plugins", "sources", "codex-chef-workflows", "user-extra.txt");
  const extraDirectSkill = path.join(creationAgentsHome, "skills", "fetch", "user-extra.txt");
  for (const target of [extraPlugin, extraMarketplacePlugin, extraDirectSkill]) {
    fs.writeFileSync(target, "must survive force and update\n", "utf8");
  }
  assertRunOk(
    runSafetyInstaller(creationCodexHome, creationAgentsHome, [forceArg]),
    "Installer force extra-file preservation smoke"
  );
  for (const target of [extraPlugin, extraMarketplacePlugin, extraDirectSkill]) {
    if (!fs.existsSync(target)) fail(`Installer force mode removed an unrelated directory file: ${target}`);
  }
  assertRunOk(
    runSafetyInstaller(creationCodexHome, creationAgentsHome, [updateArg]),
    "Installer update extra-file preservation smoke"
  );
  for (const target of [extraPlugin, extraMarketplacePlugin, extraDirectSkill]) {
    if (!fs.existsSync(target)) fail(`Installer update mode removed an unrelated directory file: ${target}`);
  }

  for (const leaf of ["codex-profile.mjs", "serena-pool.mjs", "full.config.toml"]) {
    progress(`preflight unsafe leaf ${leaf}`);
    const leafRoot = fs.mkdtempSync(path.join(os.tmpdir(), `Codex Chef Install Safety [${leaf}] #-`));
    const leafCodexHome = path.join(leafRoot, ".codex");
    const leafAgentsHome = path.join(leafRoot, ".agents");
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `Codex Chef Install Safety [${leaf}-external] #-`));
    ensureDir(leafCodexHome);
    fs.writeFileSync(path.join(externalRoot, "sentinel.txt"), "unchanged\n", "utf8");
    fs.symlinkSync(externalRoot, path.join(leafCodexHome, leaf), process.platform === "win32" ? "junction" : "dir");
    expectInstallerFailure(
      runSafetyInstaller(leafCodexHome, leafAgentsHome, [forceArg]),
      `Installer unsafe ${leaf} preflight smoke`
    );
    assertHomeContainsOnly(leafCodexHome, [leaf], `Installer unsafe ${leaf} preflight smoke`);
    if (fs.existsSync(leafAgentsHome)) {
      fail(`Installer unsafe ${leaf} preflight must fail before creating AGENTS_HOME.`);
    }
    if (fs.readdirSync(externalRoot).sort().join(",") !== "sentinel.txt") {
      fail(`Installer unsafe ${leaf} preflight wrote through the linked leaf.`);
    }
  }

  progress("Git guard ownership conflict rejection");
  const guardsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Safety [git-guards] #-"));
  const guardsHome = path.join(guardsRoot, "home");
  const guardsCodexHome = path.join(guardsRoot, ".codex");
  const guardsAgentsHome = path.join(guardsRoot, ".agents");
  const globalConfig = path.join(guardsRoot, "global.gitconfig");
  ensureDir(guardsHome);
  const foreignIgnore = "# foreign user guard\n";
  fs.writeFileSync(path.join(guardsHome, ".gitignore_global"), foreignIgnore, "utf8");
  fs.writeFileSync(
    globalConfig,
    `[core]\n\texcludesfile = ${path.join(guardsRoot, "foreign-ignore").replaceAll("\\", "/")}\n\thooksPath = ${path.join(guardsRoot, "foreign-hooks").replaceAll("\\", "/")}\n`,
    "utf8"
  );
  const guardOutput = expectInstallerFailure(
    runSafetyInstaller(guardsCodexHome, guardsAgentsHome, [gitGuardsArg], {
      extraEnv: {
        HOME: guardsHome,
        USERPROFILE: guardsHome,
        GIT_CONFIG_GLOBAL: globalConfig
      }
    }),
    "Installer Git guard conflict smoke"
  );
  assertIncludes(guardOutput, "Git guard", "Installer Git guard conflict smoke");
  if (fs.existsSync(guardsCodexHome) || fs.existsSync(guardsAgentsHome)) {
    fail("Installer Git guard conflict must fail before writing either managed home.");
  }
  if (read(path.join(guardsHome, ".gitignore_global")) !== foreignIgnore) {
    fail("Installer Git guard conflict must preserve the foreign guard file byte-for-byte.");
  }
}

if (process.argv.includes("--git-guard-adoption")) {
  runGitGuardAdoptionScenario();
  if (failures.length > 0) {
    console.error("Installer Git guard adoption smoke validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Installer Git guard adoption receipt and restore validation passed.");
  process.exit(0);
}

if (process.argv.includes("--safety-contract")) {
  const powershellInstaller = read(path.join(root, "scripts", "install.ps1"));
  const shellInstaller = read(path.join(root, "scripts", "install.sh"));
  const safetyHelper = read(path.join(root, "scripts", "lib", "installer-safety-preflight.mjs"));
  if (/Remove-Item\s+-LiteralPath\s+\$Destination\s+-Recurse/i.test(powershellInstaller)) {
    fail("PowerShell force/update must not remove a managed destination tree.");
  }
  if (/\brm\s+-rf\s+"?\$1"?/i.test(shellInstaller)) {
    fail("Shell force/update must not remove a managed destination tree.");
  }
  for (const [label, source] of [["PowerShell", powershellInstaller], ["shell", shellInstaller]]) {
    if (!source.includes("creation-only")) {
      fail(`${label} installer must expose the no-backup creation-only gate.`);
    }
    if (!source.includes("installer-safety-preflight.mjs")) {
      fail(`${label} installer must run the complete leaf and Git-guard ownership preflight.`);
    }
  }
  if (!shellInstaller.includes('OPERATION_LOCK_ID="install-$$-$(date -u +%Y%m%dT%H%M%SZ)"')) {
    fail("Shell installer must record a unique operation-lock owner identity.");
  }
  if (!shellInstaller.includes("trap 'cleanup_operation_lock' EXIT HUP INT TERM")) {
    fail("Shell installer must register the operation-lock cleanup trap without eager expansion.");
  }
  if (!shellInstaller.includes("cleanup_operation_lock\n")) {
    fail("Shell installer must explicitly release its operation lock on the normal completion path.");
  }
  if (!safetyHelper.includes('import { resolveInstallContract } from "./install-contract.mjs"')) {
    fail("Installer safety preflight must derive its selected targets from the authoritative install contract.");
  }
  if (/function\s+collectInstallTargets\s*\(/.test(safetyHelper)) {
    fail("Installer safety preflight must not maintain a second manual install-target inventory.");
  }
  assertNoBackupInventoryGate();
  if (failures.length > 0) {
    console.error("Installer safety contract validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Installer safety contract validation passed.");
  process.exit(0);
}

if (process.argv.includes("--safety")) {
  runInstallerSafetyScenarios();
  runGitGuardAdoptionScenario();
  if (failures.length > 0) {
    console.error("Installer safety smoke validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Installer safety smoke validation passed.");
  process.exit(0);
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

// A clean install with independently rooted homes covers both the zero-config
// and split-home contracts. Keep the homes in separate temp roots rather than
// repeating the same full installation later in this smoke suite.
const zeroCodexRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [zero-codex] #-"));
const zeroAgentsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [zero-agents] #-"));
const zeroCodexHome = path.join(zeroCodexRoot, ".codex");
const zeroAgentsHome = path.join(zeroAgentsRoot, ".agents");
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

const rollbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [rollback] #-"));
const rollbackCodexHome = path.join(rollbackRoot, ".codex");
const rollbackAgentsHome = path.join(rollbackRoot, ".agents");
const rollbackAgentsPath = path.join(rollbackCodexHome, "AGENTS.md");
ensureDir(rollbackCodexHome);
fs.writeFileSync(rollbackAgentsPath, "# user-owned pre-install AGENTS\n", "utf8");
progress("post-mutation rollback");
const rollbackResult = runInstaller(rollbackCodexHome, rollbackAgentsHome, [], {
  extraEnv: {
    CODEX_CHEF_TEST_MODE: "1",
    CODEX_CHEF_TEST_INSTALL_FAIL_AFTER_MUTATIONS: "1"
  }
});
if (rollbackResult.status === 0) {
  fail("Installer rollback smoke must fail at the injected post-mutation checkpoint.");
}
if (read(rollbackAgentsPath) !== "# user-owned pre-install AGENTS\n") {
  fail("Installer rollback smoke must restore an overwritten managed file after a later transaction failure.");
}
if (fs.existsSync(path.join(rollbackCodexHome, "config.toml"))) {
  fail("Installer rollback smoke must remove a transaction-created target after a failure.");
}

progress("zero-config install");
const zeroOutput = assertRunOk(runInstaller(zeroCodexHome, zeroAgentsHome), "Installer zero-config smoke");
assertInstalledBaseline(zeroCodexHome, zeroAgentsHome, "Installer zero-config smoke");
assertDefaultBoundaries(zeroOutput, "Installer zero-config smoke");
if (canonicalPathForCompare(path.dirname(zeroCodexHome)) === canonicalPathForCompare(path.dirname(zeroAgentsHome))) {
  fail("Installer zero-config smoke must use independent CODEX_HOME and AGENTS_HOME roots.");
}

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

if (process.argv.includes("--core")) {
  if (failures.length > 0) {
    console.error("Installer core smoke validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Installer core smoke validation passed: preview, zero-config with independent homes, existing-config, and idempotent scenarios.");
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
const foreignSkillFixtures = [];
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
  foreignSkillFixtures.push({ scenario, foreignSkill, foreignSentinel });
}

// Keep the fail-closed check independent for every managed skill, then run
// all explicit adoption flags together once. The installer still performs a
// real preflight and writes every selected target; this avoids repeating the
// same full baseline install four times.
const adoptionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "Codex Chef Install Smoke [foreign-adoption] #-"));
collisionRoots.push(adoptionRoot);
const adoptionCodexHome = path.join(adoptionRoot, ".codex");
const adoptionAgentsHome = path.join(adoptionRoot, ".agents");
for (const { scenario, foreignSkill, foreignSentinel } of foreignSkillFixtures) {
  const foreignSkillRoot = path.join(adoptionAgentsHome, "skills", scenario.name);
  ensureDir(foreignSkillRoot);
  fs.writeFileSync(path.join(foreignSkillRoot, "SKILL.md"), foreignSkill, "utf8");
  fs.writeFileSync(path.join(foreignSkillRoot, "user-owned.txt"), foreignSentinel, "utf8");
}
const adoptedOutput = assertRunOk(
  runInstaller(adoptionCodexHome, adoptionAgentsHome, directAdoptionScenarios.flatMap((scenario) => scenario.flagArgs)),
  "Installer explicit direct-skill adoption smoke"
);
assertInstalledBaseline(adoptionCodexHome, adoptionAgentsHome, "Installer explicit direct-skill adoption smoke");
assertDefaultBoundaries(adoptedOutput, "Installer explicit direct-skill adoption smoke");
for (const { scenario, foreignSentinel } of foreignSkillFixtures) {
  const foreignSkillRoot = path.join(adoptionAgentsHome, "skills", scenario.name);
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
  const linkedResult = variant === "root-link"
    // Keep one end-to-end installer invocation for the direct-skill linked
    // target boundary. The nested case below calls the exact preflight helper
    // that install.ps1/install.sh invoke before acquiring a write lock.
    ? runInstaller(linkCodexHome, linkAgentsHome, [adoptFlag])
    : runDirectSkillTargetPreflight(
      path.join(root, "plugins", "codex-chef-workflows", "skills", "fetch"),
      linkFetchRoot,
      true
    );
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
  const danglingResult = runDirectSkillTargetPreflight(
    path.join(root, "plugins", "codex-chef-workflows", "skills", "fetch"),
    danglingFetchRoot,
    args.length > 0
  );
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

  const linkedAncestorResult = scenario.home === "codex"
    // Retain one end-to-end installer assertion for the install-surface
    // boundary; the agents-path variant exercises the same canonical helper.
    ? runInstaller(linkedAncestorCodexHome, linkedAncestorAgentsHome)
    : runInstallSurfacePreflight(linkedAncestorCodexHome, linkedAncestorAgentsHome);
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

  const linkedHomeResult = runInstallSurfacePreflight(linkedHomeCodex, linkedHomeAgents);
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

console.log(`Installer smoke validation passed with temp targets: ${previewRoot}, ${zeroCodexRoot}, ${zeroAgentsRoot}, ${existingRoot}, ${collisionRoots.join(", ")}`);
