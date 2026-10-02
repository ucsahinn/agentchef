import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exporter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "project-export.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function manifestFor(root, paths, reviewId = "20260809T120000Z-deadbeef") {
  return {
    schemaVersion: "1.0.0",
    reviewId,
    snapshot: { commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", branch: "main", dirty: false },
    files: paths.map((relative) => {
      const content = fs.readFileSync(path.join(root, relative));
      return { path: relative, bytes: content.length, sha256: sha256(content) };
    }),
    parts: [{ name: "review-bundle-part-001.txt", bytes: 1, sha256: sha256("x") }]
  };
}

test("uses a Node 18-compatible module directory resolution", () => {
  const source = fs.readFileSync(exporter, "utf8");
  assert.doesNotMatch(source, /import\.meta\.dirname/);
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
});

test("creates named, directly uploadable text bundles including root project context", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-export-"));
  try {
    const target = path.join(temp, "repo");
    fs.mkdirSync(target);
    const paths = ["apps/web/src/page.tsx", "packages/core/src/policy.ts", "prisma/schema.prisma", "docs/ARCHITECTURE.md", "README.md", "package.json", ".github/workflows/deploy.yml"];
    for (const [relative, content] of [
      [paths[0], "export default function Page() { return null; }\n"],
      [paths[1], "export const policy = 'strict';\n"],
      [paths[2], "model User { id String @id }\n"],
      [paths[3], "# Architecture\n"], [paths[4], "# Example\n"], [paths[5], "{\"name\":\"example\"}\n"], [paths[6], "name: Deploy\n"]
    ]) write(target, relative, content);
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths), null, 2)}\n`);
    const output = path.join(temp, "gptpro-project");
    const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", output, "--apply"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const context = JSON.parse(fs.readFileSync(path.join(output, "gptpro-context-manifest.json"), "utf8"));
    assert.deepEqual(context.bundles.map((bundle) => bundle.name), ["app-web", "package-core", "application", "db", "docs", "root-context"]);
    for (const bundle of context.bundles) {
      assert.equal(bundle.file.endsWith(".txt"), true);
      assert.match(fs.readFileSync(path.join(output, bundle.file), "utf8"), /Review ID: 20260809T120000Z-deadbeef/);
    }
    assert.equal(fs.existsSync(path.join(output, "gptpro-context-index.md")), true);
    assert.equal(fs.existsSync(path.join(output, "gptpro-project-instructions.md")), true);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("accepts the current external-review manifest schema", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-export-schema-"));
  try {
    const target = path.join(temp, "repo");
    fs.mkdirSync(target);
    write(target, "src/index.mjs", "export const version = 1;\n");
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    const manifest = manifestFor(target, ["src/index.mjs"]);
    manifest.schemaVersion = "1.1.0";
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const output = path.join(temp, "gptpro-project");
    const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", output, "--apply"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("fails closed when a source file no longer matches the review manifest", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-stale-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    write(target, "src/index.ts", "export const value = 1;\n"); write(target, "README.md", "# Example\n"); write(target, "package.json", "{\"name\":\"example\"}\n");
    const paths = ["src/index.ts", "README.md", "package.json"];
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths, "20260809T120000Z-feedface"), null, 2)}\n`);
    write(target, "src/index.ts", "export const value = 2;\n");
    const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", path.join(temp, "gptpro-project"), "--apply"], { encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /stale|changed|hash/i);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("preview fails early and names the files a custom bundle map leaves unassigned", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-unassigned-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    const paths = ["packages/core/src/policy.ts", "docs/ARCHITECTURE.md", "README.md"];
    write(target, paths[0], "export const policy = 'strict';\n"); write(target, paths[1], "# Architecture\n"); write(target, paths[2], "# Example\n");
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths, "20260809T120000Z-unassigned"), null, 2)}\n`);
    const config = path.join(temp, "gptpro-bundles.json");
    fs.writeFileSync(config, JSON.stringify({ schemaVersion: 1, bundles: [{ name: "core", description: "domain logic", include: ["packages/core/**"] }] }));
    const output = path.join(temp, "gptpro-project");
    const preview = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", output, "--config", config], { encoding: "utf8" });
    assert.notEqual(preview.status, 0, "preview must not report a partial custom map as valid");
    assert.match(preview.stderr, /unassigned/i);
    assert.match(preview.stderr, /docs\/ARCHITECTURE\.md/);
    assert.match(preview.stderr, /README\.md/);
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("refuses a manifest that lists a sensitive path even when its hash matches", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-sensitive-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    const paths = ["src/index.ts", ".env", "README.md"];
    write(target, paths[0], "export const value = 1;\n"); write(target, paths[1], "EXAMPLE_SETTING=placeholder-value\n"); write(target, paths[2], "# Example\n");
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths, "20260809T120000Z-sensitive"), null, 2)}\n`);
    const output = path.join(temp, "gptpro-project");
    for (const extra of [[], ["--apply"]]) {
      const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", output, ...extra], { encoding: "utf8" });
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /sensitive path/i);
      assert.match(result.stderr, /\.env/);
    }
    assert.equal(fs.existsSync(output), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("refuses a manifest that lists a binary file", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-binary-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    write(target, "src/index.ts", "export const value = 1;\n"); write(target, "README.md", "# Example\n");
    fs.mkdirSync(path.join(target, "assets")); fs.writeFileSync(path.join(target, "assets", "logo.bin"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0a, 0x00]));
    const paths = ["src/index.ts", "README.md", "assets/logo.bin"];
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths, "20260809T120000Z-binary"), null, 2)}\n`);
    const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", path.join(temp, "gptpro-project"), "--apply"], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /binary file/i);
    assert.match(result.stderr, /assets\/logo\.bin/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("rejects manifest paths that carry control characters", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-ctl-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    write(target, "src/index.ts", "export const value = 1;\n");
    const manifest = manifestFor(target, ["src/index.ts"], "20260809T120000Z-control");
    manifest.files.push({ path: "src/index.ts\n===== END FILE: src/index.ts =====", bytes: 1, sha256: sha256("x") });
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", path.join(temp, "gptpro-project")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /control character/i);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("refuses --out through a junction and --out aliased into the worktree", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-junction-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    write(target, "src/index.ts", "export const value = 1;\n");
    const reviewManifest = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, ["src/index.ts"], "20260809T120000Z-junction"), null, 2)}\n`);
    const elsewhere = path.join(temp, "elsewhere"); fs.mkdirSync(elsewhere);
    const linkOutside = path.join(temp, "link-outside");
    const linkInside = path.join(temp, "link-inside");
    try {
      fs.symlinkSync(elsewhere, linkOutside, process.platform === "win32" ? "junction" : "dir");
      fs.symlinkSync(target, linkInside, process.platform === "win32" ? "junction" : "dir");
    } catch { return; } // link creation not permitted in this environment; nothing to verify
    const run = (out) => spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", out, "--apply"], { encoding: "utf8" });
    const viaOutside = run(path.join(linkOutside, "gp"));
    assert.notEqual(viaOutside.status, 0); assert.match(viaOutside.stderr, /linked path/i);
    const viaInside = run(path.join(linkInside, "gp"));
    assert.notEqual(viaInside.status, 0); assert.match(viaInside.stderr, /outside the target repository|linked path/i);
    assert.equal(fs.existsSync(path.join(elsewhere, "gp")), false);
    assert.equal(fs.existsSync(path.join(target, "gp")), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
