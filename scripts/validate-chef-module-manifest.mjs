const rootFields = new Set(["schemaVersion", "module", "version", "runtime", "contracts", "health", "brain", "noCopyState"]);
const noCopyRequired = new Set(["auth", "sessions", "brain-content", "control-state"]);
const unsafeValue = /(?:[A-Za-z]:[\\/]|\\\\|\/home\/|\/Users\/|token|secret|password|cookie)/i;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function only(value, fields) {
  return record(value) && Object.keys(value).every((key) => fields.has(key));
}

function safeString(value) {
  return typeof value === "string" && value.length > 0 && !unsafeValue.test(value);
}

export function validateChefModuleManifest(value) {
  if (!only(value, rootFields)) return { ok: false, code: "unexpected-field" };
  if (value.schemaVersion !== "1.0") return { ok: false, code: "unsupported-schema-major" };
  if (value.module !== "chef" || !safeString(value.version)) return { ok: false, code: "unsafe-value" };
  if (!only(value.runtime, new Set(["nodeCompatibility"])) || value.runtime.nodeCompatibility !== ">=18") return { ok: false, code: "malformed-runtime" };
  if (!only(value.contracts, new Set(["events", "capabilities"]))
    || ![value.contracts.events, value.contracts.capabilities].every((versions) => Array.isArray(versions) && versions.length > 0 && versions.every((version) => version === 1))) {
    return { ok: false, code: "malformed-contracts" };
  }
  if (!only(value.health, new Set(["commandId", "mode"])) || value.health.commandId !== "chef.health.v1" || value.health.mode !== "read-only"
    || !only(value.brain, new Set(["healthCommandId", "mode"])) || value.brain.healthCommandId !== "brain.health.v1" || value.brain.mode !== "read-only") {
    return { ok: false, code: "forbidden-health-contract" };
  }
  if (!Array.isArray(value.noCopyState) || value.noCopyState.some((entry) => !safeString(entry)) || ![...noCopyRequired].every((entry) => value.noCopyState.includes(entry))) {
    return { ok: false, code: "incomplete-no-copy-state" };
  }
  return { ok: true, value };
}
