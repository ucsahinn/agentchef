import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  applyPack,
  buildPackPlan,
  checkBundleIntegrity,
  checkFreshness,
  scanSecrets
} from "../external-review-cli.mjs";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "external-review-cli.mjs");

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-chef-review-"));
  const repo = path.join(root, "repo");
  const templateDir = path.join(root, "git-template-empty");
  const hooksDir = path.join(root, "git-hooks-disabled");
  fs.mkdirSync(repo);
  fs.mkdirSync(templateDir);
  fs.mkdirSync(hooksDir);
  git(repo, ["init", "-q", `--template=${templateDir}`]);
  git(repo, ["config", "core.excludesfile", ""]);
  git(repo, ["config", "core.hooksPath", hooksDir]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  git(repo, ["config", "tag.gpgsign", "false"]);
  fs.writeFileSync(path.join(repo, "app.js"), "export const answer = 42;\n");
  git(repo, ["add", "app.js"]);
  git(repo, ["-c", "user.name=Codex Chef", "-c", "user.email=chef@example.invalid", "commit", "-qm", "fixture"]);
  fs.writeFileSync(path.join(repo, ".env"), `${"TO"}${"KEN"}=not-packaged\n`);
  git(repo, ["add", "-f", ".env"]);
  return { root, repo, out: path.join(root, "review") };
}

test("pack preview is tracked-text-only and performs no write", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  assert.equal(fs.existsSync(out), false);
  assert.deepEqual(plan.manifest.files.map((file) => file.path), ["app.js"]);
  assert.equal(plan.manifest.excluded.some((file) => file.path === ".env"), true);
  assert.equal(plan.manifest.policy.externalUploadPerformed, false);
});

test("pack apply writes manifest and parts outside the target", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out, maxPartBytes: 10_000 });
  const manifestPath = applyPack(plan);
  assert.equal(fs.existsSync(manifestPath), true);
  assert.equal(fs.existsSync(path.join(out, "review-bundle-part-001.txt")), true);
  assert.equal(checkFreshness(repo, plan.manifest).fresh, true);
  assert.equal(checkBundleIntegrity(manifestPath, plan.manifest).ok, true);
  fs.writeFileSync(path.join(repo, "app.js"), "export const answer = 43;\n");
  assert.equal(checkFreshness(repo, plan.manifest).fresh, false);
});

test("new tracked source files make a packed snapshot stale", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  fs.writeFileSync(path.join(repo, "new-source.js"), "export const added = true;\n", "utf8");
  git(repo, ["add", "new-source.js"]);
  const freshness = checkFreshness(repo, plan.manifest);
  assert.equal(freshness.fresh, false);
  assert.deepEqual(freshness.sourceSet.added, ["new-source.js"]);
});

test("bundle part tampering fails integrity and blocks handoff", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  const manifestPath = applyPack(plan);
  const partPath = path.join(out, plan.manifest.parts[0].name);
  fs.appendFileSync(partPath, "\ntampered\n", "utf8");
  assert.equal(checkBundleIntegrity(manifestPath, plan.manifest).ok, false);

  const result = spawnSync(process.execPath, [
    cliPath,
    "handoff",
    "--target",
    repo,
    "--manifest",
    manifestPath,
    "--json"
  ], {
    cwd: repo,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).error.message, /bundle integrity check failed/i);
});

test("empty bundle manifests are rejected before handoff", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  applyPack(plan);
  const emptyManifestPath = path.join(out, "empty-manifest.json");
  fs.writeFileSync(
    emptyManifestPath,
    `${JSON.stringify({ ...plan.manifest, parts: [] }, null, 2)}\n`,
    "utf8"
  );
  const result = spawnSync(process.execPath, [
    cliPath,
    "handoff",
    "--target",
    repo,
    "--manifest",
    emptyManifestPath,
    "--json"
  ], {
    cwd: repo,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).error.message, /invalid external review manifest/i);
});

