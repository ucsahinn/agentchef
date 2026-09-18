import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const validator = path.join(root, "scripts", "validate-release-readiness.mjs");
const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const expectedTag = `v${expectedVersion}`;
const expectedTagPattern = expectedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function copyFixtureFiles(target) {
  const source = fs.readFileSync(validator, "utf8");
  const requiredBlock = /const requiredFiles = \[([\s\S]*?)\n\];/.exec(source)?.[1] || "";
  const required = [...requiredBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  for (const relativePath of [
    ...new Set([
      ...required,
      "package.json",
      "CHANGELOG.md",
      ".gitignore"
    ])
  ]) {
    const sourcePath = path.join(root, relativePath);
    const targetPath = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function runFixture(fixture, args = []) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: fixture.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
    env: {
      ...process.env
    }
  });
}

function runGit(fixture, args) {
  const result = spawnSync("git", args, {
    cwd: fixture.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function createFixture({ initializeGit = true } = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-release-readiness-"));
  copyFixtureFiles(fixtureRoot);
  const fixture = { root: fixtureRoot };
  if (initializeGit) {
    const templateDir = path.join(fixtureRoot, ".git-template-empty");
    const hooksDir = path.join(fixtureRoot, ".git-hooks-disabled");
    fs.mkdirSync(templateDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    runGit(fixture, ["init", "--quiet", `--template=${templateDir}`]);
    runGit(fixture, ["config", "user.name", "AgentChef Fixture"]);
    runGit(fixture, ["config", "user.email", "fixture@example.invalid"]);
    runGit(fixture, ["config", "core.excludesfile", ""]);
    runGit(fixture, ["config", "core.hooksPath", hooksDir]);
    runGit(fixture, ["config", "commit.gpgsign", "false"]);
    runGit(fixture, ["config", "tag.gpgsign", "false"]);
    runGit(fixture, ["add", "."]);
    runGit(fixture, ["commit", "--quiet", "-m", "fixture baseline"]);
  }
  return fixture;
}

function withFixture(callback, options) {
  const fixture = createFixture(options);
  try {
    return callback(fixture);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

test("release readiness Git-state branches are deterministic", async (context) => {
  await context.test("clean source set without the expected tag passes", () => {
    withFixture((fixture) => {
      const result = runFixture(fixture);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`Release readiness validation passed for ${expectedTagPattern}\\.`));
    });
  });

  await context.test("tracked local agent state fails closed", () => {
    withFixture((fixture) => {
      for (const relativePath of [
        ".SeReNa/session.json",
        ".AGENTS/plugins/cache/staged state.json",
        ".CoDeX/skills/example/SKILL.md",
        ".AgentSpace/memory/agent/MEMORY.md"
      ]) {
        const localState = path.join(fixture.root, relativePath);
        fs.mkdirSync(path.dirname(localState), { recursive: true });
        fs.writeFileSync(localState, "{}\n", "utf8");
        runGit(fixture, ["add", "--force", relativePath]);
      }
      const result = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Tracked release file must not contain local agent state: \.SeReNa\/session\.json/);
      assert.match(result.stderr, /\.AGENTS\/plugins\/cache\/staged state\.json/);
      assert.match(result.stderr, /\.CoDeX\/skills\/example\/SKILL\.md/);
      assert.match(result.stderr, /\.AgentSpace\/memory\/agent\/MEMORY\.md/);
    });
  });

  await context.test("non-ignored untracked local agent state fails even with allow-dirty", () => {
    withFixture((fixture) => {
      for (const relativePath of [
        ".AGENTS/skills/example/state file.json",
        ".AgEnTs/plugins/cache/example.json",
        ".CoDeX/skills/example/SKILL.md"
      ]) {
        const localState = path.join(fixture.root, relativePath);
        fs.mkdirSync(path.dirname(localState), { recursive: true });
        fs.writeFileSync(localState, "{}\n", "utf8");
      }
      const result = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Release candidate includes local agent state in git status/);
      assert.match(result.stderr, /\.AGENTS\/skills\/example\/state file\.json/);
      assert.match(result.stderr, /\.AGENTS\/plugins\/cache\/example\.json/i);
      assert.match(result.stderr, /\.CoDeX\/skills\/example\/SKILL\.md/);
    });
  });

  await context.test("exact mixed-case local namespace roots fail closed", () => {
    withFixture((fixture) => {
      fs.writeFileSync(path.join(fixture.root, ".CODEX"), "local state\n", "utf8");
      const result = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Release candidate includes local agent state in git status: \.CODEX/);
    });
  });

  await context.test("rename destinations under local agent state are inspected", () => {
    withFixture((fixture) => {
      const marketplace = ".agents/plugins/marketplace.json";
      const marketplaceTarget = path.join(fixture.root, marketplace);
      fs.mkdirSync(path.dirname(marketplaceTarget), { recursive: true });
      fs.copyFileSync(path.join(root, marketplace), marketplaceTarget);
      runGit(fixture, ["add", marketplace]);
      runGit(fixture, ["commit", "--quiet", "-m", "add marketplace fixture"]);
      const canonical = runFixture(fixture);
      assert.equal(canonical.status, 0, canonical.stderr);

      const destinationDir = path.join(fixture.root, ".agents", "plugins", "cache");
      fs.mkdirSync(destinationDir, { recursive: true });
      runGit(fixture, [
        "mv",
        ".agents/plugins/marketplace.json",
        ".agents/plugins/cache/path with spaces.json"
      ]);
      const result = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Release candidate includes local agent state in git status/);
      assert.match(result.stderr, /\.agents\/plugins\/cache\/path with spaces\.json/);
    });
  });

  await context.test("Git inspection failures report every fail-closed surface", () => {
    withFixture((fixture) => {
      const result = runFixture(fixture);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Could not inspect git status/);
      assert.match(result.stderr, /Could not inspect tracked files/);
      assert.match(result.stderr, new RegExp(`Could not inspect existing tag ${expectedTagPattern}`));
    }, { initializeGit: false });
  });

  await context.test("existing expected tag is strict-fail and allow-dirty warning", () => {
    withFixture((fixture) => {
      runGit(fixture, ["tag", expectedTag]);
      const strict = runFixture(fixture);
      assert.equal(strict.status, 1);
      assert.match(strict.stderr, new RegExp(`Tag ${expectedTagPattern} already exists locally`));

      const diagnostic = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(diagnostic.status, 0, diagnostic.stderr);
      assert.match(diagnostic.stderr, new RegExp(`Warning: Tag ${expectedTagPattern} already exists locally`));
    });
  });

  await context.test("mixed index/worktree state is strict-fail and allow-dirty warning", () => {
    withFixture((fixture) => {
      const readme = path.join(fixture.root, "README.md");
      fs.appendFileSync(readme, "\nStaged fixture change.\n", "utf8");
      runGit(fixture, ["add", "README.md"]);
      fs.appendFileSync(readme, "\nUnstaged fixture change.\n", "utf8");

      const strict = runFixture(fixture);
      assert.equal(strict.status, 1);
      assert.match(strict.stderr, /Paths contain both staged and unstaged changes: README\.md/);

      const diagnostic = runFixture(fixture, ["--allow-dirty"]);
      assert.equal(diagnostic.status, 0, diagnostic.stderr);
      assert.match(diagnostic.stderr, /Warning: Paths contain both staged and unstaged changes: README\.md/);
    });
  });
});
