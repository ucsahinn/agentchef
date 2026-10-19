import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STALE_WORKER_CAP, validateCatalog, validateTeamWording } from "../validate-subscription-team-mode.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = path.join(root, "catalog/subscription-team-mode.json");
function validate(value) {
  return validateCatalog(value, root);
}

const base = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

test("valid team mode v2 catalog passes", () => {
  assert.deepEqual(validate(base), []);
});

test("worker language must be a two-letter language code", () => {
  const missing = structuredClone(base);
  delete missing.workers.language;
  assert.ok(validate(missing).some((error) => error.includes("workers.language is required")));

  for (const language of ["", "eng", "en-US", "12"]) {
    const value = structuredClone(base);
    value.workers.language = language;
    assert.ok(validate(value).some((error) => error.includes("workers.language must be a two-letter language code")));
  }
});

test("worker branches use sibling refs for run and task", () => {
  assert.equal(base.branches.workerBranchFormat, "takim/{runId}-{taskId}");
  const value = structuredClone(base);
  value.branches.workerBranchFormat = "takim/{runId}/{taskId}";
  assert.ok(validate(value).length > 0);
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

test("disabled execution is rejected: team mode is available to every install", () => {
  const value = structuredClone(base);
  value.execution.enabled = false;
  assert.ok(validate(value).length > 0);
});

test("experimental stability is rejected", () => {
  const value = structuredClone(base);
  value.stability = "experimental";
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

// C3/C4 regression guard: a fresh install must not bring back the fixed four-worker cap or lose the team-run meaning.
test("installed instructions size workers by live capacity and map takım koşusu to beyin takim", () => {
  assert.deepEqual(validateTeamWording(root), []);
  for (const stale of ["Use at most four workers per task (a coordinator is not counted)", "the main session briefs one to four specialists", "session coordinate 1-4 bounded Codex workers", "Görev başına en çok dört worker kullan"]) {
    assert.ok(STALE_WORKER_CAP.some((pattern) => pattern.test(stale)), stale);
  }
  assert.equal(base.workers.maxWorkers, 8);
  assert.equal(base.workers.capacity.aboveRecommendation, "refuse-with-measured-reason");
});
