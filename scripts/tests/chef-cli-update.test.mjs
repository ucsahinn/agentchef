import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(root, "scripts", "chef-cli.mjs"), "utf8");

test("update treats an equal-semver fetched commit as a source update", () => {
  assert.match(source, /const candidateIsCurrent = candidate\.value === beforeHead\.value;/);
  assert.match(source, /if \(versionOrder === 0 && candidateIsCurrent\) \{/);
  assert.match(source, /versionOrder === 0\s*\? `New source revision found for v\$\{remoteVersion\.value\}`/);
});

test("source update validates the fetched tree before merging and revalidates after", () => {
  const candidateValidation = source.indexOf("const candidateValidation = runFetchedUpdateValidation(candidate.value");
  const merge = source.indexOf('runLoggedCommand("update-merge"');
  const validation = source.indexOf("const validation = runUpdateValidation", merge);

  assert.ok(candidateValidation >= 0, "fetched candidate validation must be present");
  assert.ok(merge > candidateValidation, "merge must follow fetched candidate validation");
  assert.ok(validation > merge, "updated checkout must be revalidated after merge");
});

test("source advance records a durable recovery receipt before managed refresh can fail", () => {
  const merge = source.indexOf('runLoggedCommand("update-merge"');
  const receipt = source.indexOf("const recoveryReceipt = prepareUpdateRecoveryReceipt", 0);
  const sourceAdvanced = source.indexOf('advanceUpdateRecoveryReceipt(recoveryReceipt, "source-advanced"', merge);
  const refreshStarted = source.indexOf('advanceUpdateRecoveryReceipt(recoveryReceipt, "managed-refresh-started"', sourceAdvanced);
  const verified = source.indexOf('advanceUpdateRecoveryReceipt(recoveryReceipt, "verified"', refreshStarted);

  assert.ok(receipt >= 0 && receipt < merge, "the candidate transition must be prepared before the fast-forward");
  assert.ok(sourceAdvanced > merge, "the receipt must record source advancement immediately after the fast-forward");
  assert.ok(refreshStarted > sourceAdvanced, "managed refresh may begin only after source advancement is durable");
  assert.ok(verified > refreshStarted, "only a completed runtime verification may mark the receipt verified");
  assert.match(source, /function atomicWriteUpdateRecoveryReceipt\([\s\S]*?fs\.fsyncSync\(descriptor\)/);
  assert.match(source, /recoveryCommand: "npm run chef -- --update --apply"/);
  assert.match(source, /if \(!preview\.ok\) return recordUpdateRecoveryFailure\(recoveryReceipt, preview, "updated-tree preview"\)/);
  assert.match(source, /if \(!validation\.ok\) return recordUpdateRecoveryFailure\(recoveryReceipt, validation, "updated-tree validation"\)/);
  assert.match(source, /recordUpdateRecoveryFailure\(recoveryReceipt, completed, "managed refresh or runtime verification"\)/);
  assert.match(source, /const resumableReceipt = findRecoverableUpdateReceipt\(beforeHead\.value, beforeVersion, dirty\)/);
});
