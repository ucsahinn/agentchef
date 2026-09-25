import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FILE_TARGETS,
  GIT_CONFIG_KEYS,
  applyGlobalGitGuards,
  inspectGlobalGitGuards,
  restoreGlobalGitGuards,
  validateGlobalGitGuardReceipt
} from "../lib/global-git-guards.mjs";

const cliPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "manage-global-git-guards.mjs"
);

function runGit(fixture, args, expectedStatuses = [0]) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      HOME: fixture.home,
      USERPROFILE: fixture.home,
      GIT_CONFIG_GLOBAL: fixture.gitConfigGlobal,
      GIT_CONFIG_NOSYSTEM: "1"
    }
  });
  assert.equal(
    expectedStatuses.includes(result.status),
    true,
    `git ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`
  );
  return result;
}

function configValues(fixture, key) {
  const result = runGit(fixture, ["config", "--global", "--get-all", key], [0, 1]);
  return result.status === 0
    ? result.stdout.split(/\r?\n/).filter((value) => value.length > 0)
    : [];
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-git-guards-"));
  const home = path.join(root, "home");
  const source = path.join(root, "source");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  const gitConfigGlobal = path.join(root, "global.gitconfig");
  const ignoreSource = path.join(source, ".gitignore_global");
  const hookSource = path.join(source, "pre-commit");
  fs.writeFileSync(ignoreSource, "node_modules/\n.env\n", "utf8");
  fs.writeFileSync(hookSource, "#!/usr/bin/env node\nprocess.exit(0);\n", "utf8");
  return { root, home, gitConfigGlobal, ignoreSource, hookSource };
}

function options(fx, extra = {}) {
  return {
    home: fx.home,
    gitConfigGlobal: fx.gitConfigGlobal,
    ignoreSource: fx.ignoreSource,
    hookSource: fx.hookSource,
    ...extra
  };
}

function targetPaths(fx) {
  return {
    ignore: path.join(fx.home, ".gitignore_global"),
    hook: path.join(fx.home, ".githooks", "pre-commit")
  };
}

test("preview classifies absent, exact, and foreign guard state without writes", () => {
  const fx = fixture();
  const targets = targetPaths(fx);

  const absent = inspectGlobalGitGuards(options(fx));
  assert.equal(absent.ok, true);
  assert.deepEqual(absent.files.map((entry) => [entry.id, entry.action]), [
    ["gitignore-global", "create"],
    ["pre-commit-hook", "create"]
  ]);
  assert.deepEqual(absent.gitConfig.map((entry) => [entry.key, entry.action]), [
    ["core.excludesfile", "set"],
    ["core.hooksPath", "set"]
  ]);
  assert.equal(fs.existsSync(targets.ignore), false);
  assert.equal(fs.existsSync(fx.gitConfigGlobal), false);

  fs.mkdirSync(path.dirname(targets.hook), { recursive: true });
  fs.copyFileSync(fx.ignoreSource, targets.ignore);
  fs.copyFileSync(fx.hookSource, targets.hook);
  if (process.platform !== "win32") fs.chmodSync(targets.hook, 0o755);
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", targets.ignore]);
  runGit(fx, ["config", "--global", "--add", "core.hooksPath", path.dirname(targets.hook)]);

  const exact = inspectGlobalGitGuards(options(fx));
  assert.equal(exact.ok, true);
  assert.deepEqual(exact.files.map((entry) => entry.action), ["noop", "noop"]);
  assert.deepEqual(exact.gitConfig.map((entry) => entry.action), ["noop", "noop"]);
});

