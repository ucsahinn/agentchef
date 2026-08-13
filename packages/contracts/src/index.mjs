const supportedEventTypes = new Map([
  ["suite.snapshot", { payloadFields: ["state", "observedAt", "sourceRevision"], producers: ["chef", "control"] }],
  ["run.observed", { payloadFields: ["runState", "mode", "worktreeState"], producers: ["control"] }],
  ["approval.observed", { payloadFields: ["decision", "decisionAt", "scope"], producers: ["control"] }],
  ["capability.observed", { payloadFields: ["capability", "availability", "reasonCode"], producers: ["chef", "control"] }],
  ["projection.degraded", { payloadFields: ["reasonCode", "lastFreshAt"], producers: ["kitchen"] }]
]);

const envelopeFields = new Set([
  "schemaVersion", "eventId", "eventType", "occurredAt", "producer", "correlation", "capabilities", "payload"
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasNonEmptyStrings(value, fields) {
  return fields.every((field) => typeof value[field] === "string" && value[field].length > 0);
}

export function validateEnvelope(value) {
  if (!isRecord(value) || !hasOnlyFields(value, envelopeFields)) return { ok: false, code: "unexpected-field" };
  if (!hasNonEmptyStrings(value, ["schemaVersion", "eventId", "eventType", "occurredAt"])) return { ok: false, code: "malformed-envelope" };
  const [major, minor] = value.schemaVersion.split(".");
  if (major !== "1") return { ok: false, code: "unsupported-schema-major" };
  if (!/^[0-9]+$/.test(minor || "") || value.schemaVersion.split(".").length !== 2) return { ok: false, code: "malformed-envelope" };
  if (!supportedEventTypes.has(value.eventType)) return { ok: false, code: "unsupported-event-type" };
  if (Number.isNaN(Date.parse(value.occurredAt))) return { ok: false, code: "malformed-envelope" };
  if (!isRecord(value.producer) || !hasOnlyFields(value.producer, new Set(["product", "version"])) || !hasNonEmptyStrings(value.producer, ["product", "version"])) return { ok: false, code: "malformed-envelope" };
  const eventContract = supportedEventTypes.get(value.eventType);
  if (!eventContract.producers.includes(value.producer.product)) return { ok: false, code: "forbidden-producer" };
  if (!isRecord(value.correlation) || !hasOnlyFields(value.correlation, new Set(["suiteId", "taskId", "runId"])) || !hasNonEmptyStrings(value.correlation, ["suiteId"])) return { ok: false, code: "malformed-envelope" };
  if (["taskId", "runId"].some((field) => field in value.correlation && (typeof value.correlation[field] !== "string" || value.correlation[field].length === 0))) return { ok: false, code: "malformed-envelope" };
  if ("capabilities" in value && (!Array.isArray(value.capabilities) || value.capabilities.some((capability) => typeof capability !== "string" || capability.length === 0))) return { ok: false, code: "malformed-envelope" };
  const { payloadFields } = eventContract;
  if (!isRecord(value.payload) || !hasOnlyFields(value.payload, new Set(payloadFields)) || !hasNonEmptyStrings(value.payload, payloadFields)) return { ok: false, code: "malformed-payload" };
  return { ok: true, value };
}
