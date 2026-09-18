#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scaledTimeout } from "./lib/test-timeouts.mjs";

const failures = [];
const fixtureCodexHome = path.resolve("tmp/nonexistent-codex-status-codex-home");
const fixtureAgentsHome = path.resolve("tmp/nonexistent-codex-status-agents-home");
const outputFixtureDir = path.resolve("tmp/validate-codex-status-output");
const statusSource = fs.readFileSync("scripts/codex-status.mjs", "utf8");

function fail(message) {
  failures.push(message);
}

if (!statusSource.includes("explicit invocation remains available only through an enabled copy")) {
  fail("codex status must not imply that a disabled skill remains explicitly invokable.");
}

function run(args, extra = {}) {
  return spawnSync(process.execPath, [
    "scripts/codex-status.mjs",
    "--codex-home",
    fixtureCodexHome,
    "--agents-home",
    fixtureAgentsHome,
    ...args
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: scaledTimeout(120000),
    windowsHide: true,
    env: extra.env || process.env
  });
}

function writeFakeCodexCommand() {
  const fixtureDir = path.resolve("tmp/validate-codex-status");
  fs.mkdirSync(fixtureDir, { recursive: true });
  if (process.platform === "win32") {
    const commandPath = path.join(fixtureDir, "fake-codex.cmd");
    fs.writeFileSync(commandPath, [
      "@echo off",
      "if \"%1\"==\"--strict-config\" echo codex-cli 0.140.0 C:\\\\Users\\\\codex-status-private\\\\AppData && exit /b 0",
      "if \"%1\"==\"login\" echo logged in from C:\\\\Users\\\\codex-status-private\\\\auth && exit /b 0",
      "if \"%1\"==\"mcp\" echo [{\"name\":\"fakeMcp\"}] && exit /b 0",
      "echo unexpected fake codex args %*",
      "exit /b 1",
      ""
    ].join("\r\n"), "utf8");
    return commandPath;
  }

  const commandPath = path.join(fixtureDir, "fake-codex.sh");
  fs.writeFileSync(commandPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--strict-config\" ]; then printf 'codex-cli 0.140.0 C:\\\\Users\\\\codex-status-private\\\\AppData\\n'; exit 0; fi",
    "if [ \"$1\" = \"login\" ]; then printf 'logged in from C:\\\\Users\\\\codex-status-private\\\\auth\\n'; exit 0; fi",
    "if [ \"$1\" = \"mcp\" ]; then printf '[{\"name\":\"fakeMcp\"}]\\n'; exit 0; fi",
    "printf 'unexpected fake codex args %s\\n' \"$*\"",
    "exit 1",
    ""
  ].join("\n"), "utf8");
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

function writeAmbientDriftCodexCommand() {
  const fixtureDir = path.resolve("tmp/validate-codex-status");
  fs.mkdirSync(fixtureDir, { recursive: true });
  const expectedServers = JSON.parse(fs.readFileSync(path.resolve("catalog/mcp-servers.json"), "utf8"))
    .servers
    .map((server) => ({ name: server.name }));
  const expectedServersPath = path.join(fixtureDir, "ambient-drift-target-mcp.json");
  const ambientServersPath = path.join(fixtureDir, "ambient-drift-ambient-mcp.json");
  fs.writeFileSync(expectedServersPath, `${JSON.stringify(expectedServers)}\n`, "utf8");
  fs.writeFileSync(ambientServersPath, `${JSON.stringify([{ name: "teststdio" }])}\n`, "utf8");

  if (process.platform === "win32") {
    const commandPath = path.join(fixtureDir, "ambient-drift-codex.cmd");
    fs.writeFileSync(commandPath, [
      "@echo off",
      "if \"%1\"==\"--strict-config\" echo codex-cli 0.142.0 && exit /b 0",
      "if \"%1\"==\"login\" echo Logged in && exit /b 0",
      `if "%1"=="mcp" if "%CODEX_HOME%"=="" type "${ambientServersPath}" && exit /b 0`,
      `if "%1"=="mcp" type "${expectedServersPath}" && exit /b 0`,
      "echo unexpected ambient drift fake codex args %*",
      "exit /b 1",
      ""
    ].join("\r\n"), "utf8");
    return commandPath;
  }

  const commandPath = path.join(fixtureDir, "ambient-drift-codex.sh");
  fs.writeFileSync(commandPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--strict-config\" ]; then printf 'codex-cli 0.142.0\\n'; exit 0; fi",
    "if [ \"$1\" = \"login\" ]; then printf 'Logged in\\n'; exit 0; fi",
    `if [ "$1" = "mcp" ] && [ -z "$CODEX_HOME" ]; then cat '${ambientServersPath.replaceAll("'", "'\\''")}'; exit 0; fi`,
    `if [ "$1" = "mcp" ]; then cat '${expectedServersPath.replaceAll("'", "'\\''")}'; exit 0; fi`,
    "printf 'unexpected ambient drift fake codex args %s\\n' \"$*\"",
    "exit 1",
    ""
  ].join("\n"), "utf8");
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

