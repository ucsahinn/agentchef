import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { acceptsSchema, identity, schemaId, sourceMarkerNames } from "./identity.mjs";

// Current marker name; a legacy marker is found through provenanceMarkerPath().
export const pinnedSkillProvenanceFileName = identity.sourceMarker;
export const legacyPinnedSkillProvenanceFileName = identity.legacySourceMarker;
export const pinnedSkillSchemaVersion = schemaId("pinned-skill", 1);

export function provenanceMarkerPath(target) {
  for (const name of sourceMarkerNames) {
    const candidate = path.join(target, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(target, pinnedSkillProvenanceFileName);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function skillFrontmatterName(text) {
  if (typeof text !== "string" || !text.startsWith("---")) return "";
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return "";
  const nameLine = match[1].match(/^name:\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._-]+))\s*$/m);
  return (nameLine?.[1] || nameLine?.[2] || nameLine?.[3] || "").trim();
}

export function hashSkillTree(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (sourceMarkerNames.includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Skill tree contains a symbolic link or junction: ${absolute}`);
      }
      if (stat.isDirectory()) pending.push(absolute);
      else if (stat.isFile()) files.push(absolute);
      else throw new Error(`Skill tree contains an unsupported entry: ${absolute}`);
    }
  }

  const hash = crypto.createHash("sha256");
  for (const file of files.sort((left, right) =>
    path.relative(directory, left).localeCompare(path.relative(directory, right))
  )) {
    const relative = path.relative(directory, file).split(path.sep).join("/");
    const content = fs.readFileSync(file);
    hash.update(relative);
    hash.update("\0");
    hash.update(String(content.length));
    hash.update("\0");
    hash.update(content);
  }
  return hash.digest("hex");
}

export function inspectSkillTree(target, expectedName, expectedHash = "") {
  const targetStat = lstatOrNull(target);
  if (!targetStat) return { valid: false, reason: "missing" };
  if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
    return { valid: false, reason: "not-real-directory" };
  }

  const skillFile = path.join(target, "SKILL.md");
  const skillStat = lstatOrNull(skillFile);
  if (!skillStat || skillStat.isSymbolicLink() || !skillStat.isFile() || skillStat.size === 0) {
    return { valid: false, reason: "invalid-skill-file" };
  }
  const text = fs.readFileSync(skillFile, "utf8");
  if (skillFrontmatterName(text) !== expectedName) {
    return { valid: false, reason: "skill-name-mismatch" };
  }

  const actualHash = hashSkillTree(target);
  if (expectedHash && actualHash !== expectedHash) {
    return { valid: false, reason: "tree-hash-mismatch", actualHash };
  }
  return { valid: true, reason: "tree-hash", actualHash };
}

export function inspectPinnedSkillOwnership(target, expected) {
  const tree = inspectSkillTree(target, expected.skill);
  if (!tree.valid) return tree;

  const markerPath = provenanceMarkerPath(target);
  const markerStat = lstatOrNull(markerPath);
  if (!markerStat || markerStat.isSymbolicLink() || !markerStat.isFile() || markerStat.size === 0) {
    return { valid: false, reason: "missing-provenance", actualHash: tree.actualHash };
  }

  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch {
    return { valid: false, reason: "invalid-provenance-json", actualHash: tree.actualHash };
  }

  if (!acceptsSchema(marker?.schemaVersion, "pinned-skill", 1)) {
    return { valid: false, reason: "provenance-schemaVersion-mismatch", actualHash: tree.actualHash };
  }
  const expectedFields = {
    package: expected.package,
    skill: expected.skill
  };
  for (const [field, value] of Object.entries(expectedFields)) {
    if (marker?.[field] !== value) {
      return {
        valid: false,
        reason: `provenance-${field}-mismatch`,
        actualHash: tree.actualHash
      };
    }
  }
  if (!/^[a-f0-9]{40}$/.test(marker.commit || "")) {
    return { valid: false, reason: "invalid-provenance-commit", actualHash: tree.actualHash };
  }
  if (!/^\d+\.\d+\.\d+$/.test(marker.cliVersion || "")) {
    return { valid: false, reason: "invalid-provenance-cli-version", actualHash: tree.actualHash };
  }
  if (!/^[a-f0-9]{64}$/.test(marker.sourceTreeSha256 || "")) {
    return { valid: false, reason: "invalid-provenance-hash", actualHash: tree.actualHash };
  }
  if (marker.sourceTreeSha256 !== tree.actualHash) {
    return { valid: false, reason: "provenance-tree-hash-mismatch", actualHash: tree.actualHash };
  }

  return {
    valid: true,
    reason: "verified",
    actualHash: tree.actualHash,
    provenance: marker
  };
}

export function inspectPinnedSkillTarget(target, expected) {
  const ownership = inspectPinnedSkillOwnership(target, expected);
  if (!ownership.valid) return ownership;
  if (ownership.provenance.commit !== expected.commit) {
    return {
      valid: false,
      reason: "provenance-commit-mismatch",
      actualHash: ownership.actualHash
    };
  }
  if (ownership.provenance.cliVersion !== expected.cliVersion) {
    return {
      valid: false,
      reason: "provenance-cliVersion-mismatch",
      actualHash: ownership.actualHash
    };
  }
  if (
    expected.sourceTreeSha256
    && ownership.provenance.sourceTreeSha256 !== expected.sourceTreeSha256
  ) {
    return {
      valid: false,
      reason: "expected-tree-hash-mismatch",
      actualHash: ownership.actualHash
    };
  }
  return ownership;
}

export function writePinnedSkillProvenance(target, expected) {
  const markerPath = path.join(target, pinnedSkillProvenanceFileName);
  // A rewrite always produces the current marker; a legacy marker is retired.
  const legacyPath = path.join(target, legacyPinnedSkillProvenanceFileName);
  if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath, { force: true });
  fs.writeFileSync(markerPath, `${JSON.stringify({
    schemaVersion: pinnedSkillSchemaVersion,
    package: expected.package,
    commit: expected.commit,
    skill: expected.skill,
    cliVersion: expected.cliVersion,
    sourceTreeSha256: expected.sourceTreeSha256
  }, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  return markerPath;
}

export function skillNamePattern(name) {
  return new RegExp(`^name:\\s*${escapeRegex(name)}\\s*$`, "m");
}
