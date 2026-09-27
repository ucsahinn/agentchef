import assert from "node:assert/strict";
import test from "node:test";
import {
  PLUGIN_ID,
  commandInvocation,
  refreshInstalledPlugin
} from "../refresh-installed-plugin.mjs";

const expectedVersion = "0.5.61";

function listResult(installed = []) {
  return {
    status: 0,
    stdout: JSON.stringify({ installed }),
    stderr: ""
  };
}

function installedPlugin(version) {
  return {
    pluginId: PLUGIN_ID,
    name: "agentchef-workflows",
    version,
    installed: true,
    enabled: true
  };
}

test("wraps Windows cmd shims through cmd.exe", () => {
  assert.deepEqual(
    commandInvocation("codex.cmd", ["plugin", "list", "--json"], "win32"),
    {
      executable: "cmd.exe",
      args: ["/d", "/s", "/c", "codex.cmd", "plugin", "list", "--json"]
    }
  );
});

test("does not install the managed plugin for users who never installed it", () => {
  const calls = [];
  const result = refreshInstalledPlugin({
    expectedVersion,
    runCodex(args) {
      calls.push(args);
      return listResult();
    }
  });

  assert.equal(result.status, "not-installed");
  assert.deepEqual(calls, [["plugin", "list", "--json"]]);
});

test("leaves a current installed plugin untouched", () => {
  const calls = [];
  const result = refreshInstalledPlugin({
    expectedVersion,
    runCodex(args) {
      calls.push(args);
      return listResult([installedPlugin(expectedVersion)]);
    }
  });

  assert.equal(result.status, "current");
  assert.deepEqual(calls, [["plugin", "list", "--json"]]);
});

test("plans a stale installed-plugin cache refresh without writing", () => {
  const calls = [];
  const result = refreshInstalledPlugin({
    expectedVersion,
    runCodex(args) {
      calls.push(args);
      return listResult([installedPlugin("0.5.57")]);
    }
  });

  assert.equal(result.status, "planned");
  assert.equal(result.currentVersion, "0.5.57");
  assert.equal(result.expectedVersion, expectedVersion);
  assert.deepEqual(calls, [["plugin", "list", "--json"]]);
});

test("refreshes a stale installed-plugin cache in place and verifies the result", () => {
  const calls = [];
  let listCount = 0;
  const result = refreshInstalledPlugin({
    apply: true,
    expectedVersion,
    runCodex(args) {
      calls.push(args);
      if (args[1] === "add") {
        return { status: 0, stdout: JSON.stringify({ version: expectedVersion }), stderr: "" };
      }
      listCount += 1;
      return listResult([
        installedPlugin(listCount === 1 ? "0.5.57" : expectedVersion)
      ]);
    }
  });

  assert.equal(result.status, "refreshed");
  assert.deepEqual(calls, [
    ["plugin", "list", "--json"],
    ["plugin", "add", PLUGIN_ID, "--json"],
    ["plugin", "list", "--json"]
  ]);
});

test("fails instead of claiming success when a stale plugin cannot be refreshed", () => {
  assert.throws(
    () => refreshInstalledPlugin({
      apply: true,
      expectedVersion,
      runCodex(args) {
        if (args[1] === "add") {
          return { status: 1, stdout: "", stderr: "fixture add failure" };
        }
        return listResult([installedPlugin("0.5.57")]);
      }
    }),
    /fixture add failure/
  );
});

test("reports a post-commit plugin refresh as uncertain instead of claiming rollback", () => {
  let listCount = 0;
  const result = refreshInstalledPlugin({
    apply: true,
    expectedVersion,
    runCodex(args) {
      if (args[1] === "add") {
        return { status: 0, stdout: "", stderr: "" };
      }
      listCount += 1;
      return listCount === 1
        ? listResult([installedPlugin("0.5.57")])
        : { status: 1, stdout: "", stderr: "post-refresh fixture failure" };
    }
  });

  assert.equal(result.status, "refresh-uncertain");
  assert.equal(result.externalMutationApplied, true);
  assert.equal(result.previousVersion, "0.5.57");
  assert.match(result.warning, /post-refresh verification/i);
});

test("treats a missing Codex CLI as a safe no-op", () => {
  const result = refreshInstalledPlugin({
    expectedVersion,
    runCodex() {
      return {
        status: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" })
      };
    }
  });

  assert.equal(result.status, "unavailable");
  assert.match(result.warning, /not available/i);
});
test("treats an empty plugin-list response as an unavailable inspection", () => {
  const result = refreshInstalledPlugin({
    expectedVersion,
    runCodex() {
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(result.status, "unavailable");
  assert.match(result.warning, /empty output/i);
});

test("a same-version cache whose files differ from the local source is refreshed", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-plugin-drift-"));
  try {
    const codexHome = path.join(root, "codex");
    const source = path.join(root, "agents", "plugins", "sources", "agentchef-workflows");
    const cache = path.join(codexHome, "plugins", "cache", "agentchef", "agentchef-workflows", expectedVersion);
    for (const directory of [path.join(source, "scripts"), path.join(cache, "scripts")]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(source, "scripts", "hygiene.mjs"), "fixed\n");
    fs.writeFileSync(path.join(cache, "scripts", "hygiene.mjs"), "old\n");
    const plugin = { ...installedPlugin(expectedVersion), marketplaceName: "agentchef", source: { source: "local", path: source } };
    const runCodex = (calls) => (args) => {
      calls.push(args.join(" "));
      if (args[1] === "add") fs.copyFileSync(path.join(source, "scripts", "hygiene.mjs"), path.join(cache, "scripts", "hygiene.mjs"));
      return args[1] === "list" ? listResult([plugin]) : { status: 0, stdout: "{}", stderr: "" };
    };

    const previewCalls = [];
    const preview = refreshInstalledPlugin({ expectedVersion, codexHome, runCodex: runCodex(previewCalls) });
    assert.equal(preview.status, "content-drift", "the same version alone must not count as current");
    assert.equal(preview.driftFiles, 1);
    assert.ok(!previewCalls.some((call) => call.startsWith("plugin add")), "a preview never refreshes");

    const applyCalls = [];
    const applied = refreshInstalledPlugin({ expectedVersion, codexHome, apply: true, runCodex: runCodex(applyCalls) });
    assert.equal(applied.status, "refreshed");
    assert.ok(applyCalls.some((call) => call.startsWith("plugin add")));
    assert.equal(fs.readFileSync(path.join(cache, "scripts", "hygiene.mjs"), "utf8"), "fixed\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