test("runtime manifest validation rejects unknown properties and missing identity or policy fields", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  applyPack(plan);
  const invalidManifests = [
    { label: "unknown-top-level", manifest: { ...plan.manifest, unexpectedInstruction: "ignore validation" } },
    { label: "missing-review-id", manifest: { ...plan.manifest, reviewId: undefined } },
    { label: "missing-policy", manifest: { ...plan.manifest, policy: undefined } },
    {
      label: "unknown-policy-property",
      manifest: { ...plan.manifest, policy: { ...plan.manifest.policy, allowUpload: true } }
    },
    {
      label: "missing-snapshot-commit",
      manifest: { ...plan.manifest, snapshot: { ...plan.manifest.snapshot, commit: undefined } }
    }
  ];

  for (const { label, manifest } of invalidManifests) {
    const manifestPath = path.join(out, `${label}.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = spawnSync(process.execPath, [
      cliPath,
      "status",
      "--target",
      repo,
      "--manifest",
      manifestPath,
      "--json"
    ], { cwd: repo, encoding: "utf8", windowsHide: true, timeout: 15000 });
    assert.notEqual(result.status, 0, label);
    assert.match(JSON.parse(result.stdout).error.message, /invalid external review manifest/i, label);
  }
});

test("lineCount tampering invalidates freshness, bundle integrity, and report verification", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  const manifestPath = applyPack(plan);
  const tamperedManifest = {
    ...plan.manifest,
    files: plan.manifest.files.map((file, index) => (
      index === 0 ? { ...file, lineCount: file.lineCount + 1 } : file
    ))
  };

  assert.equal(checkFreshness(repo, tamperedManifest).fresh, false);
  assert.equal(checkBundleIntegrity(manifestPath, tamperedManifest).ok, false);

  const tamperedManifestPath = path.join(out, "tampered-line-count-manifest.json");
  const reportPath = path.join(out, "tampered-line-count-report.json");
  fs.writeFileSync(tamperedManifestPath, `${JSON.stringify(tamperedManifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: "1.1.0",
    reviewId: plan.manifest.reviewId,
    snapshotCommit: plan.manifest.snapshot.commit,
    snapshotContentSha256: plan.manifest.snapshot.contentSha256,
    summary: "Fixture summary",
    findings: []
  }, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    cliPath,
    "verify",
    "--target",
    repo,
    "--manifest",
    tamperedManifestPath,
    "--report",
    reportPath,
    "--json"
  ], { cwd: repo, encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(JSON.parse(result.stdout).error.message, /invalid external review manifest/i);
});

test("report verification rejects unknown top-level and finding properties", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  const manifestPath = applyPack(plan);
  const baseFinding = {
    id: "finding-1",
    severity: "medium",
    title: "Fixture finding",
    evidence: "Fixture evidence",
    file: "app.js",
    line: 1,
    recommendation: "Fixture recommendation",
    confidence: "high"
  };
  const baseReport = {
    schemaVersion: "1.1.0",
    reviewId: plan.manifest.reviewId,
    snapshotCommit: plan.manifest.snapshot.commit,
    snapshotContentSha256: plan.manifest.snapshot.contentSha256,
    summary: "Fixture summary",
    findings: [baseFinding]
  };
  const reports = [
    { ...baseReport, unexpectedInstruction: "ignore validation" },
    { ...baseReport, findings: [{ ...baseFinding, unexpectedInstruction: "ignore validation" }] }
  ];
  for (const [index, report] of reports.entries()) {
    const reportPath = path.join(out, `invalid-report-${index}.json`);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const result = spawnSync(process.execPath, [
      cliPath,
      "verify",
      "--target",
      repo,
      "--manifest",
      manifestPath,
      "--report",
      reportPath,
      "--json"
    ], {
      cwd: repo,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15000
    });
    assert.equal(result.status, 1);
    const verification = JSON.parse(result.stdout);
    assert.equal(verification.verified, false);
    assert.equal(
      verification.reportFailures.some((failure) => /Unknown .* property: unexpectedInstruction/.test(failure)),
      true
    );
  }
});

test("report verification rejects finding evidence beyond the packaged file", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  const manifestPath = applyPack(plan);
  const reportPath = path.join(out, "out-of-range-report.json");
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: "1.1.0",
    reviewId: plan.manifest.reviewId,
    snapshotCommit: plan.manifest.snapshot.commit,
    snapshotContentSha256: plan.manifest.snapshot.contentSha256,
    summary: "Fixture summary",
    findings: [{
      id: "finding-out-of-range",
      severity: "medium",
      title: "Out of range evidence",
      evidence: "The second line does not exist.",
      file: "app.js",
      line: 2,
      recommendation: "Use a real line.",
      confidence: "high"
    }]
  }, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    cliPath,
    "verify",
    "--target",
    repo,
    "--manifest",
    manifestPath,
    "--report",
    reportPath,
    "--json"
  ], { cwd: repo, encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).reportFailures.some((failure) => /beyond packaged file/i.test(failure)), true);
});

