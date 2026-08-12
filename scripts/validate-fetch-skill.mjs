#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];
const skillDir = path.join(root, "plugins", "codex-chef-workflows", "skills", "fetch");
const validator = path.join(skillDir, "scripts", "validate-fetch-report.mjs");
let tempRoot = null;

const requiredSkillFiles = [
  "SKILL.md",
  "agents/openai.yaml",
  "assets/fetch-report.template.json",
  "references/capture-protocol.md",
  "references/forward-tests.md",
  "references/implementation-protocol.md",
  "references/safety-boundaries.md",
  "references/sources.md",
  "references/verification-rubric.md",
  "scripts/validate-fetch-report.mjs"
];

function fail(message) {
  failures.push(message);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runValidator(reportPath, checkFiles = true) {
  const args = [validator, "--report", reportPath];
  if (checkFiles) args.push("--check-files");
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
    windowsHide: true
  });
}

function evidence(role, viewport, state, relativePath) {
  return {
    role,
    type: "viewport-screenshot",
    viewport,
    state,
    path: relativePath
  };
}

function validReport() {
  return {
    schemaVersion: "codex-chef.fetch-report.v1",
    source: {
      url: "https://example.com/",
      capturedAt: "2026-07-28T00:00:00.000Z"
    },
    scope: {
      authorizationMode: "public-only",
      explicitPrivateAuthorization: false,
      explicitInsecureHttpAuthorization: false,
      explicitNonPublicAuthorization: false,
      allowedOrigins: ["https://example.com"]
    },
    safety: {
      credentialsCaptured: false,
      authStatePersisted: false,
      unsanitizedHarPersisted: false,
      productionWrites: false,
      protectedAssetsCopied: false
    },
    viewports: [
      { name: "desktop", width: 320, height: 240 },
      { name: "mobile", width: 240, height: 320 }
    ],
    routes: [
      {
        sourcePath: "/",
        localPath: "/",
        states: ["default"],
        controls: [
          { id: "route-baseline", states: ["default"] }
        ],
        evidence: [
          evidence("source", "desktop", "default", "evidence/source/home--desktop--default.png"),
          evidence("source", "mobile", "default", "evidence/source/home--mobile--default.png"),
          evidence("local", "desktop", "default", "evidence/local/home--desktop--default.png"),
          evidence("local", "mobile", "default", "evidence/local/home--mobile--default.png"),
          {
            ...evidence("source", "desktop", "default", "evidence/source/home--desktop--default--full.png"),
            type: "full-page-screenshot"
          },
          {
            ...evidence("source", "mobile", "default", "evidence/source/home--mobile--default--full.png"),
            type: "full-page-screenshot"
          },
          {
            ...evidence("local", "desktop", "default", "evidence/local/home--desktop--default--full.png"),
            type: "full-page-screenshot"
          },
          {
            ...evidence("local", "mobile", "default", "evidence/local/home--mobile--default--full.png"),
            type: "full-page-screenshot"
          },
          {
            ...evidence("source", "desktop", "default", "evidence/source/home--default--interaction.json"),
            type: "interaction",
            control: "route-baseline"
          },
          {
            ...evidence("local", "desktop", "default", "evidence/local/home--default--interaction.json"),
            type: "interaction",
            control: "route-baseline"
          },
          {
            ...evidence("local", "desktop", "default", "evidence/local/home--default--console.json"),
            type: "console"
          },
          {
            ...evidence("local", "desktop", "default", "evidence/local/home--default--network.json"),
            type: "network"
          },
          {
            ...evidence("local", "desktop", "default", "evidence/local/home--default--accessibility.json"),
            type: "accessibility"
          }
        ],
        checks: {
          visual: "pass",
          responsive: "pass",
          interaction: "pass",
          content: "pass",
          assets: "pass",
          console: "pass",
          network: "pass",
          accessibility: "pass"
        },
        gaps: []
      }
    ],
    commands: [
      { command: "npm run test", status: "pass" }
    ],
    summary: {
      status: "complete",
      knownGaps: [],
      nextAction: ""
    }
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function createPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rowSize = 1 + (width * 4);
  const pixels = Buffer.alloc(rowSize * height);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createEvidence(rootDir) {
  const files = [
    ["evidence/source/home--desktop--default.png", 320, 240],
    ["evidence/source/home--mobile--default.png", 240, 320],
    ["evidence/local/home--desktop--default.png", 320, 240],
    ["evidence/local/home--mobile--default.png", 240, 320],
    ["evidence/source/home--desktop--default--full.png", 320, 240],
    ["evidence/source/home--mobile--default--full.png", 240, 320],
    ["evidence/local/home--desktop--default--full.png", 320, 240],
    ["evidence/local/home--mobile--default--full.png", 240, 320]
  ];
  for (const [relativePath, width, height] of files) {
    const filePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, createPng(width, height));
  }
  for (const relativePath of [
    "evidence/source/home--default--interaction.json",
    "evidence/local/home--default--interaction.json",
    "evidence/local/home--default--console.json",
    "evidence/local/home--default--network.json",
    "evidence/local/home--default--accessibility.json"
  ]) {
    const filePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    writeJson(filePath, { status: "pass" });
  }
}

function expectSuccess(name, report, checkFiles = true) {
  const reportPath = path.join(tempRoot, `${name}.json`);
  writeJson(reportPath, report);
  const result = runValidator(reportPath, checkFiles);
  if (result.error || result.status !== 0) {
    fail(`${name} should pass. Got: ${result.error?.message || result.stderr.trim()}`);
  }
}

function expectFailure(name, report, expectedText, checkFiles = true) {
  const reportPath = path.join(tempRoot, `${name}.json`);
  writeJson(reportPath, report);
  const result = runValidator(reportPath, checkFiles);
  if (result.error) {
    fail(`${name} produced a process error: ${result.error.message}`);
    return;
  }
  if (result.status === 0) {
    fail(`${name} should fail closed.`);
    return;
  }
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!combined.includes(expectedText)) {
    fail(`${name} should mention "${expectedText}". Got: ${combined.trim()}`);
  }
}

