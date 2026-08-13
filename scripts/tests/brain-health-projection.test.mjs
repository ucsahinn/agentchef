#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const modulePath = path.join(root, "scripts/lib/brain-health-projection.mjs");

async function loadProjection() {
  assert.equal(fs.existsSync(modulePath), true, "Brain health projection module must exist before behavior can be verified.");
  return import(pathToFileURL(modulePath).href);
}

test("owner health projection retains only the bounded V1 aggregate", async () => {
  const { projectBrainHealth } = await loadProjection();
  const observedAt = "2026-08-13T09:00:00.000Z";
  const projection = projectBrainHealth({
    contentStatus: { ok: true, errors: ["private note path"] },
    securityStatus: {
      ok: false,
      errors: ["C:/private/brain/30-projects/secret.md"],
      metrics: {
        itemCount: 37,
        sandboxReadOnlyItemCount: 37,
        sandboxWriteItemCount: 1,
        reparsePointCount: 0
      }
    },
    audit: {
      ok: false,
      notes: { total: 37, projectIds: ["internal", "secret-project"] },
      freshness: { stale: [{ relativePath: "30-projects/secret.md" }] },
      relationships: {
        resolvedLinks: [{ from: "30-projects/secret.md", to: "20-goals/hidden.md" }],
        brokenLinks: [{ from: "30-projects/secret.md", target: "private-target" }],
        orphanNotes: ["30-projects/secret.md"]
      },
      errors: ["raw audit error"]
    },
    observedAt,
    target: "C:/private/brain",
    notes: [{ id: "brn_private", title: "Secret", projectId: "internal", body: "do not expose" }],
    relationships: { brokenLinks: [{ from: "30-projects/secret.md", target: "private-target" }] }
  });

  assert.deepEqual(projection, {
    schemaVersion: 1,
    status: "available",
    securityStatus: "attention",
    observedAt,
    itemCount: 37,
    sandboxReadOnlyItemCount: 37,
    sandboxWriteItemCount: 1,
    reparsePointCount: 0,
    auditStatus: "attention",
    canonicalNoteCount: 37,
    collectionCount: 2,
    resolvedLinkCount: 1,
    brokenLinkCount: 1,
    orphanNoteCount: 1,
    staleNoteCount: 1
  });
  assert.deepEqual(Object.keys(projection).sort(), [
    "auditStatus", "brokenLinkCount", "canonicalNoteCount", "collectionCount", "itemCount", "observedAt", "orphanNoteCount", "reparsePointCount", "resolvedLinkCount", "sandboxReadOnlyItemCount", "sandboxWriteItemCount", "schemaVersion", "securityStatus", "staleNoteCount", "status"
  ]);
});

test("owner health projection fails closed for incomplete, invalid, or stale owner results", async () => {
  const { projectBrainHealth } = await loadProjection();
  const unavailable = { schemaVersion: 1, status: "unavailable", securityStatus: "unavailable", observedAt: null };

  for (const value of [
    {},
    { contentStatus: { ok: false }, securityStatus: { ok: true }, observedAt: "2026-08-13T09:00:00.000Z" },
    { contentStatus: { ok: true }, securityStatus: { ok: true }, observedAt: "not-a-date" },
    { contentStatus: { ok: true }, securityStatus: { ok: true, metrics: { itemCount: -1 } }, observedAt: "2026-08-13T09:00:00.000Z" },
    { contentStatus: { ok: true }, securityStatus: { ok: true }, audit: { ok: true, notes: { total: 1, projectIds: "not-an-array" }, freshness: { stale: [] }, relationships: { resolvedLinks: [], brokenLinks: [], orphanNotes: [] } }, observedAt: "2026-08-13T09:00:00.000Z" }
  ]) assert.deepEqual(projectBrainHealth(value), unavailable);
});
