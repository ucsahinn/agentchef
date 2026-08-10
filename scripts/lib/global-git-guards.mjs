import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RECEIPT_SCHEMA = "codex-chef.global-git-guards-receipt";
export const RECEIPT_VERSION = 1;
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
    const action = !current.present
      ? "create"
      : contentExact && modeExact
        ? "noop"
        : contentExact
          ? "chmod"
        : adoptedFiles.has(definition.id)
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
      schema: "codex-chef.global-git-guards-inspection",
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
        appliedMode: applied.fileMode?.get(definition.id) ?? null
      };
    }),
    gitConfig: GIT_CONFIG_KEYS.map((key) => {
      const values = readConfigValues(home, gitConfigGlobal, key);
      return {
        key,
        present: values.length > 0,
        values,
        appliedValues: applied.configValues?.get(key) ?? [...values]
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
  assertExactObjectKeys(
    receipt,
    ["schema", "version", "createdAt", "home", "files", "gitConfig"],
    "Global Git guard receipt"
  );
  if (receipt.schema !== RECEIPT_SCHEMA || receipt.version !== RECEIPT_VERSION) {
    throw new Error("Global Git guard receipt schema or version is unsupported.");
  }
  if (typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) {
    throw new Error("Global Git guard receipt createdAt is invalid.");
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
      ["id", "relativePath", "present", "bytesBase64", "mode", "appliedSha256", "appliedMode"],
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
    return { ...entry };
  });

  const normalizedConfig = GIT_CONFIG_KEYS.map((key) => {
    const matches = receipt.gitConfig.filter((entry) => entry?.key === key);
    if (matches.length !== 1) throw new Error(`Receipt Git config key is not allowlisted exactly once: ${key}`);
    const entry = matches[0];
    assertExactObjectKeys(entry, ["key", "present", "values", "appliedValues"], `Receipt Git config ${key}`);
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
    return {
      key,
      present: entry.present,
      values: [...entry.values],
      appliedValues: [...entry.appliedValues]
    };
  });

  return {
    schema: RECEIPT_SCHEMA,
    version: RECEIPT_VERSION,
    createdAt: receipt.createdAt,
    home: expectedHome,
    files: normalizedFiles,
    gitConfig: normalizedConfig
  };
}

function persistReceipt(receiptPath, receipt) {
  if (!receiptPath) return;
  const resolved = assertSafeReceiptPath(receiptPath);
  fs.writeFileSync(resolved, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
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
      mutatedFileIds.add(entry.definition.id);
      if (entry.public.action !== "chmod") {
        fs.mkdirSync(path.dirname(entry.targetPath), { recursive: true });
        fs.writeFileSync(entry.targetPath, entry.source.bytes, {
          mode: entry.desiredMode ?? undefined
        });
      }
      if (entry.desiredMode !== null) fs.chmodSync(entry.targetPath, entry.desiredMode);
      appliedFileStates.set(entry.definition.id, readTargetState(built.home, entry.targetPath));
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
      mutatedConfigKeys.add(entry.key);
      setConfigValues(built.home, built.gitConfigGlobal, entry.key, [entry.proposedValue]);
      appliedConfigValues.set(entry.key, readConfigValues(built.home, built.gitConfigGlobal, entry.key));
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

export function restoreGlobalGitGuards({ home, gitConfigGlobal, receipt }) {
  const normalizedHome = normalizeHome(home);
  const normalizedReceipt = validateGlobalGitGuardReceipt(receipt, { home: normalizedHome });
  const current = validateGlobalGitGuardReceipt(
    captureReceipt(normalizedHome, gitConfigGlobal ? path.resolve(gitConfigGlobal) : undefined),
    { home: normalizedHome }
  );
  assertManagedCurrentState(current, normalizedReceipt);
  const mutatedFileIds = new Set();
  const mutatedConfigKeys = new Set();
  try {
    restoreReceiptUnsafe({
      home: normalizedHome,
      gitConfigGlobal: gitConfigGlobal ? path.resolve(gitConfigGlobal) : undefined,
      receipt: normalizedReceipt,
      expectedCurrent: current,
      mutatedFileIds,
      mutatedConfigKeys
    });
  } catch (error) {
    try {
      restoreReceiptSafely({
        home: normalizedHome,
        gitConfigGlobal: gitConfigGlobal ? path.resolve(gitConfigGlobal) : undefined,
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
  return { restored: true, receipt: normalizedReceipt };
}
