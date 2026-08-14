#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const DEFAULT_ORPHAN_GRACE_MS = 60_000;
const DEFAULT_SESSION_END_DELAY_MS = 45_000;
const MAX_BUFFER = 16 * 1024 * 1024;
const SESSION_STATE_ROOT = path.join(os.tmpdir(), "codex-chef-session-end");
const SESSION_OUTCOME_ROOT = path.join(SESSION_STATE_ROOT, "outcomes");

const MCP_SIGNATURES = [
  ["chrome-devtools", /chrome-devtools-mcp/i],
  ["codebase-memory", /codebase-memory-mcp/i],
  ["context7", /@upstash[\\/]+context7-mcp/i],
  ["sequential-thinking", /server-sequential-thinking/i],
  ["playwright", /@playwright[\\/]+mcp/i],
  ["memory", /@modelcontextprotocol[\\/]+server-memory/i],
  ["serena", /serena(?:.+)(?:start-mcp-server|mcp_server|serena-mcp-server)/i]
];

const CODEX_LAUNCHER_PATTERN = /@openai[\\/]+codex[\\/]+bin[\\/]+codex\.js/i;
const CONTROL_PATTERN = /codex-chef-control|control-mcp/i;
const BRIDGE_PROCESS_NAMES = new Set([
  "cmd",
  "node",
  "npm",
  "npx",
  "python",
  "python3",
  "serena",
  "sh",
  "bash",
  "uv",
  "uvx"
]);
const RUNTIME_NAMES = new Map([
  ["node", "node"],
  ["python", "python"],
  ["python3", "python"],
  ["serena", "serena"],
  ["uvx", "uvx"]
]);

function normalizeName(value) {
  return path.basename(String(value || "")).replace(/\.(?:exe|cmd|bat)$/i, "").toLowerCase();
}

function safeCollectionError(error) {
  const message = String(error?.message || error || "");
  if (/access.+denied|permission|unauthori[sz]ed|privilege/i.test(message)) {
    return "Detailed process metadata access was denied.";
  }
  if (/timed?\s*out|timeout/i.test(message)) {
    return "Detailed process metadata collection timed out.";
  }
  return "Detailed process metadata collection failed.";
}

function normalizeCreatedAt(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  const text = String(value || "").trim();
  const dotNetDate = text.match(/^\/Date\((\d+)(?:[+-]\d+)?\)\/$/);
  const timestamp = dotNetDate ? Number(dotNetDate[1]) : Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function sameProcessIdentity(left, right) {
  return Number(left?.pid) === Number(right?.pid)
    && Boolean(left?.createdAt)
    && left.createdAt === right?.createdAt;
}

function mcpServerFor(processEntry) {
  const commandLine = String(processEntry?.commandLine || "");
  for (const [server, pattern] of MCP_SIGNATURES) {
    if (pattern.test(commandLine)) return server;
  }
  return null;
}

function isCodexProcess(processEntry) {
  const name = normalizeName(processEntry?.name);
  return name === "codex"
    || name.startsWith("codex-command-runner")
    || CODEX_LAUNCHER_PATTERN.test(String(processEntry?.commandLine || ""));
}

function isControlProcess(processEntry) {
  return CONTROL_PATTERN.test(String(processEntry?.commandLine || ""));
}

function normalizeProcessEntry(entry) {
  return {
    pid: Number(entry?.pid ?? entry?.ProcessId ?? 0),
    parentPid: Number(entry?.parentPid ?? entry?.ParentProcessId ?? 0),
    name: String(entry?.name ?? entry?.Name ?? ""),
    commandLine: String(entry?.commandLine ?? entry?.CommandLine ?? ""),
    createdAt: normalizeCreatedAt(entry?.createdAt ?? entry?.CreationDate),
    workingSetBytes: Number(entry?.workingSetBytes ?? entry?.WorkingSetSize ?? 0) || 0
  };
}

function normalizedSnapshot(processes) {
  return (Array.isArray(processes) ? processes : [])
    .map(normalizeProcessEntry)
    .filter((entry) => Number.isInteger(entry.pid) && entry.pid > 0);
}

function processMaps(processes) {
  const byPid = new Map(processes.map((entry) => [entry.pid, entry]));
  const children = new Map();
  for (const entry of processes) {
    if (!children.has(entry.parentPid)) children.set(entry.parentPid, []);
    children.get(entry.parentPid).push(entry);
  }
  return { byPid, children };
}

function walkAncestors(startPid, byPid) {
  const ancestors = [];
  const visited = new Set();
  let current = byPid.get(Number(startPid));
  while (current && !visited.has(current.pid)) {
    visited.add(current.pid);
    ancestors.push(current);
    current = byPid.get(current.parentPid);
  }
  return ancestors;
}

function nearestCodexAncestor(processEntry, byPid) {
  return walkAncestors(processEntry?.parentPid, byPid).find(isCodexProcess) || null;
}

function highestTaggedAncestor(processEntry, server, byPid) {
  let root = processEntry;
  for (const ancestor of walkAncestors(processEntry?.parentPid, byPid)) {
    if (isCodexProcess(ancestor) || isControlProcess(ancestor)) break;
    if (mcpServerFor(ancestor) === server) root = ancestor;
  }
  return root;
}

function descendantsOf(rootPid, children) {
  const descendants = [];
  const queue = [...(children.get(Number(rootPid)) || [])];
  const visited = new Set();
  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry || visited.has(entry.pid)) continue;
    visited.add(entry.pid);
    descendants.push(entry);
    queue.push(...(children.get(entry.pid) || []));
  }
  return descendants;
}

