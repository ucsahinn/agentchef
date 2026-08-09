#!/usr/bin/env node
// A deliberately small stdio MCP bridge plus loopback-only manager.  The
// bridge is cheap per Codex client; the manager starts a pinned Serena/LSP
// child only after a semantic tool call and shares it by project root.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const SERENA_SOURCE = "22c135a881aaf17485e54ef0ccaedeaf51a202c0";
const PROTOCOL_VERSION = "2025-11-25";
const DEFAULT_IDLE_TTL_MS = 15 * 60 * 1000;
const TOOL_NAMES = [
  "activate_project", "get_current_config", "initial_instructions", "list_memories", "read_memory",
  "search_for_pattern", "find_symbol", "find_declaration", "find_implementations",
  "find_referencing_symbols", "get_symbols_overview", "get_diagnostics_for_file"
];

function defaultProjectRoot(candidate) {
  return fs.realpathSync.native(path.resolve(candidate));
}

function keyForProject(root) {
  const normalized = process.platform === "win32" ? root.toLowerCase() : root;
  return crypto.createHash("sha256").update(`${process.platform}\0${normalized}\0${SERENA_SOURCE}\0streamable-http`).digest("hex");
}

export function createSerenaPool({
  resolveProjectRoot = defaultProjectRoot,
  startBackend,
  stopBackend,
  clock = () => Date.now(),
  idleTtlMs = DEFAULT_IDLE_TTL_MS
} = {}) {
  if (typeof startBackend !== "function" || typeof stopBackend !== "function") {
    throw new TypeError("createSerenaPool requires startBackend and stopBackend functions.");
  }
  if (!Number.isFinite(idleTtlMs) || idleTtlMs < 1) throw new RangeError("idleTtlMs must be a positive number.");
  const entries = new Map();
  const starting = new Map();

  async function ensure(candidate) {
    const root = resolveProjectRoot(candidate);
    const key = keyForProject(root);
    const existing = entries.get(key);
    if (existing) {
      existing.lastUsedAt = clock();
      return Object.assign(existing.backend, { key, root: existing.root });
    }
    if (starting.has(key)) return starting.get(key);
    const pending = (async () => {
      const backend = await startBackend(root, key);
      entries.set(key, { key, root, backend, startedAt: clock(), lastUsedAt: clock() });
      return Object.assign(backend, { key, root });
    })();
    starting.set(key, pending);
    try {
      return await pending;
    } finally {
      starting.delete(key);
    }
  }

  async function reclaimIdle() {
    const now = clock();
    const reclaimed = [];
    for (const [key, entry] of entries) {
      if (now - entry.lastUsedAt < idleTtlMs) continue;
      entries.delete(key);
      await stopBackend(entry.backend, entry);
      reclaimed.push({ key, root: entry.root });
    }
    return reclaimed;
  }

  async function close() {
    const entriesToClose = [...entries.values()];
    entries.clear();
    for (const entry of entriesToClose) await stopBackend(entry.backend, entry);
  }

  return {
    ensure,
    reclaimIdle,
    close,
    snapshot: () => [...entries.values()].map(({ key, root, startedAt, lastUsedAt, backend }) => ({ key, root, startedAt, lastUsedAt, pid: backend?.pid ?? null }))
  };
}

function codexHome() {
  return path.resolve(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
}

function stateDirectory() {
  return path.join(codexHome(), "serena-pool");
}

function poolPort() {
  const parsed = Number.parseInt(process.env.CODEX_CHEF_SERENA_POOL_PORT || "44787", 10);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) throw new Error("CODEX_CHEF_SERENA_POOL_PORT must be an integer from 1024 to 65535.");
  return parsed;
}

