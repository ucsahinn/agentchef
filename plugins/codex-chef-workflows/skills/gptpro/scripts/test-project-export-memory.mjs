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

function manifestFor(root, paths) {
  return {
    schemaVersion: "1.0.0",
    reviewId: "20260814T120000Z-memorytest",
    snapshot: { commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", branch: "main", dirty: false },
    files: paths.map((relative) => {
      const content = fs.readFileSync(path.join(root, relative));
      return { path: relative, bytes: content.length, sha256: sha256(content) };
    }),
    parts: [{ name: "review-bundle-part-001.txt", bytes: 1, sha256: sha256("x") }]
  };
}

test("exports a synthetic 8 MiB snapshot without retaining several full archive copies in memory", { timeout: 60_000 }, () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gptpro-project-memory-"));
  try {
    const target = path.join(temp, "repo");
    fs.mkdirSync(target);
    const paths = [];
    for (let index = 0; index < 3; index += 1) {
      const relative = `src/fixture-${String(index).padStart(2, "0")}.ts`;
      paths.push(relative);
      const file = path.join(target, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `export const fixture${index} = "${crypto.randomBytes(2 * 1024 * 1024).toString("base64")}";\n`);
    }
    fs.writeFileSync(path.join(target, "README.md"), "# Memory fixture\n");
    paths.push("README.md");
    fs.writeFileSync(path.join(target, "package.json"), "{\"name\":\"memory-fixture\"}\n");
    paths.push("package.json");
    const review = path.join(temp, "external-review-manifest.json");
    fs.writeFileSync(review, `${JSON.stringify(manifestFor(target, paths))}\n`);
    const report = path.join(temp, "memory-report.json");
    const preload = path.join(temp, "peak-rss.cjs");
    fs.writeFileSync(preload, `const fs = require("node:fs"); const report = process.env.GPTPRO_MEMORY_REPORT; let peak = 0; const sample = () => { peak = Math.max(peak, process.memoryUsage().rss); }; const timer = setInterval(sample, 2); timer.unref(); process.on("exit", () => { sample(); clearInterval(timer); fs.writeFileSync(report, JSON.stringify({ peak })); });\n`);
    const output = path.join(temp, "gptpro-project");
    const result = spawnSync(process.execPath, ["--require", preload, exporter, "--target", target, "--manifest", review, "--out", output, "--apply"], { encoding: "utf8", env: { ...process.env, GPTPRO_MEMORY_REPORT: report } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const sourceBytes = manifestFor(target, paths).files.reduce((sum, file) => sum + file.bytes, 0);
    const peak = JSON.parse(fs.readFileSync(report, "utf8")).peak;
    assert.ok(peak < sourceBytes * 8 + 56 * 1024 * 1024, `peak RSS ${peak} retained too many full delivery copies for ${sourceBytes} source bytes`);
    const archive = fs.readFileSync(path.join(output, "repo-gptpro-context.zip"));
    assert.equal(sha256(archive), JSON.parse(fs.readFileSync(path.join(output, "gptpro-delivery-manifest.json"), "utf8")).projectArchive.sha256);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
