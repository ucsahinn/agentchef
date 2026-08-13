const chefNoCopy = new Set(["auth", "sessions", "brain-content", "control-state"]);
const controlNoCopy = new Set(["auth", "sessions", "control-database", "approvals", "worktrees"]);
const capabilities = new Set(["kitchen.snapshot", "kitchen.proposal.prepare"]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function includesEvery(values, required) {
  return Array.isArray(values) && required.size === [...required].filter((entry) => values.includes(entry)).length;
}

function supportsMajor(value, key) {
  return Array.isArray(value?.contracts?.[key]) && value.contracts[key].includes(1);
}

export function validateModuleCompatibility({ chef, control } = {}) {
  if (!record(chef) || !record(control) || chef.schemaVersion !== "1.0" || control.schemaVersion !== "1.0") return { ok: false, code: "unsupported-schema-major" };
  if (chef.module !== "chef" || control.module !== "control") return { ok: false, code: "malformed-module" };
  if (!supportsMajor(chef, "events") || !supportsMajor(control, "events")) return { ok: false, code: "incompatible-events-major" };
  if (!supportsMajor(chef, "proposals") || !supportsMajor(control, "proposals")) return { ok: false, code: "incompatible-proposals-major" };
  if (chef.health?.commandId !== "chef.health.v1" || chef.health?.mode !== "read-only" || chef.brain?.healthCommandId !== "brain.health.v1" || chef.brain?.mode !== "read-only" || control.health?.commandId !== "control.health.v1" || control.health?.mode !== "read-only") return { ok: false, code: "forbidden-health-contract" };
  if (!Array.isArray(control.kitchenCapabilities) || control.kitchenCapabilities.length !== 2 || control.kitchenCapabilities.some((entry) => !capabilities.has(entry))) return { ok: false, code: "forbidden-capability" };
  if (!includesEvery(chef.noCopyState, chefNoCopy) || !includesEvery(control.noCopyState, controlNoCopy)) return { ok: false, code: "incomplete-no-copy-state" };
  return { ok: true, contracts: { events: 1, proposals: 1 } };
}
