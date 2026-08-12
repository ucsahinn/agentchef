#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findProblemRules } from "./lib/approval-rules.mjs";
import { resolveInstallContract } from "./lib/install-contract.mjs";
import { assertManagedTargetPath } from "./lib/managed-path-safety.mjs";
import { platformCommand } from "./lib/platform-command.mjs";
import {
  inspectPinnedSkillTarget,
  inspectSkillTree
} from "./lib/skill-provenance.mjs";
import { inspectDirectSkillTarget } from "./manage-direct-skill-target.mjs";
import {
  CliUsageError,
  installCliErrorBoundary,
  requireCliValue
} from "./lib/cli-error-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
installCliErrorBoundary({
  tool: "verify-install-runtime",
  argv: args,
  root,
  prefix: "Codex Chef runtime verification error"
});
const options = {
  json: false,
  redactPaths: false,
  expectSkills: false,
  expectGitGuards: false,
  skipCodexCli: false,
  skipDoctorProbe: false,
  offline: false,
  noMcpProbe: false,
  requireLiveRuntime: false,
  ambientDoctor: false,
  probeTimeoutMs: 30000,
  doctorTimeoutMs: 12000,
  mcpTimeoutMs: 15000,
  codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
  agentsHome: process.env.AGENTS_HOME || path.join(os.homedir(), ".agents")
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--json") options.json = true;
  else if (arg === "--redact-paths") options.redactPaths = true;
  else if (arg === "--expect-skills") options.expectSkills = true;
  else if (arg === "--expect-git-guards") options.expectGitGuards = true;
  else if (arg === "--skip-codex-cli") options.skipCodexCli = true;
  else if (arg === "--skip-doctor-probe") options.skipDoctorProbe = true;
  else if (arg === "--offline") options.offline = true;
  else if (arg === "--no-mcp-probe") options.noMcpProbe = true;
  else if (arg === "--require-live-runtime") options.requireLiveRuntime = true;
  else if (arg === "--ambient-doctor") options.ambientDoctor = true;
  else if (["--probe-timeout-ms", "--doctor-timeout-ms", "--mcp-timeout-ms"].includes(arg)) {
    const key = arg === "--probe-timeout-ms" ? "probeTimeoutMs" : arg === "--doctor-timeout-ms" ? "doctorTimeoutMs" : "mcpTimeoutMs";
    options[key] = Number.parseInt(requireCliValue(args, index, arg), 10);
    if (!Number.isFinite(options[key]) || options[key] < 1000) throw new CliUsageError(`${arg} must be at least 1000.`);
    index += 1;
  }
  else if (arg === "--codex-home") {
    options.codexHome = path.resolve(requireCliValue(args, index, "--codex-home"));
    index += 1;
  } else if (arg === "--agents-home") {
    options.agentsHome = path.resolve(requireCliValue(args, index, "--agents-home"));
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    throw new CliUsageError(`Unknown argument: ${arg}`);
  }
}

function printHelp() {
  console.log(`Usage: node scripts/verify-install-runtime.mjs [options]

Read-only runtime verification for an installed Codex Chef setup.

Options:
  --codex-home <path>     Installed Codex home to inspect
  --agents-home <path>    Installed Agents home to inspect
  --expect-skills         Fail if installable curated skills are missing
  --expect-git-guards     Fail if optional global Git guard files/settings are missing
  --skip-codex-cli        Do not call codex doctor or codex mcp list
  --skip-doctor-probe     Do not call codex doctor; MCP and plugin probes may still run
  --offline               Skip all live Codex CLI/runtime probes
  --no-mcp-probe          Run doctor probes but skip codex mcp list
  --probe-timeout-ms <n>  Default timeout for non-live helper probes (default: 30000)
  --doctor-timeout-ms <n> Per-doctor timeout (default: 12000)
  --mcp-timeout-ms <n>    MCP list timeout (default: 15000)
  --require-live-runtime  Treat unavailable/timed-out live probes as failures
  --ambient-doctor         Also inspect the ambient CODEX_HOME; off by default to keep verification bounded
  --redact-paths          Redact home/repo paths in output
  --json                  Emit machine-readable JSON
`);
}

