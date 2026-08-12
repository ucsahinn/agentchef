import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireOperationLock } from "../lib/operation-lock.mjs";

function withTemporaryRoot(run) {
  const root = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-"));
  try {
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

test("operation lock rejects a second acquisition for the same root", () => {
  withTemporaryRoot((root) => {
    const lock = acquireOperationLock({ root, operation: "update" });

    assert.throws(
      () => acquireOperationLock({ root, operation: "repair" }),
      /already in progress/i
    );

    lock.release();
  });
});

test("operation locks for distinct roots do not contend", () => {
  const firstRoot = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-first-"));
  const secondRoot = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-second-"));
  try {
    const firstLock = acquireOperationLock({ root: firstRoot, operation: "update" });
    const secondLock = acquireOperationLock({ root: secondRoot, operation: "update" });

    assert.notEqual(firstLock.lockPath, secondLock.lockPath);

    firstLock.release();
    secondLock.release();
  } finally {
    rmSync(firstRoot, { force: true, recursive: true });
    rmSync(secondRoot, { force: true, recursive: true });
  }
});

test("operation lock release removes only the lock it owns", () => {
  withTemporaryRoot((root) => {
    const lock = acquireOperationLock({ root, operation: "update" });
    const owner = JSON.parse(readFileSync(join(lock.lockPath, "owner.json"), "utf8"));

    assert.equal(owner.operation, "update");
    assert.equal(owner.pid, process.pid);
    assert.equal(typeof owner.id, "string");
    assert.ok(owner.id.length > 0);
    assert.ok(owner.startedAt);

    lock.release();
    assert.equal(existsSync(lock.lockPath), false);
  });
});

test("invalid operation is rejected before creating the requested root", () => {
  withTemporaryRoot((parent) => {
    const root = join(parent, "must-not-be-created");

    assert.throws(
      () => acquireOperationLock({ root, operation: "" }),
      /operation must be a non-empty string/i
    );
    assert.equal(existsSync(root), false);
  });
});
