#!/usr/bin/env node
// Read-only probe of the installed Serena pool for codex-status: the port the
// installed bridge prefers, whether this machine can bind it, the port a
// running manager recorded, and whether a manager answers. It starts nothing
// and prints no token. Run as a child with CODEX_HOME set, because the bridge
// module derives its state directory from the environment at import time.
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function bindState(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code === "EADDRINUSE" ? "in_use" : error.code === "EACCES" ? "forbidden" : `error:${error.code || "unknown"}`));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve("free")));
  });
}

// The manager's /health reply, "foreign" for a manager of another state
// directory (401), or null when nothing of the pool's shape answers.
function health(port, token, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: "/health", method: "GET", timeout: timeoutMs, headers: token ? { authorization: `Bearer ${token}` } : {} }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode === 401) { resolve("foreign"); return; }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(response.statusCode === 200 && parsed?.ok === true && typeof parsed.profile === "string" ? parsed : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(null));
    request.end();
  });
}

export async function probeSerenaPool({ codexHome, timeoutMs = 500 }) {
  const bridgeFile = path.join(codexHome, "serena-pool.mjs");
  if (!fs.existsSync(bridgeFile)) return { inspected: false, note: "serena-pool.mjs is not installed at the target Codex home." };
  process.env.CODEX_HOME = codexHome;
  const pool = await import(pathToFileURL(bridgeFile).href);
  const preferredPort = pool.poolPort();
  const installedProfile = typeof pool.MANAGER_PROFILE === "string" ? pool.MANAGER_PROFILE : null;
  const fallback = typeof pool.fallbackPort === "function";
  const recordedPort = typeof pool.recordedPort === "function" ? pool.recordedPort() : null;
  let token = null;
  try { token = fs.readFileSync(path.join(codexHome, "serena-pool", "token"), "utf8").trim(); } catch { /* no manager has run yet */ }

  let manager = { port: null, state: "none" };
  let preferredPortState = null;
  for (const port of new Set([recordedPort, preferredPort].filter(Boolean))) {
    const reply = await health(port, token, timeoutMs);
    if (reply === "foreign") {
      if (port === preferredPort) preferredPortState = "foreign_manager";
      continue;
    }
    if (reply) {
      manager = { port, state: installedProfile && reply.profile === installedProfile ? "current" : "older" };
      break;
    }
  }
  if (manager.port === preferredPort) preferredPortState = "manager";
  else if (!preferredPortState) preferredPortState = await bindState(preferredPort);

  return {
    inspected: true,
    bridge: bridgeFile,
    preferredPort,
    preferredPortState,
    recordedPort,
    manager,
    fallback
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf("--codex-home");
  const codexHome = path.resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : process.env.CODEX_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".codex"));
  probeSerenaPool({ codexHome })
    .then((result) => { process.stdout.write(`${JSON.stringify(result)}\n`); })
    .catch((error) => { process.stdout.write(`${JSON.stringify({ inspected: false, note: `Serena pool probe failed: ${error.message}` })}\n`); });
}

export const probeFile = fileURLToPath(import.meta.url);
