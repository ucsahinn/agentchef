import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";

const LOCK_DIRECTORY_NAME = ".codex-chef-operation.lock";
const OWNER_FILE_NAME = "owner.json";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function ownerFilePath(lockPath) {
  return join(lockPath, OWNER_FILE_NAME);
}

function canonicalizeRoot(value, name) {
  const requestedRoot = resolve(requireText(value, name));
  const missingSegments = [];
  let existingAncestor = requestedRoot;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  const canonicalAncestor = existsSync(existingAncestor) ? realpathSync.native(existingAncestor) : existingAncestor;
  return resolve(canonicalAncestor, ...missingSegments);
}

function rootKey(root) {
  return process.platform === "win32" ? root.toLowerCase() : root;
}

export function canonicalizeOperationLockRoots({ roots }) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new TypeError("roots must be a non-empty array.");
  }
  const uniqueRoots = new Map();
  for (const root of roots) {
    const canonicalRoot = canonicalizeRoot(root, "lock root");
    uniqueRoots.set(rootKey(canonicalRoot), canonicalRoot);
  }
  return [...uniqueRoots.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, root]) => root);
}

function readOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(ownerFilePath(lockPath), "utf8"));
  } catch {
    return null;
  }
}

export function inspectOperationLock({ root }) {
  const resolvedRoot = canonicalizeRoot(root, "root");
  const lockPath = join(resolvedRoot, LOCK_DIRECTORY_NAME);
  if (!existsSync(lockPath)) return { status: "absent", lockPath, owner: null };
  const owner = readOwner(lockPath);
  if (!owner || typeof owner.id !== "string" || typeof owner.pid !== "number" || typeof owner.operation !== "string" || typeof owner.startedAt !== "string") {
    return { status: "unknown-owner", lockPath, owner: null };
  }
  return { status: "present", lockPath, owner };
}

export function inspectOperationLockSet({ roots }) {
  const orderedRoots = canonicalizeOperationLockRoots({ roots });
  const locks = orderedRoots.map((root) => inspectOperationLock({ root }));
  const status = locks.some((lock) => lock.status === "unknown-owner")
    ? "unknown-owner"
    : locks.some((lock) => lock.status === "present")
      ? "present"
      : "absent";
  return { roots: orderedRoots, locks, status };
}

export function releaseOperationLock(lock) {
  if (!lock || typeof lock !== "object") {
    throw new TypeError("lock must be an acquired operation lock.");
  }

  const owner = readOwner(lock.lockPath);
  if (!owner || owner.id !== lock.owner.id) {
    return false;
  }

  rmSync(lock.lockPath, { force: true, recursive: true });
  return true;
}

export function acquireOperationLock({ root, operation }) {
  const resolvedRoot = canonicalizeRoot(root, "root");
  const validatedOperation = requireText(operation, "operation");
  mkdirSync(resolvedRoot, { recursive: true });
  const lockPath = join(resolvedRoot, LOCK_DIRECTORY_NAME);
  const owner = {
    pid: process.pid,
    operation: validatedOperation,
    startedAt: new Date().toISOString(),
    id: randomUUID()
  };

  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      const lockError = new Error(`Another operation is already in progress for ${lockPath}.`);
      lockError.code = "OPERATION_LOCKED";
      throw lockError;
    }
    throw error;
  }

  try {
    writeFileSync(ownerFilePath(lockPath), `${JSON.stringify(owner)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    rmSync(lockPath, { force: true, recursive: true });
    throw error;
  }

  const lock = { lockPath, owner };
  return { ...lock, release: () => releaseOperationLock(lock) };
}

export function acquireOperationLockSet({ roots, operation }) {
  const orderedRoots = canonicalizeOperationLockRoots({ roots });
  const locks = [];
  try {
    for (const root of orderedRoots) locks.push(acquireOperationLock({ root, operation }));
  } catch (error) {
    for (const lock of locks.reverse()) lock.release();
    throw error;
  }
  return {
    roots: orderedRoots,
    locks,
    release: () => {
      let released = true;
      for (const lock of [...locks].reverse()) released = lock.release() && released;
      return released;
    }
  };
}
