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
import { inspectClaudePluginCache, readRegisteredClaudePluginVersion } from "../lib/claude-plugin-cache.mjs";

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
    baselineFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-baseline-"));
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
  assert.match(result.stdout, /--doctor-timeout-ms <n>\s+Per-doctor timeout \(default: 300000;/);
  assert.match(result.stdout, /--mcp-timeout-ms <n>\s+MCP list timeout \(default: 15000\)/);
});

test("runtime fixture builder produces a self-contained installed baseline", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-fixture-builder-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-verifier-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-slow-doctor-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-profile-launcher-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-serena-missing-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-serena-drift-"));
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
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-runtime-serena-link-"));
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

test("the Claude plugin cache check covers skills as well as roles, and ignores the Codex-only scripts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-claude-cache-"));
  try {
    const agentsHome = path.join(root, "agents");
    const claudeHome = path.join(root, "claude");
    const source = path.join(agentsHome, "plugins", "sources", "agentchef-workflows");
    const cache = path.join(claudeHome, "plugins", "cache", "agentchef", "agentchef-workflows", "1.0.0");
    const write = (base, relative, text) => {
      fs.mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
      fs.writeFileSync(path.join(base, relative), text);
    };
    write(source, ".claude-plugin/plugin.json", JSON.stringify({ version: "1.0.0" }));
    for (const base of [source, cache]) {
      write(base, "agents/code-mapper.md", "role\n");
      write(base, "skills/seo/SKILL.md", "skill\n");
    }
    write(source, "scripts/codex-process-hygiene.mjs", "new\n");
    write(cache, "scripts/codex-process-hygiene.mjs", "old\n");
    assert.deepEqual(inspectClaudePluginCache(claudeHome, agentsHome).stale, [], "a Codex-only script is not something Claude loads");

    write(cache, "skills/seo/SKILL.md", "stale skill\n");
    const stale = inspectClaudePluginCache(claudeHome, agentsHome).stale;
    assert.deepEqual(stale, [{ version: "1.0.0", differing: 1, total: 2 }], "a stale skill is drift even when every role matches");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the Claude plugin cache check reports a registered version older than the source even when the files match", () => {
  // Seen live on the 1.1.0 upgrade: `claude plugin install` left the installed
  // plugin on 1.0.0, whose cached files happened to match the new source.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-claude-version-"));
  try {
    const agentsHome = path.join(root, "agents");
    const claudeHome = path.join(root, "claude");
    const source = path.join(agentsHome, "plugins", "sources", "agentchef-workflows");
    const cache = path.join(claudeHome, "plugins", "cache", "agentchef", "agentchef-workflows", "1.0.0");
    const write = (base, relative, text) => {
      fs.mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
      fs.writeFileSync(path.join(base, relative), text);
    };
    write(source, ".claude-plugin/plugin.json", JSON.stringify({ version: "1.1.0" }));
    for (const base of [source, cache]) write(base, "agents/code-mapper.md", "role\n");
    const registry = (version) => write(claudeHome, "plugins/installed_plugins.json", JSON.stringify({ version: 2, plugins: { "agentchef-workflows@agentchef": [{ scope: "user", version }] } }));

    assert.equal(readRegisteredClaudePluginVersion(claudeHome), null, "an unregistered plugin reads as null, which the verifier reports");
    registry("1.0.0");
    const before = inspectClaudePluginCache(claudeHome, agentsHome);
    assert.deepEqual(before.stale, [], "the files themselves match");
    assert.deepEqual(before.versionMismatch, { registered: "1.0.0", expected: "1.1.0" });

    registry("1.1.0");
    assert.equal(inspectClaudePluginCache(claudeHome, agentsHome).versionMismatch, null, "an updated registration is current");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("status calls an empty home not installed, and fails a broken Claude target instead of attention", () => {
  // missing/mismatched are file lists in the verifier report; Number(list) was
  // NaN, so an empty home read as drift and was sent to repair. And a missing
  // Claude receipt under --target claude printed "fail" but exited 0.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-status-states-"));
  try {
    const homes = ["--codex-home", path.join(home, ".codex"), "--agents-home", path.join(home, ".agents"), "--claude-home", path.join(home, ".claude")];
    const status = (extra) => spawnSync(process.execPath, [path.join(root, "scripts", "codex-status.mjs"), "--json", "--skip-codex-cli", "--skip-codex-doctor-checks", ...homes, ...extra], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(240_000), env: { ...process.env, CLAUDE_CONFIG_DIR: undefined }
    });
    const codex = status([]);
    assert.equal(JSON.parse(codex.stdout).runtimeInstallState, "not_installed", codex.stderr);

    const claude = status(["--target", "claude", "--skip-claude-cli"]);
    const report = JSON.parse(claude.stdout);
    assert.equal(report.runtimeInstallState, "skipped", "a Claude-only check does not inspect Codex");
    assert.equal(report.claudeTarget.status, "fail");
    assert.equal(report.status, "fail");
    assert.notEqual(claude.status, 0, "a broken Claude target fails the run");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("--redact-paths also redacts the paths inside error messages", () => {
  // A linked managed root makes every managed-path check fail with a message
  // holding the absolute path; those messages were pushed unredacted
  // (measured: 394 home-path hits in one --json --redact-paths report).
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-redact-errors-"));
  try {
    const real = path.join(base, "real");
    const linked = path.join(base, "link");
    fs.mkdirSync(real);
    fs.symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir");
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "verify-install-runtime.mjs"), "--codex-home", linked, "--agents-home", real, "--skip-codex-cli", "--json", "--redact-paths"], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(120_000)
    });
    const report = JSON.parse(result.stdout);
    assert.ok(report.failures.some((failure) => failure.includes("Refusing to follow an unsafe managed path")), "the linked root is refused");
    const serialized = JSON.stringify(report);
    // The serialized report escapes backslashes, so the JSON form of each path
    // is what can appear in it.
    // Redaction covers the home and repo paths; the temporary base only when it
    // lives under the home (Windows), not /tmp (Linux, macOS).
    const insideHome = base.startsWith(os.homedir());
    for (const form of [os.homedir(), os.homedir().split(path.sep).join("/"), ...(insideHome ? [base] : [])].map((value) => JSON.stringify(value).slice(1, -1))) {
      assert.equal(serialized.includes(form), false, `no ${form} in a redacted report`);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test("an enabled Supabase connector without a project_ref fails verification", () => {
  // project_ref is what narrows the connector to one project; the template
  // only asks for it in a comment.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-supabase-scope-"));
  try {
    const verify = (enabled, query) => {
      fs.writeFileSync(path.join(home, "config.toml"), `[mcp_servers.supabase]\nenabled = ${enabled}\nurl = "https://mcp.supabase.com/mcp?${query}"\n\n[mcp_servers.other]\nenabled = true\n`);
      const result = spawnSync(process.execPath, [path.join(root, "scripts", "verify-install-runtime.mjs"), "--codex-home", home, "--agents-home", home, "--skip-codex-cli", "--json"], {
        cwd: root, encoding: "utf8", windowsHide: true, timeout: scaledTimeout(120_000)
      });
      return JSON.parse(result.stdout).failures.filter((failure) => failure.includes("Supabase"));
    };
    assert.equal(verify(true, "read_only=true&features=database").length, 1, "account-wide scope is a failure");
    assert.equal(verify(true, "read_only=true&project_ref=abc").length, 0, "a project-scoped connector passes");
    assert.equal(verify(false, "read_only=true").length, 0, "a disabled connector is not checked");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
