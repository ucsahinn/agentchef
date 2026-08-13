import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const fixtureDirectory = new URL("./fixtures/", import.meta.url);
const schemaUrl = new URL("../schemas/event-envelope.v1.schema.json", import.meta.url);
const fixtureNames = [
  "suite.snapshot.valid.json",
  "run.observed.valid.json",
  "approval.observed.valid.json",
  "capability.observed.valid.json",
  "projection.degraded.valid.json"
];

async function readFixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), "utf8"));
}

async function readSchema() {
  return JSON.parse(await readFile(schemaUrl, "utf8"));
}

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

test("accepts every documented v1 event payload fixture", async () => {
  for (const name of fixtureNames) {
    const fixture = await readFixture(name);
    assert.deepEqual(validateEnvelope(fixture), { ok: true, value: fixture }, name);
  }
});

test("rejects a payload enum value outside the documented v1 vocabulary", () => {
  const result = validateEnvelope({
    ...validEnvelope,
    payload: { ...validEnvelope.payload, runState: "teleporting" }
  });
  assert.deepEqual(result, { ok: false, code: "malformed-payload" });
});

test("rejects unclassified redaction-sensitive payload fields", () => {
  const result = validateEnvelope({
    ...validEnvelope,
    payload: { ...validEnvelope.payload, rawPrompt: "synthetic private input" }
  });
  assert.deepEqual(result, { ok: false, code: "unexpected-payload-field" });
});

test("rejects a forbidden producer fixture without interpreting its payload", async () => {
  const fixture = await readFixture("run.observed.forbidden-producer.json");
  assert.deepEqual(validateEnvelope(fixture), { ok: false, code: "forbidden-producer" });
});

test("rejects malformed and unsupported schema versions from synthetic fixtures", async () => {
  const malformed = await readFixture("run.observed.malformed-version.json");
  const unsupported = await readFixture("run.observed.unsupported-major.json");
  assert.deepEqual(validateEnvelope(malformed), { ok: false, code: "malformed-envelope" });
  assert.deepEqual(validateEnvelope(unsupported), { ok: false, code: "unsupported-schema-major" });
});

test("rejects a producer without a classified version", async () => {
  const fixture = await readFixture("run.observed.malformed-producer-version.json");
  assert.deepEqual(validateEnvelope(fixture), { ok: false, code: "malformed-envelope" });
});

test("rejects a producer product outside the schema enum", () => {
  const result = validateEnvelope({
    ...validEnvelope,
    producer: { product: "unclassified", version: "1.0.0" }
  });
  assert.deepEqual(result, { ok: false, code: "malformed-envelope" });
});

test("rejects a timestamp that is parseable but not an RFC 3339 date-time", () => {
  const result = validateEnvelope({ ...validEnvelope, occurredAt: "2026-08-14" });
  assert.deepEqual(result, { ok: false, code: "malformed-envelope" });
});

test("the JSON Schema closes every event payload branch used by the validator fixtures", async () => {
  const schema = await readSchema();
  const payloadDefinitions = Object.values(schema.$defs ?? {});
  assert.equal(payloadDefinitions.length, 5, "schema must define one payload contract per v1 event type");
  for (const name of fixtureNames) {
    const fixture = await readFixture(name);
    const payloadContract = payloadDefinitions.find((definition) =>
      definition.if?.properties?.eventType?.const === fixture.eventType
    );
    assert.ok(payloadContract, `${fixture.eventType} must have a schema payload branch`);
    const payloadSchema = payloadContract.then?.properties?.payload;
    assert.equal(payloadSchema?.additionalProperties, false, `${fixture.eventType} payload must fail closed`);
    assert.deepEqual(payloadSchema?.required, Object.keys(fixture.payload), `${fixture.eventType} required fields`);
    for (const [field, value] of Object.entries(fixture.payload)) {
      const fieldSchema = payloadSchema?.properties?.[field];
      assert.ok(fieldSchema, `${fixture.eventType}.${field} must be classified`);
      if (Array.isArray(fieldSchema.enum)) assert.ok(fieldSchema.enum.includes(value), `${fixture.eventType}.${field} valid fixture must use its enum`);
      else assert.equal(fieldSchema.type, "string", `${fixture.eventType}.${field} must be a safe string field`);
    }
  }
});
