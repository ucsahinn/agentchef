const supportedEventTypes = new Map([
  ["suite.snapshot", {
    producers: ["chef", "control"],
    payload: {
      state: ["available", "unavailable", "unknown", "stale", "unsupported"],
      observedAt: "date-time",
      sourceRevision: "string"
    }
  }],
  ["run.observed", {
    producers: ["control"],
    payload: {
      runState: ["queued", "running", "succeeded", "failed", "cancelled", "unavailable", "stale"],
      mode: ["read-only", "approved-write"],
      worktreeState: ["ready", "isolated", "dirty", "missing", "unknown"]
    }
  }],
  ["approval.observed", {
    producers: ["control"],
    payload: {
      decision: ["approved", "rejected", "pending"],
      decisionAt: "date-time",
      scope: ["run.start", "run.stop", "worktree.change"]
    }
  }],
  ["capability.observed", {
    producers: ["chef", "control"],
    payload: {
      capability: ["routing.read", "run.read", "approval.read", "worktree.read", "repository.mutate", "publish"],
      availability: ["available", "unavailable", "unknown", "forbidden"],
      reasonCode: ["available", "connector-unavailable", "permission-denied", "schema-unsupported", "source-stale", "upstream-unavailable", "invalid-envelope"]
    }
  }],
  ["projection.degraded", {
    producers: ["kitchen"],
    payload: {
      reasonCode: ["available", "connector-unavailable", "permission-denied", "schema-unsupported", "source-stale", "upstream-unavailable", "invalid-envelope"],
      lastFreshAt: "date-time"
    }
  }]
]);

const envelopeFields = new Set([
  "schemaVersion", "eventId", "eventType", "occurredAt", "producer", "correlation", "capabilities", "payload"
]);
const producerProducts = new Set(["chef", "control", "kitchen"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasNonEmptyStrings(value, fields) {
  return fields.every((field) => typeof value[field] === "string" && value[field].length > 0);
}

function isDateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function hasValidPayload(payload, contract) {
  const fields = Object.keys(contract);
  if (!isRecord(payload)) return "malformed-payload";
  if (!hasOnlyFields(payload, new Set(fields))) return "unexpected-payload-field";
  for (const field of fields) {
    const rule = contract[field];
    if (rule === "string" && !hasNonEmptyStrings(payload, [field])) return "malformed-payload";
    if (rule === "date-time" && !isDateTime(payload[field])) return "malformed-payload";
    if (Array.isArray(rule) && !rule.includes(payload[field])) return "malformed-payload";
  }
  return null;
}

export function validateEnvelope(value) {
  if (!isRecord(value) || !hasOnlyFields(value, envelopeFields)) return { ok: false, code: "unexpected-field" };
  if (!hasNonEmptyStrings(value, ["schemaVersion", "eventId", "eventType", "occurredAt"])) return { ok: false, code: "malformed-envelope" };
  const [major, minor] = value.schemaVersion.split(".");
  if (!/^[0-9]+$/.test(major || "") || !/^[0-9]+$/.test(minor || "") || value.schemaVersion.split(".").length !== 2) return { ok: false, code: "malformed-envelope" };
  if (major !== "1") return { ok: false, code: "unsupported-schema-major" };
  if (!supportedEventTypes.has(value.eventType)) return { ok: false, code: "unsupported-event-type" };
  if (!isDateTime(value.occurredAt)) return { ok: false, code: "malformed-envelope" };
  if (!isRecord(value.producer) || !hasOnlyFields(value.producer, new Set(["product", "version"])) || !hasNonEmptyStrings(value.producer, ["product", "version"]) || !producerProducts.has(value.producer.product)) return { ok: false, code: "malformed-envelope" };
  const eventContract = supportedEventTypes.get(value.eventType);
  if (!eventContract.producers.includes(value.producer.product)) return { ok: false, code: "forbidden-producer" };
  if (!isRecord(value.correlation) || !hasOnlyFields(value.correlation, new Set(["suiteId", "taskId", "runId"])) || !hasNonEmptyStrings(value.correlation, ["suiteId"])) return { ok: false, code: "malformed-envelope" };
  if (["taskId", "runId"].some((field) => field in value.correlation && (typeof value.correlation[field] !== "string" || value.correlation[field].length === 0))) return { ok: false, code: "malformed-envelope" };
  if ("capabilities" in value && (!Array.isArray(value.capabilities) || value.capabilities.some((capability) => typeof capability !== "string" || capability.length === 0))) return { ok: false, code: "malformed-envelope" };
  const payloadError = hasValidPayload(value.payload, eventContract.payload);
  if (payloadError) return { ok: false, code: payloadError };
  return { ok: true, value };
}
