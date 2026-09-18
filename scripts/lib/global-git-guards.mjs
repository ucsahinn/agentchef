import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RECEIPT_SCHEMA = "agentchef.global-git-guards-receipt";
export const LEGACY_RECEIPT_SCHEMA = "codex-chef.global-git-guards-receipt";
// Managed file bytes shipped by earlier releases (0.5.74 and 0.6.0). A target
// that still carries one of them is owned by AgentChef and may be replaced
// without an adoption flag; anything else stays a conflict.
export const KNOWN_LEGACY_FILE_SHA256 = Object.freeze({
  "gitignore-global": Object.freeze(["2b2fd5e71c4348956f249a730cf3df6c5f423b15b83d9ff3d5a35138b50d0751", "2b2fd5e71c4348956f249a730cf3df6c5f423b15b83d9ff3d5a35138b50d0751"]),
  "pre-commit-hook": Object.freeze(["22a2234a6d26f2c9a41e66e5c0102ab6e08374f7f14724f477fcef87a8a3e97b", "22a2234a6d26f2c9a41e66e5c0102ab6e08374f7f14724f477fcef87a8a3e97b"])
});
export const RECEIPT_VERSION = 2;
export const LEGACY_RECEIPT_VERSION = 1;
export const MAX_GUARD_FILE_BYTES = 1_048_576;
export const MAX_RECEIPT_BYTES = 3_145_728;

export const FILE_TARGETS = Object.freeze([
  Object.freeze({
    id: "gitignore-global",
    relativePath: ".gitignore_global",
    sourceOption: "ignoreSource"
  }),
  Object.freeze({
    id: "pre-commit-hook",
    relativePath: ".githooks/pre-commit",
    sourceOption: "hookSource"
  })
]);

export const GIT_CONFIG_KEYS = Object.freeze([
  "core.excludesfile",
  "core.hooksPath"
]);

const MAX_CONFIG_VALUES_PER_KEY = 32;
const MAX_CONFIG_VALUE_BYTES = 16_384;

function normalizeHome(home) {
  if (typeof home !== "string" || home.trim() === "") {
    throw new Error("A HOME path is required for global Git guard management.");
  }
  const resolved = path.resolve(home);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) throw new Error(`HOME must not be a symlink: ${resolved}`);
  if (!stat.isDirectory()) throw new Error(`HOME must be a directory: ${resolved}`);
  return resolved;
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function pathFromHome(home, relativePath) {
  const target = path.resolve(home, ...relativePath.split("/"));
  const relative = path.relative(home, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Guard target is outside HOME: ${relativePath}`);
  }
  return target;
}

function assertRegularSource(sourcePath, label) {
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    throw new Error(`${label} source path is required.`);
  }
  const resolved = path.resolve(sourcePath);
  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) throw new Error(`${label} source must not be a symlink: ${resolved}`);
  if (!stat.isFile()) throw new Error(`${label} source must be a regular file: ${resolved}`);
  if (stat.size > MAX_GUARD_FILE_BYTES) {
    throw new Error(`${label} source is too large (maximum ${MAX_GUARD_FILE_BYTES} bytes).`);
  }
  return { path: resolved, bytes: fs.readFileSync(resolved) };
}

function lstatOrNull(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function assertNoNestedSymlink(home, target) {
  const relative = path.relative(home, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Guard target is outside HOME: ${target}`);
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let current = home;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      throw new Error(`Guard target has an unsafe symlink parent: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Guard target parent is not a directory: ${current}`);
    }
  }
}