function instanceTreePids(rootPid, children, instanceRootPids) {
  const processIds = new Set([Number(rootPid)]);
  const queue = [...(children.get(Number(rootPid)) || [])];
  const visited = new Set();
  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry || visited.has(entry.pid)) continue;
    visited.add(entry.pid);
    if (isCodexProcess(entry) || isControlProcess(entry) || instanceRootPids.has(entry.pid)) {
      continue;
    }
    processIds.add(entry.pid);
    queue.push(...(children.get(entry.pid) || []));
  }
  return processIds;
}

function mb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

function ageMs(entry, now) {
  const started = Date.parse(entry?.createdAt || "");
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

export function analyzeProcessSnapshot(processes, options = {}) {
  const normalized = normalizedSnapshot(processes);
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const orphanGraceMs = Number.isFinite(Number(options.orphanGraceMs))
    ? Math.max(0, Number(options.orphanGraceMs))
    : DEFAULT_ORPHAN_GRACE_MS;
  const { byPid, children } = processMaps(normalized);
  const tagByPid = new Map();

  for (const entry of normalized) {
    if (isControlProcess(entry)) continue;
    const server = mcpServerFor(entry);
    if (server) tagByPid.set(entry.pid, server);
  }

  const nativeCodex = normalized.filter((entry) => normalizeName(entry.name) === "codex");
  const launchers = normalized.filter((entry) => (
    CODEX_LAUNCHER_PATTERN.test(entry.commandLine)
    && !descendantsOf(entry.pid, children).some((child) => normalizeName(child.name) === "codex")
  ));
  const sessionProcesses = [...nativeCodex, ...launchers];
  const groups = new Map();

  for (const entry of normalized) {
    const server = tagByPid.get(entry.pid);
    if (!server) continue;
    const owner = nearestCodexAncestor(entry, byPid);
    const root = highestTaggedAncestor(entry, server, byPid);
    const key = owner
      ? `active:${owner.pid}:${root.pid}:${server}`
      : `unowned:${root.pid}:${server}`;
    if (!groups.has(key)) {
      groups.set(key, {
        server,
        ownerPid: owner?.pid || null,
        rootPid: root.pid,
        rootCreatedAt: root.createdAt,
        taggedProcessIds: new Set(),
        processIds: new Set()
      });
    }
    groups.get(key).taggedProcessIds.add(entry.pid);
  }

  const instanceRootPids = new Set([...groups.values()].map((group) => group.rootPid));
  const relatedPids = new Set();
  for (const group of groups.values()) {
    group.processIds = instanceTreePids(group.rootPid, children, instanceRootPids);
    for (const taggedPid of group.taggedProcessIds) group.processIds.add(taggedPid);
    for (const ancestor of walkAncestors(byPid.get(group.rootPid)?.parentPid, byPid)) {
      if (isCodexProcess(ancestor) || isControlProcess(ancestor) || instanceRootPids.has(ancestor.pid)) {
        break;
      }
      if (!BRIDGE_PROCESS_NAMES.has(normalizeName(ancestor.name))) break;
      group.processIds.add(ancestor.pid);
    }
    for (const pid of group.processIds) relatedPids.add(pid);
  }

  const instanceRecords = [...groups.values()].map((group) => {
    const root = byPid.get(group.rootPid);
    const active = Boolean(group.ownerPid);
    const processIds = [...group.processIds];
    const workingSetBytes = processIds.reduce(
      (sum, pid) => sum + Number(byPid.get(pid)?.workingSetBytes || 0),
      0
    );
    const rootAgeMs = ageMs(root, now);
    const cleanupEligible = !active && Boolean(root?.createdAt) && rootAgeMs >= orphanGraceMs;
    return {
      server: group.server,
      ownerPid: group.ownerPid,
      rootPid: group.rootPid,
      startedAt: group.rootCreatedAt,
      state: active ? "active" : cleanupEligible ? "orphan" : "grace",
      cleanupEligible,
      ageSeconds: Math.floor(rootAgeMs / 1000),
      processCount: processIds.length,
      workingSetMb: mb(workingSetBytes),
      processIds
    };
  }).sort((left, right) => (
    left.server.localeCompare(right.server)
    || left.rootPid - right.rootPid
  ));
  const instances = instanceRecords.map(({ processIds, ...instance }) => instance);

  const unrelatedRuntimes = { node: 0, python: 0, serena: 0, uvx: 0 };
  for (const entry of normalized) {
    const runtime = RUNTIME_NAMES.get(normalizeName(entry.name));
    if (!runtime) continue;
    if (isCodexProcess(entry) || isControlProcess(entry) || relatedPids.has(entry.pid)) continue;
    unrelatedRuntimes[runtime] += 1;
  }

  const serverMap = new Map();
  for (const instance of instances) {
    if (!serverMap.has(instance.server)) {
      serverMap.set(instance.server, {
        server: instance.server,
        instances: 0,
        active: 0,
        orphanCandidates: 0,
        grace: 0,
        processes: 0,
        workingSetMb: 0
      });
    }
    const summary = serverMap.get(instance.server);
    summary.instances += 1;
    summary[instance.state === "orphan" ? "orphanCandidates" : instance.state] += 1;
    summary.processes += instance.processCount;
    summary.workingSetMb = Math.round((summary.workingSetMb + instance.workingSetMb) * 10) / 10;
  }

  const sessions = sessionProcesses.map((entry) => {
    const ownedInstances = instanceRecords.filter((instance) => instance.ownerPid === entry.pid);
    const ownedPids = new Set();
    for (const instance of ownedInstances) {
      for (const pid of instance.processIds) ownedPids.add(pid);
    }
    return {
      pid: entry.pid,
      startedAt: entry.createdAt,
      mcpInstances: ownedInstances.length,
      helperProcesses: ownedPids.size,
      workingSetMb: mb([...ownedPids].reduce(
        (sum, pid) => sum + Number(byPid.get(pid)?.workingSetBytes || 0),
        Number(entry.workingSetBytes || 0)
      ))
    };
  }).sort((left, right) => left.pid - right.pid);

  const cleanupCandidates = instances
    .filter((instance) => instance.cleanupEligible)
    .map((instance) => ({
      rootPid: instance.rootPid,
      rootCreatedAt: instance.startedAt,
      server: instance.server,
      ageSeconds: instance.ageSeconds,
      processCount: instance.processCount,
      workingSetMb: instance.workingSetMb
    }));

  return {
    schemaVersion: 2,
    generatedAt: new Date(now).toISOString(),
    status: "ok",
    detailAvailable: true,
    codexSessions: sessions.length,
    codexProcessCount: normalized.filter(isCodexProcess).length,
    localMcpInstances: instances.length,
    activeMcpInstances: instances.filter((instance) => instance.state === "active").length,
    orphanCandidates: cleanupCandidates.length,
    graceInstances: instances.filter((instance) => instance.state === "grace").length,
    mcpHelperProcesses: relatedPids.size,
    mcpWorkingSetMb: mb([...relatedPids].reduce(
      (sum, pid) => sum + Number(byPid.get(pid)?.workingSetBytes || 0),
      0
    )),
    unrelatedRuntimes,
    sessions,
    servers: [...serverMap.values()].sort((left, right) => left.server.localeCompare(right.server)),
    instances,
    cleanupCandidates,
    safety: [
      "Active MCP trees with a live Codex ancestor are never cleanup candidates.",
      "Unowned MCP trees stay in a grace period before they can be selected.",
      "Unrelated Node, Python, browser, product, and development-server processes are excluded.",
      "Cleanup requires explicit --apply, except for a separately trusted SessionEnd ownership snapshot."
    ]
  };
}

export function verifyCleanupPlan(processes, plan) {
  const normalized = normalizedSnapshot(processes);
  const { byPid } = processMaps(normalized);
  return (Array.isArray(plan) ? plan : []).filter((item) => {
    const rootPid = Number(item?.rootPid);
    const current = byPid.get(rootPid);
    const expected = {
      pid: rootPid,
      createdAt: normalizeCreatedAt(item?.rootCreatedAt)
    };
    if (!sameProcessIdentity(current, expected)) return false;
    if (mcpServerFor(current) !== item.server) return false;
    if (nearestCodexAncestor(current, byPid)) return false;
    return highestTaggedAncestor(current, item.server, byPid)?.pid === rootPid;
  });
}

export function captureSessionOwnedSnapshot(processes, hookPid = process.pid) {
  const normalized = normalizedSnapshot(processes);
  const { byPid } = processMaps(normalized);
  const hook = byPid.get(Number(hookPid));
  if (!hook) return null;
  const owner = nearestCodexAncestor(hook, byPid);
  if (!owner) return null;
  const ownerChain = [owner];
  for (const ancestor of walkAncestors(owner.parentPid, byPid)) {
    if (!isCodexProcess(ancestor)) break;
    ownerChain.push(ancestor);
  }
  const owned = normalized
    .filter((entry) => (
      !isControlProcess(entry)
      && Boolean(mcpServerFor(entry))
      && nearestCodexAncestor(entry, byPid)?.pid === owner.pid
    ))
    .map((entry) => ({
      pid: entry.pid,
      parentPid: entry.parentPid,
      name: normalizeName(entry.name),
      server: mcpServerFor(entry),
      createdAt: entry.createdAt
    }))
    .sort((left, right) => left.pid - right.pid);
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    ownerPid: owner.pid,
    ownerChain: ownerChain.map((entry) => ({
      pid: entry.pid,
      createdAt: entry.createdAt
    })),
    processes: owned
  };
}