function setSource(report, url) {
  const parsed = new URL(url);
  report.source.url = url;
  report.scope.allowedOrigins = [parsed.origin];
}

function explainRouteCheck(report, check, status) {
  report.routes[0].checks[check] = status;
  report.routes[0].gaps = [{
    check,
    status,
    explanation: `${check} is not complete.`,
    nextAction: `Resolve the ${check} finding.`
  }];
}

try {
  for (const rel of requiredSkillFiles) {
    if (!fs.existsSync(path.join(skillDir, rel))) fail(`Missing fetch skill file: ${rel}`);
  }

  if (fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    const skillText = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    for (const requiredText of [
      "$fetch",
      "safety-boundaries.md",
      "capture-protocol.md",
      "implementation-protocol.md",
      "verification-rubric.md",
      "validate-fetch-report.mjs"
    ]) {
      if (!skillText.includes(requiredText)) fail(`Fetch SKILL.md must mention ${requiredText}.`);
    }
  }

  if (fs.existsSync(path.join(skillDir, "agents", "openai.yaml"))) {
    const yaml = fs.readFileSync(path.join(skillDir, "agents", "openai.yaml"), "utf8");
    if (!/allow_implicit_invocation:\s*false/.test(yaml)) {
      fail("Fetch must remain explicit-only to avoid JavaScript fetch and scraping trigger collisions.");
    }
    if (!yaml.includes("$fetch") || !yaml.includes("$codex-chef-workflows:fetch")) {
      fail("Fetch default prompt must document both direct and plugin-namespaced invocation identities.");
    }
  }

  const catalog = JSON.parse(fs.readFileSync(path.join(root, "catalog", "skills.json"), "utf8"));
  const catalogEntry = catalog.skills?.find((skill) => skill.name === "fetch");
  if (
    catalogEntry?.install !== false
    || catalogEntry?.directInstall !== true
    || catalogEntry?.directTarget !== "${AGENTS_HOME}/skills/fetch"
  ) {
    fail("Fetch catalog metadata must keep plugin install disabled and the managed direct target at ${AGENTS_HOME}/skills/fetch.");
  }

  const installPlan = JSON.parse(fs.readFileSync(path.join(root, "manifests", "install-plan.json"), "utf8"));
  const directOperation = installPlan.operations?.find((operation) => operation.id === "fetch-direct-skill");
  const marketplaceSourceOperation = installPlan.operations?.find(
    (operation) => operation.id === "codex-plugin-marketplace-source"
  );
  if (
    directOperation?.kind !== "copy-directory"
    || directOperation?.source !== "plugins/codex-chef-workflows/skills/fetch"
    || directOperation?.destination !== "${AGENTS_HOME}/skills/fetch"
    || !installPlan.profiles?.default?.includes("fetch-direct-skill")
    || !installPlan.profiles?.all?.includes("fetch-direct-skill")
  ) {
    fail("Install plan must synchronize the canonical Fetch source for direct $fetch invocation in default and all profiles.");
  }
  if (
    marketplaceSourceOperation?.kind !== "copy-directory"
    || marketplaceSourceOperation?.source !== "plugins/codex-chef-workflows"
    || marketplaceSourceOperation?.destination !== "${AGENTS_HOME}/plugins/sources/codex-chef-workflows"
    || !installPlan.profiles?.default?.includes("codex-plugin-marketplace-source")
    || !installPlan.profiles?.all?.includes("codex-plugin-marketplace-source")
  ) {
    fail("Install plan must keep the plugin marketplace mirror inside AGENTS_HOME for independent custom-home support.");
  }

  if (fs.existsSync(validator)) {
    const syntax = spawnSync(process.execPath, ["--check", validator], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10000,
      windowsHide: true
    });
    if (syntax.error || syntax.status !== 0) {
      fail(`Fetch report validator syntax failed: ${syntax.error?.message || syntax.stderr.trim()}`);
    }
  }

  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-fetch-skill-"));
  createEvidence(tempRoot);

  expectSuccess("valid", validReport());

  const validExplicitHttp = validReport();
  setSource(validExplicitHttp, "http://example.com/");
  validExplicitHttp.scope.explicitInsecureHttpAuthorization = true;
  expectSuccess("valid-explicit-http", validExplicitHttp);

  const validOwnedPrivate = validReport();
  setSource(validOwnedPrivate, "https://localhost/");
  validOwnedPrivate.scope.authorizationMode = "owned-private-test";
  validOwnedPrivate.scope.explicitPrivateAuthorization = true;
  validOwnedPrivate.scope.explicitNonPublicAuthorization = true;
  expectSuccess("valid-owned-private", validOwnedPrivate);

  const validPartial = validReport();
  explainRouteCheck(validPartial, "assets", "gap");
  validPartial.summary = {
    status: "partial",
    knownGaps: ["The protected hero asset needs a lawful replacement."],
    nextAction: "Provide an owned asset or approve an original replacement."
  };
  expectSuccess("valid-partial", validPartial);

  const validBlocked = validReport();
  explainRouteCheck(validBlocked, "visual", "blocked");
  validBlocked.routes[0].checks.responsive = "blocked";
  validBlocked.routes[0].gaps.push({
    check: "responsive",
    status: "blocked",
    explanation: "The source page is inaccessible.",
    nextAction: "Provide authorized access to the target."
  });
  validBlocked.routes[0].evidence = validBlocked.routes[0].evidence.filter((item) =>
    !["viewport-screenshot", "full-page-screenshot"].includes(item.type)
  );
  validBlocked.summary = {
    status: "blocked",
    knownGaps: ["The source page could not be inspected."],
    nextAction: "Provide authorized access to the target."
  };
  expectSuccess("valid-blocked", validBlocked);

  const unsafe = validReport();
  unsafe.safety.authStatePersisted = true;
  expectFailure("unsafe-auth-state", unsafe, "safety.authStatePersisted must remain false");

  const secretMaterial = validReport();
  secretMaterial.summary.nextAction = `Authorization: Bearer ${"abcdefghijklmnopqrstuvwxyz123456"}`;
  expectFailure("secret-material", secretMaterial, "secret-like material");

  const dishonest = validReport();
  dishonest.routes[0].checks.assets = "gap";
  expectFailure("dishonest-complete", dishonest, "summary.status cannot be complete");

  const missingMatrix = validReport();
  missingMatrix.routes[0].evidence = missingMatrix.routes[0].evidence.filter((item) =>
    !(item.role === "local"
      && item.type === "viewport-screenshot"
      && item.viewport === "mobile")
  );
  expectFailure("missing-matrix", missingMatrix, "exactly one local viewport-screenshot");

  const screenshotsOnly = validReport();
  screenshotsOnly.routes[0].evidence = screenshotsOnly.routes[0].evidence.filter((item) =>
    item.type === "viewport-screenshot"
  );
  expectFailure("screenshots-only-complete", screenshotsOnly, "full-page-screenshot");

  for (const [type, expectedText] of [
    ["interaction", "source interaction evidence"],
    ["console", "local console evidence"],
    ["network", "local network evidence"],
    ["accessibility", "local accessibility evidence"]
  ]) {
    const missingType = validReport();
    missingType.routes[0].evidence = missingType.routes[0].evidence.filter((item) =>
      item.type !== type
    );
    expectFailure(`missing-${type}-evidence`, missingType, expectedText);
  }

  const duplicateViewports = validReport();
  duplicateViewports.viewports[1].name = "desktop";
  expectFailure("duplicate-viewports", duplicateViewports, "name must be unique");

  const duplicateDimensions = validReport();
  duplicateDimensions.viewports[1].width = 320;
  duplicateDimensions.viewports[1].height = 240;
  expectFailure("duplicate-dimensions", duplicateDimensions, "dimensions must be unique");

  const multipleStates = validReport();
  multipleStates.routes[0].states.push("hover");
  expectFailure("missing-state-evidence", multipleStates, "state \"hover\"");

  const sharedEvidence = validReport();
  sharedEvidence.routes[0].evidence[2].path = sharedEvidence.routes[0].evidence[0].path;
  expectFailure("shared-source-local-evidence", sharedEvidence, "must not duplicate");

  const wrongDimensions = validReport();
  wrongDimensions.routes[0].evidence[0].viewport = "mobile";
  expectFailure("wrong-image-dimensions", wrongDimensions, "dimensions must match viewport");

  const validDesktopPng = fs.readFileSync(
    path.join(tempRoot, "evidence", "source", "home--desktop--default.png")
  );
  const invalidPngCases = [
    ["ihdr-only", validDesktopPng.subarray(0, 33)],
    ["truncated-idat", validDesktopPng.subarray(0, Math.max(34, validDesktopPng.length - 20))],
    ["missing-iend", validDesktopPng.subarray(0, validDesktopPng.length - 12)],
    ["bad-crc", Buffer.from(validDesktopPng)]
  ];
  invalidPngCases[3][1][invalidPngCases[3][1].length - 1] ^= 0xff;
  for (const [name, bytes] of invalidPngCases) {
    const relativePath = `evidence/source/${name}.png`;
    fs.writeFileSync(path.join(tempRoot, relativePath), bytes);
    const invalidPng = validReport();
    invalidPng.routes[0].evidence[0].path = relativePath;
    expectFailure(name, invalidPng, "complete, decodable PNG");
  }

  const oversizedPath = path.join(tempRoot, "evidence", "source", "oversized.png");
  fs.writeFileSync(oversizedPath, Buffer.from([0]));
  fs.truncateSync(oversizedPath, (50 * 1024 * 1024) + 1);
  const oversizedEvidence = validReport();
  oversizedEvidence.routes[0].evidence[0].path = "evidence/source/oversized.png";
  expectFailure("oversized-evidence", oversizedEvidence, "between 1 byte and 50 MiB");

  const directoryEvidence = validReport();
  directoryEvidence.routes[0].evidence[0].path = "evidence/source";
  expectFailure("directory-evidence", directoryEvidence, "regular, non-link file");

  const escaped = validReport();
  escaped.routes[0].evidence[0].path = "../outside.png";
  expectFailure("path-escape", escaped, "must be a safe relative path", false);

  const mixedEscape = validReport();
  mixedEscape.routes[0].evidence[0].path = "evidence\\..\\outside.png";
  expectFailure("mixed-path-escape", mixedEscape, "must be a safe relative path", false);

  const windowsAbsolute = validReport();
  windowsAbsolute.routes[0].evidence[0].path = "C:\\evidence\\outside.png";
  expectFailure("windows-absolute-path", windowsAbsolute, "must be a safe relative path", false);

  const windowsDriveRelative = validReport();
  windowsDriveRelative.routes[0].evidence[0].path = "C:outside.png";
  expectFailure("windows-drive-relative", windowsDriveRelative, "must be a safe relative path", false);

  const alternateDataStream = validReport();
  alternateDataStream.routes[0].evidence[0].path = "evidence/source.png:stream";
  expectFailure("alternate-data-stream", alternateDataStream, "must be a safe relative path", false);

  const credentialUrl = validReport();
  credentialUrl.source.url = "https://user:password@example.com/";
  expectFailure("credential-url", credentialUrl, "source.url must not contain credentials", false);

  const mismatchedOrigin = validReport();
  mismatchedOrigin.scope.allowedOrigins = ["https://other.example"];
  expectFailure("mismatched-origin", mismatchedOrigin, "must include the exact source origin", false);

  const malformedHostname = validReport();
  malformedHostname.source.url = "https://bad_host.example/";
  malformedHostname.scope.allowedOrigins = ["https://bad_host.example"];
  expectFailure("malformed-hostname", malformedHostname, "valid IDNA host name", false);

  for (const [name, url] of [
    ["loopback-ipv4", "https://127.0.0.1/"],
    ["rfc1918", "https://10.20.30.40/"],
    ["link-local", "https://169.254.1.1/"],
    ["ipv6-loopback", "https://[::1]/"],
    ["cloud-metadata", "https://169.254.169.254/latest/meta-data/"]
  ]) {
    const privateTarget = validReport();
    setSource(privateTarget, url);
    expectFailure(name, privateTarget, "public-only must not target a non-public destination", false);
  }

  const insecureHttp = validReport();
  setSource(insecureHttp, "http://example.com/");
  expectFailure("unapproved-http", insecureHttp, "explicitInsecureHttpAuthorization=true", false);

  const unapprovedPrivate = validReport();
  unapprovedPrivate.scope.authorizationMode = "owned-private-test";
  expectFailure("unapproved-private", unapprovedPrivate, "Owned modes require", false);

  const unexplainedGap = validReport();
  unexplainedGap.routes[0].checks.assets = "gap";
  unexplainedGap.summary = {
    status: "partial",
    knownGaps: ["Asset mismatch."],
    nextAction: "Replace the asset."
  };
  expectFailure("unexplained-gap", unexplainedGap, "matching explained route gap");

  const partialWithBlocked = validReport();
  explainRouteCheck(partialWithBlocked, "visual", "blocked");
  partialWithBlocked.summary = {
    status: "partial",
    knownGaps: ["Visual capture is blocked."],
    nextAction: "Restore target access."
  };
  expectFailure("partial-with-blocked", partialWithBlocked, "partial reports require");

  const blockedWithGap = validReport();
  explainRouteCheck(blockedWithGap, "assets", "gap");
  blockedWithGap.summary = {
    status: "blocked",
    knownGaps: ["An asset differs."],
    nextAction: "Replace the asset."
  };
  expectFailure("blocked-with-gap", blockedWithGap, "blocked reports require");

  const partialWithoutNextAction = validPartial;
  partialWithoutNextAction.summary.nextAction = "";
  expectFailure("partial-without-next-action", partialWithoutNextAction, "summary.nextAction", false);

  const symlinkReport = validReport();
  const symlinkPath = path.join(tempRoot, "evidence", "source", "linked.png");
  try {
    fs.symlinkSync(
      path.join(tempRoot, "evidence", "source", "home--desktop--default.png"),
      symlinkPath,
      "file"
    );
    symlinkReport.routes[0].evidence[0].path = "evidence/source/linked.png";
    expectFailure("symlink-evidence", symlinkReport, "regular, non-link file");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
      fail(`symlink test setup failed unexpectedly: ${error.message}`);
    }
  }
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Fetch skill validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Fetch skill validation passed.");
