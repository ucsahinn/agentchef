import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  inspectDirectSkillTarget,
  markerFileName,
  writeDirectSkillMarker
} from "../manage-direct-skill-target.mjs";
import { activatePinnedSkill } from "../lib/pinned-skill-activation.mjs";
import {
  hashSkillTree,
  inspectPinnedSkillTarget,
  inspectSkillTree,
  pinnedSkillProvenanceFileName,
  pinnedSkillSchemaVersion,
  writePinnedSkillProvenance
} from "../lib/skill-provenance.mjs";

const root = path.resolve(process.cwd());
const pinnedInstaller = path.join(root, "scripts", "install-pinned-skill.mjs");
const seoValidator = path.join(
  root,
  "plugins",
  "codex-chef-workflows",
  "skills",
  "seo",
  "scripts",
  "validate-seo-report.mjs"
);
const researchValidator = path.join(
  root,
  "plugins",
  "codex-chef-workflows",
  "skills",
  "evidence-research",
  "scripts",
  "validate-research-report.mjs"
);

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyTree(source, target) {
  fs.cpSync(source, target, { recursive: true });
}

function runValidator(validator, reportPath) {
  return spawnSync(process.execPath, [validator, "--report", reportPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
    windowsHide: true
  });
}

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function pinnedSourceFixture(tempRoot, skill = "example-skill") {
  const sourceRepo = path.join(tempRoot, "source-repo");
  const skillRoot = path.join(sourceRepo, "skills", skill);
  fs.mkdirSync(skillRoot, { recursive: true });
  git(sourceRepo, ["init", "-q"]);
  git(sourceRepo, ["config", "core.hooksPath", path.join(tempRoot, "disabled-hooks")]);
  git(sourceRepo, ["config", "commit.gpgsign", "false"]);
  fs.writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    `---\nname: ${skill}\ndescription: Fixture pinned skill.\n---\n`,
    "utf8"
  );
  git(sourceRepo, ["add", "."]);
  git(sourceRepo, [
    "-c",
    "user.name=Codex Chef",
    "-c",
    "user.email=chef@example.invalid",
    "commit",
    "-qm",
    "fixture"
  ]);
  return {
    sourceRepo,
    commit: git(sourceRepo, ["rev-parse", "HEAD"])
  };
}

function runPinnedInstaller({
  tempRoot,
  sourceRepo,
  commit,
  skill = "example-skill",
  extraArgs = [],
  agentsHome = path.join(tempRoot, "agents"),
  codexHome = path.join(tempRoot, "codex"),
  tracePath = path.join(tempRoot, "git-trace.log")
}) {
  const sourceUrl = pathToFileURL(sourceRepo).href;
  return spawnSync(process.execPath, [
    pinnedInstaller,
    "--package",
    "owner/repository",
    "--commit",
    commit,
    "--skill",
    skill,
    "--cli-version",
    "1.5.20",
    ...extraArgs
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
    windowsHide: true,
    env: {
      ...process.env,
      AGENTS_HOME: agentsHome,
      CODEX_HOME: codexHome,
      GIT_ALLOW_PROTOCOL: "file",
      GIT_CONFIG_COUNT: "3",
      GIT_CONFIG_KEY_0: "http.sslBackend",
      GIT_CONFIG_VALUE_0: "openssl",
      GIT_CONFIG_KEY_1: `url.${sourceUrl}.insteadOf`,
      GIT_CONFIG_VALUE_1: "https://github.com/owner/repository.git",
      GIT_CONFIG_KEY_2: "core.autocrlf",
      GIT_CONFIG_VALUE_2: "false",
      GIT_TRACE: tracePath
    }
  });
}