const progressEnabled = !options.json;
const probes = [];
if (progressEnabled) {
  console.log("Codex Chef install runtime verification");
  console.log("Collecting installed file, Codex CLI, MCP, skill, and Git guard checks; this can take 30-60 seconds.");
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function mcpEntriesFromParsed(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.servers)) return parsed.servers;
  if (Array.isArray(parsed?.mcp_servers)) return parsed.mcp_servers;
  if (parsed?.servers && typeof parsed.servers === "object") {
    return Object.entries(parsed.servers).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }
  if (parsed?.mcp_servers && typeof parsed.mcp_servers === "object") {
    return Object.entries(parsed.mcp_servers).map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : { value })
    }));
  }
  return [];
}

function redact(value) {
  if (!options.redactPaths || typeof value !== "string") return value;
  const home = os.homedir();
  return value
    .replaceAll(home, "${HOME}")
    .replaceAll(home.replaceAll("\\", "/"), "${HOME}")
    .replaceAll(root, "${REPO}")
    .replaceAll(root.replaceAll("\\", "/"), "${REPO}")
    .replace(/[A-Za-z]:\\Users\\[^\\/]+/g, "${OTHER_USERPROFILE}")
    .replace(/[A-Za-z]:\/Users\/[^\\/]+/g, "${OTHER_USERPROFILE}");
}

function parseBlocks(text, pattern) {
  const values = new Set();
  for (const match of text.matchAll(pattern)) values.add(match[1]);
  return values;
}

function normalizePath(filePath) {
  return path.resolve(filePath || "");
}

function sameFilesystemPath(left, right) {
  const normalizedLeft = normalizePath(left);
  const normalizedRight = normalizePath(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function posixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function listFilesRecursive(directory, { rejectLinks = false } = {}) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  const rootStat = fs.lstatSync(directory);
  if (rejectLinks && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    throw new Error(`Managed directory must be a real directory: ${directory}`);
  }

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (rejectLinks && stat.isSymbolicLink()) {
        throw new Error(`Managed directory tree must not contain links: ${fullPath}`);
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        files.push(posixPath(path.relative(directory, fullPath)));
      } else if (rejectLinks) throw new Error(`Managed directory tree contains an unsupported entry: ${fullPath}`);
    }
  }

  walk(directory);
  return files.sort();
}

function run(command, commandArgs, extra = {}) {
  const executable = process.platform === "win32" && command.endsWith(".cmd") ? "cmd.exe" : command;
  const args = process.platform === "win32" && command.endsWith(".cmd")
    ? ["/d", "/s", "/c", command, ...commandArgs]
    : commandArgs;
  return spawnSync(executable, args, {
    cwd: extra.cwd || root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: extra.timeout || options.probeTimeoutMs,
    windowsHide: true,
    env: extra.env || process.env
  });
}

function codexCommand() {
  return platformCommand("codex");
}

function runProbe(name, command, commandArgs, extra = {}) {
  if (progressEnabled) console.log(`Probe started: ${name}`);
  const startedAt = Date.now();
  const result = run(command, commandArgs, extra);
  const timedOut = result.error?.code === "ETIMEDOUT";
  const probe = { name, durationMs: Date.now() - startedAt, status: timedOut ? "timeout" : result.error ? "error" : result.status === 0 ? "ok" : "failed" };
  probes.push(probe);
  if (progressEnabled) console.log(`Probe finished: ${name} (${probe.status}, ${probe.durationMs}ms)`);
  return result;
}

function parseCodexDoctorRuntime(doctor, warnings, label) {
  let activeCodexHome = null;
  let activeConfig = null;
  try {
    const parsed = JSON.parse(doctor.stdout || "{}");
    const rootSection = parsed.root || parsed.config || parsed;
    const configDetails = parsed.checks?.["config.load"]?.details || {};
    activeCodexHome = rootSection.codex_home
      || rootSection.codexHome
      || parsed.codex_home
      || parsed.codexHome
      || configDetails.CODEX_HOME
      || null;
    activeConfig = rootSection.config_file
      || rootSection.configFile
      || parsed.config_file
      || parsed.configFile
      || configDetails["config.toml"]
      || null;
  } catch {
    warnings.push(`${label} did not emit parseable JSON.`);
  }

  return {
    doctorExitCode: doctor.status,
    activeCodexHome: redact(activeCodexHome),
    activeConfig: redact(activeConfig),
    activeHomeMatchesInstall: activeCodexHome ? sameFilesystemPath(activeCodexHome, options.codexHome) : null
  };
}