function loadOrCreateToken() {
  const directory = stateDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(directory, "token");
  try {
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  try {
    fs.writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return token;
  } catch (error) {
    if (error?.code === "EEXIST") return fs.readFileSync(tokenPath, "utf8").trim();
    throw error;
  }
}

function requestJson({ pathName, method = "GET", body, token, timeoutMs = 1500 }) {
  const serialized = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port: poolPort(),
      path: pathName,
      method,
      timeout: timeoutMs,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(serialized ? { "content-type": "application/json", "content-length": Buffer.byteLength(serialized) } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* manager errors are intentionally generic */ }
        if ((response.statusCode || 500) >= 300) {
          reject(new Error(parsed?.error || `Serena pool manager returned HTTP ${response.statusCode}.`));
          return;
        }
        resolve(parsed);
      });
    });
    request.once("timeout", () => request.destroy(new Error("Serena pool manager timed out.")));
    request.once("error", reject);
    if (serialized) request.write(serialized);
    request.end();
  });
}

async function ensureManager(token) {
  try {
    await requestJson({ pathName: "/health", token, timeoutMs: 350 });
    return;
  } catch { /* start the singleton below */ }
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "manager"], {
    cwd: codexHome(), detached: true, stdio: "ignore", windowsHide: true, env: process.env
  });
  child.unref();
  const deadline = Date.now() + 5000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await requestJson({ pathName: "/health", token, timeoutMs: 500 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  throw new Error(`Serena pool manager did not become ready: ${lastError?.message || "unknown error"}`);
}

function writeStdio(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolList() {
  return TOOL_NAMES.map((name) => ({
    name,
    description: "Read-only Serena semantic code-intelligence operation routed through the project-keyed local pool.",
    inputSchema: { type: "object", additionalProperties: true }
  }));
}

async function runBridge() {
  const token = loadOrCreateToken();
  await ensureManager(token);
  const clientId = crypto.randomUUID();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) void handleBridgeMessage(line, { token, clientId });
  });
  process.stdin.on("end", () => process.exit(0));
}

async function handleBridgeMessage(line, { token, clientId }) {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
  if (message.method === "initialize") {
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "serena-project-pool", version: "0.1.0" } } });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/list") {
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, result: { tools: toolList() } });
    return;
  }
  if (message.method !== "tools/call") {
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found." } });
    return;
  }
  const toolName = message.params?.name;
  if (!TOOL_NAMES.includes(toolName)) {
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "Tool is not allowlisted by Serena pool." } });
    return;
  }
  try {
    const result = await requestJson({
      pathName: "/call-tool",
      method: "POST",
      token,
      timeoutMs: 185000,
      body: { clientId, projectRoot: process.cwd(), toolName, arguments: message.params?.arguments || {} }
    });
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, ...(result.response || { error: { code: -32603, message: "Serena pool returned no tool response." } }) });
  } catch (error) {
    if (message.id !== undefined) writeStdio({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "Serena pool request failed.", data: { reason: error.message } } });
  }
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function launchSerena(root) {
  const port = await reserveLoopbackPort();
  const child = spawn("uvx", [
    "--from", `git+https://github.com/oraios/serena.git@${SERENA_SOURCE}`,
    "serena", "start-mcp-server", "--transport", "streamable-http", "--host", "127.0.0.1", "--port", String(port),
    "--context", "codex", "--project", root, "--open-web-dashboard", "False"
  ], {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, UV_CACHE_DIR: path.join(stateDirectory(), "uv-cache") }
  });
  child.unref();
  return { pid: child.pid, child, endpoint: `http://127.0.0.1:${port}/mcp`, sessions: new Map(), queue: Promise.resolve() };
}

async function stopSerena(backend) {
  if (!backend?.child || backend.child.exitCode !== null || !backend.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(backend.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-backend.pid, "SIGTERM"); } catch { /* already gone */ }
  }
}

export function parseMcpResponse(response, text) {
  const sessionId = response.headers["mcp-session-id"];
  const contentType = String(response.headers["content-type"] || "");
  if (!text.trim()) return { sessionId, response: null };
  if (contentType.includes("application/json")) return { sessionId, response: JSON.parse(text) };
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (data) return { sessionId, response: JSON.parse(data.slice(5).trim()) };
  }
  throw new Error("Serena returned an unsupported MCP response.");
}