function readTargetState(home, targetPath) {
  assertNoNestedSymlink(home, targetPath);
  const stat = lstatOrNull(targetPath);
  if (!stat) {
    return { present: false, bytes: null, mode: null };
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Guard target is an unsafe symlink: ${targetPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Guard target is not a regular file: ${targetPath}`);
  }
  if (stat.size > MAX_GUARD_FILE_BYTES) {
    throw new Error(`Guard target is too large to capture safely: ${targetPath}`);
  }
  return {
    present: true,
    bytes: fs.readFileSync(targetPath),
    mode: stat.mode & 0o777
  };
}

function assertPathParentsNotLinked(targetPath, label) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  const parts = path.relative(root, path.dirname(resolved)).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = lstatOrNull(current);
    if (!stat) throw new Error(`${label} parent directory does not exist: ${current}`);
    if (stat.isSymbolicLink()) throw new Error(`${label} has an unsafe symlink parent: ${current}`);
    if (!stat.isDirectory()) throw new Error(`${label} parent is not a directory: ${current}`);
  }
}

export function assertSafeReceiptPath(receiptPath, { mustExist = false } = {}) {
  if (typeof receiptPath !== "string" || receiptPath.trim() === "") {
    throw new Error("Receipt path is required.");
  }
  const resolved = path.resolve(receiptPath);
  assertPathParentsNotLinked(resolved, "Receipt path");
  const stat = lstatOrNull(resolved);
  if (stat?.isSymbolicLink()) throw new Error(`Receipt path must not be a symlink: ${resolved}`);
  if (mustExist) {
    if (!stat) throw new Error(`Receipt does not exist: ${resolved}`);
    if (!stat.isFile()) throw new Error(`Receipt is not a regular file: ${resolved}`);
  } else if (stat) {
    throw new Error(`Receipt path already exists: ${resolved}`);
  }
  return resolved;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function managedFileMode(definition) {
  if (process.platform === "win32") return null;
  return definition.id === "pre-commit-hook" ? 0o755 : 0o644;
}

function gitEnvironment(home, gitConfigGlobal) {
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    GIT_CONFIG_NOSYSTEM: "1"
  };
  if (gitConfigGlobal) env.GIT_CONFIG_GLOBAL = path.resolve(gitConfigGlobal);
  else delete env.GIT_CONFIG_GLOBAL;
  return env;
}

function runGit(home, gitConfigGlobal, args, expectedStatuses = [0]) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
    env: gitEnvironment(home, gitConfigGlobal)
  });
  if (result.error) throw result.error;
  if (!expectedStatuses.includes(result.status)) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed with code ${result.status}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function readConfigValues(home, gitConfigGlobal, key) {
  const result = runGit(
    home,
    gitConfigGlobal,
    ["config", "--global", "--no-includes", "--get-all", key],
    [0, 1]
  );
  if (result.status === 1) return [];
  const values = result.stdout.split(/\r?\n/);
  if (values.at(-1) === "") values.pop();
  return values;
}

function setConfigValues(home, gitConfigGlobal, key, values) {
  runGit(
    home,
    gitConfigGlobal,
    ["config", "--global", "--no-includes", "--unset-all", key],
    [0, 5]
  );
  for (const value of values) {
    runGit(home, gitConfigGlobal, ["config", "--global", "--no-includes", "--add", key, value]);
  }
}

function desiredConfigValues(home) {
  const ignorePath = pathFromHome(home, ".gitignore_global");
  const hookPath = pathFromHome(home, ".githooks/pre-commit");
  return new Map([
    ["core.excludesfile", ignorePath],
    ["core.hooksPath", path.dirname(hookPath)]
  ]);
}

function normalizeAdoptions(values, allowed, label) {
  if (values === undefined) return new Set();
  if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
  const selected = new Set();
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new Error(`Unknown ${label} value '${value}'. Allowed values: ${allowed.join(", ")}`);
    }
    selected.add(value);
  }
  return selected;
}

function buildInspection(options) {
  const home = normalizeHome(options.home);
  const gitConfigGlobal = options.gitConfigGlobal ? path.resolve(options.gitConfigGlobal) : undefined;
  const adoptedFiles = normalizeAdoptions(
    options.adoptFiles,
    FILE_TARGETS.map((entry) => entry.id),
    "adoptFiles"
  );
  const adoptedKeys = normalizeAdoptions(options.adoptKeys, [...GIT_CONFIG_KEYS], "adoptKeys");
  const desiredFiles = FILE_TARGETS.map((definition) => {
    const source = assertRegularSource(options[definition.sourceOption], definition.id);
    const targetPath = pathFromHome(home, definition.relativePath);
    const current = readTargetState(home, targetPath);
    const desiredMode = managedFileMode(definition);
    const contentExact = current.present && current.bytes.equals(source.bytes);
    const modeExact = desiredMode === null || (current.present && current.mode === desiredMode);
    const ownedLegacy = current.present && !contentExact
      && (KNOWN_LEGACY_FILE_SHA256[definition.id] || []).includes(sha256(current.bytes));
    const action = !current.present
      ? "create"
      : contentExact && modeExact
        ? "noop"
        : contentExact
          ? "chmod"
        : adoptedFiles.has(definition.id) || ownedLegacy
          ? "replace"
          : "conflict";
    return {
      definition,
      source,
      targetPath,
      current,
      desiredMode,
      public: {
        id: definition.id,
        relativePath: definition.relativePath,
        sourcePath: source.path,
        targetPath,
        currentPresent: current.present,
        currentSha256: current.present ? sha256(current.bytes) : null,
        proposedSha256: sha256(source.bytes),
        proposedMode: desiredMode,
        action,
        adoptionRequired: action === "conflict"
      }
    };
  });

  const expected = desiredConfigValues(home);
  const desiredGitConfig = GIT_CONFIG_KEYS.map((key) => {
    const values = readConfigValues(home, gitConfigGlobal, key);
    const proposedValue = expected.get(key);
    const exact = values.length === 1 && values[0] === proposedValue;
    const action = values.length === 0
      ? "set"
      : exact
        ? "noop"
        : adoptedKeys.has(key)
          ? "replace"
          : "conflict";
    return {
      key,
      values,
      proposedValue,
      public: {
        key,
        present: values.length > 0,
        currentValues: values,
        proposedValue,
        action,
        adoptionRequired: action === "conflict"
      }
    };
  });

  const conflicts = [
    ...desiredFiles
      .filter((entry) => entry.public.action === "conflict")
      .map((entry) => ({
        id: `file:${entry.definition.id}`,
        type: "file",
        message: `Foreign ${entry.definition.relativePath} requires --adopt-file ${entry.definition.id}.`
      })),
    ...desiredGitConfig
      .filter((entry) => entry.public.action === "conflict")
      .map((entry) => ({
        id: `git-config:${entry.key}`,
        type: "git-config",
        message: `Foreign ${entry.key} requires --adopt-key ${entry.key}.`
      }))
  ];

  return {
    home,
    gitConfigGlobal,
    desiredFiles,
    desiredGitConfig,
    inspection: {
      schema: "agentchef.global-git-guards-inspection",
      version: 1,
      home,
      files: desiredFiles.map((entry) => entry.public),
      gitConfig: desiredGitConfig.map((entry) => entry.public),
      conflicts,
      ok: conflicts.length === 0
    }
  };
}

export function inspectGlobalGitGuards(options) {
  return buildInspection(options).inspection;
}

function captureReceipt(home, gitConfigGlobal, applied = {}) {
  return {
    schema: RECEIPT_SCHEMA,
    version: RECEIPT_VERSION,
    createdAt: new Date().toISOString(),
    operationId: crypto.randomUUID(),
    state: applied.state ?? "applying",
    home,
    files: FILE_TARGETS.map((definition) => {
      const state = readTargetState(home, pathFromHome(home, definition.relativePath));
      return {
        id: definition.id,
        relativePath: definition.relativePath,
        present: state.present,
        bytesBase64: state.present ? state.bytes.toString("base64") : null,
        mode: state.present ? state.mode : null,
        appliedSha256: applied.fileSha256?.get(definition.id)
          ?? (state.present ? sha256(state.bytes) : null),
        appliedMode: applied.fileMode?.get(definition.id) ?? null,
        progress: applied.fileProgress?.get(definition.id) ?? "pending"
      };
    }),
    gitConfig: GIT_CONFIG_KEYS.map((key) => {
      const values = readConfigValues(home, gitConfigGlobal, key);
      return {
        key,
        present: values.length > 0,
        values,
        appliedValues: applied.configValues?.get(key) ?? [...values],
        progress: applied.configProgress?.get(key) ?? "pending"
      };
    })
  };
}

function assertExactObjectKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has an invalid schema.`);
  }
}