function snapshotServerRoot(entry, snapshotByPid) {
  let root = entry;
  const visited = new Set([entry.pid]);
  let parent = snapshotByPid.get(entry.parentPid);
  while (parent && parent.server === entry.server && !visited.has(parent.pid)) {
    visited.add(parent.pid);
    root = parent;
    parent = snapshotByPid.get(parent.parentPid);
  }
  return root;
}

export function buildOwnedCleanupPlan(processes, snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.processes)) return [];
  const normalized = normalizedSnapshot(processes);
  const { byPid } = processMaps(normalized);
  if ((snapshot.ownerChain || []).some((owner) => sameProcessIdentity(byPid.get(owner.pid), owner))) {
    return [];
  }

  const snapshotByPid = new Map(snapshot.processes.map((entry) => [entry.pid, entry]));
  const roots = snapshot.processes.filter((entry) => (
    snapshotServerRoot(entry, snapshotByPid).pid === entry.pid
  ));
  const plan = [];
  for (const root of roots) {
    const current = byPid.get(root.pid);
    if (!sameProcessIdentity(current, root) || mcpServerFor(current) !== root.server) continue;
    const memberPids = snapshot.processes
      .filter((entry) => (
        entry.server === root.server
        && snapshotServerRoot(entry, snapshotByPid).pid === root.pid
      ))
      .map((entry) => entry.pid)
      .filter((pid) => {
        const candidate = byPid.get(pid);
        return sameProcessIdentity(candidate, snapshotByPid.get(pid))
          && mcpServerFor(candidate) === root.server;
      });
    plan.push({
      rootPid: root.pid,
      rootCreatedAt: root.createdAt,
      server: root.server,
      processCount: memberPids.length,
      ownershipReceipt: {
        schemaVersion: 1,
        ownerPid: snapshot.ownerPid,
        ownerChain: (snapshot.ownerChain || []).map((owner) => ({
          pid: owner.pid,
          createdAt: owner.createdAt
        })),
        rootPid: root.pid,
        rootCreatedAt: root.createdAt,
        server: root.server,
        processes: snapshot.processes
          .filter((entry) => (
            entry.server === root.server
            && snapshotServerRoot(entry, snapshotByPid).pid === root.pid
          ))
          .map((entry) => ({
            pid: entry.pid,
            parentPid: entry.parentPid,
            server: entry.server,
            createdAt: entry.createdAt
          }))
      }
    });
  }
  return plan.sort((left, right) => left.rootPid - right.rootPid);
}

