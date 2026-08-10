import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..", "..");
const hygieneModuleUrl = pathToFileURL(path.join(root, "scripts", "codex-process-hygiene.mjs")).href;
const now = Date.parse("2026-07-29T13:00:00.000Z");
const old = "2026-07-29T12:00:00.000Z";
const recent = "2026-07-29T12:59:45.000Z";

function proc(pid, parentPid, name, commandLine, createdAt = old, workingSetBytes = 1024) {
  return { pid, parentPid, name, commandLine, createdAt, workingSetBytes };
}

function fixtureProcesses() {
  return [
    proc(100, 1, "node.exe", "node C:\\tools\\@openai\\codex\\bin\\codex.js"),
    proc(101, 100, "codex.exe", "codex.exe app-server"),
    proc(200, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.76"),
    proc(201, 200, "node.exe", "node @playwright/mcp/dist/index.js"),
    proc(300, 1, "node.exe", "node C:\\workspace\\node_modules\\next\\dist\\bin\\next dev"),
    proc(400, 999, "cmd.exe", "cmd /c npx.cmd -y codebase-memory-mcp@0.8.1"),
    proc(401, 400, "node.exe", "node codebase-memory-mcp/dist/index.js"),
    proc(500, 999, "cmd.exe", "cmd /c npx.cmd -y @upstash/context7-mcp@3.2.1", recent),
    proc(501, 500, "node.exe", "node @upstash/context7-mcp/dist/index.js", recent),
    proc(600, 1, "node.exe", "node C:\\tools\\codex-chef-control\\dist\\mcp-server.mjs")
  ];
}

function mcpEnabledState(file) {
  const states = new Map();
  let current = null;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const table = line.match(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]$/);
    if (table) {
      current = table[1];
      continue;
    }
    const enabled = line.match(/^enabled\s*=\s*(true|false)$/);
    if (current && enabled) {
      states.set(current, enabled[1] === "true");
      current = null;
    }
  }
  return states;
}

test("balanced, full, multi-session, and offline profiles preserve MCP capability with different process cost", () => {
  const localMcp = [
    "context7",
    "sequential-thinking",
    "playwright",
    "chrome-devtools",
    "serena",
    "memory",
    "codebase-memory"
  ];
  const base = mcpEnabledState(path.join(root, "templates", "codex", "config.windows.toml"));
  const full = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "full.config.toml"));
  const multiSession = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "multi-session.config.toml"));
  const offline = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "offline.config.toml"));

  assert.deepEqual(localMcp.filter((name) => base.get(name)), ["context7", "serena"]);
  assert.deepEqual(localMcp.filter((name) => full.get(name)), localMcp);
  assert.deepEqual(localMcp.filter((name) => multiSession.get(name)), ["serena"]);
  assert.equal([...offline.values()].every((enabled) => enabled === false), true);
});

test("plugin registers only the reviewed SessionEnd process-hygiene hook", () => {
  const pluginRoot = path.join(root, "plugins", "codex-chef-workflows");
  const manifest = JSON.parse(fs.readFileSync(
    path.join(pluginRoot, ".codex-plugin", "plugin.json"),
    "utf8"
  ));
  const hookPath = manifest.hooks?.[0];
  assert.equal(hookPath, "./hooks/process-hygiene.json");

  const hookConfig = JSON.parse(fs.readFileSync(
    path.join(pluginRoot, hookPath),
    "utf8"
  ));
  assert.deepEqual(Object.keys(hookConfig.hooks), ["SessionEnd"]);
  const handler = hookConfig.hooks.SessionEnd[0].hooks[0];
  assert.equal(handler.type, "command");
  assert.equal(handler.timeout, 3);
  assert.match(handler.command, /PLUGIN_ROOT[\\/]scripts[\\/]codex-process-hygiene\.mjs/);
  assert.match(handler.commandWindows, /PLUGIN_ROOT.*scripts[\\/]codex-process-hygiene\.mjs/);
  assert.match(handler.command, /--session-end/);
  assert.match(handler.commandWindows, /--session-end/);
});