function decodeBoundedBase64(value, label) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} must contain valid base64 bytes.`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > MAX_GUARD_FILE_BYTES) {
    throw new Error(`${label} is too large (maximum ${MAX_GUARD_FILE_BYTES} bytes).`);
  }
  if (bytes.toString("base64") !== value) throw new Error(`${label} must use canonical base64.`);
  return bytes;
}

export function validateGlobalGitGuardReceipt(receipt, { home } = {}) {
  const serializedBytes = Buffer.byteLength(JSON.stringify(receipt ?? null));
  if (serializedBytes > MAX_RECEIPT_BYTES) {
    throw new Error(`Global Git guard receipt is too large (maximum ${MAX_RECEIPT_BYTES} bytes).`);
  }
  const isLegacy = receipt?.version === LEGACY_RECEIPT_VERSION;
  assertExactObjectKeys(
    receipt,
    isLegacy
      ? ["schema", "version", "createdAt", "home", "files", "gitConfig"]
      : ["schema", "version", "createdAt", "operationId", "state", "home", "files", "gitConfig"],
    "Global Git guard receipt"
  );
  if (![RECEIPT_SCHEMA, LEGACY_RECEIPT_SCHEMA].includes(receipt.schema) || ![LEGACY_RECEIPT_VERSION, RECEIPT_VERSION].includes(receipt.version)) {
    throw new Error("Global Git guard receipt schema or version is unsupported.");
  }
  if (typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) {
    throw new Error("Global Git guard receipt createdAt is invalid.");
  }
  if (!isLegacy && (typeof receipt.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.operationId))) {
    throw new Error("Global Git guard receipt operationId is invalid.");
  }
  if (!isLegacy && !["applying", "applied", "rolled-back"].includes(receipt.state)) {
    throw new Error("Global Git guard receipt state is invalid.");
  }
  const expectedHome = normalizeHome(home ?? receipt.home);
  if (typeof receipt.home !== "string" || !samePath(receipt.home, expectedHome)) {
    throw new Error("Global Git guard receipt HOME does not match the requested HOME.");
  }
  if (!Array.isArray(receipt.files) || receipt.files.length !== FILE_TARGETS.length) {
    throw new Error("Global Git guard receipt must contain exactly the two allowlisted files.");
  }
  if (!Array.isArray(receipt.gitConfig) || receipt.gitConfig.length !== GIT_CONFIG_KEYS.length) {
    throw new Error("Global Git guard receipt must contain exactly the two allowlisted Git config keys.");
  }

  const normalizedFiles = FILE_TARGETS.map((definition) => {
    const matches = receipt.files.filter((entry) => entry?.id === definition.id);
    if (matches.length !== 1) {
      throw new Error(`Receipt file id is not allowlisted exactly once: ${definition.id}`);
    }
    const entry = matches[0];
    assertExactObjectKeys(
      entry,
      isLegacy
        ? ["id", "relativePath", "present", "bytesBase64", "mode", "appliedSha256", "appliedMode"]
        : ["id", "relativePath", "present", "bytesBase64", "mode", "appliedSha256", "appliedMode", "progress"],
      `Receipt file ${definition.id}`
    );
    if (entry.relativePath !== definition.relativePath) {
      throw new Error(`Receipt file path is not allowlisted: ${entry.relativePath}`);
    }
    pathFromHome(expectedHome, entry.relativePath);
    if (typeof entry.present !== "boolean") throw new Error(`Receipt file ${definition.id} present must be boolean.`);
    if (!entry.present) {
      if (entry.bytesBase64 !== null || entry.mode !== null) {
        throw new Error(`Absent receipt file ${definition.id} cannot contain bytes or mode.`);
      }
    } else {
      decodeBoundedBase64(entry.bytesBase64, `Receipt file ${definition.id}`);
      if (!Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
        throw new Error(`Receipt file ${definition.id} mode is invalid.`);
      }
    }
    if (typeof entry.appliedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.appliedSha256)) {
      throw new Error(`Receipt file ${definition.id} applied hash is invalid.`);
    }
    if (entry.appliedMode !== null && (!Number.isInteger(entry.appliedMode) || entry.appliedMode < 0 || entry.appliedMode > 0o777)) {
      throw new Error(`Receipt file ${definition.id} applied mode is invalid.`);
    }
    if (!isLegacy && !["pending", "prepared", "applied"].includes(entry.progress)) {
      throw new Error(`Receipt file ${definition.id} progress is invalid.`);
    }
    return isLegacy ? { ...entry } : { ...entry, progress: entry.progress };
  });

  const normalizedConfig = GIT_CONFIG_KEYS.map((key) => {
    const matches = receipt.gitConfig.filter((entry) => entry?.key === key);
    if (matches.length !== 1) throw new Error(`Receipt Git config key is not allowlisted exactly once: ${key}`);
    const entry = matches[0];
    assertExactObjectKeys(
      entry,
      isLegacy ? ["key", "present", "values", "appliedValues"] : ["key", "present", "values", "appliedValues", "progress"],
      `Receipt Git config ${key}`
    );
    if (typeof entry.present !== "boolean" || !Array.isArray(entry.values) || !Array.isArray(entry.appliedValues)) {
      throw new Error(`Receipt Git config ${key} state is invalid.`);
    }
    if (entry.present !== (entry.values.length > 0)) {
      throw new Error(`Receipt Git config ${key} presence does not match its values.`);
    }
    if (entry.values.length > MAX_CONFIG_VALUES_PER_KEY || entry.appliedValues.length > MAX_CONFIG_VALUES_PER_KEY) {
      throw new Error(`Receipt Git config ${key} has too many values.`);
    }
    for (const value of [...entry.values, ...entry.appliedValues]) {
      if (typeof value !== "string" || value.includes("\0") || Buffer.byteLength(value) > MAX_CONFIG_VALUE_BYTES) {
        throw new Error(`Receipt Git config ${key} contains an invalid or too large value.`);
      }
    }
    if (!isLegacy && !["pending", "prepared", "applied"].includes(entry.progress)) {
      throw new Error(`Receipt Git config ${key} progress is invalid.`);
    }
    return {
      key,
      present: entry.present,
      values: [...entry.values],
      appliedValues: [...entry.appliedValues],
      ...(isLegacy ? {} : { progress: entry.progress })
    };
  });

  return {
    schema: RECEIPT_SCHEMA,
    version: receipt.version,
    createdAt: receipt.createdAt,
    ...(isLegacy ? {} : { operationId: receipt.operationId, state: receipt.state }),
    home: expectedHome,
    files: normalizedFiles,
    gitConfig: normalizedConfig
  };
}

function writeReceiptAtomically(receiptPath, receipt, { mustExist = false } = {}) {
  const resolved = assertSafeReceiptPath(receiptPath, { mustExist });
  const temporary = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${crypto.randomUUID()}.tmp`
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, resolved);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch (cleanupError) { if (cleanupError.code !== "ENOENT") throw cleanupError; }
    throw error;
  }
}