function postMcp(endpoint, payload, sessionId) {
  const target = new URL(endpoint);
  const serialized = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: target.hostname, port: target.port, path: target.pathname, method: "POST", headers: {
      accept: "application/json, text/event-stream", "content-type": "application/json", "content-length": Buffer.byteLength(serialized),
      "mcp-protocol-version": PROTOCOL_VERSION, ...(sessionId ? { "mcp-session-id": sessionId } : {})
    } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((response.statusCode || 500) >= 300) return reject(new Error(`Serena MCP returned HTTP ${response.statusCode}.`));
        try { resolve(parseMcpResponse(response, text)); } catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
    request.write(serialized);
    request.end();
  });
}

async function waitForSession(backend, clientId) {
  const existing = backend.sessions.get(clientId);
  if (existing?.sessionId) return existing.sessionId;
  if (existing?.pending) return existing.pending;
  const pending = (async () => {
    // A first pinned uvx install can download/build Python wheels. This is
    // deliberately off the MCP startup path, but its one semantic call gets
    // the same bounded 180-second budget as the configured tool timeout.
    const deadline = Date.now() + 180000;
    let lastError;
    while (Date.now() < deadline) {
      try {
        const initialized = await postMcp(backend.endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "codex-chef-serena-pool", version: "0.1.0" } } });
        const sessionId = initialized.sessionId;
        if (!sessionId) throw new Error("Serena did not return an MCP session id.");
        await postMcp(backend.endpoint, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, sessionId);
        backend.sessions.set(clientId, { sessionId });
        return sessionId;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(`Pinned Serena did not become ready: ${lastError?.message || "unknown error"}`);
  })();
  backend.sessions.set(clientId, { pending });
  try {
    return await pending;
  } catch (error) {
    backend.sessions.delete(clientId);
    throw error;
  }
}

function enqueueBackendCall(backend, operation) {
  const queued = (backend.queue || Promise.resolve()).catch(() => {}).then(operation);
  backend.queue = queued.catch(() => {});
  return queued;
}

async function runManager() {
  const token = loadOrCreateToken();
  const pool = createSerenaPool({ startBackend: launchSerena, stopBackend: stopSerena });
  let lastRequestAt = Date.now();
  let stopping = false;
  const shutdown = async (server) => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    server.close();
    await pool.close();
  };
  const server = http.createServer(async (request, response) => {
    lastRequestAt = Date.now();
    const unauthorized = request.headers.authorization !== `Bearer ${token}`;
    if (unauthorized) { response.writeHead(401).end(JSON.stringify({ error: "Unauthorized." })); return; }
    if (request.method === "GET" && request.url === "/health") { response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true })); return; }
    if (request.method === "POST" && request.url === "/shutdown") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      void shutdown(server);
      return;
    }
    if (request.method !== "POST" || request.url !== "/call-tool") { response.writeHead(404).end(JSON.stringify({ error: "Not found." })); return; }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!TOOL_NAMES.includes(body.toolName) || typeof body.clientId !== "string" || typeof body.projectRoot !== "string") throw new Error("Invalid Serena pool request.");
      const backend = await pool.ensure(body.projectRoot);
      const forwarded = await enqueueBackendCall(backend, async () => {
        const sessionId = await waitForSession(backend, body.clientId);
        return postMcp(backend.endpoint, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: body.toolName, arguments: body.arguments || {} } }, sessionId);
      });
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ response: forwarded.response }));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: error.message }));
    }
  });
  const timer = setInterval(() => {
    void pool.reclaimIdle().then(() => {
      if (pool.snapshot().length === 0 && Date.now() - lastRequestAt >= 60_000) void shutdown(server);
    });
  }, 60_000);
  timer.unref();
  server.listen({ host: "127.0.0.1", port: poolPort() });
  process.once("SIGTERM", () => void shutdown(server));
  process.once("SIGINT", () => void shutdown(server));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const mode = process.argv[2];
  if (mode === "manager") void runManager();
  else if (mode === "bridge") void runBridge().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
  else { process.stderr.write("Usage: node serena-pool.mjs bridge|manager\n"); process.exitCode = 2; }
}
