import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquireOperationLock, acquireOperationLockSet, inspectOperationLock, inspectOperationLockSet } from "../lib/operation-lock.mjs";

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

test("ordered lock sets contend on a shared root even when their primary roots differ", () => {
  const firstRoot = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-set-first-"));
  const secondRoot = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-set-second-"));
  const sharedRoot = mkdtempSync(join(tmpdir(), "codex-chef-operation-lock-set-shared-"));
  try {
    const firstLock = acquireOperationLockSet({ roots: [firstRoot, sharedRoot], operation: "install" });
    assert.throws(
      () => acquireOperationLockSet({ roots: [secondRoot, sharedRoot], operation: "repair" }),
      /already in progress/i
    );
    firstLock.release();
    const secondLock = acquireOperationLockSet({ roots: [secondRoot, sharedRoot], operation: "repair" });
    secondLock.release();
  } finally {
    rmSync(firstRoot, { force: true, recursive: true });
    rmSync(secondRoot, { force: true, recursive: true });
    rmSync(sharedRoot, { force: true, recursive: true });
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

test("operation lock inspection is read-only and fails closed for an unknown owner", () => {
  withTemporaryRoot((root) => {
    const lockPath = join(root, ".codex-chef-operation.lock");
    mkdirSync(lockPath);
    writeFileSync(join(lockPath, "owner.json"), "{not-json}\n", "utf8");
    const inspection = inspectOperationLock({ root });
    assert.equal(inspection.status, "unknown-owner");
    assert.equal(existsSync(lockPath), true);
  });
});

test("operation lock set inspection canonicalizes duplicate roots and fails closed when any root is unknown", () => {
  withTemporaryRoot((root) => {
    const secondRoot = join(root, "second");
    const secondLockPath = join(secondRoot, ".codex-chef-operation.lock");
    mkdirSync(secondLockPath, { recursive: true });
    writeFileSync(join(secondLockPath, "owner.json"), "{not-json}\\n", "utf8");

    const inspection = inspectOperationLockSet({ roots: [root, root, secondRoot] });
    assert.deepEqual(inspection.roots, [root, secondRoot].sort());
    assert.equal(inspection.status, "unknown-owner");
    assert.equal(inspection.locks.length, 2);
    assert.equal(existsSync(secondLockPath), true);
  });
});