function persistReceipt(receiptPath, receipt) {
  if (!receiptPath) return;
  writeReceiptAtomically(receiptPath, receipt);
}

function updateReceipt(receiptPath, receipt) {
  if (!receiptPath) return;
  writeReceiptAtomically(receiptPath, receipt, { mustExist: true });
}

function receiptFileState(entry) {
  return {
    present: entry.present,
    bytes: entry.present ? decodeBoundedBase64(entry.bytesBase64, `Receipt file ${entry.id}`) : null,
    mode: entry.present ? entry.mode : null
  };
}

function assertManagedCurrentState(current, appliedReceipt) {
  for (const entry of current.files) {
    const applied = appliedReceipt.files.find((candidate) => candidate.id === entry.id);
    const currentSha256 = entry.present
      ? sha256(decodeBoundedBase64(entry.bytesBase64, `Current file ${entry.id}`))
      : null;
    if (currentSha256 !== applied.appliedSha256) {
      throw new Error(`Current Git guard state no longer matches the managed file ${entry.relativePath}; refusing restore.`);
    }
    if (applied.appliedMode !== null && entry.mode !== applied.appliedMode) {
      throw new Error(`Current Git guard mode no longer matches the managed file ${entry.relativePath}; refusing restore.`);
    }
  }
  for (const entry of current.gitConfig) {
    const applied = appliedReceipt.gitConfig.find((candidate) => candidate.key === entry.key);
    if (JSON.stringify(entry.values) !== JSON.stringify(applied.appliedValues)) {
      throw new Error(`Current Git guard state no longer matches the managed config ${entry.key}; refusing restore.`);
    }
  }
}