test("SessionEnd hook fails closed without turning unavailable process metadata into hook noise", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        "plugins",
        "codex-chef-workflows",
        "scripts",
        "codex-process-hygiene.mjs"
      ),
      "--session-end"
    ],
    {
      cwd: root,
      encoding: "utf8",
      input: JSON.stringify({
        session_id: "test-session",
        cwd: root,
        hook_event_name: "SessionEnd",
        reason: "other"
      }),
      windowsHide: true,
      timeout: 30_000
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "");
});

test("SessionEnd worker rejects forgeable serialized cleanup snapshots", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "plugins", "codex-chef-workflows", "scripts", "codex-process-hygiene.mjs"),
      "--owned-sweep",
      Buffer.from("{}", "utf8").toString("base64url"),
      "--apply",
      "--delay-ms",
      "0"
    ],
    { cwd: root, encoding: "utf8", windowsHide: true, timeout: 30_000 }
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /no longer accepts serialized snapshots/i);
});

test("process CLI reports sessions, MCP instances, and unrelated runtimes separately", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts", "chef-cli.mjs"), "--processes", "--json", "--no-log"],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 2);
  assert.equal(typeof payload.codexSessions, "number");
  assert.equal(typeof payload.localMcpInstances, "number");
  assert.equal(typeof payload.orphanCandidates, "number");
  assert.equal(typeof payload.unrelatedRuntimes?.node, "number");
  assert.equal(typeof payload.unrelatedRuntimes?.python, "number");
});

test("active Codex descendants stay out of the orphan cleanup plan", async () => {
  const { analyzeProcessSnapshot } = await import(hygieneModuleUrl);
  const report = analyzeProcessSnapshot(fixtureProcesses(), {
    now,
    orphanGraceMs: 60_000
  });

  assert.equal(report.codexSessions, 1);
  assert.equal(report.localMcpInstances, 3);
  assert.equal(report.activeMcpInstances, 1);
  assert.equal(report.orphanCandidates, 1);
  assert.deepEqual(report.cleanupCandidates.map((item) => item.rootPid), [400]);
  assert.deepEqual(report.cleanupCandidates.map((item) => item.server), ["codebase-memory"]);
  assert.equal(report.unrelatedRuntimes.node, 1);
});