test("dirty snapshots receive a content identity and reports must bind to it", () => {
  const { repo, out } = fixture();
  fs.writeFileSync(path.join(repo, "app.js"), "export const answer = 43;\n", "utf8");
  const plan = buildPackPlan({ target: repo, out });
  assert.equal(plan.manifest.snapshot.dirty, true);
  assert.match(plan.manifest.snapshot.contentSha256, /^[0-9a-f]{64}$/);
  assert.match(plan.manifest.reviewId, new RegExp(plan.manifest.snapshot.contentSha256.slice(0, 12)));

  const manifestPath = applyPack(plan);
  const reportPath = path.join(out, "missing-content-identity.json");
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: "1.1.0",
    reviewId: plan.manifest.reviewId,
    snapshotCommit: plan.manifest.snapshot.commit,
    summary: "Fixture summary",
    findings: []
  }, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    cliPath, "verify", "--target", repo, "--manifest", manifestPath, "--report", reportPath, "--json"
  ], { cwd: repo, encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).reportFailures.some((failure) => /snapshotContentSha256/i.test(failure)), true);
});

test("secret-like tracked content fails closed", () => {
  const { repo, out } = fixture();
  fs.writeFileSync(path.join(repo, "leak.txt"), `token=${"gh"}${"p_"}abcdefghijklmnopqrstuvwxyz1234567890\n`);
  git(repo, ["add", "leak.txt"]);
  assert.throws(() => buildPackPlan({ target: repo, out }), /Secret-like content blocked/);
  assert.deepEqual(
    scanSecrets(`-----BEGIN ${"PRIVATE"} KEY-----`),
    [],
    "PEM format markers without key material are not private keys"
  );
  assert.deepEqual(
    scanSecrets(
      `-----BEGIN ${"PRIVATE"} KEY-----\n`
      + `${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="}\n`
      + `-----END ${"PRIVATE"} KEY-----`
    ),
    ["private key"],
    "complete PEM blocks with key-shaped material remain blocked"
  );
  assert.deepEqual(
    scanSecrets(
      `${"github_"}pat_abcdefghijklmnopqrstuvwxyz123456 `
      + `${"postgres:"}//sentinel-user:sentinel-password@example.invalid/database `
      + `${"eyJabcdefghijk"}.abcdefghijklmnop.abcdefghijklmnop `
      + `-----BEGIN ${"ENCRYPTED PRIVATE"} KEY-----\n`
      + `${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="}\n`
      + `-----END ${"ENCRYPTED PRIVATE"} KEY-----`
    ),
    ["private key", "GitHub fine-grained token", "JWT", "connection string"]
  );
  assert.deepEqual(
    scanSecrets(`Authorization: Bearer ${"opaque-credential-value-abcdefghijklmnopqrstuvwxyz123456"}`),
    ["Bearer credential"],
    "opaque bearer credentials are blocked even when their issuer is not recognizable"
  );
  const basicCredential = Buffer.from(["actual", "user", "credential", "password"].join(":"), "utf8").toString("base64");
  assert.deepEqual(
    scanSecrets(`Authorization: Basic ${basicCredential}`),
    ["Basic credential"],
    "opaque Basic credentials are blocked without embedding a credential fixture in repository source"
  );

  const genericValue = ["actual", "credential", "value", "123456789"].join("-");
  assert.deepEqual(
    scanSecrets(`"apiKey": "${genericValue}"`),
    ["generic credential assignment"]
  );
  assert.deepEqual(
    scanSecrets(`${"secret_"}key = "${["test", "but", "real", "credential", "123456789"].join("-")}"`),
    ["generic credential assignment"]
  );
  for (const reference of [
    "const token = process.env.GITHUB_TOKEN;",
    "token = Deno.env.get(\"GITHUB_TOKEN\");",
    "token = os.environ[\"GITHUB_TOKEN\"]",
    "token = Environment.GetEnvironmentVariable(\"GITHUB_TOKEN\")",
    "{\"token:audit\":\"node scripts/analyze-token-surfaces.mjs --json\"}"
  ]) {
    assert.deepEqual(scanSecrets(reference), [], reference);
  }
  assert.deepEqual(
    scanSecrets("password: ${{ secrets.GITHUB_TOKEN }}"),
    [],
    "GitHub Actions secret expressions are references, not credential values"
  );
  assert.deepEqual(
    scanSecrets("password: ${{ secrets.GITHUB_TOKEN }}-fallback-value"),
    ["generic credential assignment"],
    "GitHub Actions secret expressions must not allow a hardcoded fallback"
  );
  assert.deepEqual(
    scanSecrets("$dbUrl = \"postgresql://postgres:{0}@db.{1}.supabase.co:5432/postgres\" -f $password, $projectRef"),
    [],
    "connection-string format templates are not credential values"
  );
  assert.deepEqual(
    scanSecrets("const token = authHeader.substring(7)"),
    [],
    "credentials derived from a request header are not hardcoded values"
  );
  assert.deepEqual(
    scanSecrets("password: crypto.randomUUID()"),
    [],
    "credentials generated at runtime are not hardcoded values"
  );
  assert.deepEqual(
    scanSecrets("password: crypto.randomUUID(),"),
    [],
    "runtime credential expressions remain safe in object literals"
  );
  assert.deepEqual(
    scanSecrets("const token = request.headers.get('authorization');", "route.ts"),
    [],
    "runtime source expressions are not treated as hardcoded credentials"
  );
  assert.deepEqual(
    scanSecrets("const token = accessToken || sessionRef.current?.access_token || null;", "route.ts"),
    [],
    "dynamic source fallback expressions are not treated as hardcoded credentials"
  );
  assert.deepEqual(
    scanSecrets(`const token = process.env.API_TOKEN || "${["hardcoded", "fallback", "credential"].join("-")}";`, "route.ts"),
    ["generic credential assignment"],
    "hardcoded source fallbacks remain blocked"
  );
  assert.deepEqual(
    scanSecrets("password: correct horse battery staple", "settings.yaml"),
    ["generic credential assignment"],
    "configuration values remain subject to strict credential scanning"
  );
  assert.deepEqual(
    scanSecrets(`${"access_"}token: "${["test", "expired", "token"].join("-")}"`, "api-client.test.ts"),
    [],
    "named credential fixtures are safe only in test files"
  );
  assert.deepEqual(
    scanSecrets(`${"access_"}token: "${["test", "expired", "token"].join("-")}"`, "settings.yaml"),
    ["generic credential assignment"],
    "named credential fixtures remain blocked outside test files"
  );
  assert.deepEqual(
    scanSecrets(`${"access_"}token: "${["expired", "token"].join("-")}"`, "api-client.test.ts"),
    ["generic credential assignment"],
    "test fixture values must carry an explicit safe prefix"
  );
  assert.deepEqual(
    scanSecrets(`${"pass"}word: "${"test-Aa!234567890"}"`, "password-policy.test.ts"),
    [],
    "named test password fixtures may satisfy a special-character password policy"
  );
  assert.deepEqual(
    scanSecrets(`${"to"}ken = process.env.API_TOKEN || "${["hardcoded", "fallback", "credential"].join("-")}"`),
    ["generic credential assignment"]
  );
  assert.deepEqual(
    scanSecrets(`${"pass"}word: |\n  ${["correct", "horse", "battery", "staple"].join(" ")}\n`),
    ["generic credential assignment"]
  );
});

