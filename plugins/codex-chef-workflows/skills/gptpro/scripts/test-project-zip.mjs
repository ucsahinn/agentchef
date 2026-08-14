import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const exporter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "project-export.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
function write(root, relative, content) { const target = path.join(root, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, "utf8"); }
function manifestFor(root, paths) { return { schemaVersion: "1.0.0", reviewId: "20260809T120000Z-ziptest", snapshot: { commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", branch: "main", dirty: false }, files: paths.map((relative) => { const content = fs.readFileSync(path.join(root, relative)); return { path: relative, bytes: content.length, sha256: sha256(content) }; }), parts: [{ name: "review-bundle-part-001.txt", bytes: 1, sha256: sha256("x") }] }; }

test("creates one GPT Pro ZIP convenience package containing the complete named context", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-zip-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    const paths = ["src/index.ts", "docs/ARCHITECTURE.md", "README.md", "package.json"];
    write(target, paths[0], "export const version = '1';\n"); write(target, paths[1], "# Architecture\n"); write(target, paths[2], "# Example\n"); write(target, paths[3], "{\"name\":\"example\"}\n");
    const reviewManifest = path.join(temp, "external-review-manifest.json"); fs.writeFileSync(reviewManifest, `${JSON.stringify(manifestFor(target, paths), null, 2)}\n`);
    const output = path.join(temp, "gptpro-project"); const result = spawnSync(process.execPath, [exporter, "--target", target, "--manifest", reviewManifest, "--out", output, "--apply"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const archive = path.join(output, "repo-gptpro-context.zip"); assert.equal(fs.existsSync(archive), true, "expected one convenience ZIP archive"); assert.equal(fs.readFileSync(archive).subarray(0, 4).toString("binary"), "PK\u0003\u0004");
    const context = JSON.parse(fs.readFileSync(path.join(output, "gptpro-context-manifest.json"), "utf8"));
    assert.equal(context.uploadArchive.file, "repo-gptpro-context.zip");
    assert.ok(context.uploadArchive.entries.some((entry) => entry.name === "gptpro-context-index.md"));
    assert.ok(context.uploadArchive.entries.some((entry) => entry.name === "upload-text/repo-application.txt"));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