function receiptMatchesPlan(item, byPid) {
  const receipt = item?.ownershipReceipt;
  if (!receipt || receipt.schemaVersion !== 1 || !Array.isArray(receipt.processes)) return null;
  const rootPid = Number(item?.rootPid);
  const root = byPid.get(rootPid);
  if (!sameProcessIdentity(root, { pid: rootPid, createdAt: normalizeCreatedAt(item?.rootCreatedAt) })) return null;
  if (receipt.rootPid !== rootPid
    || normalizeCreatedAt(receipt.rootCreatedAt) !== normalizeCreatedAt(item?.rootCreatedAt)
    || receipt.server !== item?.server
    || mcpServerFor(root) !== item?.server
    || highestTaggedAncestor(root, item.server, byPid)?.pid !== rootPid
    || nearestCodexAncestor(root, byPid)) return null;
  if (!Array.isArray(receipt.ownerChain) || receipt.ownerChain.length === 0
    || Number(receipt.ownerPid) !== Number(receipt.ownerChain[0]?.pid)
    || receipt.ownerChain.some((owner) => !Number.isInteger(Number(owner?.pid)) || !normalizeCreatedAt(owner?.createdAt))) return null;
  if (receipt.ownerChain.some((owner) => sameProcessIdentity(byPid.get(Number(owner?.pid)), owner))) return null;

  const members = receipt.processes.map((member) => byPid.get(Number(member?.pid)));
  if (members.length === 0 || members.some((member, index) => (
    !sameProcessIdentity(member, receipt.processes[index])
    || mcpServerFor(member) !== item.server
  ))) return null;
  if (!members.some((member) => member.pid === rootPid)) return null;
  return members;
}

