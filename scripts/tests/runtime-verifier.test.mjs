import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveInstallContract } from "../lib/install-contract.mjs";
import { writeDirectSkillMarker } from "../manage-direct-skill-target.mjs";
import { writeMarketplaceEntry } from "../upsert-marketplace-entry.mjs";
import { scaledTimeout } from "../lib/test-timeouts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let baselineFixtureRoot = null;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: scaledTimeout(300000),
    windowsHide: true,
    ...options
  });
}

function buildRuntimeFixture(codexHome, agentsHome) {
  const fixtureRoot = path.dirname(codexHome);
  const contract = resolveInstallContract({
    root,
    platform: process.platform === "win32" ? "windows" : "unix",
    codexHome,
    agentsHome,
    home: fixtureRoot
  });

  for (const action of contract.operations) {
    const source = action.source && path.join(root, action.source);
    if (action.kind === "copy-file") {
      fs.mkdirSync(path.dirname(action.destination), { recursive: true });
      fs.copyFileSync(source, action.destination);
    } else if (action.kind === "copy-directory") {
      fs.cpSync(source, action.destination, { recursive: true, force: false, errorOnExist: true });
    } else if (action.kind === "generate-mcp-profile") {
      const rendered = run(process.execPath, [
        "scripts/merge-codex-config.mjs",
        "--render-mcp-profile",
        "--source", action.configSource,
        "--template", source,
        "--output", action.destination
      ]);
      assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
    } else if (action.kind === "write-ownership-marker") {
      writeDirectSkillMarker(source, path.dirname(action.destination));
    } else if (action.kind === "write-marketplace") {
      writeMarketplaceEntry(action.destination, action.pluginTarget);
    }
  }
}

function installFixture(codexHome, agentsHome) {
  if (!baselineFixtureRoot) {
    process.stderr.write("[runtime-verifier] building reusable installed fixture baseline\n");
    baselineFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-baseline-"));
    const baselineCodexHome = path.join(baselineFixtureRoot, ".codex");
    const baselineAgentsHome = path.join(baselineFixtureRoot, ".agents");
    buildRuntimeFixture(baselineCodexHome, baselineAgentsHome);
    process.stderr.write("[runtime-verifier] reusable installed fixture baseline ready\n");
  }
  fs.cpSync(path.join(baselineFixtureRoot, ".codex"), codexHome, { recursive: true, force: false, errorOnExist: true });
  fs.cpSync(path.join(baselineFixtureRoot, ".agents"), agentsHome, { recursive: true, force: false, errorOnExist: true });
}

test.after(() => {
  if (baselineFixtureRoot) fs.rmSync(baselineFixtureRoot, { recursive: true, force: true });
});

function verifyOffline(codexHome, agentsHome) {
  return run(process.execPath, [
    "scripts/verify-install-runtime.mjs",
    "--json",
    "--offline",
    "--codex-home", codexHome,
    "--agents-home", agentsHome
  ]);
}

