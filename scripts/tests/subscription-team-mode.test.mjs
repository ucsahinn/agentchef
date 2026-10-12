import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../validate-subscription-team-mode.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = path.join(root, "catalog/subscription-team-mode.json");
function validate(value) {
  return validateCatalog(value, root);
}

const base = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

test("valid team mode v2 catalog passes", () => {
  assert.deepEqual(validate(base), []);
});

test("test_verifier cannot be elevated above read-only", () => {
  const value = structuredClone(base);
  value.execution.roleModeCeilings.test_verifier = "workspace-write";
  assert.ok(validate(value).length > 0);
});

test("unknown role is rejected", () => {
  const value = structuredClone(base);
  value.execution.roleModeCeilings.imaginary_role = "read-only";
  assert.ok(validate(value).length > 0);
});

test("enabled execution is rejected", () => {
  const value = structuredClone(base);
  value.execution.enabled = true;
  assert.ok(validate(value).length > 0);
});

test("approval filename contract is enforced", () => {
  const value = structuredClone(base);
  value.approval.startFile = "{runId}.start.json";
  assert.ok(validate(value).length > 0);
});

test("catalog and nested objects reject unknown keys", () => {
  const value = structuredClone(base);
  value.surprise = true;
  assert.ok(validate(value).length > 0);
});