function descendantsFirst(members, rootPid) {
  const memberIds = new Set(members.map((member) => member.pid));
  const children = new Map();
  for (const member of members) {
    if (!memberIds.has(member.parentPid)) continue;
    if (!children.has(member.parentPid)) children.set(member.parentPid, []);
    children.get(member.parentPid).push(member);
  }
  const ordered = [];
  const visit = (pid, visited = new Set()) => {
    if (visited.has(pid)) return;
    visited.add(pid);
    for (const child of children.get(pid) || []) visit(child.pid, visited);
    if (pid !== rootPid) ordered.push(pid);
  };
  visit(rootPid);
  return ordered;
}

function parsePowerShellSnapshot(stdout) {
  const parsed = JSON.parse(String(stdout || "null"));
  return normalizedSnapshot(parsed == null ? [] : Array.isArray(parsed) ? parsed : [parsed]);
}

function collectWindowsSnapshot() {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,CreationDate,WorkingSetSize) | ConvertTo-Json -Compress"
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: MAX_BUFFER
    }
  );
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || String(result.stderr || result.stdout || `exit ${result.status}`).trim());
  }
  return parsePowerShellSnapshot(result.stdout);
}

function collectUnixSnapshot() {
  const result = spawnSync(
    "ps",
    ["-axo", "pid=,ppid=,rss=,lstart=,comm=,args="],
    {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: MAX_BUFFER
    }
  );
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || String(result.stderr || result.stdout || `exit ${result.status}`).trim());
  }
  const processes = [];
  for (const line of String(result.stdout || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d{4})\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    processes.push(normalizeProcessEntry({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      workingSetBytes: Number(match[3]) * 1024,
      createdAt: `${match[4]} ${match[5]} ${match[6]} ${match[7]} ${match[8]}`,
      name: match[9],
      commandLine: match[10]
    }));
  }
  return processes;
}