function pushMissing(failures, label, expected, actual) {
  const missing = expected.filter((value) => !actual.has(value));
  if (missing.length > 0) failures.push(`${label} missing: ${missing.join(", ")}`);
  return missing;
}

function runtimeInstallContract() {
  return resolveInstallContract({
    root,
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome: options.codexHome,
    agentsHome: options.agentsHome,
    home: os.homedir()
  });
}

function inspectInstalledFiles(failures) {
  const agentsCatalog = readJson("catalog/agents.json");
  const mcpCatalog = readJson("catalog/mcp-servers.json");
  const expectedAgents = [
    ...agentsCatalog.agents.map((agent) => agent.name),
    ...(agentsCatalog.coordinators || []).map((coordinator) => coordinator.name)
  ].sort();
  const expectedMcp = mcpCatalog.servers.map((server) => server.name).sort();

  const configPath = path.join(options.codexHome, "config.toml");
  const agentsDir = path.join(options.codexHome, "agents");
  const contract = runtimeInstallContract();
  const actionByComponent = new Map(contract.operations.map((action) => [action.componentId, action]));
  const marketplacePath = actionByComponent.get("plugin-marketplace").destination;
  const pluginPath = actionByComponent.get("codex-plugin").destination;
  const marketplacePluginPath = actionByComponent.get("codex-plugin-marketplace-source").destination;
  const directSkills = readJson("catalog/skills.json").skills.filter((skill) => skill.directInstall === true);

  const requiredFiles = contract.operations
    .filter((action) => ["copy-file", "generate-mcp-profile", "write-ownership-marker", "write-marketplace"].includes(action.kind))
    .map((action) => action.destination);
  for (const target of [...requiredFiles, pluginPath, marketplacePluginPath]) {
    try {
      assertManagedTargetPath(target, [options.codexHome, options.agentsHome]);
    } catch (error) {
      failures.push(error.message);
    }
  }
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) failures.push(`Required installed file is missing: ${redact(file)}`);
  }
  if (!fs.existsSync(pluginPath)) failures.push(`Installed plugin directory is missing: ${redact(pluginPath)}`);
  if (!fs.existsSync(marketplacePluginPath)) {
    failures.push(`Installed marketplace plugin source is missing: ${redact(marketplacePluginPath)}`);
  }
  for (const skill of directSkills) {
    const source = path.join(root, "plugins", "codex-chef-workflows", "skills", skill.name);
    const target = path.join(options.agentsHome, "skills", skill.name);
    try {
      const state = inspectDirectSkillTarget(source, target);
      if (!["managed", "managed-with-extras"].includes(state.status)) {
        failures.push(
          `Installed direct skill ownership is invalid for ${skill.name}: ${redact(target)} (${state.reason || state.status})`
        );
      }
      if (state.status === "managed-with-extras") {
        warnings.push(`Installed direct skill preserves local extra files: ${skill.name} at ${redact(target)}.`);
      }
    } catch (error) {
      failures.push(`Installed direct skill ownership could not be verified for ${skill.name}: ${error.message}`);
    }
  }

  let installedMcp = new Set();
  if (fs.existsSync(configPath)) {
    const configText = readText(configPath);
    installedMcp = parseBlocks(configText, /^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm);
    pushMissing(failures, "Installed config MCP servers", expectedMcp, installedMcp);
  }

  let installedAgents = new Set();
  if (fs.existsSync(agentsDir)) {
    installedAgents = new Set(
      fs.readdirSync(agentsDir)
        .filter((file) => file.endsWith(".toml"))
        .map((file) => path.basename(file, ".toml"))
    );
    pushMissing(failures, "Installed specialist agents", expectedAgents, installedAgents);
  } else {
    failures.push(`Installed agents directory is missing: ${redact(agentsDir)}`);
  }

  return {
    codexHome: redact(options.codexHome),
    agentsHome: redact(options.agentsHome),
    requiredFiles: requiredFiles.map((file) => ({ path: redact(file), exists: fs.existsSync(file) })),
    plugin: { path: redact(pluginPath), exists: fs.existsSync(pluginPath) },
    marketplacePlugin: { path: redact(marketplacePluginPath), exists: fs.existsSync(marketplacePluginPath) },
    agents: {
      expected: expectedAgents.length,
      installed: installedAgents.size,
      missing: expectedAgents.filter((agent) => !installedAgents.has(agent))
    },
    mcp: {
      expected: expectedMcp.length,
      installed: installedMcp.size,
      missing: expectedMcp.filter((server) => !installedMcp.has(server))
    }
  };
}