function restoreReceiptUnsafe({
  home,
  gitConfigGlobal,
  receipt,
  fileIds = new Set(FILE_TARGETS.map((entry) => entry.id)),
  configKeys = new Set(GIT_CONFIG_KEYS),
  expectedCurrent = null,
  mutatedFileIds = new Set(),
  mutatedConfigKeys = new Set()
}) {
  for (const entry of receipt.files) {
    if (!fileIds.has(entry.id)) continue;
    const targetPath = pathFromHome(home, entry.relativePath);
    if (expectedCurrent) {
      const expectedEntry = expectedCurrent.files.find((candidate) => candidate.id === entry.id);
      assertTargetUnchanged(home, targetPath, receiptFileState(expectedEntry));
    } else {
      readTargetState(home, targetPath);
    }
    mutatedFileIds.add(entry.id);
    if (!entry.present) {
      if (lstatOrNull(targetPath)) fs.unlinkSync(targetPath);
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, decodeBoundedBase64(entry.bytesBase64, `Receipt file ${entry.id}`));
    fs.chmodSync(targetPath, entry.mode);
  }
  for (const entry of receipt.gitConfig) {
    if (!configKeys.has(entry.key)) continue;
    if (expectedCurrent) {
      const expectedEntry = expectedCurrent.gitConfig.find((candidate) => candidate.key === entry.key);
      assertConfigUnchanged(home, gitConfigGlobal, entry.key, expectedEntry.values);
    }
    mutatedConfigKeys.add(entry.key);
    setConfigValues(home, gitConfigGlobal, entry.key, entry.values);
  }
}

