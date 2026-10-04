import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..", "..");
const hygieneModuleUrl = pathToFileURL(path.join(
  root,
  "plugins",
  "agentchef",
  "scripts",
  "codex-process-hygiene.mjs"
)).href;
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
    "codebase-memory"
  ];
  const base = mcpEnabledState(path.join(root, "templates", "codex", "config.windows.toml"));
  const full = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "full.config.toml"));
  const multiSession = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "multi-session.config.toml"));
  const offline = mcpEnabledState(path.join(root, "templates", "codex", "profiles", "offline.config.toml"));

  // Browser servers are added per project when a task needs them.
  assert.deepEqual(localMcp.filter((name) => base.get(name)), ["serena"]);
  assert.deepEqual(localMcp.filter((name) => full.get(name)), localMcp);
  assert.deepEqual(localMcp.filter((name) => multiSession.get(name)), ["serena"]);
  assert.equal([...offline.values()].every((enabled) => enabled === false), true);
});

test("plugin registers only the reviewed SessionEnd process-hygiene hook", () => {
  const pluginRoot = path.join(root, "plugins", "agentchef");
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
        "agentchef",
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
      path.join(root, "plugins", "agentchef", "scripts", "codex-process-hygiene.mjs"),
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
      // The CLI enumerates the live process table. Under the full parallel
      // suite, that table includes the test workers themselves, so allow the
      // same bounded command a little more time without weakening assertions.
      timeout: 60_000
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

test("signature-only orphan findings remain advisory and cannot authorize termination", async () => {
  const {
    analyzeProcessSnapshot,
    terminateCleanupPlan
  } = await import(hygieneModuleUrl);
  const processes = fixtureProcesses();
  const report = analyzeProcessSnapshot(processes, { now, orphanGraceMs: 60_000 });
  const calls = [];

  const results = terminateCleanupPlan(report.cleanupCandidates, {
    processes,
    platform: "linux",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(calls, []);
  assert.equal(results.length, 1);
  assert.equal(results[0].stopped, false);
  assert.match(results[0].skippedReason, /trusted ownership receipt/i);
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

test("Unix cleanup rechecks receipt-bound descendants and sends TERM children before root", async () => {
  const {
    buildOwnedCleanupPlan,
    captureSessionOwnedSnapshot,
    terminateCleanupPlan
  } = await import(hygieneModuleUrl);
  const startProcesses = [
    ...fixtureProcesses(),
    proc(700, 701, "node.exe", "node codex-process-hygiene.mjs --session-end"),
    proc(701, 101, "cmd.exe", "cmd /c node codex-process-hygiene.mjs --session-end")
  ];
  const snapshot = captureSessionOwnedSnapshot(startProcesses, 700);
  const ownerEnded = startProcesses.filter((item) => ![100, 101, 700, 701].includes(item.pid));
  const plan = buildOwnedCleanupPlan(ownerEnded, snapshot).filter((item) => item.rootPid === 200);
  const calls = [];

  const results = terminateCleanupPlan(plan, {
    processes: ownerEnded,
    platform: "linux",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(calls, [
    ["kill", ["-TERM", "201"]],
    ["kill", ["-TERM", "200"]]
  ]);
  assert.deepEqual(results.map((item) => item.stopped), [true]);
});

test("cleanup rejects a receipt whose claimed owner identity no longer matches its owner chain", async () => {
  const {
    buildOwnedCleanupPlan,
    captureSessionOwnedSnapshot,
    terminateCleanupPlan
  } = await import(hygieneModuleUrl);
  const startProcesses = [
    ...fixtureProcesses(),
    proc(700, 701, "node.exe", "node codex-process-hygiene.mjs --session-end"),
    proc(701, 101, "cmd.exe", "cmd /c node codex-process-hygiene.mjs --session-end")
  ];
  const snapshot = captureSessionOwnedSnapshot(startProcesses, 700);
  const ownerEnded = startProcesses.filter((item) => ![100, 101, 700, 701].includes(item.pid));
  const plan = buildOwnedCleanupPlan(ownerEnded, snapshot).filter((item) => item.rootPid === 200);
  plan[0].ownershipReceipt.ownerPid = 999;
  const calls = [];

  const results = terminateCleanupPlan(plan, {
    processes: ownerEnded,
    platform: "linux",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(calls, []);
  assert.equal(results[0].stopped, false);
});

test("Serena backends the pool manager started are owned by it, never orphans", async () => {
  // The Serena pool manager is detached on purpose and reclaims its own
  // backends after an idle TTL. With no Codex or Claude ancestor, its backend
  // used to be a cleanup candidate that --cleanup-stale --apply would kill.
  const { analyzeProcessSnapshot } = await import(hygieneModuleUrl);
  const snapshot = [
    proc(500, 1, "node.exe", "\"C:\\Program Files\\nodejs\\node.exe\" D:\\tools\\codex-home\\serena-pool.mjs manager"),
    proc(510, 500, "uvx.exe", "uvx --from git+https://github.com/oraios/serena.git@949a27e serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 50192"),
    proc(511, 510, "python.exe", "python -m serena start-mcp-server --transport streamable-http"),
    // A Serena server with no live owner at all is still a candidate.
    proc(600, 999, "uvx.exe", "uvx --from git+https://github.com/oraios/serena.git@949a27e serena start-mcp-server --context ide"),
    proc(601, 600, "python.exe", "python -m serena start-mcp-server --context ide")
  ];
  const report = analyzeProcessSnapshot(snapshot, { now, orphanGraceMs: 60_000 });
  assert.ok(!report.cleanupCandidates.some((item) => item.rootPid === 510), "a pool-owned backend may never be selected");
  assert.deepEqual(report.cleanupCandidates.map((item) => item.rootPid), [600], "only the unowned Serena tree is a candidate");
});

test("MCP servers a live Claude Code session started are active, never orphans", async () => {
  // AgentChef installs for Claude Code too. A Claude session parents MCP
  // servers exactly like a Codex session, and with no Codex ancestor those trees
  // used to be reported as orphans that the manual cleanup would terminate.
  const { analyzeProcessSnapshot } = await import(hygieneModuleUrl);
  const snapshot = [
    // A native Claude Code session with a context7 server.
    proc(700, 1, "claude.exe", "claude.exe"),
    proc(710, 700, "cmd.exe", "cmd /c npx.cmd -y @upstash/context7-mcp@4.1.1"),
    proc(711, 710, "node.exe", "node @upstash/context7-mcp/dist/index.js"),
    // An npm-installed Claude Code session with a playwright server.
    proc(800, 1, "node.exe", "node C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"),
    proc(810, 800, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.83"),
    proc(811, 810, "node.exe", "node @playwright/mcp/dist/index.js"),
    // A tree whose owner is really gone: this one is still an orphan.
    proc(900, 999, "cmd.exe", "cmd /c npx.cmd -y codebase-memory-mcp@0.8.1"),
    proc(901, 900, "node.exe", "node codebase-memory-mcp/dist/index.js")
  ];
  const report = analyzeProcessSnapshot(snapshot, { now, orphanGraceMs: 60_000 });

  assert.equal(report.claudeSessions, 2, "both launch styles count as a session");
  assert.equal(report.localMcpInstances, 3);
  assert.equal(report.activeMcpInstances, 2, "both Claude-owned trees are active");
  assert.deepEqual(report.cleanupCandidates.map((item) => item.rootPid), [900], "only the genuinely unowned tree is a candidate");
  assert.ok(!report.cleanupCandidates.some((item) => [710, 810].includes(item.rootPid)), "no Claude-owned tree may ever be selected");
});

test("Windows cleanup stops a tree with taskkill /T /F", async () => {
  const { buildOwnerExitPlan, terminateCleanupPlan } = await import(hygieneModuleUrl);
  const owner = { pid: 101, createdAt: old };
  const afterExit = fixtureProcesses().filter((item) => ![100, 101].includes(item.pid));
  const plan = buildOwnerExitPlan(afterExit, owner).filter((item) => item.rootPid === 200);
  const calls = [];
  terminateCleanupPlan(plan, {
    processes: afterExit,
    platform: "win32",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  // Without /F a hidden Node process refuses the stop and stays alive.
  assert.deepEqual(calls, [["taskkill.exe", ["/PID", "200", "/T", "/F"]]]);
});

test("an owner-exit plan takes only MCP trees the exited owner started", async () => {
  const { buildOwnerExitPlan } = await import(hygieneModuleUrl);
  const owner = { pid: 101, createdAt: old };
  // While the owner lives, nothing is planned.
  assert.deepEqual(buildOwnerExitPlan(fixtureProcesses(), owner), []);
  const afterExit = fixtureProcesses().filter((item) => ![100, 101].includes(item.pid));
  const plan = buildOwnerExitPlan(afterExit, owner);
  assert.deepEqual(plan.map((item) => [item.rootPid, item.server, item.processCount]), [[200, "playwright", 2]]);
  // Another session's tree (parent 999) and the control server are never taken.
  assert.ok(!plan.some((item) => [400, 500, 600].includes(item.rootPid)));
});

test("an owner-exit plan refuses a child of a process that reused the owner's pid", async () => {
  const { buildOwnerExitPlan } = await import(hygieneModuleUrl);
  const owner = { pid: 101, createdAt: old };
  const later = "2026-07-29T12:50:00.000Z";
  const reused = [
    ...fixtureProcesses().filter((item) => ![100, 101, 200, 201].includes(item.pid)),
    // pid 101 now belongs to an unrelated, newer process ...
    proc(101, 1, "node.exe", "node some-other-tool.js", later),
    // ... whose own MCP child is newer still: not the old owner's.
    proc(220, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.83", "2026-07-29T12:55:00.000Z"),
    // An orphan created before the reuse is the old owner's and is planned.
    proc(200, 101, "cmd.exe", "cmd /c npx.cmd -y @playwright/mcp@0.0.76", old)
  ];
  assert.deepEqual(buildOwnerExitPlan(reused, owner).map((item) => item.rootPid), [200]);
});

test("the owner chain picks the nearest Codex or Claude entry and nothing else", async () => {
  const { ownerFromChain } = await import(hygieneModuleUrl);
  assert.deepEqual(ownerFromChain("10:1790000000000:bash.exe,20:1790000000500:codex.exe,30:1:claude.exe"), { pid: 20, createdAt: new Date(1790000000500).toISOString() });
  assert.equal(ownerFromChain("10:1790000000000:bash.exe"), null);
  assert.equal(ownerFromChain(""), null, "an empty chain means the wrapper could not read it: no sweep");
});

test("the SessionEnd hook records only the owner, from the chain the wrapper passes", () => {
  const record = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-hygiene-")), "record.json");
  const script = path.join(root, "plugins", "agentchef", "scripts", "codex-process-hygiene.mjs");
  const run = spawnSync(process.execPath, [script, "--session-end", "--owner-chain=10:1790000000000:bash.exe,20:1790000000500:codex.exe"], {
    input: JSON.stringify({ hook_event_name: "SessionEnd" }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    env: { ...process.env, AGENTCHEF_TEST_MODE: "1", AGENTCHEF_TEST_HYGIENE_RECORD: record }
  });
  assert.equal(run.status, 0, run.stderr);
  const scheduled = JSON.parse(fs.readFileSync(record, "utf8"));
  assert.deepEqual(scheduled.snapshot, { schemaVersion: 2, owner: { pid: 20, createdAt: new Date(1790000000500).toISOString() } });

  fs.rmSync(record);
  const none = spawnSync(process.execPath, [script, "--session-end", "--owner-chain="], {
    input: JSON.stringify({ hook_event_name: "SessionEnd" }),
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    env: { ...process.env, AGENTCHEF_TEST_MODE: "1", AGENTCHEF_TEST_HYGIENE_RECORD: record }
  });
  assert.equal(none.status, 0, none.stderr);
  assert.equal(fs.existsSync(record), false, "no owner, no sweep");
});

test("the Windows hook wrapper passes a readable owner chain within Codex's three seconds", { skip: process.platform !== "win32" }, () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "plugins", "agentchef", "hooks", "process-hygiene.json"), "utf8"));
  const command = config.hooks.SessionEnd[0].hooks[0].commandWindows;
  const inner = /^powershell\.exe -NoProfile -NonInteractive -Command "(.*)"$/s.exec(command)[1];
  // The wrapper's real work, minus the hand-off to node, prints the chain.
  const probe = inner.replace(/; & node .*$/s, "; $c -join ','");
  const started = Date.now();
  const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", probe], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout.trim(), /^\d+:\d+:[^,]+(,\d+:\d+:[^,]+)*$/, "pid:startMs:name entries");
  // Recorded, not asserted: a loaded machine can exceed it, and then Codex
  // stops the hook and no sweep is scheduled (fail-closed).
  console.log(`owner-chain wrapper took ${Date.now() - started} ms`);
});

test("a manual stale cleanup stops a rechecked orphan and skips one that gained an owner", async () => {
  const { analyzeProcessSnapshot, staleCleanupExitCode, terminateStaleCandidates } = await import(hygieneModuleUrl);
  const processes = fixtureProcesses();
  const report = analyzeProcessSnapshot(processes, { now, orphanGraceMs: 60_000 });
  assert.deepEqual(report.cleanupCandidates.map((item) => item.rootPid), [400]);
  const calls = [];
  const results = terminateStaleCandidates(report.cleanupCandidates, {
    processes,
    now,
    platform: "linux",
    spawnSync(command, args) {
      calls.push([command, args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });
  assert.deepEqual(calls, [["kill", ["-TERM", "401"]], ["kill", ["-TERM", "400"]]], "children before the root");
  assert.deepEqual(results.map((item) => item.stopped), [true]);
  assert.equal(staleCleanupExitCode(report.cleanupCandidates, results), 0);

  // Between the audit and the stop, a Codex session adopted the tree.
  const adopted = processes.map((item) => (item.pid === 400 ? { ...item, parentPid: 101 } : item));
  const skipped = terminateStaleCandidates(report.cleanupCandidates, { processes: adopted, now, platform: "linux", spawnSync() { throw new Error("must not stop"); } });
  assert.equal(skipped[0].stopped, false);
  assert.match(skipped[0].skippedReason, /no longer a stale candidate/i);
  assert.equal(staleCleanupExitCode(report.cleanupCandidates, skipped), 1, "candidates but nothing stopped is not a success");
});

test("a manual stale cleanup on Windows uses taskkill /T /F", async () => {
  const { analyzeProcessSnapshot, terminateStaleCandidates } = await import(hygieneModuleUrl);
  const processes = fixtureProcesses();
  const report = analyzeProcessSnapshot(processes, { now, orphanGraceMs: 60_000 });
  const calls = [];
  terminateStaleCandidates(report.cleanupCandidates, { processes, now, platform: "win32", spawnSync(command, args) { calls.push([command, args]); return { status: 0 }; } });
  assert.deepEqual(calls, [["taskkill.exe", ["/PID", "400", "/T", "/F"]]]);
});
