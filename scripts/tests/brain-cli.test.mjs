#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "scripts/brain-cli.mjs");

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
}

function jsonError(result) {
  assert.equal(result.stderr, "");
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, "codex-chef.cli-error.v1");
  assert.equal(report.status, "error");
  assert.equal(report.tool, "brain");
  return report.error?.message || "";
}

function snapshotVault(root) {
  const entries = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    const relativePath = path.relative(root, current).split(path.sep).join("/") || ".";
    if (stat.isDirectory()) {
      entries.push({ relativePath, kind: "directory", length: 0, mtimeMs: stat.mtimeMs });
      for (const name of fs.readdirSync(current)) stack.push(path.join(current, name));
    } else if (stat.isFile()) {
      const content = fs.readFileSync(current);
      entries.push({ relativePath, kind: "file", length: content.length, mtimeMs: stat.mtimeMs, sha256: crypto.createHash("sha256").update(content).digest("hex") });
    } else {
      entries.push({ relativePath, kind: "other", length: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

test("CLI requires an explicit target source and preview writes nothing", () => {
  const missing = run(["init", "--preview", "--json"], { CODEX_CHEF_BRAIN_HOME: "" });
  assert.notEqual(missing.status, 0);
  assert.match(jsonError(missing), /target|vault/i);

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain cli Türkçe "));
  const target = path.join(sandbox, "CodexChefBrain");
  const preview = run(["init", "--target", target, "--preview", "--json"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).action, "preview");
  assert.equal(fs.existsSync(target), false);
});

test("CLI initializes, captures and retrieves a note using JSON contracts", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-flow-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);

  const candidatePath = path.join(sandbox, "candidate.json");
  fs.writeFileSync(candidatePath, JSON.stringify({
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "33333333-3333-4333-8333-333333333333",
    type: "knowledge",
    title: "Control Center çalışma sınırı",
    projectId: "codex-chef-control",
    bodyMarkdown: "Foundation sürümü kalıcı kuyruk çalıştırmaz.",
    privacy: "local",
    confidence: "confirmed",
    retention: "project",
    sourceRefs: ["user:2026-07-22"]
  }), "utf8");

  const capturePreview = run(["capture", "--target", target, "--input", candidatePath, "--preview", "--json"]);
  assert.equal(capturePreview.status, 0, capturePreview.stderr);
  assert.equal(JSON.parse(capturePreview.stdout).status, "create");
  const captureApply = run(["capture", "--target", target, "--input", candidatePath, "--apply", "--json"]);
  assert.equal(captureApply.status, 0, captureApply.stderr);

  const retrieve = run(["retrieve", "--target", target, "--project", "codex-chef-control", "--query", "kuyruk", "--json"]);
  assert.equal(retrieve.status, 0, retrieve.stderr);
  assert.equal(JSON.parse(retrieve.stdout).notes.length, 1);
});

test("CLI retrieves shared and Chef-role memory only for the requested role", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-role-memory-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);

  const candidatePath = path.join(sandbox, "role-memory.json");
  fs.writeFileSync(candidatePath, JSON.stringify({
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "77777777-7777-4777-8777-777777777777",
    type: "decision",
    title: "Security memory boundary",
    projectId: "codex-chef",
    bodyMarkdown: "Shared decisions and the security role use bounded memory.",
    privacy: "local",
    confidence: "confirmed",
    retention: "project",
    sourceRefs: ["user:2026-08-12"],
    agentRoles: ["shared", "security"]
  }), "utf8");

  assert.equal(run(["capture", "--target", target, "--input", candidatePath, "--apply", "--json"]).status, 0);
  const security = run(["retrieve", "--target", target, "--project", "codex-chef", "--role", "security", "--query", "memory", "--json"]);
  assert.equal(security.status, 0, security.stderr);
  assert.equal(JSON.parse(security.stdout).notes.length, 1);

  const frontend = run(["retrieve", "--target", target, "--project", "codex-chef", "--role", "frontend", "--query", "memory", "--json"]);
  assert.equal(frontend.status, 0, frontend.stderr);
  assert.equal(JSON.parse(frontend.stdout).notes.length, 1, "shared memory is available to every Chef role");

  const unknown = run(["retrieve", "--target", target, "--project", "codex-chef", "--role", "not-a-chef-role", "--json"]);
  assert.notEqual(unknown.status, 0);
  assert.match(jsonError(unknown), /role/i);

  const invalidCandidate = { ...JSON.parse(fs.readFileSync(candidatePath, "utf8")), candidateId: "abababab-abab-4bab-8bab-abababababab", agentRoles: ["not-a-chef-role"] };
  fs.writeFileSync(candidatePath, JSON.stringify(invalidCandidate), "utf8");
  const invalidCapture = run(["capture", "--target", target, "--input", candidatePath, "--preview", "--json"]);
  assert.notEqual(invalidCapture.status, 0);
  assert.match(jsonError(invalidCapture), /role/i);
});

