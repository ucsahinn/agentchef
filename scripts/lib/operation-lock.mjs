import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

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

function readOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(ownerFilePath(lockPath), "utf8"));
  } catch {
    return null;
  }
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
  const resolvedRoot = resolve(requireText(root, "root"));
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