test("each foreign file and config key requires its own narrow adoption", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  fs.mkdirSync(path.dirname(targets.hook), { recursive: true });
  fs.writeFileSync(targets.ignore, "foreign ignore\n", "utf8");
  fs.writeFileSync(targets.hook, "foreign hook\n", "utf8");
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", "foreign-ignore"]);
  runGit(fx, ["config", "--global", "--add", "core.hooksPath", "foreign-hooks"]);

  const blocked = inspectGlobalGitGuards(options(fx));
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.conflicts.map((entry) => entry.id), [
    "file:gitignore-global",
    "file:pre-commit-hook",
    "git-config:core.excludesfile",
    "git-config:core.hooksPath"
  ]);
  assert.throws(() => applyGlobalGitGuards(options(fx)), /adoption/i);
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "foreign ignore\n");
  assert.deepEqual(configValues(fx, "core.excludesfile"), ["foreign-ignore"]);

  const partial = inspectGlobalGitGuards(options(fx, {
    adoptFiles: ["gitignore-global", "pre-commit-hook"],
    adoptKeys: ["core.excludesfile"]
  }));
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.conflicts.map((entry) => entry.id), ["git-config:core.hooksPath"]);

  const adopted = applyGlobalGitGuards(options(fx, {
    adoptFiles: FILE_TARGETS.map((entry) => entry.id),
    adoptKeys: [...GIT_CONFIG_KEYS]
  }));
  assert.equal(adopted.inspection.ok, true);
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), fs.readFileSync(fx.ignoreSource, "utf8"));
  assert.equal(fs.readFileSync(targets.hook, "utf8"), fs.readFileSync(fx.hookSource, "utf8"));
  assert.deepEqual(configValues(fx, "core.excludesfile"), [targets.ignore]);
  assert.deepEqual(configValues(fx, "core.hooksPath"), [path.dirname(targets.hook)]);
});

test("apply receipt and restore preserve exact multi-value, unset, bytes, and absence state", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const foreignIgnore = Buffer.from([0, 1, 2, 10, 255]);
  fs.writeFileSync(targets.ignore, foreignIgnore);
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", "first"]);
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", "second value"]);

  const applied = applyGlobalGitGuards(options(fx, {
    adoptFiles: ["gitignore-global"],
    adoptKeys: ["core.excludesfile"]
  }));
  const receipt = validateGlobalGitGuardReceipt(applied.receipt, { home: fx.home });
  assert.deepEqual(receipt.gitConfig.find((entry) => entry.key === "core.excludesfile"), {
    key: "core.excludesfile",
    present: true,
    values: ["first", "second value"],
    appliedValues: [targets.ignore],
    progress: "applied"
  });
  assert.deepEqual(receipt.gitConfig.find((entry) => entry.key === "core.hooksPath"), {
    key: "core.hooksPath",
    present: false,
    values: [],
    appliedValues: [path.dirname(targets.hook)],
    progress: "applied"
  });
  assert.equal(receipt.files.find((entry) => entry.id === "gitignore-global").bytesBase64, foreignIgnore.toString("base64"));
  assert.equal(receipt.files.find((entry) => entry.id === "pre-commit-hook").present, false);

  fs.writeFileSync(fx.ignoreSource, "updated repository source\n", "utf8");
  fs.writeFileSync(fx.hookSource, "updated repository hook\n", "utf8");

  restoreGlobalGitGuards({
    ...options(fx),
    receipt
  });
  assert.deepEqual(fs.readFileSync(targets.ignore), foreignIgnore);
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), ["first", "second value"]);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("manual restore refuses to overwrite Git guard state changed after apply", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  fs.writeFileSync(targets.ignore, "user edit after install\n", "utf8");
  runGit(fx, ["config", "--global", "--replace-all", "core.hooksPath", "user-hooks-after-install"]);

  assert.throws(() => restoreGlobalGitGuards({
    ...options(fx),
    receipt: applied.receipt
  }), /current.*no longer matches.*managed/i);
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "user edit after install\n");
  assert.deepEqual(configValues(fx, "core.hooksPath"), ["user-hooks-after-install"]);
});

test("manual restore refuses post-apply managed file mode drift", {
  skip: process.platform === "win32" ? "POSIX mode semantics are not available on Windows." : false
}, () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  fs.chmodSync(targets.hook, 0o700);

  assert.throws(() => restoreGlobalGitGuards({
    home: fx.home,
    gitConfigGlobal: fx.gitConfigGlobal,
    receipt: applied.receipt
  }), /mode no longer matches.*pre-commit/i);
  assert.equal(fs.statSync(targets.hook).mode & 0o777, 0o700);
});