function expectedCurrentFromMaps(fileStates, configValues) {
  return {
    files: [...fileStates].map(([id, state]) => ({
      id,
      present: state.present,
      bytesBase64: state.present ? state.bytes.toString("base64") : null,
      mode: state.present ? state.mode : null
    })),
    gitConfig: [...configValues].map(([key, values]) => ({ key, values: [...values] }))
  };
}

function restoreReceiptSafely({
  home,
  gitConfigGlobal,
  receipt,
  fileIds,
  configKeys,
  expectedCurrent
}) {
  const errors = [];
  for (const id of fileIds) {
    try {
      restoreReceiptUnsafe({
        home,
        gitConfigGlobal,
        receipt,
        fileIds: new Set([id]),
        configKeys: new Set(),
        expectedCurrent
      });
    } catch (error) {
      errors.push(error);
    }
  }
  for (const key of configKeys) {
    try {
      restoreReceiptUnsafe({
        home,
        gitConfigGlobal,
        receipt,
        fileIds: new Set(),
        configKeys: new Set([key]),
        expectedCurrent
      });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Rollback preserved state that changed after this transaction wrote it.");
  }
}

function assertTargetUnchanged(home, targetPath, expected) {
  const current = readTargetState(home, targetPath);
  const same = current.present === expected.present
    && (!current.present || (
      current.mode === expected.mode
      && current.bytes.equals(expected.bytes)
    ));
  if (!same) throw new Error(`Guard target changed after inspection: ${targetPath}`);
}

function assertConfigUnchanged(home, gitConfigGlobal, key, expectedValues) {
  const current = readConfigValues(home, gitConfigGlobal, key);
  if (JSON.stringify(current) !== JSON.stringify(expectedValues)) {
    throw new Error(`Global Git config ${key} changed after inspection.`);
  }
}

function injectFailure(failAfterStep, step) {
  if (failAfterStep === undefined) return;
  if (!Number.isInteger(failAfterStep) || failAfterStep < 1) {
    throw new Error("failAfterStep must be a positive integer.");
  }
  if (step === failAfterStep) throw new Error(`Injected failure after step ${step}.`);
}

export function applyGlobalGitGuards(options) {
  if (options.beforeMutation !== undefined && typeof options.beforeMutation !== "function") {
    throw new Error("beforeMutation must be a function when provided.");
  }
  const built = buildInspection(options);
  if (!built.inspection.ok) {
    const detail = built.inspection.conflicts.map((entry) => entry.message).join(" ");
    throw new Error(`Global Git guard adoption is required before apply. ${detail}`);
  }
  const receipt = validateGlobalGitGuardReceipt(
    captureReceipt(built.home, built.gitConfigGlobal, {
      fileSha256: new Map(built.desiredFiles.map((entry) => [entry.definition.id, sha256(entry.source.bytes)])),
      fileMode: new Map(built.desiredFiles.map((entry) => [entry.definition.id, entry.desiredMode])),
      configValues: new Map(built.desiredGitConfig.map((entry) => [entry.key, [entry.proposedValue]]))
    }),
    { home: built.home }
  );
  if (options.receiptPath) {
    const receiptPath = path.resolve(options.receiptPath);
    for (const entry of built.desiredFiles) {
      if (samePath(receiptPath, entry.targetPath)) {
        throw new Error(`Receipt path cannot overlap a managed guard target: ${receiptPath}`);
      }
    }
    if (built.gitConfigGlobal && samePath(receiptPath, built.gitConfigGlobal)) {
      throw new Error(`Receipt path cannot overlap the global Git config file: ${receiptPath}`);
    }
  }
  persistReceipt(options.receiptPath, receipt);

  let step = 0;
  const mutatedFileIds = new Set();
  const mutatedConfigKeys = new Set();
  const appliedFileStates = new Map();
  const appliedConfigValues = new Map();
  try {
    for (const entry of built.desiredFiles) {
      if (entry.public.action === "noop") continue;
      options.beforeMutation?.({
        type: "file",
        id: entry.definition.id,
        targetPath: entry.targetPath,
        nextStep: step + 1
      });
      assertTargetUnchanged(built.home, entry.targetPath, entry.current);
      receipt.files.find((candidate) => candidate.id === entry.definition.id).progress = "prepared";
      updateReceipt(options.receiptPath, receipt);
      mutatedFileIds.add(entry.definition.id);
      if (entry.public.action !== "chmod") {
        fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
        fs.writeFileSync(entry.targetPath, entry.source.bytes, {
          mode: entry.desiredMode ?? undefined
        });
      }
      if (entry.desiredMode !== null) fs.chmodSync(entry.targetPath, entry.desiredMode);
      appliedFileStates.set(entry.definition.id, readTargetState(built.home, entry.targetPath));
      receipt.files.find((candidate) => candidate.id === entry.definition.id).progress = "applied";
      updateReceipt(options.receiptPath, receipt);
      step += 1;
      injectFailure(options.failAfterStep, step);
    }
    for (const entry of built.desiredGitConfig) {
      if (entry.public.action === "noop") continue;
      options.beforeMutation?.({
        type: "git-config",
        key: entry.key,
        nextStep: step + 1
      });
      assertConfigUnchanged(built.home, built.gitConfigGlobal, entry.key, entry.values);
      receipt.gitConfig.find((candidate) => candidate.key === entry.key).progress = "prepared";
      updateReceipt(options.receiptPath, receipt);
      mutatedConfigKeys.add(entry.key);
      setConfigValues(built.home, built.gitConfigGlobal, entry.key, [entry.proposedValue]);
      appliedConfigValues.set(entry.key, readConfigValues(built.home, built.gitConfigGlobal, entry.key));
      receipt.gitConfig.find((candidate) => candidate.key === entry.key).progress = "applied";
      updateReceipt(options.receiptPath, receipt);
      step += 1;
      injectFailure(options.failAfterStep, step);
    }

    const verified = buildInspection({
      ...options,
      adoptFiles: [],
      adoptKeys: []
    }).inspection;
    if (!verified.ok || [...verified.files, ...verified.gitConfig].some((entry) => entry.action !== "noop")) {
      throw new Error("Global Git guard apply verification failed.");
    }
    receipt.state = "applied";
    updateReceipt(options.receiptPath, receipt);
  } catch (error) {
    try {
      restoreReceiptSafely({
        home: built.home,
        gitConfigGlobal: built.gitConfigGlobal,
        receipt,
        fileIds: mutatedFileIds,
        configKeys: mutatedConfigKeys,
        expectedCurrent: expectedCurrentFromMaps(appliedFileStates, appliedConfigValues)
      });
      receipt.state = "rolled-back";
      updateReceipt(options.receiptPath, receipt);
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], `Global Git guard apply failed and rollback also failed: ${error.message}`);
    }
    throw error;
  }

  return {
    applied: true,
    stepsApplied: step,
    inspection: built.inspection,
    receipt
  };
}

