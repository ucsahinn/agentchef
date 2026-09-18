#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { acceptsSchema, identity, managedMarkerNames, schemaId } from "./lib/identity.mjs";

export const markerFileName = identity.managedMarker;
export const legacyMarkerFileName = identity.legacyManagedMarker;

// The ownership marker a target actually carries (current first, then legacy).
export function markerPathFor(targetRoot) {
  for (const name of managedMarkerNames) {
    const candidate = path.join(path.resolve(targetRoot), name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(path.resolve(targetRoot), markerFileName);
}

function readSkillName(sourceRoot) {
  const skillPath = path.join(path.resolve(sourceRoot), "SKILL.md");
  const text = fs.readFileSync(skillPath, "utf8").replace(/^\uFEFF/, "");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const name = frontmatter?.match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 63) {
    throw new Error(`managed direct skill source has an invalid name: ${skillPath}`);
  }
  if (path.basename(path.resolve(sourceRoot)) !== name) {
    throw new Error(`managed direct skill source folder must match skill name ${name}: ${sourceRoot}`);
  }
  return name;
}

function markerContractFor(sourceRoot, targetRoot) {
  const name = readSkillName(sourceRoot);
  if (path.basename(path.resolve(targetRoot)) !== name) {
    throw new Error(`managed direct skill target folder must match skill name ${name}: ${targetRoot}`);
  }
  return Object.freeze({
    schemaVersion: schemaId("managed-direct-skill", 1),
    manager: "agentchef",
    component: "direct-skill",
    name,
    source: `plugins/agentchef-workflows/skills/${name}`
  });
}

// A marker written before 1.0.0 is accepted when every field other than the
// identity spelling matches the current contract.
function markerMatchesContract(marker, contract) {
  if (!marker || typeof marker !== "object") return false;
  if (!acceptsSchema(marker.schemaVersion, "managed-direct-skill", 1)) return false;
  if (!["agentchef", "codex-chef"].includes(marker.manager)) return false;
  const legacyName = contract.name === identity.operatorSkill ? identity.legacyOperatorSkill : contract.name;
  if (marker.component !== contract.component || ![contract.name, legacyName].includes(marker.name)) return false;
  const legacySkill = contract.name === identity.operatorSkill ? identity.legacyOperatorSkill : contract.name;
  const legacySource = `plugins/${identity.legacyPluginName}/skills/${legacySkill}`;
  return marker.source === contract.source || marker.source === legacySource;
}

function stableJson(value) {
  if (Array.isArray(value)) return JSON.stringify(value.map((entry) => JSON.parse(stableJson(entry))));
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return JSON.stringify(Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, JSON.parse(stableJson(value[key]))])
  ));
}

function listRegularFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`managed direct skill root must be a real directory: ${root}`);
  }
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`managed direct skill tree must not contain links: ${absolute}`);
      }
      if (stat.isDirectory()) pending.push(absolute);
      else if (stat.isFile()) files.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
      else throw new Error(`managed direct skill tree contains an unsupported entry: ${absolute}`);
    }
  }
  return files.sort();
}

function filesMatch(sourceRoot, targetRoot, sourceFiles) {
  for (const relative of sourceFiles) {
    const source = path.join(sourceRoot, relative);
    const target = path.join(targetRoot, relative);
    if (!fs.existsSync(target)) return false;
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    if (!fs.readFileSync(source).equals(fs.readFileSync(target))) return false;
  }
  return true;
}

