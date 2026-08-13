import assert from "node:assert/strict";
import test from "node:test";

import { validateChefModuleManifest } from "../validate-chef-module-manifest.mjs";

const valid = {
  schemaVersion: "1.0",
  module: "chef",
  version: "0.5.72",
  runtime: { nodeCompatibility: ">=18" },
  contracts: { events: [1], capabilities: [1] },
  health: { commandId: "chef.health.v1", mode: "read-only" },
  brain: { healthCommandId: "brain.health.v1", mode: "read-only" },
  noCopyState: ["auth", "sessions", "brain-content", "control-state"]
};

test("accepts a bounded Chef and Brain internal-module manifest", () => {
  assert.deepEqual(validateChefModuleManifest(valid), { ok: true, value: valid });
});

test("rejects unknown or path-shaped metadata", () => {
  assert.deepEqual(validateChefModuleManifest({ ...valid, localPath: "C:/private" }), { ok: false, code: "unexpected-field" });
  assert.deepEqual(validateChefModuleManifest({ ...valid, version: "C:/private" }), { ok: false, code: "unsafe-value" });
});

test("rejects unsupported schema and mutable health contracts", () => {
  assert.deepEqual(validateChefModuleManifest({ ...valid, schemaVersion: "2.0" }), { ok: false, code: "unsupported-schema-major" });
  assert.deepEqual(validateChefModuleManifest({ ...valid, brain: { healthCommandId: "brain.capture.v1", mode: "write" } }), { ok: false, code: "forbidden-health-contract" });
});

test("requires explicit no-copy coverage for user-owned state", () => {
  assert.deepEqual(validateChefModuleManifest({ ...valid, noCopyState: ["auth"] }), { ok: false, code: "incomplete-no-copy-state" });
});
