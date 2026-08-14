import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleUrl = new URL("../../templates/codex/serena-pool.mjs", import.meta.url);

function waitFor(condition, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (condition()) { clearInterval(timer); resolve(); }
      else if (Date.now() >= deadline) { clearInterval(timer); reject(new Error("Timed out waiting for Serena pool bridge.")); }
    }, 20);
  });
}

function managerRequest(port, token, pathName) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: pathName, method: "POST", headers: { authorization: `Bearer ${token}` } }, (response) => {
      response.resume();
      response.on("end", () => response.statusCode === 200 ? resolve() : reject(new Error(`Manager returned ${response.statusCode}.`)));
    });
    request.once("error", reject);
    request.end();
  });
}

function listenLoopback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => resolve({ server, port: server.address().port }));
  });
}

test("project-keyed Serena pool coalesces same-project starts and separates worktrees", async () => {
  const { createSerenaPool } = await import(moduleUrl.href);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-"));
  const project = path.join(sandbox, "project");
  const worktree = path.join(sandbox, "project-worktree");
  fs.mkdirSync(project);
  fs.mkdirSync(worktree);

  let starts = 0;
  const pool = createSerenaPool({
    resolveProjectRoot: (candidate) => path.resolve(candidate),
    startBackend: async (root) => ({ id: ++starts, root }),
    stopBackend: async () => {}
  });

  const sameProject = await Promise.all(Array.from({ length: 10 }, () => pool.ensure(project)));
  const otherProject = await pool.ensure(worktree);

  assert.equal(starts, 2);
  assert.equal(new Set(sameProject.map((entry) => entry.id)).size, 1);
  assert.notEqual(sameProject[0].key, otherProject.key);
  assert.equal(pool.snapshot().length, 2);
});

test("project-keyed Serena pool reclaims only its idle child after the configured TTL", async () => {
  const { createSerenaPool } = await import(moduleUrl.href);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-idle-"));
  const project = path.join(sandbox, "project");
  fs.mkdirSync(project);
  const stopped = [];
  let now = 0;
  const pool = createSerenaPool({
    clock: () => now,
    idleTtlMs: 100,
    resolveProjectRoot: (candidate) => path.resolve(candidate),
    startBackend: async (root) => ({ root, pid: 123 }),
    stopBackend: async (backend) => stopped.push(backend)
  });

  await pool.ensure(project);
  now = 99;
  assert.deepEqual(await pool.reclaimIdle(), []);
  now = 100;
  const reclaimed = await pool.reclaimIdle();

  assert.equal(reclaimed.length, 1);
  assert.equal(stopped.length, 1);
  assert.equal(pool.snapshot().length, 0);
});

test("project-keyed Serena pool evicts a backend that exits before the next request", async () => {
  const { createSerenaPool } = await import(moduleUrl.href);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-exit-"));
  const project = path.join(sandbox, "project");
  fs.mkdirSync(project);
  let starts = 0;
  const firstChild = new EventEmitter();
  const pool = createSerenaPool({
    resolveProjectRoot: (candidate) => path.resolve(candidate),
    startBackend: async () => ({ id: ++starts, child: starts === 1 ? firstChild : new EventEmitter() }),
    stopBackend: async () => {}
  });

  assert.equal((await pool.ensure(project)).id, 1);
  firstChild.emit("exit", 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pool.snapshot().length, 0);
  assert.equal((await pool.ensure(project)).id, 2);
});

test("project-keyed Serena pool refuses a backend that already exited during startup", async () => {
  const { createSerenaPool } = await import(moduleUrl.href);
  for (const childState of [{ exitCode: 1, signalCode: null }, { exitCode: null, signalCode: "SIGTERM" }]) {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-startup-exit-"));
    const project = path.join(sandbox, "project");
    fs.mkdirSync(project);
    const exitedChild = Object.assign(new EventEmitter(), childState);
    const pool = createSerenaPool({
      resolveProjectRoot: (candidate) => path.resolve(candidate),
      startBackend: async () => ({ child: exitedChild }),
      stopBackend: async () => {}
    });

    await assert.rejects(pool.ensure(project), /exited before it became available/);
    assert.equal(pool.snapshot().length, 0);
  }
});