function readMarker(markerPath) {
  try {
    return JSON.parse(fs.readFileSync(markerPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function inspectDirectSkillTarget(sourceRoot, targetRoot) {
  const source = path.resolve(sourceRoot);
  const target = path.resolve(targetRoot);
  const markerContract = markerContractFor(source, target);
  const sourceFiles = listRegularFiles(source);
  if (sourceFiles.length === 0 || !sourceFiles.includes("SKILL.md")) {
    throw new Error(`canonical direct skill source is incomplete: ${source}`);
  }

  const targetStat = lstatOrNull(target);
  if (!targetStat) {
    return { status: "absent", safeToSync: true, sourceFiles };
  }
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    return { status: "foreign", safeToSync: false, reason: "target-is-not-a-real-directory", sourceFiles };
  }

  let targetFiles;
  try {
    targetFiles = listRegularFiles(target).filter((file) => !managedMarkerNames.includes(file));
  } catch (error) {
    return { status: "foreign", safeToSync: false, reason: error.message, sourceFiles };
  }

  const markerPath = markerPathFor(target);
  if (fs.existsSync(markerPath)) {
    const markerStat = fs.lstatSync(markerPath);
    const marker = markerStat.isFile() && !markerStat.isSymbolicLink()
      ? readMarker(markerPath)
      : null;
    if (markerMatchesContract(marker, markerContract)) {
      const managedFilesMatch = filesMatch(source, target, sourceFiles);
      if (managedFilesMatch && stableJson(targetFiles) === stableJson(sourceFiles)) {
        return { status: "managed", safeToSync: true, sourceFiles };
      }
      if (managedFilesMatch) {
        return { status: "managed-with-extras", safeToSync: true, reason: "local-extras-preserved", sourceFiles };
      }
      return {
        status: "managed-drift",
        safeToSync: true,
        reason: "managed-content-drift",
        sourceFiles
      };
    }
    return { status: "foreign", safeToSync: false, reason: "invalid-ownership-marker", sourceFiles };
  }

  const exactLegacyMatch = stableJson(targetFiles) === stableJson(sourceFiles)
    && filesMatch(source, target, sourceFiles);
  if (exactLegacyMatch) {
    return { status: "legacy-match", safeToSync: true, sourceFiles };
  }
  return { status: "foreign", safeToSync: false, reason: "unowned-existing-directory", sourceFiles };
}

export function isDirectSkillStateAdoptable(state) {
  return state?.status === "foreign"
    && ["unowned-existing-directory", "invalid-ownership-marker"].includes(state.reason);
}

export function writeDirectSkillMarker(sourceRoot, targetRoot, { allowAdopt = false } = {}) {
  const markerContract = markerContractFor(sourceRoot, targetRoot);
  const skillName = markerContract.name;
  const state = inspectDirectSkillTarget(sourceRoot, targetRoot);
  if (state.status === "foreign" && !allowAdopt) {
    throw new Error(`refusing to adopt foreign direct ${skillName} skill without explicit approval: ${targetRoot}`);
  }
  if (
    state.status === "foreign"
    && !isDirectSkillStateAdoptable(state)
  ) {
    throw new Error(`refusing to adopt an unsafe direct ${skillName} target: ${targetRoot} (${state.reason})`);
  }
  if (!fs.existsSync(targetRoot) || !filesMatch(path.resolve(sourceRoot), path.resolve(targetRoot), state.sourceFiles)) {
    throw new Error(`direct ${skillName} target does not match the canonical source: ${targetRoot}`);
  }
  const markerPath = path.join(path.resolve(targetRoot), markerFileName);
  const legacyMarkerPath = path.join(path.resolve(targetRoot), legacyMarkerFileName);
  if (fs.existsSync(legacyMarkerPath)) {
    const legacyStat = fs.lstatSync(legacyMarkerPath);
    if (!legacyStat.isFile() || legacyStat.isSymbolicLink()) {
      throw new Error(`direct ${skillName} legacy ownership marker must be a regular file: ${legacyMarkerPath}`);
    }
    // Writing the current marker retires the legacy one.
    fs.rmSync(legacyMarkerPath, { force: true });
  }
  if (fs.existsSync(markerPath)) {
    const markerStat = fs.lstatSync(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) {
      throw new Error(`direct ${skillName} ownership marker must be a regular file: ${markerPath}`);
    }
  }
  fs.writeFileSync(markerPath, `${JSON.stringify(markerContract, null, 2)}\n`, "utf8");
  return { ...state, markerPath, status: state.status === "managed" ? "managed" : "marked" };
}

function usage() {
  console.error("Usage: node scripts/manage-direct-skill-target.mjs <source> <target> (--check|--mark) [--allow-adopt]");
}

function main() {
  const [sourceRoot, targetRoot, mode, ...rest] = process.argv.slice(2);
  const allowAdopt = rest.includes("--allow-adopt");
  if (!sourceRoot || !targetRoot || !["--check", "--mark"].includes(mode) || rest.some((arg) => arg !== "--allow-adopt")) {
    usage();
    process.exit(1);
  }
  try {
    if (mode === "--check") {
      const state = inspectDirectSkillTarget(sourceRoot, targetRoot);
      console.log(JSON.stringify(state));
      process.exit(state.safeToSync || (allowAdopt && isDirectSkillStateAdoptable(state)) ? 0 : 2);
    }
    console.log(JSON.stringify(writeDirectSkillMarker(sourceRoot, targetRoot, { allowAdopt })));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