test("Brain context-pack schema describes the emitted role and untrusted markers", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas", "brain-context-pack.schema.json"), "utf8"));
  assert.deepEqual(schema.properties.agentRole.type, ["string", "null"]);
  assert.equal(schema.properties.untrusted.const, true);
  assert.equal(schema.properties.notes.items.properties.agentRoles.type, "array");
});

test("CLI capture accepts a UTF-8 BOM candidate from Windows PowerShell", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-bom-candidate-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);
  const candidatePath = path.join(sandbox, "candidate.json");
  fs.writeFileSync(candidatePath, `\uFEFF\uFEFF${JSON.stringify({
    schemaVersion: "codex-chef.brain-candidate.v1",
    candidateId: "99999999-9999-4999-8999-999999999999",
    type: "knowledge",
    title: "Windows candidate encoding",
    projectId: "codex-chef",
    bodyMarkdown: "BOM-safe candidate input.",
    privacy: "local",
    confidence: "confirmed",
    retention: "project",
    sourceRefs: ["user:2026-08-12"],
    agentRoles: ["security"]
  })}`, "utf8");
  const captured = run(["capture", "--target", target, "--input", candidatePath, "--apply", "--json"]);
  assert.equal(captured.status, 0, captured.stderr);
});

test("CLI builds a read-only Obsidian URI and rejects vault escapes", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-uri-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);

  const opened = run(["uri", "--target", target, "--note", "10-command-center/dashboard.md", "--json"]);
  assert.equal(opened.status, 0, opened.stderr);
  assert.deepEqual(JSON.parse(opened.stdout), {
    schemaVersion: "codex-chef.obsidian-uri.v1",
    action: "open",
    vault: "CodexChefBrain",
    note: "10-command-center/dashboard.md",
    uri: "obsidian://open?vault=CodexChefBrain&file=10-command-center%2Fdashboard.md"
  });

  const escaped = run(["uri", "--target", target, "--note", "../outside.md", "--json"]);
  assert.notEqual(escaped.status, 0);
  assert.match(jsonError(escaped), /escapes the vault/i);
});

test("CLI exposes a read-only Windows Brain permission audit", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-permissions-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);
  const before = snapshotVault(target);
  const audited = run(["permissions", "--target", target, "--json"]);

  assert.equal(audited.status === 0 || audited.status === 1, true, audited.stderr);
  const result = JSON.parse(audited.stdout);
  assert.equal(result.schemaVersion, "codex-chef.brain-permissions-windows.v1");
  assert.equal(result.supported, process.platform === "win32");
  if (process.platform === "win32") {
    assert.equal(typeof result.ok, "boolean");
    assert.equal(result.metrics.itemCount > 0, true);
    assert.equal(typeof result.checks.treeFullyScanned, "boolean");
  }
  else assert.equal(result.ok, null);
  assert.deepEqual(snapshotVault(target), before);

  const status = run(["status", "--target", target, "--json"]);
  assert.equal(status.status === 0 || status.status === 1, true, status.stderr);
  const statusReport = JSON.parse(status.stdout);
  assert.equal(statusReport.contentStatus.ok, true);
  assert.equal(statusReport.securityStatus.supported, process.platform === "win32");
  assert.equal(statusReport.ok, process.platform === "win32" ? statusReport.securityStatus.ok : true);
  assert.deepEqual(snapshotVault(target), before);
});

