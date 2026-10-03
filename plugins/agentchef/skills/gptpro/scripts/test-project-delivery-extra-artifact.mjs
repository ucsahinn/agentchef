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

test("status rejects an unexpected stale subsystem archive", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-extra-archive-"));
  try {
    const target = path.join(temp, "repo"); fs.mkdirSync(target);
    const paths = ["src/index.ts", "README.md", "package.json"];
    write(target, paths[0], "export const value = 1;\n"); write(target, paths[1], "# Example\n"); write(target, paths[2], "{\"name\":\"example\"}\n");
    const review = { schemaVersion: "1.0.0", reviewId: "20260809T120000Z-extra", snapshot: { commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", branch: "main", dirty: false }, files: paths.map((relative) => { const content = fs.readFileSync(path.join(target, relative)); return { path: relative, bytes: content.length, sha256: sha256(content) }; }), parts: [{ name: "review-bundle-part-001.txt", bytes: 1, sha256: sha256("x") }] };
    const reviewManifest = path.join(temp, "external-review-manifest.json"); fs.writeFileSync(reviewManifest, `${JSON.stringify(review, null, 2)}\n`);
    const output = path.join(temp, "gptpro-project"); const args = [exporter, "--target", target, "--manifest", reviewManifest, "--out", output];
    const applied = spawnSync(process.execPath, [...args, "--apply"], { encoding: "utf8" }); assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    fs.writeFileSync(path.join(output, "subsystem-zips", "old-context.zip"), "not a valid archive", "utf8");
    const status = spawnSync(process.execPath, [...args, "--status"], { encoding: "utf8" });
    assert.notEqual(status.status, 0, status.stdout || status.stderr);
    assert.match(status.stdout, /unexpected/i);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