function validSeoReport() {
  return {
    schemaVersion: "codex-chef.seo-audit.v1",
    generatedAt: "2026-07-29T00:00:00.000Z",
    status: "complete",
    scope: {
      mode: "deployed-public",
      targetUrl: "https://example.com/",
      locales: ["en"],
      authorization: "public-read-only"
    },
    claims: {
      rankingsVerified: false,
      indexingVerified: false,
      searchConsoleVerified: false,
      fieldDataVerified: false
    },
    evidence: [
      {
        id: "rendered-home",
        kind: "rendered-browser",
        location: "https://example.com/",
        checkedAt: "2026-07-29T00:00:00.000Z",
        grade: "deployed-public"
      },
      {
        id: "google-guidance",
        kind: "official-guidance",
        location: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
        checkedAt: "2026-07-29T00:00:00.000Z",
        grade: "official-current"
      }
    ],
    findings: [
      {
        id: "title-home",
        bucket: "content-intent",
        severity: "medium",
        classification: "proven",
        summary: "The rendered home title is generic.",
        impact: "The result does not clearly describe the page.",
        recommendation: "Use a concise title that matches the visible page purpose.",
        validation: "Reinspect the rendered title after the change.",
        evidenceRefs: ["rendered-home"],
        approvalRequired: false
      }
    ],
    metrics: {
      lab: [],
      field: []
    },
    gaps: [],
    approvalGates: [],
    nextActions: [
      "Implement the title change locally and verify the rendered output."
    ]
  };
}

function validResearchReport() {
  return {
    schemaVersion: "codex-chef.evidence-research.v1",
    generatedAt: "2026-07-29T00:00:00.000Z",
    status: "complete",
    charter: {
      decision: "Choose the safest supported SEO skill design.",
      primaryQuestion: "Which workflow structure is best supported by current evidence?",
      subQuestions: ["Which claims require live evidence?"],
      scope: "Official documentation and local repository behavior.",
      exclusions: ["Credentialed account data"],
      audience: "Codex Chef maintainers",
      deadline: "2026-07-29"
    },
    methods: {
      approach: "targeted-document-review",
      inclusionCriteria: ["Official current documentation", "Local executable evidence"],
      exclusionCriteria: ["Unattributed commentary"],
      searchLog: ["Google Search Central SEO skill guidance"]
    },
    sources: [
      {
        id: "openai-skills",
        title: "Build skills",
        url: "https://developers.openai.com/plugins/build/skills",
        checkedAt: "2026-07-29T00:00:00.000Z",
        sourceType: "official-documentation",
        confidence: "high",
        supports: ["claim-1"],
        outdatedRisk: "medium"
      }
    ],
    claims: [
      {
        id: "claim-1",
        statement: "Long conditional guidance belongs in references.",
        classification: "fact",
        confidence: "high",
        sourceRefs: ["openai-skills"],
        uncertainty: "None material for this package decision."
      }
    ],
    synthesis: {
      findings: ["Use a concise SKILL.md with routed references."],
      disagreements: [],
      limitations: ["No public marketplace publication was tested."],
      recommendations: ["Package the workflow as a skills-only plugin."]
    },
    gaps: [],
    approvalGates: []
  };
}