test("separate same-server roots remain separate logical MCP instances", async () => {
  const { analyzeProcessSnapshot } = await import(hygieneModuleUrl);
  const processes = [
    proc(100, 1, "node.exe", "node C:\\tools\\@openai\\codex\\bin\\codex.js"),
    proc(101, 100, "codex.exe", "codex.exe app-server"),
    proc(200, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.76"),
    proc(201, 200, "node.exe", "node @playwright/mcp/dist/index.js"),
    proc(210, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.76"),
    proc(211, 210, "node.exe", "node @playwright/mcp/dist/index.js")
  ];
  const report = analyzeProcessSnapshot(processes, {
    now,
    orphanGraceMs: 60_000
  });

  assert.equal(report.localMcpInstances, 2);
  assert.deepEqual(report.instances.map((item) => item.rootPid), [200, 210]);
  assert.deepEqual(report.instances.map((item) => item.processCount), [2, 2]);
  assert.equal(report.servers[0].instances, 2);
  assert.equal(report.servers[0].processes, 4);
  assert.equal(report.sessions[0].mcpInstances, 2);
  assert.equal(report.sessions[0].helperProcesses, 4);
});

test("recent unowned MCP processes remain inside the grace period", async () => {
  const { analyzeProcessSnapshot } = await import(hygieneModuleUrl);
  const report = analyzeProcessSnapshot(fixtureProcesses(), {
    now,
    orphanGraceMs: 60_000
  });

  const context7 = report.instances.find((item) => item.server === "context7");
  assert.equal(context7.state, "grace");
  assert.equal(context7.cleanupEligible, false);
});

test("manual cleanup rechecks exact identity and active ownership before termination", async () => {
  const {
    analyzeProcessSnapshot,
    verifyCleanupPlan
  } = await import(hygieneModuleUrl);
  const processes = fixtureProcesses();
  const report = analyzeProcessSnapshot(processes, {
    now,
    orphanGraceMs: 60_000
  });

  assert.deepEqual(
    verifyCleanupPlan(processes, report.cleanupCandidates).map((item) => item.rootPid),
    [400]
  );

  const reused = processes.map((item) => (
    item.pid === 400
      ? { ...item, createdAt: "2026-07-29T12:30:00.000Z" }
      : item
  ));
  assert.deepEqual(verifyCleanupPlan(reused, report.cleanupCandidates), []);

  const newlyOwned = processes.map((item) => (
    item.pid === 400 ? { ...item, parentPid: 101 } : item
  ));
  assert.deepEqual(verifyCleanupPlan(newlyOwned, report.cleanupCandidates), []);
});

test("SessionEnd ownership snapshot selects only MCP descendants of its Codex owner", async () => {
  const { captureSessionOwnedSnapshot } = await import(hygieneModuleUrl);
  const processes = [
    ...fixtureProcesses(),
    proc(700, 701, "node.exe", "node codex-process-hygiene.mjs --session-end"),
    proc(701, 101, "cmd.exe", "cmd /c node codex-process-hygiene.mjs --session-end")
  ];

  const snapshot = captureSessionOwnedSnapshot(processes, 700);
  assert.equal(snapshot.ownerPid, 101);
  assert.deepEqual(snapshot.processes.map((item) => item.pid), [200, 201]);
});

test("SessionEnd cleanup fails closed while the owner lives or a PID was reused", async () => {
  const {
    buildOwnedCleanupPlan,
    captureSessionOwnedSnapshot
  } = await import(hygieneModuleUrl);
  const startProcesses = [
    ...fixtureProcesses(),
    proc(700, 701, "node.exe", "node codex-process-hygiene.mjs --session-end"),
    proc(701, 101, "cmd.exe", "cmd /c node codex-process-hygiene.mjs --session-end")
  ];
  const snapshot = captureSessionOwnedSnapshot(startProcesses, 700);

  assert.deepEqual(buildOwnedCleanupPlan(startProcesses, snapshot), []);

  const ownerEnded = startProcesses.filter((item) => ![100, 101, 700, 701].includes(item.pid));
  const ownerEndedPlan = buildOwnedCleanupPlan(ownerEnded, snapshot);
  assert.deepEqual(ownerEndedPlan.map((item) => item.rootPid), [200]);
  assert.equal(ownerEndedPlan[0].rootCreatedAt, old);

  const reused = ownerEnded.map((item) => (
    item.pid === 200
      ? { ...item, createdAt: "2026-07-29T12:30:00.000Z" }
      : item
  ));
  assert.deepEqual(buildOwnedCleanupPlan(reused, snapshot), []);
});

test("SessionEnd cleanup keeps same-server roots and process counts separate", async () => {
  const {
    buildOwnedCleanupPlan,
    captureSessionOwnedSnapshot
  } = await import(hygieneModuleUrl);
  const startProcesses = [
    ...fixtureProcesses(),
    proc(210, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.76"),
    proc(211, 210, "node.exe", "node @playwright/mcp/dist/index.js"),
    proc(700, 701, "node.exe", "node codex-process-hygiene.mjs --session-end"),
    proc(701, 101, "cmd.exe", "cmd /c node codex-process-hygiene.mjs --session-end")
  ];
  const snapshot = captureSessionOwnedSnapshot(startProcesses, 700);
  const ownerEnded = startProcesses.filter((item) => ![100, 101, 700, 701].includes(item.pid));
  const plan = buildOwnedCleanupPlan(ownerEnded, snapshot)
    .filter((item) => item.server === "playwright");

  assert.deepEqual(plan.map((item) => item.rootPid), [200, 210]);
  assert.deepEqual(plan.map((item) => item.processCount), [2, 2]);
});