export function collectProcessSnapshot() {
  try {
    return {
      ok: true,
      source: process.platform === "win32" ? "Win32_Process" : "ps",
      processes: process.platform === "win32" ? collectWindowsSnapshot() : collectUnixSnapshot(),
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      source: process.platform === "win32" ? "Win32_Process" : "ps",
      processes: [],
      error: safeCollectionError(error)
    };
  }
}

function fallbackRuntimeCounts() {
  const counts = { node: 0, python: 0, serena: 0, uvx: 0, codex: 0 };
  const command = process.platform === "win32" ? "tasklist.exe" : "ps";
  const args = process.platform === "win32" ? ["/fo", "csv", "/nh"] : ["-axo", "comm="];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: MAX_BUFFER
  });
  if (result.error || result.status !== 0) return counts;
  for (const line of String(result.stdout || "").split(/\r?\n/)) {
    const rawName = process.platform === "win32"
      ? line.match(/^"([^"]+)"/)?.[1]
      : line.trim();
    const name = normalizeName(rawName);
    if (name === "codex" || name.startsWith("codex-command-runner")) counts.codex += 1;
    const runtime = RUNTIME_NAMES.get(name);
    if (runtime) counts[runtime] += 1;
  }
  return counts;
}

export function buildProcessAudit(options = {}) {
  const collected = collectProcessSnapshot();
  if (collected.ok) {
    return {
      ...analyzeProcessSnapshot(collected.processes, options),
      platform: process.platform,
      source: collected.source,
      error: null
    };
  }
  const fallback = fallbackRuntimeCounts();
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    source: "fallback-name-count",
    status: "attention",
    detailAvailable: false,
    codexSessions: fallback.codex,
    codexProcessCount: fallback.codex,
    localMcpInstances: 0,
    activeMcpInstances: 0,
    orphanCandidates: 0,
    graceInstances: 0,
    mcpHelperProcesses: 0,
    mcpWorkingSetMb: 0,
    unrelatedRuntimes: {
      node: fallback.node,
      python: fallback.python,
      serena: fallback.serena,
      uvx: fallback.uvx
    },
    sessions: [],
    servers: [],
    instances: [],
    cleanupCandidates: [],
    error: collected.error,
    safety: [
      "Detailed parent/child inspection was unavailable; no cleanup plan was produced.",
      "Name-only fallback counts are evidence of load, not proof that a process is stale."
    ]
  };
}