test("a failed Serena child is rejected immediately instead of consuming the readiness budget", async () => {
  const { waitForSession } = await import(moduleUrl.href);
  const child = Object.assign(new EventEmitter(), { exitCode: 1, signalCode: null });
  const startedAt = Date.now();

  await assert.rejects(
    waitForSession({ child, endpoint: "http://127.0.0.1:1/mcp", sessions: new Map() }, "client-1"),
    /exited before it became ready/
  );
  assert.ok(Date.now() - startedAt < 1000);
});

test("a Serena child that loses its reserved port is restarted once with a fresh backend", async () => {
  const { createSerenaPool, recoverFromStartupExit } = await import(moduleUrl.href);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-port-collision-"));
  const project = path.join(sandbox, "project");
  fs.mkdirSync(project);
  const collidedChild = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const healthyChild = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null });
  const blocker = await listenLoopback();
  let starts = 0;
  const stopped = [];
  const pool = createSerenaPool({
    resolveProjectRoot: (candidate) => path.resolve(candidate),
    startBackend: async () => ({ child: ++starts === 1 ? collidedChild : healthyChild, port: starts === 1 ? blocker.port : 44002 }),
    stopBackend: async (backend) => stopped.push(backend)
  });

  try {
    const result = await recoverFromStartupExit(pool, project, async (backend) => {
      if (backend.child === collidedChild) {
        assert.equal(backend.port, blocker.port);
        collidedChild.exitCode = 1;
        throw new Error("Pinned Serena exited before it became ready.");
      }
      return backend.port;
    });

    assert.equal(result, 44002);
    assert.equal(starts, 2);
    assert.deepEqual(stopped.map((backend) => backend.port), [blocker.port]);
    assert.equal(pool.snapshot().length, 1);
  } finally {
    await new Promise((resolve, reject) => blocker.server.close((error) => error ? reject(error) : resolve()));
  }
});

test("a second Serena startup exit reports the bounded port-collision retry failure", async () => {
  const { createSerenaPool, recoverFromStartupExit } = await import(moduleUrl.href);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-port-collision-failure-"));
  const project = path.join(sandbox, "project");
  fs.mkdirSync(project);
  let starts = 0;
  const pool = createSerenaPool({
    resolveProjectRoot: (candidate) => path.resolve(candidate),
    startBackend: async () => ({ child: Object.assign(new EventEmitter(), { exitCode: null, signalCode: null }), port: 45000 + ++starts }),
    stopBackend: async () => {}
  });

  await assert.rejects(
    recoverFromStartupExit(pool, project, async (backend) => {
      backend.child.exitCode = 1;
      throw new Error("Pinned Serena exited before it became ready.");
    }),
    /after retrying once with a fresh loopback port/
  );
  assert.equal(starts, 2);
  assert.equal(pool.snapshot().length, 0);
});

test("MCP notification acknowledgements may be empty while retaining the downstream session", async () => {
  const { parseMcpResponse } = await import(moduleUrl.href);
  assert.deepEqual(parseMcpResponse({ headers: { "mcp-session-id": "session-1", "content-type": "application/json" } }, ""), {
    sessionId: "session-1",
    response: null
  });
});

test("stdio bridge exposes the safe tool surface without starting Serena on MCP initialization", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "serena-pool-bridge-"));
  const port = 48_000 + Math.floor(Math.random() * 1_000);
  const bridge = spawn(process.execPath, [fileURLToPath(moduleUrl), "bridge"], {
    cwd: home,
    env: { ...process.env, CODEX_HOME: home, CODEX_CHEF_SERENA_POOL_PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const replies = [];
  let buffer = "";
  bridge.stdout.setEncoding("utf8");
  bridge.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) replies.push(JSON.parse(line));
  });
  bridge.stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n');
  bridge.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n');
  bridge.stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n');
  try {
    await waitFor(() => replies.length === 2);
    assert.equal(replies[0].result.serverInfo.name, "serena-project-pool");
    assert.deepEqual(replies[1].result.tools.map((tool) => tool.name), [
      "activate_project", "get_current_config", "initial_instructions", "list_memories", "read_memory",
      "search_for_pattern", "find_symbol", "find_declaration", "find_implementations",
      "find_referencing_symbols", "get_symbols_overview", "get_diagnostics_for_file"
    ]);
  } finally {
    bridge.stdin.end();
    const token = fs.readFileSync(path.join(home, "serena-pool", "token"), "utf8").trim();
    await managerRequest(port, token, "/shutdown");
  }
});