function sameFileState(left, right) {
  return left.present === right.present
    && (!left.present || (left.mode === right.mode && left.bytes.equals(right.bytes)));
}

function isAppliedFileState(current, entry) {
  return current.present
    && sha256(current.bytes) === entry.appliedSha256
    && (entry.appliedMode === null || current.mode === entry.appliedMode);
}

function recoverInterruptedReceipt(home, gitConfigGlobal, receipt) {
  const fileIds = new Set();
  const configKeys = new Set();
  const expectedFileStates = new Map();
  const expectedConfigValues = new Map();

  for (const entry of receipt.files) {
    const targetPath = pathFromHome(home, entry.relativePath);
    const current = readTargetState(home, targetPath);
    const original = receiptFileState(entry);
    const originalMatches = sameFileState(current, original);
    const appliedMatches = isAppliedFileState(current, entry);
    if (receipt.state === "rolled-back") {
      if (originalMatches) continue;
      throw new Error(`Current Git guard state no longer matches the expected original file ${entry.relativePath}; refusing recovery.`);
    }
    if (entry.progress === "pending") {
      if (originalMatches) continue;
      throw new Error(`Current Git guard state no longer matches the expected original file ${entry.relativePath}; refusing recovery.`);
    }
    if (entry.progress === "applied") {
      if (!appliedMatches) {
        throw new Error(`Current Git guard state no longer matches the expected managed file ${entry.relativePath}; refusing recovery.`);
      }
    } else if (originalMatches) {
      continue;
    } else if (!appliedMatches) {
      throw new Error(`Current Git guard state no longer matches an expected original or managed file ${entry.relativePath}; refusing recovery.`);
    }
    fileIds.add(entry.id);
    expectedFileStates.set(entry.id, current);
  }
  for (const entry of receipt.gitConfig) {
    const current = readConfigValues(home, gitConfigGlobal, entry.key);
    const originalMatches = JSON.stringify(current) === JSON.stringify(entry.values);
    const appliedMatches = JSON.stringify(current) === JSON.stringify(entry.appliedValues);
    if (receipt.state === "rolled-back") {
      if (originalMatches) continue;
      throw new Error(`Current Git guard state no longer matches the expected original config ${entry.key}; refusing recovery.`);
    }
    if (entry.progress === "pending") {
      if (originalMatches) continue;
      throw new Error(`Current Git guard state no longer matches the expected original config ${entry.key}; refusing recovery.`);
    }
    if (entry.progress === "applied") {
      if (!appliedMatches) {
        throw new Error(`Current Git guard state no longer matches the expected managed config ${entry.key}; refusing recovery.`);
      }
    } else if (originalMatches) {
      continue;
    } else if (!appliedMatches) {
      throw new Error(`Current Git guard state no longer matches an expected original or managed config ${entry.key}; refusing recovery.`);
    }
    configKeys.add(entry.key);
    expectedConfigValues.set(entry.key, current);
  }
  restoreReceiptUnsafe({
    home,
    gitConfigGlobal,
    receipt,
    fileIds,
    configKeys,
    expectedCurrent: expectedCurrentFromMaps(expectedFileStates, expectedConfigValues)
  });
  return { recovered: true, fileIds, configKeys };
}