export function terminateCleanupPlan(plan, options = {}) {
  const collected = Array.isArray(options.processes)
    ? { ok: true, processes: normalizedSnapshot(options.processes), error: null }
    : collectProcessSnapshot();
  if (!collected.ok) {
    return (Array.isArray(plan) ? plan : []).map((item) => ({
      rootPid: Number(item?.rootPid),
      server: item?.server,
      ok: false,
      stopped: false,
      exitCode: null,
      error: `Process identity recheck unavailable: ${collected.error}`
    }));
  }
  const { byPid } = processMaps(collected.processes);
  const platform = options.platform || process.platform;
  const run = options.spawnSync || spawnSync;
  const results = [];
  for (const item of Array.isArray(plan) ? plan : []) {
    const pid = Number(item?.rootPid);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    const members = receiptMatchesPlan(item, byPid);
    if (!members) {
      results.push({
        rootPid: pid,
        server: item.server,
        ok: true,
        stopped: false,
        exitCode: null,
        error: null,
        skippedReason: "Process lacked a trusted ownership receipt, exited, changed identity, gained an active Codex owner, or no longer matched the captured MCP tree."
      });
      continue;
    }
    const targets = platform === "win32" ? [pid] : [...descendantsFirst(members, pid), pid];
    const command = platform === "win32" ? "taskkill.exe" : "kill";
    const commandResults = targets.map((targetPid) => run(
      command,
      platform === "win32" ? ["/PID", String(targetPid), "/T"] : ["-TERM", String(targetPid)],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: Number(options.timeoutMs || 15_000)
      }
    ));
    const result = commandResults.find((entry) => entry.error || entry.status !== 0) || commandResults.at(-1);
    results.push({
      rootPid: pid,
      server: item.server,
      ok: commandResults.every((entry) => !entry.error && entry.status === 0),
      stopped: commandResults.every((entry) => !entry.error && entry.status === 0),
      exitCode: result.status,
      error: result.error?.message || (result.status === 0 ? null : String(result.stderr || result.stdout || "").trim())
    });
  }
  return results;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (input.length > 1_000_000) reject(new Error("Hook input exceeded 1 MB."));
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function createOwnedSweepState(snapshot) {
  fs.mkdirSync(SESSION_STATE_ROOT, { recursive: true, mode: 0o700 });
  const statePath = path.join(SESSION_STATE_ROOT, `${crypto.randomUUID()}.json`);
  fs.writeFileSync(statePath, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return statePath;
}

function consumeOwnedSweepState(statePath) {
  const resolvedRoot = path.resolve(SESSION_STATE_ROOT);
  const resolvedState = path.resolve(String(statePath || ""));
  if (path.dirname(resolvedState) !== resolvedRoot || !/^[0-9a-f-]{36}\.json$/i.test(path.basename(resolvedState))) {
    throw new Error("SessionEnd state path is invalid.");
  }
  const stat = fs.lstatSync(resolvedState);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error("SessionEnd state is invalid.");
  const content = fs.readFileSync(resolvedState, "utf8");
  fs.unlinkSync(resolvedState);
  return JSON.parse(content);
}

function recordOwnedSweepOutcome(snapshot, results, error = null) {
  try {
    fs.mkdirSync(SESSION_OUTCOME_ROOT, { recursive: true, mode: 0o700 });
    const outcome = {
      schemaVersion: "codex-chef.session-end-outcome.v1",
      recordedAt: new Date().toISOString(),
      ownerPid: snapshot?.ownerPid || null,
      resultCount: results.length,
      failedCount: results.filter((item) => !item.ok).length,
      results: results.map((item) => ({ pid: item.rootPid, server: item.server, ok: item.ok, exitCode: item.exitCode ?? null })),
      error: error ? String(error.message || error) : null
    };
    fs.writeFileSync(path.join(SESSION_OUTCOME_ROOT, `${Date.now()}-${crypto.randomUUID()}.json`), JSON.stringify(outcome), { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch {
    // The hook must stay silent and bounded even when its metadata sink is unavailable.
  }
}

function scheduleOwnedSweep(snapshot, delayMs) {
  const statePath = createOwnedSweepState(snapshot);
  const child = spawn(
    process.execPath,
    [scriptPath, "--owned-sweep-state", statePath, "--apply", "--delay-ms", String(delayMs)],
    {
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    }
  );
  child.unref();
}

async function runSessionEndHook(delayMs) {
  const rawInput = await readStdin();
  const input = JSON.parse(rawInput || "{}");
  if (input.hook_event_name !== "SessionEnd") return 0;
  const collected = collectProcessSnapshot();
  if (!collected.ok) return 0;
  const snapshot = captureSessionOwnedSnapshot(collected.processes, process.pid);
  if (!snapshot || snapshot.processes.length === 0) return 0;
  scheduleOwnedSweep(snapshot, delayMs);
  return 0;
}

function printHumanAudit(report) {
  console.log("Codex process hygiene");
  console.log(`Status: ${report.status}`);
  console.log(`Codex sessions: ${report.codexSessions}`);
  console.log(`Local MCP instances: ${report.localMcpInstances} (${report.activeMcpInstances} active, ${report.orphanCandidates} orphan candidates, ${report.graceInstances} in grace)`);
  console.log(`MCP helper processes: ${report.mcpHelperProcesses} (${report.mcpWorkingSetMb} MB working set)`);
  console.log(`Unrelated runtimes: node=${report.unrelatedRuntimes.node}, python=${report.unrelatedRuntimes.python}, serena=${report.unrelatedRuntimes.serena}, uvx=${report.unrelatedRuntimes.uvx}`);
  if (report.error) console.log(`Attention: ${report.error}`);
  for (const server of report.servers) {
    console.log(`- ${server.server}: instances=${server.instances}, active=${server.active}, orphan=${server.orphanCandidates}, grace=${server.grace}, processes=${server.processes}`);
  }
  if (Array.isArray(report.cleanupResults)) {
    const stopped = report.cleanupResults.filter((item) => item.stopped).length;
    const skipped = report.cleanupResults.filter((item) => item.ok && !item.stopped).length;
    const failed = report.cleanupResults.filter((item) => !item.ok).length;
    console.log(`Cleanup result: stopped=${stopped}, skipped=${skipped}, failed=${failed}`);
  }
}

export async function runProcessHygieneCli(argv) {
  let json = false;
  let apply = false;
  let cleanupStale = false;
  let sessionEnd = false;
  let ownedSweep = null;
  let ownedSweepState = null;
  let delayMs = DEFAULT_SESSION_END_DELAY_MS;
  let orphanGraceMs = DEFAULT_ORPHAN_GRACE_MS;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") json = true;
    else if (arg === "--apply") apply = true;
    else if (arg === "--cleanup-stale") cleanupStale = true;
    else if (arg === "--session-end") sessionEnd = true;
    else if (arg === "--owned-sweep") ownedSweep = argv[++index];
    else if (arg === "--owned-sweep-state") ownedSweepState = argv[++index];
    else if (arg === "--delay-ms") delayMs = parsePositiveInteger(argv[++index], DEFAULT_SESSION_END_DELAY_MS);
    else if (arg === "--grace-ms") orphanGraceMs = parsePositiveInteger(argv[++index], DEFAULT_ORPHAN_GRACE_MS);
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (sessionEnd) return runSessionEndHook(delayMs);
  if (ownedSweep) {
    throw new Error("--owned-sweep no longer accepts serialized snapshots.");
  }
  if (ownedSweepState) {
    if (!apply) throw new Error("--owned-sweep requires --apply.");
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const snapshot = consumeOwnedSweepState(ownedSweepState);
    const collected = collectProcessSnapshot();
    if (!collected.ok) {
      recordOwnedSweepOutcome(snapshot, [], collected.error || new Error("Process snapshot unavailable."));
      return 0;
    }
    const results = terminateCleanupPlan(buildOwnedCleanupPlan(collected.processes, snapshot));
    recordOwnedSweepOutcome(snapshot, results);
    return 0;
  }

  if (apply && !cleanupStale) throw new Error("--apply requires --cleanup-stale.");
  const report = buildProcessAudit({ orphanGraceMs });
  let cleanupResults = [];
  if (cleanupStale && apply && report.detailAvailable) {
    cleanupResults = terminateCleanupPlan(report.cleanupCandidates);
  }
  const output = cleanupResults.length > 0 ? { ...report, cleanupResults } : report;
  if (json) console.log(JSON.stringify(output, null, 2));
  else printHumanAudit(output);
  return cleanupResults.some((item) => !item.ok) ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath);
if (isMain) {
  try {
    process.exitCode = await runProcessHygieneCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Codex process hygiene error: ${error.message}`);
    process.exitCode = 1;
  }
}