test("generic credential assignments are blocked from the complete pack", () => {
  const { repo, out } = fixture();
  const genericValue = ["actual", "credential", "value", "123456789"].join("-");
  fs.writeFileSync(path.join(repo, "config.js"), `export const ${"api"}Key = "${genericValue}";\n`);
  git(repo, ["add", "config.js"]);
  assert.throws(
    () => buildPackPlan({ target: repo, out }),
    /Secret-like content blocked.*generic credential assignment/
  );
});

test("Basic Authorization credentials are blocked from the complete pack", () => {
  const { repo, out } = fixture();
  const basicCredential = Buffer.from(["actual", "user", "credential", "password"].join(":"), "utf8").toString("base64");
  fs.writeFileSync(path.join(repo, "request.txt"), `Authorization: Basic ${basicCredential}\n`, "utf8");
  git(repo, ["add", "request.txt"]);
  assert.throws(
    () => buildPackPlan({ target: repo, out }),
    /Secret-like content blocked.*Basic credential/
  );
});

test("PowerShell runtime credential assignments remain packable while literals stay blocked", () => {
  const runtimeFixture = fixture();
  fs.writeFileSync(
    path.join(runtimeFixture.repo, "agent.ps1"),
    "$credential = [PSCredential]::new($UserName, $securePassword)\n",
    "utf8"
  );
  git(runtimeFixture.repo, ["add", "agent.ps1"]);
  const runtimePlan = buildPackPlan({ target: runtimeFixture.repo, out: runtimeFixture.out });
  assert.equal(runtimePlan.manifest.files.some((file) => file.path === "agent.ps1"), true);

  const literalFixture = fixture();
  const literalValue = ["actual", "credential", "value", "123456789"].join("-");
  fs.writeFileSync(
    path.join(literalFixture.repo, "agent.ps1"),
    `$credential = "${literalValue}"\n`,
    "utf8"
  );
  git(literalFixture.repo, ["add", "agent.ps1"]);
  assert.throws(
    () => buildPackPlan({ target: literalFixture.repo, out: literalFixture.out }),
    /Secret-like content blocked.*generic credential assignment/
  );
});

