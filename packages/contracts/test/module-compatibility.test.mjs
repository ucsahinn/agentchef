import assert from "node:assert/strict";
import test from "node:test";
import { validateModuleCompatibility } from "../src/module-compatibility.mjs";

const chef = {
  schemaVersion: "1.0", module: "chef", runtime: { nodeCompatibility: ">=18" },
  contracts: { events: [1], capabilities: [1], proposals: [1] },
  health: { commandId: "chef.health.v1", mode: "read-only" },
  brain: { healthCommandId: "brain.health.v1", mode: "read-only" },
  noCopyState: ["auth", "sessions", "brain-content", "control-state"]
};
const control = {
  schemaVersion: "1.0", module: "control",
  runtime: { nodeMajor: 24, dotnetRuntimeMajor: 8, codexSdkVersion: "0.145.0", nativeSupervisor: "required" },
  contracts: { events: [1], proposals: [1] },
  health: { commandId: "control.health.v1", mode: "read-only" },
  kitchenCapabilities: ["kitchen.snapshot", "kitchen.proposal.prepare"],
  noCopyState: ["auth", "sessions", "control-database", "approvals", "worktrees"]
};

test("accepts compatible Chef and Control internal-module metadata", () => {
  assert.deepEqual(validateModuleCompatibility({ chef, control }), { ok: true, contracts: { events: 1, proposals: 1 } });
});

test("rejects unknown schema and incompatible contract majors", () => {
  assert.deepEqual(validateModuleCompatibility({ chef: { ...chef, schemaVersion: "2.0" }, control }), { ok: false, code: "unsupported-schema-major" });
  assert.deepEqual(validateModuleCompatibility({ chef: { ...chef, contracts: { ...chef.contracts, events: [2] } }, control }), { ok: false, code: "incompatible-events-major" });
  assert.deepEqual(validateModuleCompatibility({ chef: { ...chef, contracts: { ...chef.contracts, proposals: [] } }, control }), { ok: false, code: "incompatible-proposals-major" });
});

test("rejects mutable authority and incomplete state exclusions", () => {
  assert.deepEqual(validateModuleCompatibility({ chef, control: { ...control, health: { commandId: "control.start.v1", mode: "write" } } }), { ok: false, code: "forbidden-health-contract" });
  assert.deepEqual(validateModuleCompatibility({ chef, control: { ...control, kitchenCapabilities: ["kitchen.execute"] } }), { ok: false, code: "forbidden-capability" });
  assert.deepEqual(validateModuleCompatibility({ chef: { ...chef, noCopyState: ["auth"] }, control }), { ok: false, code: "incomplete-no-copy-state" });
});
