import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