test("injected mid-transaction failure rolls back every prior change", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  fs.writeFileSync(targets.ignore, "foreign ignore\n", "utf8");
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", "one"]);
  runGit(fx, ["config", "--global", "--add", "core.excludesfile", "two"]);
  const beforeConfig = fs.readFileSync(fx.gitConfigGlobal);

  assert.throws(() => applyGlobalGitGuards(options(fx, {
    adoptFiles: ["gitignore-global"],
    adoptKeys: ["core.excludesfile"],
    failAfterStep: 3
  })), /injected failure after step 3/i);

  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "foreign ignore\n");
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(fs.readFileSync(fx.gitConfigGlobal), beforeConfig);
  assert.deepEqual(configValues(fx, "core.excludesfile"), ["one", "two"]);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("a target changed after inspection is never overwritten or rolled back", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  let injected = false;
  assert.throws(() => applyGlobalGitGuards(options(fx, {
    beforeMutation: ({ type, id }) => {
      if (!injected && type === "file" && id === "gitignore-global") {
        fs.writeFileSync(targets.ignore, "concurrent owner\n", "utf8");
        injected = true;
      }
    }
  })), /changed after inspection/i);
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "concurrent owner\n");
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), []);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("apply rollback preserves a file changed after this transaction wrote it", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  let changed = false;

  assert.throws(() => applyGlobalGitGuards(options(fx, {
    failAfterStep: 2,
    beforeMutation: ({ type, id }) => {
      if (!changed && type === "file" && id === "pre-commit-hook") {
        fs.writeFileSync(targets.ignore, "concurrent edit after managed write\n", "utf8");
        changed = true;
      }
    }
  })), /rollback also failed/i);

  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "concurrent edit after managed write\n");
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), []);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("apply rollback preserves a Git config key changed after this transaction wrote it", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  let changed = false;

  assert.throws(() => applyGlobalGitGuards(options(fx, {
    failAfterStep: 4,
    beforeMutation: ({ type, key }) => {
      if (!changed && type === "git-config" && key === "core.hooksPath") {
        runGit(fx, ["config", "--global", "--replace-all", "core.excludesfile", "concurrent-config-edit"]);
        changed = true;
      }
    }
  })), /rollback also failed/i);

  assert.equal(fs.existsSync(targets.ignore), false);
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), ["concurrent-config-edit"]);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("receipt path cannot overlap either managed guard target", () => {
  for (const targetName of ["ignore", "hook"]) {
    const fx = fixture();
    const matchingPath = targetPaths(fx)[targetName];
    assert.throws(
      () => applyGlobalGitGuards(options(fx, { receiptPath: matchingPath })),
      /receipt.*guard target/i
    );
  }
});

test("linked source paths fail closed", () => {
  const sourceFixture = fixture();
  const linkedSource = path.join(sourceFixture.root, "linked-source");
  const sourceDirectory = path.join(sourceFixture.root, "source-directory");
  fs.mkdirSync(sourceDirectory);
  fs.symlinkSync(sourceDirectory, linkedSource, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => inspectGlobalGitGuards(options(sourceFixture, { ignoreSource: linkedSource })),
    /source.*symlink/i
  );
});

test("linked HOME roots fail closed", () => {
  const homeFixture = fixture();
  const realHome = path.join(homeFixture.root, "real-home");
  const linkedHome = path.join(homeFixture.root, "linked-home");
  fs.mkdirSync(realHome);
  fs.symlinkSync(realHome, linkedHome, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => inspectGlobalGitGuards(options(homeFixture, { home: linkedHome })),
    /HOME.*symlink/i
  );
});

test("receipt persistence refuses a linked parent path", () => {
  const fx = fixture();
  const outside = path.join(fx.root, "outside");
  const linkedParent = path.join(fx.root, "linked-receipts");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, linkedParent, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => applyGlobalGitGuards(options(fx, {
      receiptPath: path.join(linkedParent, "receipt.json")
    })),
    /receipt.*symlink/i
  );
  assert.equal(fs.existsSync(path.join(outside, "receipt.json")), false);
});

test("receipt validation rejects alternate keys, paths, homes, and oversized payloads", () => {
  const fx = fixture();
  const applied = applyGlobalGitGuards(options(fx));
  const valid = structuredClone(applied.receipt);

  const wrongKey = structuredClone(valid);
  wrongKey.gitConfig[0].key = "credential.helper";
  assert.throws(() => validateGlobalGitGuardReceipt(wrongKey, { home: fx.home }), /allowlisted/i);

  const wrongPath = structuredClone(valid);
  wrongPath.files[0].relativePath = "../outside";
  assert.throws(() => validateGlobalGitGuardReceipt(wrongPath, { home: fx.home }), /allowlisted/i);

  const otherHome = path.join(fx.root, "other-home");
  fs.mkdirSync(otherHome);
  assert.throws(
    () => validateGlobalGitGuardReceipt(valid, { home: otherHome }),
    /receipt.*HOME/i
  );

  const oversized = structuredClone(valid);
  oversized.files[0].present = true;
  oversized.files[0].bytesBase64 = Buffer.alloc(1_048_577).toString("base64");
  assert.throws(() => validateGlobalGitGuardReceipt(oversized, { home: fx.home }), /too large/i);
});