function inspectManagedFileDrift(failures, warnings) {
  const mismatched = [];
  const missing = [];
  const extra = [];
  let expectedFiles = 0;
  let matchedFiles = 0;

  function recordMissing(sourceLabel, targetPath) {
    missing.push({ source: sourceLabel, target: redact(targetPath) });
    failures.push(`Installed managed file is missing: ${sourceLabel} -> ${redact(targetPath)}`);
  }

  function recordMismatch(sourceLabel, targetPath) {
    mismatched.push({ source: sourceLabel, target: redact(targetPath) });
    failures.push(`Installed managed file drifted from source: ${sourceLabel} -> ${redact(targetPath)}`);
  }

  function significantRulesLines(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function compareRulesBaseline(sourceRel, targetPath) {
    expectedFiles += 1;
    const sourcePath = path.join(root, sourceRel);
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
      recordMissing(sourceRel, targetPath);
      return;
    }

    const sourceText = fs.readFileSync(sourcePath, "utf8");
    const targetText = fs.readFileSync(targetPath, "utf8");
    const targetLines = new Set(significantRulesLines(targetText));
    const missingLines = significantRulesLines(sourceText)
      .filter((line) => !targetLines.has(line));
    const problemRules = findProblemRules(targetText, { sourceText });
    if (missingLines.length > 0) {
      mismatched.push({
        source: sourceRel,
        target: redact(targetPath),
        reason: "missing-managed-rules-baseline",
        missingLines: missingLines.length
      });
      failures.push(`Installed rules file is missing ${missingLines.length} managed baseline line(s): ${sourceRel} -> ${redact(targetPath)}`);
      return;
    }
    if (problemRules.length > 0) {
      mismatched.push({
        source: sourceRel,
        target: redact(targetPath),
        reason: "conflicting-local-approval-rules",
        problemRules: problemRules.map((rule) => ({
          lineNumber: rule.lineNumber,
          pattern: rule.pattern,
          decision: rule.decision,
          reason: rule.reason
        }))
      });
      failures.push(`Installed rules file has ${problemRules.length} conflicting local approval rule(s): ${sourceRel} -> ${redact(targetPath)}`);
      return;
    }
    matchedFiles += 1;
  }

  function compareFile(sourceRel, targetPath) {
    expectedFiles += 1;
    const sourcePath = path.join(root, sourceRel);
    try {
      assertManagedTargetPath(targetPath, [options.codexHome, options.agentsHome]);
    } catch (error) {
      failures.push(error.message);
      mismatched.push({ source: sourceRel, target: redact(targetPath), reason: "unsafe-managed-path" });
      return;
    }
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
      recordMissing(sourceRel, targetPath);
      return;
    }
    const source = fs.readFileSync(sourcePath);
    const target = fs.readFileSync(targetPath);
    if (!source.equals(target)) {
      recordMismatch(sourceRel, targetPath);
      return;
    }
    matchedFiles += 1;
  }

  function compareGeneratedMcpProfile(sourceRel, targetPath) {
    expectedFiles += 1;
    try {
      assertManagedTargetPath(targetPath, [options.codexHome, options.agentsHome]);
      const sourceConfig = path.join(options.codexHome, "config.toml");
      const templatePath = path.join(root, sourceRel);
      if (!fs.existsSync(sourceConfig) || !fs.existsSync(templatePath) || !fs.existsSync(targetPath)) {
        recordMissing(sourceRel, targetPath);
        return;
      }
      const rendered = spawnSync(process.execPath, [
        "scripts/merge-codex-config.mjs",
        "--render-mcp-profile",
        "--source", sourceConfig,
        "--template", templatePath,
        "--output", targetPath,
        "--dry-run"
      ], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        timeout: options.probeTimeoutMs
      });
      if (rendered.error || rendered.status !== 0 || fs.readFileSync(targetPath, "utf8") !== rendered.stdout) {
        recordMismatch(sourceRel, targetPath);
        return;
      }
      matchedFiles += 1;
    } catch (error) {
      failures.push(error.message);
      mismatched.push({ source: sourceRel, target: redact(targetPath), reason: "generated-profile-verification-failed" });
    }
  }

  const contract = runtimeInstallContract();
  const pluginMirrors = [];
  for (const action of contract.operations) {
    if (action.id === "codex-config" || ["write-ownership-marker", "write-marketplace", "refresh-plugin-cache"].includes(action.kind)) {
      continue;
    }
    if (action.kind === "copy-file") {
      if (action.id === "codex-rules") compareRulesBaseline(action.source, action.destination);
      else compareFile(action.source, action.destination);
      continue;
    }
    if (action.kind === "generate-mcp-profile") {
      compareGeneratedMcpProfile(action.source, action.destination);
      continue;
    }
    if (action.kind === "copy-directory") {
      const sourceRoot = path.join(root, action.source);
      const sourceFiles = listFilesRecursive(sourceRoot, { rejectLinks: true });
      for (const file of sourceFiles) {
        compareFile(posixPath(path.join(action.source, file)), path.join(action.destination, file));
      }
      if (["codex-plugin", "codex-plugin-marketplace-source"].includes(action.componentId)) {
        pluginMirrors.push({ target: action.destination, sourceFiles: new Set(sourceFiles) });
      }
    }
  }

  for (const mirror of pluginMirrors) {
    let mirrorFiles = [];
    try {
      assertManagedTargetPath(mirror.target, [options.codexHome, options.agentsHome]);
      mirrorFiles = listFilesRecursive(mirror.target, { rejectLinks: true });
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    for (const file of mirrorFiles) {
      if (!mirror.sourceFiles.has(file)) {
        const extraPath = path.join(mirror.target, file);
        extra.push(redact(extraPath));
        warnings.push(`Installed managed plugin mirror preserves an extra local file not present in source: ${redact(extraPath)}. Use repair --prune-managed-plugin-extras only after review.`);
      }
    }
  }

  return {
    expected: expectedFiles,
    matched: matchedFiles,
    mismatched,
    missing,
    extra
  };
}