test("source template credential references remain packable", () => {
  const { repo, out } = fixture();
  fs.writeFileSync(
    path.join(repo, "samples.mjs"),
    "const rendered = `\"Password\"=\"${sampleValues.registryPassword}\"`;\n",
    "utf8"
  );
  git(repo, ["add", "samples.mjs"]);
  const plan = buildPackPlan({ target: repo, out });
  assert.equal(plan.manifest.files.some((file) => file.path === "samples.mjs"), true);
});

test("public multi-session profile source is not classified as session state", () => {
  const { repo, out } = fixture();
  const profilePath = path.join(repo, "templates", "codex", "profiles", "multi-session.config.toml");
  const decisionPath = path.join(
    repo,
    "docs",
    "decisions",
    "003-capability-preserving-multi-session-process-hygiene.md"
  );
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
  fs.writeFileSync(profilePath, "[features]\nmanaged_serena = true\n", "utf8");
  fs.writeFileSync(decisionPath, "# Public multi-session design decision\n", "utf8");
  git(repo, [
    "add",
    "templates/codex/profiles/multi-session.config.toml",
    "docs/decisions/003-capability-preserving-multi-session-process-hygiene.md"
  ]);

  const plan = buildPackPlan({ target: repo, out });
  assert.equal(
    plan.manifest.files.some((file) => file.path === "templates/codex/profiles/multi-session.config.toml"),
    true
  );
  assert.equal(
    plan.manifest.files.some(
      (file) => file.path === "docs/decisions/003-capability-preserving-multi-session-process-hygiene.md"
    ),
    true
  );
});

test("session state artifacts remain excluded from review packs", () => {
  const { repo, out } = fixture();
  const sessionPath = path.join(repo, "state", "session-index.md");
  const misleadingSessionPath = path.join(repo, "state", "multi-session.config.toml");
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, "private session state\n", "utf8");
  fs.writeFileSync(misleadingSessionPath, "private session state\n", "utf8");
  git(repo, ["add", "state/session-index.md", "state/multi-session.config.toml"]);

  const plan = buildPackPlan({ target: repo, out });
  assert.equal(
    plan.manifest.excluded.some((file) => file.path === "state/session-index.md" && file.reason === "sensitive-path"),
    true
  );
  assert.equal(
    plan.manifest.excluded.some(
      (file) => file.path === "state/multi-session.config.toml" && file.reason === "sensitive-path"
    ),
    true
  );
});