test("JSON CLI previews, applies with a receipt, and restores it", () => {
  const fx = fixture();
  const receiptPath = path.join(fx.root, "receipt.json");
  const common = [
    "--home", fx.home,
    "--git-config-global", fx.gitConfigGlobal,
    "--ignore-source", fx.ignoreSource,
    "--hook-source", fx.hookSource,
    "--json"
  ];

  const preview = spawnSync(process.execPath, [cliPath, "preview", ...common], {
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(JSON.parse(preview.stdout).inspection.ok, true);
  assert.equal(fs.existsSync(fx.gitConfigGlobal), false);

  const apply = spawnSync(process.execPath, [
    cliPath,
    "apply",
    ...common,
    "--receipt",
    receiptPath
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(apply.status, 0, apply.stderr);
  const applyPayload = JSON.parse(apply.stdout);
  assert.equal(applyPayload.applied, true);
  assert.deepEqual(applyPayload.receipt, {
    path: receiptPath,
    schema: "agentchef.global-git-guards-receipt",
    version: 2
  });
  assert.equal(apply.stdout.includes("bytesBase64"), false);
  assert.equal(fs.existsSync(receiptPath), true);
  const persistedApplyReceipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.match(persistedApplyReceipt.operationId, /^[0-9a-f-]{36}$/i);
  assert.equal(persistedApplyReceipt.state, "applied");
  assert.equal(persistedApplyReceipt.files.every((entry) => entry.progress === "applied"), true);
  assert.equal(persistedApplyReceipt.gitConfig.every((entry) => entry.progress === "applied"), true);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
  }

  const restore = spawnSync(process.execPath, [
    cliPath,
    "restore",
    "--home", fx.home,
    "--git-config-global", fx.gitConfigGlobal,
    "--receipt", receiptPath,
    "--json"
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(restore.status, 0, restore.stderr);
  assert.equal(JSON.parse(restore.stdout).restored, true);
  assert.equal(JSON.parse(restore.stdout).recovered, false);
  assert.equal(restore.stdout.includes("bytesBase64"), false);
  assert.equal(JSON.parse(fs.readFileSync(receiptPath, "utf8")).state, "rolled-back");
  assert.equal(fs.existsSync(targetPaths(fx).ignore), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), []);
});

test("v2 receipt recovers crash-like pre- and post-mutation prepared states without touching pending surfaces", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  restoreGlobalGitGuards({ ...options(fx), receipt: applied.receipt });

  const interrupted = structuredClone(applied.receipt);
  interrupted.version = 2;
  interrupted.operationId = "4dc24b09-9cb6-4c10-9a64-d2a5d0a39e82";
  interrupted.state = "applying";
  for (const entry of interrupted.files) entry.progress = "pending";
  for (const entry of interrupted.gitConfig) entry.progress = "pending";
  interrupted.files.find((entry) => entry.id === "gitignore-global").progress = "prepared";
  interrupted.files.find((entry) => entry.id === "pre-commit-hook").progress = "prepared";

  fs.writeFileSync(targets.ignore, fs.readFileSync(fx.ignoreSource));
  const result = restoreGlobalGitGuards({ ...options(fx), receipt: interrupted });

  assert.equal(result.recovered, true);
  assert.equal(fs.existsSync(targets.ignore), false);
  assert.equal(fs.existsSync(targets.hook), false);
  assert.deepEqual(configValues(fx, "core.excludesfile"), []);
  assert.deepEqual(configValues(fx, "core.hooksPath"), []);
});

test("v2 interrupted receipt fails closed when a prepared target has concurrent foreign content", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  restoreGlobalGitGuards({ ...options(fx), receipt: applied.receipt });

  const interrupted = structuredClone(applied.receipt);
  interrupted.version = 2;
  interrupted.operationId = "4dc24b09-9cb6-4c10-9a64-d2a5d0a39e82";
  interrupted.state = "applying";
  for (const entry of interrupted.files) entry.progress = "pending";
  for (const entry of interrupted.gitConfig) entry.progress = "pending";
  interrupted.files.find((entry) => entry.id === "gitignore-global").progress = "prepared";

  fs.writeFileSync(targets.ignore, "concurrent foreign content\n", "utf8");
  assert.throws(
    () => restoreGlobalGitGuards({ ...options(fx), receipt: interrupted }),
    /expected original or managed file.*refusing recovery/i
  );
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), "concurrent foreign content\n");
});