function inspectConfigDrift(failures) {
  const template = path.join(
    root,
    "templates",
    "codex",
    process.platform === "win32" ? "config.windows.toml" : "config.unix.toml"
  );
  const destination = path.join(options.codexHome, "config.toml");
  if (!fs.existsSync(destination)) {
    return { inspected: false, status: "fail", reason: "config.toml missing" };
  }

  const result = run(process.execPath, [
    "scripts/merge-codex-config.mjs",
    template,
    destination,
    "--sync-managed-tables",
    "--dry-run",
    "--json"
  ], { timeout: 60000 });

  if (result.error) {
    failures.push(`Installed Codex config drift check could not run: ${result.error.message}`);
    return { inspected: false, status: "fail", error: result.error.message };
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    failures.push(`Installed Codex config drift check failed: ${output}`);
    return { inspected: true, status: "fail", exitCode: result.status };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (error) {
    failures.push(`Installed Codex config drift check did not emit parseable JSON: ${error.message}`);
    return { inspected: true, status: "fail", exitCode: result.status };
  }

  const drift = {
    addedRootKeys: parsed.addedRootKeys || [],
    addedTables: parsed.addedTables || [],
    removedDeprecatedFields: parsed.removedDeprecatedFields || [],
    updatedManagedFields: parsed.updatedManagedFields || [],
    updatedManagedTables: parsed.updatedManagedTables || []
  };
  const driftCount = Object.values(drift).reduce((count, values) => count + values.length, 0)
    + (parsed.fullTemplateInstall ? 1 : 0);

  if (driftCount > 0) {
    failures.push("Installed Codex config has managed drift; run `npm run repair:install -- --apply` to sync the safe automation template.");
  }

  return {
    inspected: true,
    status: driftCount > 0 ? "fail" : "ok",
    fullTemplateInstall: parsed.fullTemplateInstall === true,
    ...drift
  };
}

function inspectCodexRuntime(failures, warnings) {
  if (options.skipCodexCli || options.offline) {
    return { inspected: false, note: options.offline ? "Skipped by --offline." : "Skipped by --skip-codex-cli." };
  }

  let ambient = { inspected: false, note: "Skipped by default; use --ambient-doctor to compare the ambient CODEX_HOME." };
  if (options.ambientDoctor) {
    const ambientDoctor = runProbe("ambient codex doctor", codexCommand(), ["doctor", "--json"], { timeout: options.doctorTimeoutMs });
    if (ambientDoctor.error) {
      warnings.push(`Could not run ambient codex doctor --json: ${ambientDoctor.error.message}`);
      ambient = { inspected: false, error: ambientDoctor.error.message };
    } else {
      ambient = {
        inspected: true,
        ...parseCodexDoctorRuntime(ambientDoctor, warnings, "ambient codex doctor --json")
      };
      if (ambientDoctor.status !== 0) warnings.push(`Ambient codex doctor --json exited ${ambientDoctor.status}.`);
      if (ambient.activeHomeMatchesInstall === false) {
        warnings.push(
          `Ambient Codex runtime home differs from installed target; verifying with explicit CODEX_HOME=${redact(options.codexHome)}.`
        );
      }
    }
  }

  const installedEnv = { ...process.env, CODEX_HOME: options.codexHome };
  const doctor = options.skipDoctorProbe ? null : runProbe("installed-home codex doctor", codexCommand(), ["doctor", "--json"], {
    env: installedEnv,
    timeout: options.doctorTimeoutMs
  });
  const runtime = { inspected: false, ambient };
  if (options.skipDoctorProbe) {
    runtime.doctor = { inspected: false, note: "Skipped by --skip-doctor-probe." };
  } else if (doctor.error) {
    (options.requireLiveRuntime ? failures : warnings).push(`Could not run codex doctor --json with installed CODEX_HOME: ${doctor.error.message}`);
    runtime.error = doctor.error.message;
  } else {
    Object.assign(runtime, {
      inspected: true,
        ...parseCodexDoctorRuntime(doctor, warnings, "codex doctor --json with installed CODEX_HOME")
    });
    if (doctor.status !== 0) {
      (options.requireLiveRuntime ? failures : warnings).push(`Codex doctor --json with installed CODEX_HOME exited ${doctor.status}.`);
    }
  }

  if (runtime.activeHomeMatchesInstall === false) {
    failures.push(
      `Codex doctor with installed CODEX_HOME differs from installed Codex home: active=${runtime.activeCodexHome} installed=${redact(options.codexHome)}`
    );
  }

  if (options.noMcpProbe) {
    runtime.mcpList = { inspected: false, note: "Skipped by --no-mcp-probe." };
    return runtime;
  }
  const mcpList = runProbe("installed-home codex mcp list", codexCommand(), ["mcp", "list", "--json"], {
    env: installedEnv,
    timeout: options.mcpTimeoutMs
  });
  if (mcpList.error) {
    const message = `Could not run codex mcp list --json with installed CODEX_HOME: ${mcpList.error.message}`;
    (options.requireLiveRuntime ? failures : warnings).push(message);
    runtime.mcpList = { inspected: false, error: mcpList.error.message };
    return runtime;
  }

  if (mcpList.status !== 0) {
    const message = `codex mcp list --json with installed CODEX_HOME exited ${mcpList.status}.`;
    (options.requireLiveRuntime ? failures : warnings).push(message);
    runtime.mcpList = { inspected: false, exitCode: mcpList.status, error: message };
    return runtime;
  }

  runtime.inspected = true;
  try {
    const parsed = JSON.parse(mcpList.stdout || "[]");
    const servers = mcpEntriesFromParsed(parsed)
      .map((server) => server.name || server.id)
      .filter(Boolean)
      .sort();
    const expected = readJson("catalog/mcp-servers.json").servers.map((server) => server.name).sort();
    if (servers.length === 0 && expected.length > 0) {
      warnings.push(
        "codex mcp list --json returned no MCP servers despite a managed installed configuration; live MCP visibility is ambiguous in this process. Run codex mcp list --json directly outside the package runner before repairing."
      );
      runtime.mcpList = {
        inspected: true,
        exitCode: mcpList.status,
        servers: 0,
        missing: [],
        ambiguous: true
      };
      return runtime;
    }
    const actual = new Set(servers);
    const missing = expected.filter((server) => !actual.has(server));
    if (missing.length > 0) {
      failures.push(`codex mcp list with installed CODEX_HOME is missing: ${missing.join(", ")}`);
    }
    runtime.mcpList = {
      inspected: true,
      exitCode: mcpList.status,
      servers: servers.length,
      missing
    };
  } catch {
    warnings.push("codex mcp list --json with installed CODEX_HOME did not emit parseable JSON.");
    runtime.mcpList = { inspected: false, exitCode: mcpList.status };
  }

  return runtime;
}

function inspectPluginRuntime(failures, warnings) {
  if (options.offline || options.skipCodexCli) {
    return { inspected: false, note: "Skipped by offline or Codex CLI mode." };
  }

  const installedEnv = { ...process.env, CODEX_HOME: options.codexHome };
  const result = runProbe(
    "installed-home codex plugin list",
    codexCommand(),
    ["plugin", "list", "--available", "--json"],
    { env: installedEnv, timeout: options.probeTimeoutMs }
  );
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || `exit ${result.status}`;
    const message = `Could not inspect Codex Chef plugin state with installed CODEX_HOME: ${detail}`;
    (options.requireLiveRuntime ? failures : warnings).push(message);
    return { inspected: false, error: detail };
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    const entries = [
      ...(Array.isArray(parsed.installed) ? parsed.installed : []),
      ...(Array.isArray(parsed.available) ? parsed.available : [])
    ];
    const entry = entries.find((plugin) => plugin?.name === "codex-chef-workflows");
    if (!entry) {
      warnings.push(
        "Codex Chef plugin is neither installed nor discoverable in the active marketplace set; managed direct skills remain the guaranteed invocation path."
      );
      return { inspected: true, found: false, installed: false, enabled: false };
    }
    const expectedVersion = readJson("plugins/codex-chef-workflows/.codex-plugin/plugin.json").version;
    if (entry.installed !== true) {
      warnings.push(
        "Codex Chef plugin is discoverable but not installed; namespaced plugin calls require explicit installation and a new session."
      );
    } else if (entry.enabled !== true) {
      warnings.push("Codex Chef plugin is installed but disabled; namespaced plugin calls are unavailable.");
    }
    if (entry.installed === true && entry.version !== expectedVersion) {
      failures.push(
        `Installed Codex Chef plugin version drifted: expected ${expectedVersion}, got ${entry.version || "unknown"}.`
      );
    }
    return {
      inspected: true,
      found: true,
      installed: entry.installed === true,
      enabled: entry.enabled === true,
      version: entry.version || null,
      expectedVersion
    };
  } catch (error) {
    warnings.push(`codex plugin list --available --json did not emit parseable plugin state: ${error.message}`);
    return { inspected: false, error: error.message };
  }
}