function writeAmbientMcpStateDriftCodexCommand() {
  const fixtureDir = path.resolve("tmp/validate-codex-status");
  fs.mkdirSync(fixtureDir, { recursive: true });
  const targetServersPath = path.join(fixtureDir, "ambient-state-drift-target-mcp.json");
  const ambientServersPath = path.join(fixtureDir, "ambient-state-drift-ambient-mcp.json");
  fs.writeFileSync(targetServersPath, `${JSON.stringify([{
    name: "sameMcp",
    enabled: true,
    auth_status: "authenticated"
  }])}\n`, "utf8");
  fs.writeFileSync(ambientServersPath, `${JSON.stringify([{
    name: "sameMcp",
    enabled: false,
    disabled_reason: "ambient-disabled",
    auth_status: "not_authenticated"
  }])}\n`, "utf8");

  if (process.platform === "win32") {
    const commandPath = path.join(fixtureDir, "ambient-state-drift-codex.cmd");
    fs.writeFileSync(commandPath, [
      "@echo off",
      "if \"%1\"==\"--strict-config\" echo codex-cli 0.142.0 && exit /b 0",
      "if \"%1\"==\"login\" echo Logged in && exit /b 0",
      `if "%1"=="mcp" if "%CODEX_HOME%"=="" type "${ambientServersPath}" && exit /b 0`,
      `if "%1"=="mcp" type "${targetServersPath}" && exit /b 0`,
      "echo unexpected ambient state drift fake codex args %*",
      "exit /b 1",
      ""
    ].join("\r\n"), "utf8");
    return commandPath;
  }

  const commandPath = path.join(fixtureDir, "ambient-state-drift-codex.sh");
  fs.writeFileSync(commandPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--strict-config\" ]; then printf 'codex-cli 0.142.0\\n'; exit 0; fi",
    "if [ \"$1\" = \"login\" ]; then printf 'Logged in\\n'; exit 0; fi",
    `if [ "$1" = "mcp" ] && [ -z "$CODEX_HOME" ]; then cat '${ambientServersPath.replaceAll("'", "'\\''")}'; exit 0; fi`,
    `if [ "$1" = "mcp" ]; then cat '${targetServersPath.replaceAll("'", "'\\''")}'; exit 0; fi`,
    "printf 'unexpected ambient state drift fake codex args %s\\n' \"$*\"",
    "exit 1",
    ""
  ].join("\n"), "utf8");
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

function writeNonzeroDoctorCodexCommand() {
  const fixtureDir = path.resolve("tmp/validate-codex-status");
  fs.mkdirSync(fixtureDir, { recursive: true });
  const doctorJson = JSON.stringify({
    overallStatus: "ok",
    codexVersion: "0.142.0",
    checks: {
      fixture: { id: "fixture", status: "ok", summary: "Fixture check passed." }
    }
  });

  if (process.platform === "win32") {
    const commandPath = path.join(fixtureDir, "nonzero-doctor-codex.cmd");
    fs.writeFileSync(commandPath, [
      "@echo off",
      "if \"%1\"==\"--strict-config\" echo codex-cli 0.142.0 && exit /b 0",
      "if \"%1\"==\"login\" echo Logged in && exit /b 0",
      "if \"%1\"==\"mcp\" echo [{\"name\":\"fakeMcp\",\"enabled\":true}] && exit /b 0",
      `if "%1"=="doctor" echo ${doctorJson} && exit /b 9`,
      "echo unexpected nonzero doctor fake codex args %*",
      "exit /b 1",
      ""
    ].join("\r\n"), "utf8");
    return commandPath;
  }

  const commandPath = path.join(fixtureDir, "nonzero-doctor-codex.sh");
  fs.writeFileSync(commandPath, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--strict-config\" ]; then printf 'codex-cli 0.142.0\\n'; exit 0; fi",
    "if [ \"$1\" = \"login\" ]; then printf 'Logged in\\n'; exit 0; fi",
    "if [ \"$1\" = \"mcp\" ]; then printf '[{\"name\":\"fakeMcp\",\"enabled\":true}]\\n'; exit 0; fi",
    `if [ "$1" = "doctor" ]; then printf '%s\\n' '${doctorJson.replaceAll("'", "'\\''")}'; exit 9; fi`,
    "printf 'unexpected nonzero doctor fake codex args %s\\n' \"$*\"",
    "exit 1",
    ""
  ].join("\n"), "utf8");
  fs.chmodSync(commandPath, 0o755);
  return commandPath;
}