test("v2 interrupted receipt rejects managed content for a surface never prepared", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  restoreGlobalGitGuards({ ...options(fx), receipt: applied.receipt });

  const interrupted = structuredClone(applied.receipt);
  interrupted.version = 2;
  interrupted.operationId = "4dc24b09-9cb6-4c10-9a64-d2a5d0a39e82";
  interrupted.state = "applying";
  for (const entry of interrupted.files) entry.progress = "pending";
  for (const entry of interrupted.gitConfig) entry.progress = "pending";

  fs.writeFileSync(targets.ignore, fs.readFileSync(fx.ignoreSource));
  assert.throws(
    () => restoreGlobalGitGuards({ ...options(fx), receipt: interrupted }),
    /expected original.*refusing recovery/i
  );
  assert.equal(fs.readFileSync(targets.ignore, "utf8"), fs.readFileSync(fx.ignoreSource, "utf8"));
});

test("JSON CLI recover persists the rolled-back state for an interrupted receipt", () => {
  const fx = fixture();
  const targets = targetPaths(fx);
  const applied = applyGlobalGitGuards(options(fx));
  restoreGlobalGitGuards({ ...options(fx), receipt: applied.receipt });
  const receipt = structuredClone(applied.receipt);
  receipt.operationId = "4dc24b09-9cb6-4c10-9a64-d2a5d0a39e82";
  receipt.state = "applying";
  for (const entry of receipt.files) entry.progress = "pending";
  for (const entry of receipt.gitConfig) entry.progress = "pending";
  receipt.files.find((entry) => entry.id === "gitignore-global").progress = "prepared";
  fs.writeFileSync(targets.ignore, fs.readFileSync(fx.ignoreSource));
  const receiptPath = path.join(fx.root, "interrupted-receipt.json");
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    cliPath,
    "recover",
    "--home", fx.home,
    "--git-config-global", fx.gitConfigGlobal,
    "--receipt", receiptPath,
    "--json"
  ], { encoding: "utf8", windowsHide: true });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).recovered, true);
  assert.equal(JSON.parse(fs.readFileSync(receiptPath, "utf8")).state, "rolled-back");
  assert.equal(fs.existsSync(targets.ignore), false);
});

test("legacy v1 receipts retain strict final-state restore behavior", () => {
  const fx = fixture();
  const applied = applyGlobalGitGuards(options(fx));
  const legacy = structuredClone(applied.receipt);
  legacy.version = 1;
  delete legacy.operationId;
  delete legacy.state;
  for (const entry of legacy.files) delete entry.progress;
  for (const entry of legacy.gitConfig) delete entry.progress;

  const result = restoreGlobalGitGuards({ ...options(fx), receipt: legacy });
  assert.equal(result.restored, true);
  assert.equal(result.recovered, false);
  assert.equal(fs.existsSync(targetPaths(fx).ignore), false);
});

test("a hook shipped by an earlier AgentChef release is replaced without adoption", (t) => {
  const fx = fixture();
  const { hook } = targetPaths(fx);
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  // The 1.0.0 hook, exactly as that release shipped it.
  const shipped = spawnSync("git", ["show", "715d0b8:templates/git/pre-commit"], { cwd: repoRoot, encoding: "buffer", windowsHide: true });
  if (shipped.status !== 0) {
    t.skip("the 1.0.0 commit is not in this clone");
    return;
  }
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, shipped.stdout);
  const owned = inspectGlobalGitGuards(options(fx)).files.find((entry) => entry.id === "pre-commit-hook");
  assert.equal(owned.action, "replace");
  assert.equal(owned.adoptionRequired, false);

  fs.writeFileSync(hook, "#!/usr/bin/env node\n// the user's own hook\n");
  const foreign = inspectGlobalGitGuards(options(fx)).files.find((entry) => entry.id === "pre-commit-hook");
  assert.equal(foreign.action, "conflict");
});