function inspectSkills(failures, warnings) {
  const skillsCatalog = readJson("catalog/skills.json");
  const expectedEntries = skillsCatalog.skills
    .filter((skill) => skill.install === true || skill.directInstall === true)
    .sort((left, right) => left.name.localeCompare(right.name));
  const expected = expectedEntries.map((skill) => skill.name);

  if (!options.expectSkills) {
    return {
      inspected: false,
      expected: expected.length,
      note: "Use --expect-skills after running -All or -InstallSkills."
    };
  }

  const skillRoots = [
    path.join(options.codexHome, "skills"),
    path.join(options.agentsHome, "skills")
  ];
  const locations = new Map();
  for (const skillRoot of skillRoots) {
    if (!fs.existsSync(skillRoot)) continue;
    try {
      assertManagedTargetPath(skillRoot, [options.codexHome, options.agentsHome]);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const roots = locations.get(entry.name) || [];
      roots.push(skillRoot);
      locations.set(entry.name, roots);
    }
  }
  const actual = new Set(locations.keys());
  const missing = expected.filter((skill) => !actual.has(skill));
  const duplicates = [...locations.entries()]
    .filter(([, roots]) => roots.length > 1)
    .map(([name, roots]) => ({ name, roots: roots.map(redact) }));
  if (missing.length > 0) failures.push(`Curated global skills missing: ${missing.join(", ")}`);
  if (duplicates.length > 0) {
    failures.push(`Duplicate global skill names are visible across skill roots: ${duplicates.map((entry) => entry.name).join(", ")}`);
  }
  const invalid = [];
  for (const skill of expectedEntries) {
    const roots = locations.get(skill.name) || [];
    if (roots.length !== 1) continue;
    const target = path.join(roots[0], skill.name);
    try {
      assertManagedTargetPath(target, [options.codexHome, options.agentsHome]);
      const state = skill.install === true
        ? inspectPinnedSkillTarget(target, {
            package: skill.package,
            commit: skill.commit,
            skill: skill.skill,
            cliVersion: skillsCatalog.skillsCliVersion
          })
        : inspectSkillTree(target, skill.name);
      if (!state.valid) {
        invalid.push({ name: skill.name, reason: state.reason, path: redact(target) });
        failures.push(`Curated global skill is invalid: ${skill.name} (${state.reason}) at ${redact(target)}`);
      }
    } catch (error) {
      invalid.push({ name: skill.name, reason: error.message, path: redact(target) });
      failures.push(`Curated global skill could not be verified: ${skill.name} (${error.message})`);
    }
  }
  return {
    inspected: true,
    expected: expected.length,
    installed: actual.size,
    missing,
    invalidCount: invalid.length,
    invalid,
    duplicateCount: duplicates.length,
    duplicates,
    roots: skillRoots.map((skillRoot) => ({ path: redact(skillRoot), exists: fs.existsSync(skillRoot) }))
  };
}