test("runtime verifier help documents its effective timeout defaults", () => {
  const result = run(process.execPath, ["scripts/verify-install-runtime.mjs", "--help"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /--probe-timeout-ms <n>\s+Default timeout for non-live helper probes \(default: 30000\)/);
  assert.match(result.stdout, /--doctor-timeout-ms <n>\s+Per-doctor timeout \(default: 12000\)/);
  assert.match(result.stdout, /--mcp-timeout-ms <n>\s+MCP list timeout \(default: 15000\)/);
});

test("runtime fixture builder produces a self-contained installed baseline", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-fixture-builder-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    buildRuntimeFixture(codexHome, agentsHome);

    const result = verifyOffline(codexHome, agentsHome);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function writeEmptyMcpCodex(binDir, codexHome) {
  const escapedHome = fs.realpathSync.native(codexHome).replaceAll("\\", "\\\\");
  if (process.platform === "win32") {
    const command = path.join(binDir, "codex.cmd");
    fs.writeFileSync(command, [
      "@echo off",
      `if \"%1\"==\"doctor\" echo {\"checks\":{\"config.load\":{\"details\":{\"CODEX_HOME\":\"${escapedHome}\",\"config.toml\":\"${escapedHome}\\\\config.toml\"}}}} & exit /b 0`,
      "if \"%1\"==\"mcp\" echo [] & exit /b 0",
      "if \"%1\"==\"plugin\" echo {\"installed\":[],\"available\":[]} & exit /b 0",
      "exit /b 1",
      ""
    ].join("\r\n"), "utf8");
    return;
  }
  const command = path.join(binDir, "codex");
  fs.writeFileSync(command, [
    "#!/bin/sh",
    `if [ \"$1\" = \"doctor\" ]; then printf '%s\\n' '{\"checks\":{\"config.load\":{\"details\":{\"CODEX_HOME\":\"${escapedHome}\",\"config.toml\":\"${escapedHome}/config.toml\"}}}}'; exit 0; fi`,
    "if [ \"$1\" = \"mcp\" ]; then printf '[]\\n'; exit 0; fi",
    "if [ \"$1\" = \"plugin\" ]; then printf '{\"installed\":[],\"available\":[]}\\n'; exit 0; fi",
    "exit 1",
    ""
  ].join("\n"), "utf8");
  fs.chmodSync(command, 0o755);
}

test("runtime verifier treats an empty live MCP list as ambiguous when managed config is present", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-verifier-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    const binDir = path.join(fixtureRoot, "bin");
    fs.mkdirSync(binDir);
    installFixture(codexHome, agentsHome);
    writeEmptyMcpCodex(binDir, codexHome);

    const probeEnv = { ...process.env, CODEX_HOME: codexHome, AGENTS_HOME: agentsHome };
    for (const key of Object.keys(probeEnv)) {
      if (key.toLowerCase() === "path") delete probeEnv[key];
    }
    probeEnv[process.platform === "win32" ? "Path" : "PATH"] = `${binDir}${path.delimiter}${process.env.Path || process.env.PATH || ""}`;
    const result = run(process.execPath, [
      "scripts/verify-install-runtime.mjs",
      "--json",
      "--require-live-runtime",
      "--codex-home", codexHome,
      "--agents-home", agentsHome
    ], {
      env: probeEnv
    });

    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.runtime.mcpList.missing, []);
    assert.equal(
      report.failures.some((failure) => failure.startsWith("codex mcp list with installed CODEX_HOME is missing:")),
      false
    );
    assert.match(report.warnings.join("\n"), /returned no MCP servers despite a managed installed configuration/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("strict live runtime fails when the installed-home doctor times out", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-slow-doctor-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    const binDir = path.join(fixtureRoot, "bin");
    fs.mkdirSync(binDir);
    installFixture(codexHome, agentsHome);
    const command = path.join(binDir, process.platform === "win32" ? "codex.cmd" : "codex");
    if (process.platform === "win32") {
      fs.writeFileSync(command, [
        "@echo off",
        "if \"%1\"==\"doctor\" ping -n 3 127.0.0.1 >nul & echo {} & exit /b 0",
        "if \"%1\"==\"mcp\" echo [] & exit /b 0",
        "if \"%1\"==\"plugin\" echo {\"installed\":[],\"available\":[]} & exit /b 0",
        "exit /b 1",
        ""
      ].join("\r\n"), "utf8");
    } else {
      fs.writeFileSync(command, [
        "#!/bin/sh",
        "if [ \"$1\" = \"doctor\" ]; then sleep 2; printf '{}\\n'; exit 0; fi",
        "if [ \"$1\" = \"mcp\" ]; then printf '[]\\n'; exit 0; fi",
        "if [ \"$1\" = \"plugin\" ]; then printf '{\"installed\":[],\"available\":[]}\\n'; exit 0; fi",
        "exit 1",
        ""
      ].join("\n"), "utf8");
      fs.chmodSync(command, 0o755);
    }
    const env = { ...process.env, CODEX_HOME: codexHome, AGENTS_HOME: agentsHome };
    env.PATH = `${binDir}${path.delimiter}${process.env.PATH || process.env.Path || ""}`;
    env.Path = env.PATH;
    const result = run(process.execPath, [
      "scripts/verify-install-runtime.mjs",
      "--json",
      "--require-live-runtime",
      "--doctor-timeout-ms", "1000",
      "--codex-home", codexHome,
      "--agents-home", agentsHome
    ], { env });
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(report.runtime.mcpList.inspected, true);
    assert.match(report.failures.join("\n"), /Could not run codex doctor --json with installed CODEX_HOME/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("installed profile launcher applies MCP enablement through Codex config overrides", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-profile-launcher-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    const binDir = path.join(fixtureRoot, "bin");
    fs.mkdirSync(binDir);
    installFixture(codexHome, agentsHome);
    const capturePath = path.join(fixtureRoot, "captured-args.json");
    if (process.platform === "win32") {
      fs.writeFileSync(path.join(binDir, "codex.cmd"), [
        "@echo off",
        `node -e \"require('fs').writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(1)))\" -- %*`,
        ""
      ].join("\r\n"), "utf8");
    } else {
      fs.writeFileSync(path.join(binDir, "codex"), [
        "#!/bin/sh",
        "node -e 'require(\"fs\").writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(1)))' -- \"$@\"",
        ""
      ].join("\n"), "utf8");
      fs.chmodSync(path.join(binDir, "codex"), 0o755);
    }
    const env = { ...process.env, CODEX_HOME: codexHome, AGENTS_HOME: agentsHome, CAPTURE_PATH: capturePath };
    const testPath = `${binDir}${path.delimiter}${process.env.Path || process.env.PATH || ""}`;
    env.PATH = testPath;
    env.Path = testPath;
    const result = run(process.execPath, [path.join(codexHome, "codex-profile.mjs"), "full", "exec", "hello"], { env });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const captured = JSON.parse(fs.readFileSync(capturePath, "utf8"));
    const normalized = captured.map((arg) => arg.replace(/^"|"$/g, ""));
    assert.deepEqual(normalized.slice(-2), ["exec", "hello"]);
    assert.ok(normalized.includes("mcp_servers.codebase-memory.enabled=true"));
    assert.ok(normalized.includes("mcp_servers.sequential-thinking.enabled=true"));

    const offlineResult = run(process.execPath, [path.join(codexHome, "codex-profile.mjs"), "offline", "exec", "hello"], { env });
    assert.equal(offlineResult.status, 0, offlineResult.stderr || offlineResult.stdout);
    const offlineArgs = JSON.parse(fs.readFileSync(capturePath, "utf8")).map((arg) => arg.replace(/^"|"$/g, ""));
    for (const name of ["openaiDeveloperDocs", "context7", "serena", "github", "supabase"]) {
      assert.ok(offlineArgs.includes(`mcp_servers.${name}.enabled=false`), `offline profile must disable ${name}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("runtime verifier fails when the installed Serena pool launcher is missing", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-serena-missing-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    installFixture(codexHome, agentsHome);
    fs.rmSync(path.join(codexHome, "serena-pool.mjs"));

    const result = verifyOffline(codexHome, agentsHome);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(report.failures.join("\n"), /serena-pool\.mjs/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("runtime verifier fails when the installed Serena pool launcher drifts", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-serena-drift-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    installFixture(codexHome, agentsHome);
    fs.appendFileSync(path.join(codexHome, "serena-pool.mjs"), "\n// drift fixture\n", "utf8");

    const result = verifyOffline(codexHome, agentsHome);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(report.failures.join("\n"), /serena-pool\.mjs/i);
    assert.match(report.failures.join("\n"), /drifted from source/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("runtime verifier rejects a linked Serena pool launcher", (context) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-runtime-serena-link-"));
  try {
    const codexHome = path.join(fixtureRoot, ".codex");
    const agentsHome = path.join(fixtureRoot, ".agents");
    installFixture(codexHome, agentsHome);
    const target = path.join(codexHome, "serena-pool.mjs");
    const outside = path.join(fixtureRoot, "outside-serena-pool.mjs");
    fs.copyFileSync(target, outside);
    fs.rmSync(target);
    try {
      fs.symlinkSync(outside, target, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
        const realCodexHome = path.join(fixtureRoot, "real-codex-home");
        fs.renameSync(codexHome, realCodexHome);
        try {
          fs.symlinkSync(realCodexHome, codexHome, process.platform === "win32" ? "junction" : "dir");
        } catch (junctionError) {
          if (["EPERM", "EACCES", "ENOTSUP"].includes(junctionError?.code)) {
            context.skip(`File and directory link creation are unavailable: ${error.code}/${junctionError.code}`);
            return;
          }
          throw junctionError;
        }
      } else {
        throw error;
      }
    }

    const result = verifyOffline(codexHome, agentsHome);
    const report = JSON.parse(result.stdout);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(report.failures.join("\n"), /unsafe managed path/i);
    assert.match(report.failures.join("\n"), /serena-pool\.mjs/i);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