test("common credential forms are excluded or blocked through the complete pack", () => {
  const npmFixture = fixture();
  const npmToken = `${"npm_"}abcdefghijklmnopqrstuvwxyz1234567890`;
  fs.writeFileSync(path.join(npmFixture.repo, ".npmrc"), `_authToken=${npmToken}\n`);
  git(npmFixture.repo, ["add", "-f", ".npmrc"]);
  const npmPlan = buildPackPlan({ target: npmFixture.repo, out: npmFixture.out });
  assert.equal(npmPlan.manifest.files.some((file) => file.path === ".npmrc"), false);
  assert.equal(
    npmPlan.manifest.excluded.some((file) => file.path === ".npmrc" && file.reason === "sensitive-path"),
    true
  );

  const blockedCases = [
    ["aws.txt", `${["AWS", "SECRET", "ACCESS", "KEY"].join("_")}=${["AbCdEf", "123456", "GhIjKl", "789012", "MnOpQr", "345678"].join("")}\n`],
    ["fallback.js", `export const ${"to"}ken = process.env.API_TOKEN || "${["hardcoded", "fallback", "credential"].join("-")}";\n`],
    ["settings.yaml", `${"pass"}word: ${["correct", "horse", "battery", "staple"].join(" ")}\n`],
    ["settings-block.yaml", `${"pass"}word: |\n  ${["correct", "horse", "battery", "staple"].join(" ")}\n`],
    [
      "pgp.txt",
      `-----BEGIN ${"PGP PRIVATE KEY BLOCK"}-----\n`
      + `${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo="}\n`
      + `-----END ${"PGP PRIVATE KEY BLOCK"}-----\n`
    ]
  ];
  for (const [name, content] of blockedCases) {
    const blockedFixture = fixture();
    fs.writeFileSync(path.join(blockedFixture.repo, name), content, "utf8");
    git(blockedFixture.repo, ["add", name]);
    assert.throws(
      () => buildPackPlan({ target: blockedFixture.repo, out: blockedFixture.out }),
      /Secret-like content blocked/,
      name
    );
  }
});

test("Docker registry credentials are excluded by path and detected in content", () => {
  const dockerFixture = fixture();
  const dockerDir = path.join(dockerFixture.repo, ".docker");
  const dockerConfig = path.join(dockerDir, "config.json");
  const dockerAuth = Buffer.from(["registry", "user", "password"].join(":")).toString("base64");
  fs.mkdirSync(dockerDir);
  fs.writeFileSync(
    dockerConfig,
    `${JSON.stringify({ auths: { "registry.example.invalid": { auth: dockerAuth } } }, null, 2)}\n`,
    "utf8"
  );
  git(dockerFixture.repo, ["add", "-f", ".docker/config.json"]);

  const plan = buildPackPlan({ target: dockerFixture.repo, out: dockerFixture.out });
  assert.equal(plan.manifest.files.some((file) => file.path === ".docker/config.json"), false);
  assert.equal(
    plan.manifest.excluded.some(
      (file) => file.path === ".docker/config.json" && file.reason === "sensitive-path"
    ),
    true
  );
  assert.deepEqual(
    scanSecrets(JSON.stringify({ auths: { registry: { auth: dockerAuth } } })),
    ["Docker registry auth"]
  );
});

test("output inside target is rejected", () => {
  const { repo } = fixture();
  assert.throws(() => buildPackPlan({ target: repo, out: path.join(repo, "review") }), /outside the target/);
});

test("output through an outside linked ancestor is rejected", () => {
  const { root, repo } = fixture();
  const linkedOutput = path.join(root, "linked-output");
  fs.symlinkSync(repo, linkedOutput, process.platform === "win32" ? "junction" : "dir");
  const redirectedOutput = path.join(linkedOutput, "review");
  assert.throws(
    () => buildPackPlan({ target: repo, out: redirectedOutput }),
    /linked path component|resolves inside/
  );
  assert.equal(fs.existsSync(path.join(repo, "review")), false);
});