function inspectGitGuards(failures) {
  if (!options.expectGitGuards) {
    return { inspected: false, note: "Use --expect-git-guards only after installing optional Git guards." };
  }

  const ignorePath = path.join(os.homedir(), ".gitignore_global");
  const hooksPath = path.join(os.homedir(), ".githooks");
  const hookPath = path.join(hooksPath, "pre-commit");
  for (const file of [ignorePath, hookPath]) {
    if (!fs.existsSync(file)) failures.push(`Optional Git guard file is missing: ${redact(file)}`);
  }

  const excludes = run("git", ["config", "--global", "--get", "core.excludesfile"]);
  const hooks = run("git", ["config", "--global", "--get", "core.hooksPath"]);
  const configuredExcludes = (excludes.stdout || "").trim();
  const configuredHooks = (hooks.stdout || "").trim();
  if (!sameFilesystemPath(configuredExcludes, ignorePath)) {
    failures.push("Global Git core.excludesfile does not point at the Codex Chef guard file.");
  }
  if (!sameFilesystemPath(configuredHooks, hooksPath)) {
    failures.push("Global Git core.hooksPath does not point at the Codex Chef hooks directory.");
  }

  return {
    inspected: true,
    excludesfile: redact(configuredExcludes),
    hooksPath: redact(configuredHooks)
  };
}