test("managed direct skill marker records the actual skill identity", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-managed-skill-"));
  try {
    const source = path.join(tempRoot, "plugins", "codex-chef-workflows", "skills", "seo");
    const target = path.join(tempRoot, "agents", "skills", "seo");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: seo\ndescription: Audit and improve evidence-backed SEO.\n---\n",
      "utf8"
    );
    copyTree(source, target);

    writeDirectSkillMarker(source, target);

    const marker = JSON.parse(fs.readFileSync(path.join(target, markerFileName), "utf8"));
    assert.equal(marker.name, "seo");
    assert.equal(marker.source, "plugins/codex-chef-workflows/skills/seo");
    assert.equal(inspectDirectSkillTarget(source, target).status, "managed");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("managed direct skill marker does not hide missing or modified source files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-managed-skill-drift-"));
  try {
    const source = path.join(tempRoot, "plugins", "codex-chef-workflows", "skills", "seo");
    const target = path.join(tempRoot, "agents", "skills", "seo");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: seo\ndescription: Audit and improve evidence-backed SEO.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(source, "reference.md"), "canonical\n", "utf8");
    copyTree(source, target);
    writeDirectSkillMarker(source, target);

    fs.rmSync(path.join(target, "SKILL.md"));
    let state = inspectDirectSkillTarget(source, target);
    assert.equal(state.status, "managed-drift");
    assert.equal(state.safeToSync, true);
    assert.equal(state.reason, "managed-content-drift");

    fs.copyFileSync(path.join(source, "SKILL.md"), path.join(target, "SKILL.md"));
    fs.writeFileSync(path.join(target, "reference.md"), "modified\n", "utf8");
    state = inspectDirectSkillTarget(source, target);
    assert.equal(state.status, "managed-drift");
    assert.equal(state.safeToSync, true);
    assert.equal(state.reason, "managed-content-drift");

    fs.copyFileSync(path.join(source, "reference.md"), path.join(target, "reference.md"));
    fs.writeFileSync(path.join(target, "unexpected.txt"), "not canonical\n", "utf8");
    state = inspectDirectSkillTarget(source, target);
    assert.equal(state.status, "managed-with-extras");
    assert.equal(state.safeToSync, true);
    assert.equal(state.reason, "local-extras-preserved");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("skill provenance rejects empty, unproven, and wrong-source skill directories", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-skill-provenance-"));
  try {
    const target = path.join(tempRoot, "skills", "example-skill");
    fs.mkdirSync(target, { recursive: true });
    assert.equal(inspectSkillTree(target, "example-skill").reason, "invalid-skill-file");

    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: Example pinned skill.\n---\n",
      "utf8"
    );
    const expected = {
      package: "owner/repository",
      commit: "a".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.20"
    };
    assert.equal(inspectPinnedSkillTarget(target, expected).reason, "missing-provenance");

    const sourceTreeSha256 = hashSkillTree(target);
    writeJson(path.join(target, pinnedSkillProvenanceFileName), {
      schemaVersion: pinnedSkillSchemaVersion,
      package: "wrong/repository",
      commit: expected.commit,
      skill: expected.skill,
      cliVersion: expected.cliVersion,
      sourceTreeSha256
    });
    assert.equal(
      inspectPinnedSkillTarget(target, expected).reason,
      "provenance-package-mismatch"
    );

    writeJson(path.join(target, pinnedSkillProvenanceFileName), {
      schemaVersion: pinnedSkillSchemaVersion,
      ...expected,
      sourceTreeSha256
    });
    assert.equal(inspectPinnedSkillTarget(target, expected).valid, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill activation installs an exact native copy with provenance", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-activation-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    const backupRoot = path.join(codexHome, "backups", "example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(agentsHome, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: Example pinned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(source, "reference.md"), "exact source\n", "utf8");
    const expected = {
      package: "owner/repository",
      commit: "a".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(source)
    };

    const result = activatePinnedSkill({
      source,
      target,
      backupRoot,
      managedRoots: [agentsHome, codexHome],
      expected
    });

    assert.equal(result.installed.valid, true);
    assert.equal(result.backedUp, false);
    assert.equal(inspectPinnedSkillTarget(target, expected).valid, true);
    assert.deepEqual(
      fs.readdirSync(path.join(agentsHome, "skills")).filter((entry) => entry.startsWith(".codex-chef-")),
      []
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill activation refuses an unowned target without explicit adoption", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-foreign-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    const backupRoot = path.join(codexHome, "backups", "example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: New pinned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: User-owned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(target, "user-owned.txt"), "preserve me\n", "utf8");
    const expected = {
      package: "owner/repository",
      commit: "b".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(source)
    };

    assert.throws(
      () => activatePinnedSkill({
        source,
        target,
        backupRoot,
        managedRoots: [agentsHome, codexHome],
        expected
      }),
      /explicit adoption/i
    );
    assert.equal(
      fs.readFileSync(path.join(target, "user-owned.txt"), "utf8"),
      "preserve me\n"
    );
    assert.equal(fs.existsSync(backupRoot), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("full-depth pinned installation omits the shallow fetch boundary", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-depth-"));
  try {
    const fixture = pinnedSourceFixture(tempRoot);
    const tracePath = path.join(tempRoot, "git-trace.log");
    const result = runPinnedInstaller({
      tempRoot,
      ...fixture,
      tracePath,
      extraArgs: ["--verify-only", "--full-depth"]
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const trace = fs.readFileSync(tracePath, "utf8");
    assert.match(trace, /\bfetch\b/);
    assert.doesNotMatch(trace, /--depth(?:=|\s+)1\b/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned installer preserves and skips an unowned same-name skill", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-skip-"));
  try {
    const fixture = pinnedSourceFixture(tempRoot);
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: User-owned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(target, "user-owned.txt"), "preserve me\n", "utf8");

    const result = runPinnedInstaller({
      tempRoot,
      ...fixture,
      agentsHome,
      codexHome
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Skipped existing user-owned skill example-skill/i);
    assert.equal(
      fs.readFileSync(path.join(target, "user-owned.txt"), "utf8"),
      "preserve me\n"
    );
    assert.equal(fs.existsSync(path.join(target, pinnedSkillProvenanceFileName)), false);
    assert.equal(fs.existsSync(path.join(codexHome, "backups")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned installer adopts only the explicitly selected same-name skill", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-adopt-"));
  try {
    const fixture = pinnedSourceFixture(tempRoot);
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: User-owned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(target, "user-owned.txt"), "preserve in backup\n", "utf8");

    const result = runPinnedInstaller({
      tempRoot,
      ...fixture,
      agentsHome,
      codexHome,
      extraArgs: ["--adopt-existing"]
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expected = {
      package: "owner/repository",
      commit: fixture.commit,
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(
        path.join(fixture.sourceRepo, "skills", "example-skill")
      )
    };
    assert.equal(inspectPinnedSkillTarget(target, expected).valid, true);
    const backupRoots = fs.readdirSync(path.join(codexHome, "backups"));
    assert.equal(backupRoots.length, 1);
    assert.equal(
      fs.readFileSync(
        path.join(
          codexHome,
          "backups",
          backupRoots[0],
          "agents",
          "skills",
          "example-skill",
          "user-owned.txt"
        ),
        "utf8"
      ),
      "preserve in backup\n"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned installer upgrades a valid Chef-owned skill without adoption", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-upgrade-"));
  try {
    const fixture = pinnedSourceFixture(tempRoot);
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: Previous managed version.\n---\n",
      "utf8"
    );
    writePinnedSkillProvenance(target, {
      package: "owner/repository",
      commit: "a".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.19",
      sourceTreeSha256: hashSkillTree(target)
    });

    const result = runPinnedInstaller({
      tempRoot,
      ...fixture,
      agentsHome,
      codexHome
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const expected = {
      package: "owner/repository",
      commit: fixture.commit,
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(
        path.join(fixture.sourceRepo, "skills", "example-skill")
      )
    };
    assert.equal(inspectPinnedSkillTarget(target, expected).valid, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill activation restores the previous target when post-activation verification fails", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-rollback-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    const backupRoot = path.join(codexHome, "backups", "example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: New pinned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(target, "previous.txt"), "preserve me\n", "utf8");
    const expected = {
      package: "owner/repository",
      commit: "b".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(source)
    };

    assert.throws(
      () => activatePinnedSkill({
        source,
        target,
        backupRoot,
        managedRoots: [agentsHome, codexHome],
        expected,
        allowAdopt: true,
        testHooks: {
          afterActivate() {
            throw new Error("injected post-activation failure");
          }
        }
      }),
      /injected post-activation failure/
    );
    assert.equal(fs.readFileSync(path.join(target, "previous.txt"), "utf8"), "preserve me\n");
    assert.equal(fs.existsSync(path.join(target, "SKILL.md")), false);
    assert.deepEqual(
      fs.readdirSync(path.join(agentsHome, "skills")).filter((entry) => entry.startsWith(".codex-chef-")),
      []
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill replacement creates a manifest-backed namespaced backup", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-backup-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    const backupRoot = path.join(codexHome, "backups", "codex-chef-skill-test-example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: New pinned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(path.join(target, "SKILL.md"), "previous pinned skill\n", "utf8");
    fs.writeFileSync(path.join(target, "legacy.txt"), "preserve in backup\n", "utf8");
    const expected = {
      package: "owner/repository",
      commit: "c".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(source)
    };

    const result = activatePinnedSkill({
      source,
      target,
      backupRoot,
      managedRoots: [agentsHome, codexHome],
      expected,
      allowAdopt: true
    });

    assert.equal(result.backedUp, true);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(backupRoot, ".codex-chef-backup.json"), "utf8")
    );
    assert.equal(manifest.schemaVersion, "codex-chef.backup.v1");
    assert.equal(manifest.operation, "pinned-skill-replacement");
    assert.equal(manifest.skill, "example-skill");
    assert.deepEqual(
      manifest.entries.map((entry) => entry.backupRelativePath).sort(),
      [
        "agents/skills/example-skill/legacy.txt",
        "agents/skills/example-skill/SKILL.md"
      ].sort()
    );
    assert.equal(
      fs.readFileSync(
        path.join(backupRoot, "agents", "skills", "example-skill", "legacy.txt"),
        "utf8"
      ),
      "preserve in backup\n"
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill activation rejects an overlapping backup root before any write", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-overlap-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const agentsHome = path.join(tempRoot, "agents");
    const target = path.join(agentsHome, "skills", "example-skill");
    const codexHome = path.join(target, "nested-codex");
    const backupRoot = path.join(codexHome, "backups", "example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: New pinned skill.\n---\n",
      "utf8"
    );
    fs.writeFileSync(
      path.join(target, "SKILL.md"),
      "---\nname: example-skill\ndescription: Existing managed skill.\n---\n",
      "utf8"
    );
    const previousExpected = {
      package: "owner/repository",
      commit: "d".repeat(40),
      skill: "example-skill",
      cliVersion: "1.5.19",
      sourceTreeSha256: hashSkillTree(target)
    };
    writePinnedSkillProvenance(target, previousExpected);
    const expected = {
      ...previousExpected,
      commit: "e".repeat(40),
      cliVersion: "1.5.20",
      sourceTreeSha256: hashSkillTree(source)
    };
    const beforeEntries = fs.readdirSync(target).sort();

    assert.throws(
      () => activatePinnedSkill({
        source,
        target,
        backupRoot,
        managedRoots: [agentsHome, codexHome],
        expected
      }),
      /overlap/i
    );
    assert.deepEqual(fs.readdirSync(target).sort(), beforeEntries);
    assert.equal(fs.existsSync(codexHome), false);
    assert.equal(inspectPinnedSkillTarget(target, previousExpected).valid, true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("pinned skill activation rejects linked source content before changing the target", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-pinned-link-"));
  try {
    const source = path.join(tempRoot, "checkout", "example-skill");
    const linkedDirectory = path.join(tempRoot, "linked");
    const agentsHome = path.join(tempRoot, "agents");
    const codexHome = path.join(tempRoot, "codex");
    const target = path.join(agentsHome, "skills", "example-skill");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(linkedDirectory, { recursive: true });
    fs.mkdirSync(agentsHome, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: example-skill\ndescription: Example pinned skill.\n---\n",
      "utf8"
    );
    fs.symlinkSync(
      linkedDirectory,
      path.join(source, "linked-content"),
      process.platform === "win32" ? "junction" : "dir"
    );

    assert.throws(
      () => hashSkillTree(source),
      /symbolic link or junction/
    );
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator accepts evidence-backed audit reports", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-report-"));
  try {
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, validSeoReport());
    const result = runValidator(seoValidator, reportPath);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects ranking guarantees", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-guarantee-"));
  try {
    const report = validSeoReport();
    report.findings[0].recommendation = "This guarantees first place on Google.";
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /ranking guarantee/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects unsupported verified indexing claims", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-indexing-"));
  try {
    const report = validSeoReport();
    report.claims.indexingVerified = true;
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /indexingVerified.*Search Console|URL Inspection/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects private scope without private authorization", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-private-scope-"));
  try {
    const report = validSeoReport();
    report.scope.mode = "authorized-private";
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /authorized-private.*authorization/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects account claims with non-account evidence", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-account-grade-"));
  try {
    const report = validSeoReport();
    report.scope.mode = "authorized-private";
    report.scope.authorization = "authorized-private-read-only";
    report.claims.rankingsVerified = true;
    report.evidence.push({
      id: "search-console",
      kind: "search-console",
      location: "https://search.google.com/search-console/",
      checkedAt: "2026-07-29T00:00:00.000Z",
      grade: "technical-local"
    });
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /account-verified/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator enforces field-data grade and metric evidence", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-field-data-"));
  try {
    const report = validSeoReport();
    report.claims.fieldDataVerified = true;
    report.evidence.push({
      id: "crux",
      kind: "crux-field",
      location: "https://developer.chrome.com/docs/crux/",
      checkedAt: "2026-07-29T00:00:00.000Z",
      grade: "technical-local"
    });
    report.metrics.field.push({
      name: "LCP",
      value: 2100,
      unit: "ms",
      evidenceRef: "crux"
    });
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /crux-field.*technical-local/i);

    report.evidence.at(-1).grade = "deployed-public";
    report.metrics.field = [];
    writeJson(reportPath, report);
    const missingMetric = runValidator(seoValidator, reportPath);
    assert.notEqual(missingMetric.status, 0);
    assert.match(`${missingMetric.stdout}\n${missingMetric.stderr}`, /field evidence.*field metric/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects evidence grades beyond the declared scope", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-scope-grade-"));
  try {
    const report = validSeoReport();
    report.scope.mode = "local-rendered";
    report.scope.authorization = "local-only";
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /grade deployed-public exceeds scope\.mode local-rendered/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("SEO report validator rejects bearer credentials in free text", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-seo-secret-"));
  try {
    const report = validSeoReport();
    report.nextActions = [`Authorization: Bearer ${"abcdefghijklmnopqrstuvwxyz123456"}`];
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(seoValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /secret-like material/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence research validator accepts traceable synthesis", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-report-"));
  try {
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, validResearchReport());
    const result = runValidator(researchValidator, reportPath);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence research validator rejects orphaned claim sources", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-orphan-"));
  try {
    const report = validResearchReport();
    report.claims[0].sourceRefs = ["missing-source"];
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(researchValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown source/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence research validator rejects source links to unknown claims", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-source-link-"));
  try {
    const report = validResearchReport();
    report.sources[0].supports = ["missing-claim"];
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(researchValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown claim/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence research validator rejects claim links missing from source supports", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-reverse-link-"));
  try {
    const report = validResearchReport();
    report.sources.push({
      id: "second-source",
      title: "Second source",
      url: "https://example.com/second",
      checkedAt: "2026-07-29T00:00:00.000Z",
      sourceType: "official-documentation",
      confidence: "high",
      supports: ["claim-2"],
      outdatedRisk: "low"
    });
    report.claims.push({
      id: "claim-2",
      statement: "The second source supports this control claim.",
      classification: "fact",
      confidence: "high",
      sourceRefs: ["second-source"],
      uncertainty: "None material."
    });
    report.claims[0].sourceRefs.push("second-source");
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(researchValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /must reference each other/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("evidence research validator rejects bearer credentials in free text", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-secret-"));
  try {
    const report = validResearchReport();
    report.synthesis.limitations = [`Authorization: Basic ${"dXNlcjpwYXNzd29yZDEyMzQ1Ng=="}`];
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(researchValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /secret-like material/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("complete evidence research reports cannot retain unresolved gaps", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-research-gap-"));
  try {
    const report = validResearchReport();
    report.gaps.push({
      id: "missing-primary-source",
      severity: "high",
      description: "The primary source was not available.",
      nextAction: "Obtain the primary source."
    });
    const reportPath = path.join(tempRoot, "report.json");
    writeJson(reportPath, report);
    const result = runValidator(researchValidator, reportPath);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /complete.*gaps/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