test("apply rechecks a previously safe output ancestor after a link swap", () => {
  const { root, repo } = fixture();
  const safeParent = path.join(root, "safe-parent");
  const out = path.join(safeParent, "review");
  const plan = buildPackPlan({ target: repo, out });
  fs.symlinkSync(repo, safeParent, process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => applyPack(plan),
    /linked path component|resolves inside/
  );
  assert.equal(fs.existsSync(path.join(repo, "review")), false);
});

test("handoff refuses a manifest stored inside the target repository", () => {
  const { repo, out } = fixture();
  const plan = buildPackPlan({ target: repo, out });
  const manifestPath = path.join(repo, "external-review-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(plan.manifest, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, [
    cliPath,
    "handoff",
    "--target",
    repo,
    "--manifest",
    manifestPath,
    "--apply",
    "--json"
  ], {
    cwd: repo,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000
  });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(repo, "external-review-handoff.md")), false);
  assert.match(JSON.parse(result.stdout).error.message, /outside the target repository/);
});

test("tracked missing and linked sources fail closed", (context) => {
  const missingFixture = fixture();
  const missingPath = path.join(missingFixture.repo, "tracked-missing.txt");
  fs.writeFileSync(missingPath, "tracked\n", "utf8");
  git(missingFixture.repo, ["add", "tracked-missing.txt"]);
  fs.unlinkSync(missingPath);
  assert.throws(
    () => buildPackPlan({ target: missingFixture.repo, out: missingFixture.out }),
    /tracked source is missing/i
  );

  const linkedFixture = fixture();
  const outsideFile = path.join(linkedFixture.root, "outside.txt");
  const linkedPath = path.join(linkedFixture.repo, "tracked-link.txt");
  fs.writeFileSync(outsideFile, "outside\n", "utf8");
  try {
    fs.symlinkSync(outsideFile, linkedPath, "file");
  } catch (error) {
    if (error?.code === "EPERM") {
      context.diagnostic("File symlink creation is unavailable; missing tracked-source coverage still ran.");
      return;
    }
    throw error;
  }
  git(linkedFixture.repo, ["add", "tracked-link.txt"]);
  assert.throws(
    () => buildPackPlan({ target: linkedFixture.repo, out: linkedFixture.out }),
    /linked path component/
  );
});

test("tracked sources cannot escape through a replaced ancestor junction", () => {
  const linkedFixture = fixture();
  const sourceDir = path.join(linkedFixture.repo, "src");
  const sourcePath = path.join(sourceDir, "app.js");
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(sourcePath, "export const boundary = 'inside';\n", "utf8");
  git(linkedFixture.repo, ["add", "src/app.js"]);
  git(linkedFixture.repo, [
    "-c",
    "user.name=Codex Chef",
    "-c",
    "user.email=chef@example.invalid",
    "commit",
    "-qm",
    "tracked source ancestor fixture"
  ]);

  const safePlan = buildPackPlan({ target: linkedFixture.repo, out: linkedFixture.out });
  const outsideDir = path.join(linkedFixture.root, "outside-src");
  const outsideSentinel = "outside-junction-sentinel";
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(outsideDir, "app.js"), `${outsideSentinel}\n`, "utf8");
  fs.rmSync(sourceDir, { recursive: true });
  fs.symlinkSync(outsideDir, sourceDir, process.platform === "win32" ? "junction" : "dir");

  assert.throws(
    () => buildPackPlan({ target: linkedFixture.repo, out: linkedFixture.out }),
    /linked path component/
  );
  const freshness = checkFreshness(linkedFixture.repo, safePlan.manifest);
  assert.equal(freshness.fresh, false);
  assert.equal(
    freshness.files.find((file) => file.path === "src/app.js")?.status,
    "unsafe"
  );
  assert.equal(
    safePlan.parts.some((part) => part.content.includes(outsideSentinel)),
    false
  );
});