const jsonResult = run(["--json", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks"]);
if (jsonResult.error) {
  fail(`codex status JSON validation could not run: ${jsonResult.error.message}`);
} else if (jsonResult.status !== 0) {
  fail(`codex status JSON validation exited ${jsonResult.status}: ${(jsonResult.stderr || jsonResult.stdout).trim()}`);
}

const repoOnlyResult = run(["--json", "--redact-paths", "--repo-only"]);
if (repoOnlyResult.error) {
  fail(`codex status repo-only alias validation could not run: ${repoOnlyResult.error.message}`);
} else if (repoOnlyResult.status !== 0) {
  fail(`codex status repo-only alias exited ${repoOnlyResult.status}: ${(repoOnlyResult.stderr || repoOnlyResult.stdout).trim()}`);
} else {
  try {
    const repoOnly = JSON.parse(repoOnlyResult.stdout);
    if (repoOnly.runtime?.status !== "skipped") fail("codex status --repo-only must skip installed runtime checks.");
    if (repoOnly.codexDoctor?.status !== "skipped") fail("codex status --repo-only must skip direct Codex doctor checks.");
    if (repoOnly.codexCliRuntime?.status !== "skipped") fail("codex status --repo-only must skip Codex CLI probes.");
  } catch (error) {
    fail(`codex status repo-only alias did not emit parseable JSON: ${error.message}`);
  }
}

const plainCompatResult = run(["--json", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks", "--plain", "--plain-output", "--no-log"]);
if (plainCompatResult.error) {
  fail(`codex status plain/no-log compatibility validation could not run: ${plainCompatResult.error.message}`);
} else if (plainCompatResult.status !== 0) {
  fail(`codex status must accept shared Chef CLI plain/no-log flags: ${(plainCompatResult.stderr || plainCompatResult.stdout).trim()}`);
}

const outputFixtureId = `${process.pid}-${Date.now()}`;
const insideOutputRel = `tmp/validate-codex-status-output/status-${outputFixtureId}.json`;
const insideOutputResult = run(["--json", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks", "--output", insideOutputRel]);
if (insideOutputResult.error) {
  fail(`codex status --output inside repo could not run: ${insideOutputResult.error.message}`);
} else if (insideOutputResult.status !== 0) {
  fail(`codex status --output inside repo exited ${insideOutputResult.status}: ${(insideOutputResult.stderr || insideOutputResult.stdout).trim()}`);
} else if (!fs.existsSync(path.resolve(insideOutputRel))) {
  fail("codex status --output must write JSON reports inside the repository.");
} else {
  try {
    const writtenReport = JSON.parse(fs.readFileSync(path.resolve(insideOutputRel), "utf8"));
    if (writtenReport.schemaVersion !== "agentchef.status.v1") {
      fail("codex status --output must write the status JSON report.");
    }
  } catch (error) {
    fail(`codex status --output report was not parseable JSON: ${error.message}`);
  }
}

fs.mkdirSync(outputFixtureDir, { recursive: true });
const existingOutputRel = `tmp/validate-codex-status-output/existing-${outputFixtureId}.json`;
fs.writeFileSync(path.resolve(existingOutputRel), "{\"existing\":true}\n", "utf8");
const existingOutputResult = run(["--json", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks", "--output", existingOutputRel]);
if (existingOutputResult.error) {
  fail(`codex status --output existing-file check could not run: ${existingOutputResult.error.message}`);
} else if (existingOutputResult.status === 0) {
  fail("codex status --output must refuse existing reports unless --force-output is used.");
} else if (!String(existingOutputResult.stderr || existingOutputResult.stdout).includes("Refusing to overwrite existing report without --force-output")) {
  fail("codex status --output existing-file refusal must explain --force-output.");
}

const outsideOutputResult = run(["--json", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks", "--output", "../codex-status-outside.json"]);
if (outsideOutputResult.error) {
  fail(`codex status --output outside-repo check could not run: ${outsideOutputResult.error.message}`);
} else if (outsideOutputResult.status === 0) {
  fail("codex status --output must refuse paths outside the repository.");
} else if (!String(outsideOutputResult.stderr || outsideOutputResult.stdout).includes("Refusing to write status report outside repository")) {
  fail("codex status --output outside-repo refusal must explain the repository boundary.");
}

let report;
if (failures.length === 0) {
  try {
    report = JSON.parse(jsonResult.stdout);
  } catch (error) {
    fail(`codex status did not emit parseable JSON: ${error.message}`);
  }
}

if (report) {
  if (report.schemaVersion !== "agentchef.status.v1") {
    fail("codex status schemaVersion drifted.");
  }
  if (!["ok", "attention", "fail"].includes(report.status)) {
    fail(`codex status has unexpected status: ${report.status}`);
  }
  if (report.repoDoctor?.status !== "ok") {
    fail(`codex status repoDoctor must be ok in repo-only validation, got ${report.repoDoctor?.status}.`);
  }
  if (report.runtime?.status !== "skipped") {
    fail("codex status validation should skip installed runtime checks.");
  }
  if (report.codexDoctor?.status !== "skipped") {
    fail("codex status validation should skip direct Codex doctor checks.");
  }
  if (report.skillsContext?.documentedBudget?.includes("2%") !== true) {
    fail("codex status must explain the documented skills context budget.");
  }
  if (report.routingBoard?.profileCount < 10) {
    fail("codex status must include the enterprise routing board profile count.");
  }
  if (!report.routingBoard?.requiredSurfaces?.agents?.includes("context_architect")) {
    fail("codex status routing board must include context_architect in required agent surfaces.");
  }
  if (!report.routingBoard?.requiredSurfaces?.mcp?.includes("openaiDeveloperDocs")) {
    fail("codex status routing board must include OpenAI Docs MCP in required MCP surfaces.");
  }
  if (!report.routingBoard?.boundary?.includes("subagent spawning still requires the current runtime to permit delegation")) {
    fail("codex status routing board must preserve the runtime-bounded subagent boundary.");
  }
  if (!report.routingBoard?.boundary?.includes("graph-indexing")) {
    fail("codex status routing board must include graph-indexing in the approval boundary.");
  }
  if (!report.mcpSetupBoard || report.mcpSetupBoard.serverCount !== 16) {
    fail("codex status must include the MCP setup board with all 16 servers.");
  }
  if (!Array.isArray(report.mcpSetupBoard.servers) || !report.mcpSetupBoard.servers.some((server) => server.name === "supabase" && server.setupKind === "oauth" && String(server.setupHint || "").includes("project_ref") && String(server.setupHint || "").includes("read_only=true"))) {
    fail("codex status MCP setup board must explain project-scoped, read-only Supabase OAuth setup.");
  }
  if (report.effectiveControls?.features?.multiAgent !== true) {
    fail("codex status must report that multi-agent routing is enabled in effective controls.");
  }
  if (report.effectiveControls?.agents?.maxDepth !== 2) {
    fail("codex status effective controls must report the bounded subagent depth.");
  }
  if (!report.effectiveControls?.contextBudget?.longRunningRecommendation?.includes("token-safe.config.toml")) {
    fail("codex status must report token-safe context-budget guidance.");
  }
  if (report.effectiveControls?.contextBudget?.tokenSafeProfileAvailable !== true) {
    fail("codex status must confirm the token-safe profile is available.");
  }
  if (typeof report.effectiveControls?.contextBudget?.tokenSafeProfileActive !== "boolean") {
    fail("codex status must report whether the token-safe profile is active.");
  }
  if (report.effectiveControls?.appsDefault?.enabled !== false) {
    fail("codex status effective controls must report app connectors disabled by default.");
  }
  if (report.effectiveControls?.appsDefault?.destructiveEnabled !== false) {
    fail("codex status effective controls must report destructive app tools disabled by default.");
  }
  if (!Array.isArray(report.nextActions) || report.nextActions.length === 0) {
    fail("codex status must include nextActions.");
  }
  if (report.cliQuickStart?.interactiveMenu !== "npm run chef") {
    fail("codex status must include the interactive Chef CLI entrypoint.");
  }
  if (!report.codexCliRuntime?.target?.codexHome) {
    fail("codex status must include the explicit target CODEX_HOME under test.");
  }
  if (!report.codexCliRuntime?.ambient?.inspected) {
    fail("codex status must include ambient Codex CLI status so shell drift is visible.");
  }
  if (!["same", "different", "unknown"].includes(report.codexCliRuntime?.ambient?.relationshipToTarget)) {
    fail("codex status ambient relationship must be same, different, or unknown.");
  }
  for (const command of [
    "npm run chef -- --status",
    "npm run chef -- --doctor",
    "npm run chef -- --update",
    "npm run chef -- --mcp",
    "npm run chef -- --logs"
  ]) {
    if (!report.cliQuickStart?.readOnlyCommands?.includes(command)) {
      fail(`codex status quick start missing read-only command: ${command}`);
    }
  }
  if (report.cliQuickStart?.numberedActions !== true) {
    fail("codex status must document numbered interactive actions.");
  }
  if (!String(report.cliQuickStart?.boundary || "").includes("Update, install")) {
    fail("codex status quick start boundary must mention update as an apply-gated write path.");
  }
  if (!report.gitRepository?.inspected) {
    fail("codex status must inspect Git repository health.");
  }
  if (!["ok", "attention", "fail"].includes(report.gitRepository?.status)) {
    fail(`codex status Git repository health has unexpected status: ${report.gitRepository?.status}`);
  }
  if ((report.gitRepository?.dirtyLineCount || 0) > 0 && report.gitRepository.status === "ok") {
    fail("codex status must report dirty Git worktrees as attention, not ok.");
  }
  if ((report.gitRepository?.dirtyLineCount || 0) > 0 && report.status === "ok") {
    fail("codex status overall status must not be ok while the Git worktree is dirty.");
  }
  if (!report.logSummary?.inspected) {
    fail("codex status must include a log summary.");
  }
  if (!Array.isArray(report.logSummary?.repoCliLogs?.recent)) {
    fail("codex status log summary must include recent repo CLI logs.");
  }
  if (report.logSummary?.repoCliLogs?.contentInspected !== false) {
    fail("codex status must not inspect repo CLI log contents.");
  }
  if (!Array.isArray(report.logSummary?.codexLogs?.recent)) {
    fail("codex status log summary must include recent Codex log metadata.");
  }
  if (report.logSummary?.codexLogs?.contentInspected !== false) {
    fail("codex status must not inspect Codex log contents.");
  }
}

const fakeCodexCommand = writeFakeCodexCommand();
const fakeCodexResult = run([
  "--json",
  "--redact-paths",
  "--skip-runtime",
  "--skip-codex-doctor-checks"
], {
  env: {
    ...process.env,
    CODEX_STATUS_CODEX_COMMAND: fakeCodexCommand
  }
});
if (fakeCodexResult.error) {
  fail(`codex status fake Codex validation could not run: ${fakeCodexResult.error.message}`);
} else if (fakeCodexResult.status !== 0 && fakeCodexResult.status !== 1) {
  fail(`codex status fake Codex validation exited ${fakeCodexResult.status}: ${(fakeCodexResult.stderr || fakeCodexResult.stdout).trim()}`);
} else {
  const serialized = fakeCodexResult.stdout;
  try {
    const fakeReport = JSON.parse(fakeCodexResult.stdout);
    if (!fakeReport.codexCliRuntime?.mcp?.configuredServers?.includes("fakeMcp")) {
      fail("codex status fake Codex validation must use CODEX_STATUS_CODEX_COMMAND.");
    }
    const fakeMcpState = fakeReport.codexCliRuntime?.mcp?.states?.find((server) => server.name === "fakeMcp");
    if (!fakeMcpState || typeof fakeMcpState.enabled !== "boolean") {
      fail("codex status fake Codex validation must expose safe MCP enabled/disabled state.");
    }
    if ("transport" in fakeMcpState || "env" in fakeMcpState) {
      fail("codex status MCP state must not expose transport or environment configuration.");
    }
  } catch (error) {
    fail(`codex status fake Codex validation did not emit parseable JSON: ${error.message}`);
  }
  if (serialized.includes("codex-status-private") || serialized.includes("C:\\\\Users\\\\codex-status-private")) {
    fail("codex status --redact-paths must redact escaped Windows user profile paths in command previews.");
  }
}

const ambientDriftCodexCommand = writeAmbientDriftCodexCommand();
const ambientDriftResult = run([
  "--json",
  "--redact-paths",
  "--skip-runtime",
  "--skip-codex-doctor-checks"
], {
  env: {
    ...process.env,
    CODEX_STATUS_CODEX_COMMAND: ambientDriftCodexCommand,
    CODEX_HOME: ""
  }
});
if (ambientDriftResult.error) {
  fail(`codex status ambient drift validation could not run: ${ambientDriftResult.error.message}`);
} else if (ambientDriftResult.status !== 0) {
  fail(`codex status ambient drift validation exited ${ambientDriftResult.status}: ${(ambientDriftResult.stderr || ambientDriftResult.stdout).trim()}`);
} else {
  try {
    const driftReport = JSON.parse(ambientDriftResult.stdout);
    if (driftReport.codexCliRuntime?.status !== "ok") {
      fail("codex status Codex CLI summary must stay ok when target checks pass and only ambient status differs.");
    }
    if (driftReport.codexCliRuntime?.ambient?.relationshipToTarget !== "different") {
      fail("codex status ambient drift validation must keep the ambient relationship visible as different.");
    }
    if (!Array.isArray(driftReport.warnings) || !driftReport.warnings.some((warning) => warning.includes("Ambient Codex CLI status differs"))) {
      fail("codex status ambient drift validation must report ambient drift as a warning.");
    }
    if (Array.isArray(driftReport.attentionReasons) && driftReport.attentionReasons.some((reason) => reason.includes("Ambient Codex CLI status differs"))) {
      fail("codex status ambient drift validation must not turn ambient drift warnings into attention reasons.");
    }
  } catch (error) {
    fail(`codex status ambient drift validation did not emit parseable JSON: ${error.message}`);
  }
}

const ambientMcpStateDriftCodexCommand = writeAmbientMcpStateDriftCodexCommand();
const ambientMcpStateDriftResult = run([
  "--json",
  "--redact-paths",
  "--skip-runtime",
  "--skip-codex-doctor-checks"
], {
  env: {
    ...process.env,
    CODEX_STATUS_CODEX_COMMAND: ambientMcpStateDriftCodexCommand,
    CODEX_HOME: ""
  }
});
if (ambientMcpStateDriftResult.error) {
  fail(`codex status ambient MCP state drift validation could not run: ${ambientMcpStateDriftResult.error.message}`);
} else if (ambientMcpStateDriftResult.status !== 0) {
  fail(`codex status ambient MCP state drift validation exited ${ambientMcpStateDriftResult.status}: ${(ambientMcpStateDriftResult.stderr || ambientMcpStateDriftResult.stdout).trim()}`);
} else {
  try {
    const stateDriftReport = JSON.parse(ambientMcpStateDriftResult.stdout);
    if (stateDriftReport.codexCliRuntime?.ambient?.relationshipToTarget !== "different") {
      fail("codex status must report target/ambient MCP state drift even when configured server names match.");
    }
    if (!Array.isArray(stateDriftReport.warnings) || !stateDriftReport.warnings.some((warning) => warning.includes("Ambient Codex CLI status differs"))) {
      fail("codex status must make target/ambient MCP state drift visible as a warning.");
    }
  } catch (error) {
    fail(`codex status ambient MCP state drift validation did not emit parseable JSON: ${error.message}`);
  }
}

const nonzeroDoctorCodexCommand = writeNonzeroDoctorCodexCommand();
const nonzeroDoctorResult = run([
  "--json",
  "--redact-paths",
  "--skip-runtime",
  "--skip-codex-cli"
], {
  env: {
    ...process.env,
    CODEX_STATUS_CODEX_COMMAND: nonzeroDoctorCodexCommand
  }
});
if (nonzeroDoctorResult.error) {
  fail(`codex status nonzero doctor validation could not run: ${nonzeroDoctorResult.error.message}`);
} else if (nonzeroDoctorResult.status !== 0) {
  fail(`codex status nonzero doctor validation exited ${nonzeroDoctorResult.status}: ${(nonzeroDoctorResult.stderr || nonzeroDoctorResult.stdout).trim()}`);
} else {
  try {
    const nonzeroDoctorReport = JSON.parse(nonzeroDoctorResult.stdout);
    if (nonzeroDoctorReport.codexDoctor?.exitCode !== 9) {
      fail("codex status must preserve the nonzero codex doctor exit code.");
    }
    if (nonzeroDoctorReport.codexDoctor?.status !== "attention") {
      fail("codex status must not report codex doctor as ok after a nonzero exit code.");
    }
    if (!Array.isArray(nonzeroDoctorReport.attentionReasons)
      || !nonzeroDoctorReport.attentionReasons.some((reason) => reason.includes("exited 9"))) {
      fail("codex status must explain the nonzero codex doctor exit code in attention reasons.");
    }
  } catch (error) {
    fail(`codex status nonzero doctor validation did not emit parseable JSON: ${error.message}`);
  }
}

const foreignCwd = path.resolve("tmp/validate-codex-doctor-foreign-cwd");
fs.mkdirSync(foreignCwd, { recursive: true });
const doctorFromForeignCwd = spawnSync(process.execPath, [
  path.resolve("scripts/codex-doctor.mjs"),
  "--json",
  "--redact-paths"
], {
  cwd: foreignCwd,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: scaledTimeout(120000),
  windowsHide: true
});
if (doctorFromForeignCwd.error) {
  fail(`codex doctor foreign-cwd validation could not run: ${doctorFromForeignCwd.error.message}`);
} else if (doctorFromForeignCwd.status !== 0) {
  fail(`codex doctor must resolve its repository from the script location, not process.cwd(): ${(doctorFromForeignCwd.stderr || doctorFromForeignCwd.stdout).trim()}`);
} else {
  try {
    const foreignCwdReport = JSON.parse(doctorFromForeignCwd.stdout);
    const expectedPackageName = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).name;
    if (foreignCwdReport.status !== "ok" || foreignCwdReport.repo?.packageName !== expectedPackageName) {
      fail("codex doctor foreign-cwd validation must inspect the AgentChef repository.");
    }
  } catch (error) {
    fail(`codex doctor foreign-cwd validation did not emit parseable JSON: ${error.message}`);
  }
}

const missingCodexCommand = path.join(path.resolve("tmp/validate-codex-status"), process.platform === "win32" ? "missing-codex.cmd" : "missing-codex");
const missingCodexResult = run([
  "--json",
  "--redact-paths",
  "--skip-runtime",
  "--skip-codex-doctor-checks"
], {
  env: {
    ...process.env,
    CODEX_STATUS_CODEX_COMMAND: missingCodexCommand
  }
});
if (missingCodexResult.error) {
  fail(`codex status missing Codex validation could not run: ${missingCodexResult.error.message}`);
} else if (missingCodexResult.status !== 0) {
  fail(`codex status missing Codex validation exited ${missingCodexResult.status}: ${(missingCodexResult.stderr || missingCodexResult.stdout).trim()}`);
} else {
  try {
    const missingReport = JSON.parse(missingCodexResult.stdout);
    if (missingReport.codexCliRuntime?.status !== "attention") {
      fail("codex status missing Codex validation must report Codex CLI attention.");
    }
    if (missingReport.codexCliRuntime?.ambient?.inspected !== true) {
      fail("codex status missing Codex validation must keep ambient status visible.");
    }
    if (!["same", "unknown"].includes(missingReport.codexCliRuntime?.ambient?.relationshipToTarget)) {
      fail("codex status missing Codex validation must not report a target/ambient drift when the configured Codex command is unavailable.");
    }
    if (missingReport.codexCliRuntime?.ambient?.login?.status !== "attention") {
      fail("codex status missing Codex validation must surface ambient login attention.");
    }
  } catch (error) {
    fail(`codex status missing Codex validation did not emit parseable JSON: ${error.message}`);
  }
}

const textResult = run(["--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks"]);
if (textResult.error) {
  fail(`codex status text validation could not run: ${textResult.error.message}`);
} else if (textResult.status !== 0) {
  fail(`codex status text validation exited ${textResult.status}: ${(textResult.stderr || textResult.stdout).trim()}`);
} else {
  for (const required of ["AgentChef status", "Overall:", "Repo Git:", "Installed runtime:", "Skills:", "MCP:", "Codex CLI:", "Codex doctor checks:", "Next action:"]) {
    if (!textResult.stdout.includes(required)) fail(`codex status text output missing: ${required}`);
  }
  for (const hiddenByDefault of ["Target Codex home:", "Ambient Codex:", "Enterprise routing:", "Effective controls:", "Context budget:", "Token-safe profile:", "MCP setup note:"]) {
    if (textResult.stdout.includes(hiddenByDefault)) {
      fail(`codex status compact text output must reserve this surface for --details: ${hiddenByDefault}`);
    }
  }
  if (!textResult.stdout.includes("[status] running repo:doctor")) {
    fail("codex status text output should label the repository doctor as repo:doctor.");
  }
  if (textResult.stdout.includes("[status] running codex:doctor")) {
    fail("codex status repo-only output must not imply direct Codex CLI doctor checks are running.");
  }
  if (!textResult.stdout.includes("npm run chef -- --status --repo-only --details --no-log")) {
    fail("codex status repo-only output must preserve the repo-only boundary in its details command.");
  }
}

const detailedTextResult = run(["--details", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks"]);
if (detailedTextResult.error) {
  fail(`codex status detailed text validation could not run: ${detailedTextResult.error.message}`);
} else if (detailedTextResult.status !== 0) {
  fail(`codex status detailed text validation exited ${detailedTextResult.status}: ${(detailedTextResult.stderr || detailedTextResult.stdout).trim()}`);
} else {
  for (const required of ["Use:", "Numbered menu:", "Target Codex home:", "Ambient Codex:", "Logs:", "Repo starter:", "Skills context:", "Enterprise routing:", "Effective controls:", "Context budget:", "Token-safe profile: available=", "active=", "target=low/none/low/64000/6000", "MCP setup:", "MCP setup note: serena", "MCP setup note: codebase-memory", "MCP setup note: supabase"]) {
    if (!detailedTextResult.stdout.includes(required)) fail(`codex status detailed text output missing: ${required}`);
  }
}

const turkishTextResult = run(["--tr", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks"]);
if (turkishTextResult.error) {
  fail(`codex status Turkish text validation could not run: ${turkishTextResult.error.message}`);
} else if (turkishTextResult.status !== 0) {
  fail(`codex status Turkish text validation exited ${turkishTextResult.status}: ${(turkishTextResult.stderr || turkishTextResult.stdout).trim()}`);
} else {
  for (const required of ["AgentChef durumu", "Genel:", "Kurulu ortam:", "Skill'ler:", "MCP:", "Codex doctor kontrolleri:", "Sonraki adım:"]) {
    if (!turkishTextResult.stdout.includes(required)) fail(`codex status Turkish text output missing: ${required}`);
  }
  for (const asciiWording of ["Kullanim", "Numarali menu", "calisiyor", "zaman siniri", "atlandi", "kaydi", "yonetilen dosyalar"]) {
    if (turkishTextResult.stdout.includes(asciiWording)) {
      fail(`codex status Turkish text output must use natural Turkish spelling instead of: ${asciiWording}`);
    }
  }
}

const turkishDetailedTextResult = run(["--details", "--tr", "--redact-paths", "--skip-runtime", "--skip-codex-doctor-checks"]);
if (turkishDetailedTextResult.error) {
  fail(`codex status Turkish detailed text validation could not run: ${turkishDetailedTextResult.error.message}`);
} else if (turkishDetailedTextResult.status !== 0) {
  fail(`codex status Turkish detailed text validation exited ${turkishDetailedTextResult.status}: ${(turkishDetailedTextResult.stderr || turkishDetailedTextResult.stdout).trim()}`);
} else {
  for (const required of ["Kullanım:", "Numaralı menü:", "Context bütçesi:", "Token-safe profil:", "MCP kurulum notu: codebase-memory", "İlk çalışmada Node/npx paket indirmesi gerekir"]) {
    if (!turkishDetailedTextResult.stdout.includes(required)) fail(`codex status Turkish detailed text output missing: ${required}`);
  }
  if (turkishTextResult.stdout.includes("Requires Node/npx first-run package download")) {
    fail("codex status Turkish text output must translate the codebase-memory setup hint.");
  }
  if (turkishTextResult.stdout.includes("Skipped installed/global skill roots because installed-runtime and live Codex CLI probes are disabled.")) {
    fail("codex status Turkish text output must translate skipped skill inventory notes.");
  }
}

const routingResult = spawnSync(process.execPath, ["scripts/codex-routing-board.mjs", "--json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  timeout: scaledTimeout(120000),
  windowsHide: true
});
if (routingResult.error) {
  fail(`codex routing JSON validation could not run: ${routingResult.error.message}`);
} else if (routingResult.status !== 0) {
  fail(`codex routing JSON validation exited ${routingResult.status}: ${(routingResult.stderr || routingResult.stdout).trim()}`);
} else {
  try {
    const routing = JSON.parse(routingResult.stdout);
    if (routing.schemaVersion !== "agentchef.routing.v2") fail("codex routing schemaVersion drifted.");
    if (routing.profileCount < 10) fail("codex routing must include at least 10 profiles.");
    if (routing.delegationPolicy?.mode !== "conditional") {
      fail("codex routing must preserve conditional delegation policy.");
    }
    if (routing.agentRuntimePolicy?.neverOverrideUserProfile !== true) {
      fail("codex routing must preserve active user profile choices.");
    }
  } catch (error) {
    fail(`codex routing did not emit parseable JSON: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error("Codex status validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Codex status validation passed.");