export function restoreGlobalGitGuards({ home, gitConfigGlobal, receipt, receiptPath }) {
  const normalizedHome = normalizeHome(home);
  const normalizedReceipt = validateGlobalGitGuardReceipt(receipt, { home: normalizedHome });
  const normalizedGitConfigGlobal = gitConfigGlobal ? path.resolve(gitConfigGlobal) : undefined;
  if (normalizedReceipt.version === RECEIPT_VERSION && normalizedReceipt.state !== "applied") {
    const recovery = recoverInterruptedReceipt(normalizedHome, normalizedGitConfigGlobal, normalizedReceipt);
    normalizedReceipt.state = "rolled-back";
    updateReceipt(receiptPath, normalizedReceipt);
    return { restored: true, recovered: recovery.recovered, receipt: normalizedReceipt };
  }
  const current = validateGlobalGitGuardReceipt(
    captureReceipt(normalizedHome, normalizedGitConfigGlobal),
    { home: normalizedHome }
  );
  assertManagedCurrentState(current, normalizedReceipt);
  const mutatedFileIds = new Set();
  const mutatedConfigKeys = new Set();
  try {
    restoreReceiptUnsafe({
      home: normalizedHome,
      gitConfigGlobal: normalizedGitConfigGlobal,
      receipt: normalizedReceipt,
      expectedCurrent: current,
      mutatedFileIds,
      mutatedConfigKeys
    });
  } catch (error) {
    try {
      restoreReceiptSafely({
        home: normalizedHome,
        gitConfigGlobal: normalizedGitConfigGlobal,
        receipt: current,
        fileIds: mutatedFileIds,
        configKeys: mutatedConfigKeys,
        expectedCurrent: normalizedReceipt
      });
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], `Global Git guard restore failed and rollback also failed: ${error.message}`);
    }
    throw error;
  }
  if (normalizedReceipt.version === RECEIPT_VERSION) {
    normalizedReceipt.state = "rolled-back";
    updateReceipt(receiptPath, normalizedReceipt);
  }
  return { restored: true, recovered: false, receipt: normalizedReceipt };
}
