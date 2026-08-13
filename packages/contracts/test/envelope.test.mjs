import assert from "node:assert/strict";
import test from "node:test";
let validateEnvelope;
try {
  ({ validateEnvelope } = await import("../src/index.mjs"));
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}

const validEnvelope = {
  schemaVersion: "1.0",
  eventId: "evt_01JTEST",
  eventType: "run.observed",
  occurredAt: "2026-08-14T00:00:00.000Z",
  producer: { product: "control", version: "0.3.0" },
  correlation: { suiteId: "suite_01JTEST", taskId: "TASK-MSS2GO7LSECFW", runId: "run_01JTEST" },
  capabilities: ["run.read"],
  payload: { runState: "running", mode: "read-only", worktreeState: "ready" }
};

test("accepts the minimum v1 run observation envelope", () => {
  assert.equal(typeof validateEnvelope, "function", "the contracts package must publish envelope validation");
  assert.deepEqual(validateEnvelope(validEnvelope), { ok: true, value: validEnvelope });
});

test("rejects an envelope with an unsupported major before an action can start", () => {
  const result = validateEnvelope({ ...validEnvelope, schemaVersion: "2.0" });
  assert.deepEqual(result, { ok: false, code: "unsupported-schema-major" });
});

test("rejects unclassified envelope fields to keep exports fail-closed", () => {
  const result = validateEnvelope({ ...validEnvelope, rawPrompt: "private input" });
  assert.deepEqual(result, { ok: false, code: "unexpected-field" });
});

test("rejects an observation emitted by a product that is not authoritative for it", () => {
  const result = validateEnvelope({ ...validEnvelope, producer: { product: "chef", version: "0.5.72" } });
  assert.deepEqual(result, { ok: false, code: "forbidden-producer" });
});
