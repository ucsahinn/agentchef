import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const exporter = path.resolve(import.meta.dirname, "project-export.mjs");
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