const failures = [];
const warnings = [];

const report = {
  probes,
  schemaVersion: "codex-chef.install-runtime.v1",
  generatedAt: new Date().toISOString(),
  installed: inspectInstalledFiles(failures),
  managedFiles: inspectManagedFileDrift(failures, warnings),
  configDrift: inspectConfigDrift(failures),
  runtime: inspectCodexRuntime(failures, warnings),
  plugin: inspectPluginRuntime(failures, warnings),
  skills: inspectSkills(failures, warnings),
  gitGuards: inspectGitGuards(failures),
  warnings,
  failures
};

report.status = failures.length > 0 ? "fail" : warnings.length > 0 ? "attention" : "ok";

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (!progressEnabled) console.log("Codex Chef install runtime verification");
  console.log(`Status: ${report.status}`);
  console.log(`Codex home: ${report.installed.codexHome}`);
  console.log(`Agents home: ${report.installed.agentsHome}`);
  console.log(`Agents: ${report.installed.agents.installed}/${report.installed.agents.expected}`);
  console.log(`MCP config: ${report.installed.mcp.installed}/${report.installed.mcp.expected}`);
  console.log(`Managed files: ${report.managedFiles.matched}/${report.managedFiles.expected} current`);
  if (report.runtime.inspected) {
    console.log(`Codex doctor home under test: ${report.runtime.activeCodexHome || "unknown"}`);
    console.log(`Installed CODEX_HOME matches target: ${report.runtime.activeHomeMatchesInstall}`);
    if (report.runtime.ambient?.inspected && report.runtime.ambient.activeHomeMatchesInstall === false) {
      console.log(`Ambient Codex home: ${report.runtime.ambient.activeCodexHome || "unknown"}`);
    }
    if (report.runtime.mcpList?.inspected) {
      console.log(`Runtime MCP list with installed CODEX_HOME: ${report.runtime.mcpList.servers} servers`);
    }
  }
  if (report.skills.inspected) {
    console.log(`Skills: ${report.skills.installed} listed, ${report.skills.missing.length} missing from curated install set`);
  }
  if (report.plugin.inspected) {
    console.log(`Plugin: installed=${report.plugin.installed} enabled=${report.plugin.enabled}`);
  }
  for (const warning of warnings) console.log(`Warning: ${warning}`);
  for (const failure of failures) console.error(`Failure: ${failure}`);
}

if (failures.length > 0) process.exit(1);