test("CLI health emits only the safe Brain owner aggregate", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-health-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);
  const before = snapshotVault(target);
  const health = run(["health", "--target", target, "--json"]);

  assert.equal(health.status === 0 || health.status === 1, true, health.stderr);
  const projection = JSON.parse(health.stdout);
  assert.equal(projection.schemaVersion, 1);
  assert.ok(["available", "unavailable"].includes(projection.status));
  assert.ok(["ok", "attention", "unavailable"].includes(projection.securityStatus));
  assert.equal(projection.observedAt === null || Number.isFinite(Date.parse(projection.observedAt)), true);
  if (projection.status === "unavailable") {
    assert.deepEqual(projection, {
      schemaVersion: 1,
      status: "unavailable",
      securityStatus: "unavailable",
      observedAt: null
    });
    assert.deepEqual(snapshotVault(target), before);
    return;
  }
  for (const field of ["canonicalNoteCount", "collectionCount", "resolvedLinkCount", "brokenLinkCount", "orphanNoteCount", "staleNoteCount"]) {
    assert.equal(Number.isSafeInteger(projection[field]) && projection[field] >= 0, true, field);
  }
  assert.ok(["ok", "attention", "unavailable"].includes(projection.auditStatus));
  assert.deepEqual(Object.keys(projection).sort(), [
    "auditStatus", "brokenLinkCount", "canonicalNoteCount", "collectionCount", "itemCount", "observedAt", "orphanNoteCount", "reparsePointCount", "resolvedLinkCount", "sandboxReadOnlyItemCount", "sandboxWriteItemCount", "schemaVersion", "securityStatus", "staleNoteCount", "status"
  ]);
  assert.deepEqual(snapshotVault(target), before);
});

test("CLI exposes a read-only Brain correlation audit", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "brain-cli-audit-"));
  const target = path.join(sandbox, "CodexChefBrain");
  assert.equal(run(["init", "--target", target, "--apply", "--json"]).status, 0);
  const before = snapshotVault(target);
  const audited = run(["audit", "--target", target, "--json"]);
  assert.equal(audited.status, 0, audited.stderr);
  const report = JSON.parse(audited.stdout);
  assert.equal(report.schemaVersion, "codex-chef.brain-audit.v1");
  assert.equal(report.target, target);
  assert.equal(Array.isArray(report.freshness.stale), true);
  assert.deepEqual(snapshotVault(target), before);
});

test("Brain documentation names the supported CLI and Control 0.3.0 boundary", () => {
  const documentation = [
    "templates/brain/README.md",
    "docs/brain/README.md",
    "docs/brain/README.tr.md",

    "plugins/codex-chef-workflows/skills/codex-chef-brain/SKILL.md",
    "plugins/codex-chef-workflows/skills/codex-chef-brain/references/brain-protocol.md"
  ];

  for (const relativePath of documentation) {
    const content = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(content, /\bcodex-brain\b/i, `${relativePath} must not advertise an unshipped codex-brain executable.`);
    assert.doesNotMatch(content, /Control 0\.1\.1/i, `${relativePath} must not advertise the superseded Control 0.1.1 contract.`);
  }

  for (const relativePath of documentation.slice(0, 4)) {
    const content = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(content, /npm\.cmd run brain -- status --target/i, `${relativePath} must direct users to the supported Brain status command.`);
  }

  for (const relativePath of documentation.slice(0, 4)) {
    const content = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(content, /npm\.cmd run brain -- audit --target/i, `${relativePath} must document the supported Brain correlation audit.`);
  }

  for (const relativePath of documentation.slice(1)) {
    const content = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(content, /Control\s+0\.3\.0/i, `${relativePath} must identify the current Control boundary.`);
  }
});
