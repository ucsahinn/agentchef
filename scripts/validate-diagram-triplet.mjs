#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const failures = [];
const renderer = path.join(root, "plugins", "agentchef-workflows", "skills", "offline-diagram-triplet", "scripts", "render-diagram-triplet.mjs");
const skill = path.join(root, "plugins", "agentchef-workflows", "skills", "offline-diagram-triplet", "SKILL.md");
let tempRoot = null;

function fail(message) {
  failures.push(message);
}

function runRenderer(source, name, timeout = 60000) {
  const inputPath = path.join(tempRoot, `${name}.mmd`);
  const outDir = path.join(tempRoot, name);
  fs.writeFileSync(inputPath, source, "utf8");
  return spawnSync(process.execPath, [renderer, "--mermaid", inputPath, "--out-dir", outDir, "--name", name], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    windowsHide: true
  });
}

function validateSuccessfulTriplet() {
  const source = [
    "flowchart LR",
    "  A[English brief] --> B[Mermaid source]",
    "  B --> C[Editable Excalidraw]",
    "  B --> D[Rendered SVG]",
    "  B --> E[Rendered PNG]",
    ""
  ].join("\n");

  const result = runRenderer(source, "sample");
  if (result.error) {
    fail(`Diagram renderer could not run: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    fail(`Diagram renderer exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
    return;
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    fail(`Diagram renderer did not emit parseable JSON: ${error.message}`);
    return;
  }

  if (report.schemaVersion !== "agentchef.diagram-triplet.v1") {
    fail("Diagram renderer schemaVersion drifted.");
  }
  if (report.nodes !== 5 || report.edges !== 4) {
    fail(`Diagram renderer expected 5 nodes and 4 edges, got ${report.nodes} nodes and ${report.edges} edges.`);
  }
  for (const [key, filePath] of Object.entries(report.files || {})) {
    if (!fs.existsSync(filePath)) fail(`Diagram renderer did not create ${key}: ${filePath}`);
  }

  const excalidrawPath = report.files?.excalidraw;
  if (excalidrawPath && fs.existsSync(excalidrawPath)) {
    const scene = JSON.parse(fs.readFileSync(excalidrawPath, "utf8"));
    if (scene.type !== "excalidraw" || !Array.isArray(scene.elements) || scene.elements.length < 5) {
      fail("Generated Excalidraw scene is not editable Excalidraw JSON.");
    }
  }

  const svgPath = report.files?.svg;
  if (svgPath && fs.existsSync(svgPath)) {
    const svg = fs.readFileSync(svgPath, "utf8");
    if (!svg.includes("<svg") || !svg.includes("<title") || !svg.includes("<desc")) {
      fail("Generated SVG must include svg, title, and desc elements.");
    }
  }

  const pngPath = report.files?.png;
  if (pngPath && fs.existsSync(pngPath)) {
    const png = fs.readFileSync(pngPath);
    const signature = "89504e470d0a1a0a";
    if (png.subarray(0, 8).toString("hex") !== signature) {
      fail("Generated PNG does not have a valid PNG signature.");
    }
  }

  const markdownPath = report.files?.markdown;
  if (markdownPath && fs.existsSync(markdownPath)) {
    const markdown = fs.readFileSync(markdownPath, "utf8");
    if (!markdown.includes("```mermaid") || !markdown.includes(".excalidraw") || !markdown.includes(".png")) {
      fail("Generated Markdown snippet must embed Mermaid and link editable/rendered artifacts.");
    }
  }
}

function expectRendererFailure(name, source, expectedMessage) {
  const result = runRenderer(source, name, 10000);
  if (result.error) {
    fail(`Diagram renderer ${name} failed with process error instead of clean validation error: ${result.error.message}`);
    return;
  }
  if (result.status === 0) {
    fail(`Diagram renderer ${name} should fail closed.`);
    return;
  }
  const combined = `${result.stderr || ""}\n${result.stdout || ""}`;
  if (!combined.includes(expectedMessage)) {
    fail(`Diagram renderer ${name} error should include "${expectedMessage}". Got: ${combined.trim()}`);
  }
}

function validateFailureCases() {
  expectRendererFailure("cycle", [
    "flowchart TD",
    "  A[One] --> B[Two]",
    "  B --> A",
    ""
  ].join("\n"), "Cyclic Mermaid graphs are not supported");

  const tooManyNodes = ["flowchart TD"];
  for (let index = 0; index <= 200; index += 1) tooManyNodes.push(`  N${index}[Node ${index}]`);
  expectRendererFailure("too-many-nodes", tooManyNodes.join("\n"), "too many nodes");

  const tooWide = ["flowchart TD"];
  for (let index = 0; index < 200; index += 1) tooWide.push(`  W${index}[Wide standalone node ${index}]`);
  expectRendererFailure("too-wide", tooWide.join("\n"), "Rendered diagram is too large");
}

try {
  if (!fs.existsSync(skill)) fail("Missing offline diagram triplet SKILL.md.");
  if (!fs.existsSync(renderer)) fail("Missing offline diagram triplet renderer script.");

  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-diagram-triplet-"));
  if (failures.length === 0) {
    validateSuccessfulTriplet();
    validateFailureCases();
  }
} finally {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Diagram triplet validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Diagram triplet validation passed.");
