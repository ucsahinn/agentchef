import fs from "node:fs";
import path from "node:path";

function comparable(filePath) {
  const normalized = path.resolve(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function isPathInside(childPath, parentPath) {
  const child = comparable(childPath);
  const parent = comparable(parentPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function lstatOrNull(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function inspectManagedRootPath(base) {
  const stat = lstatOrNull(base);
  if (stat?.isSymbolicLink()) {
    return {
      safe: false,
      reason: "linked-managed-root",
      unsafeComponent: base
    };
  }
  if (stat && !stat.isDirectory()) {
    return {
      safe: false,
      reason: "non-directory-managed-root",
      unsafeComponent: base
    };
  }
  return { safe: true };
}

export function canonicalizeWithMissingTail(targetPath) {
  let current = path.resolve(targetPath);
  const missing = [];
  while (!lstatOrNull(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missing.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(fs.realpathSync.native(current), ...missing);
}

export function inspectManagedTargetPath(baseRoot, targetPath) {
  const base = path.resolve(baseRoot);
  const target = path.resolve(targetPath);
  if (!isPathInside(target, base)) {
    return {
      safe: false,
      reason: "outside-managed-root",
      base,
      target
    };
  }

  const rootState = inspectManagedRootPath(base);
  if (!rootState.safe) {
    return {
      ...rootState,
      base,
      target
    };
  }

  const relative = path.relative(base, target);
  const segments = relative === "" ? [] : relative.split(path.sep).filter(Boolean);
  let current = base;

  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = lstatOrNull(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      return {
        safe: false,
        reason: "linked-managed-path-component",
        base,
        target,
        unsafeComponent: current
      };
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      return {
        safe: false,
        reason: "non-directory-managed-path-ancestor",
        base,
        target,
        unsafeComponent: current
      };
    }
  }

  const canonicalBase = canonicalizeWithMissingTail(base);
  const canonicalTarget = canonicalizeWithMissingTail(target);
  if (!isPathInside(canonicalTarget, canonicalBase)) {
    return {
      safe: false,
      reason: "canonical-managed-target-escape",
      base,
      target,
      canonicalBase,
      canonicalTarget
    };
  }

  return { safe: true, base, target, canonicalBase, canonicalTarget };
}

export function assertManagedTargetPath(targetPath, managedRoots) {
  const roots = managedRoots
    .map((root) => path.resolve(root))
    .filter((root) => isPathInside(targetPath, root))
    .sort((left, right) => right.length - left.length);
  if (roots.length === 0) {
    throw new Error(`Refusing to access unmanaged target outside configured homes: ${targetPath}`);
  }

  const state = inspectManagedTargetPath(roots[0], targetPath);
  if (!state.safe) {
    const suffix = state.unsafeComponent ? ` (${state.unsafeComponent})` : "";
    throw new Error(`Refusing to follow an unsafe managed path: ${targetPath} [${state.reason}]${suffix}`);
  }
  return state;
}
