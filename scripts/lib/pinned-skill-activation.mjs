import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertManagedTargetPath,
  isPathInside
} from "./managed-path-safety.mjs";
import {
  inspectPinnedSkillOwnership,
  inspectPinnedSkillTarget,
  inspectSkillTree,
  writePinnedSkillProvenance
} from "./skill-provenance.mjs";

const BACKUP_MANIFEST_NAME = ".codex-chef-backup.json";
const ROLLBACK_RECEIPT_NAME = ".codex-chef-pinned-skill-rollback.json";
const ROLLBACK_RECEIPT_SCHEMA = "codex-chef.pinned-skill-rollback.v1";

function removeRealDirectory(target, managedRoots) {
  if (!fs.existsSync(target)) return;
  assertManagedTargetPath(target, managedRoots);
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Refusing to remove a non-directory pinned skill target: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: false });
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function createPinnedSkillBackup(target, backupRoot, skill, expected, managedRoots) {
  const backupTarget = path.join(backupRoot, "agents", "skills", skill);
  assertManagedTargetPath(backupRoot, managedRoots);
  assertManagedTargetPath(backupTarget, managedRoots);
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.cpSync(target, backupTarget, {
    recursive: true,
    errorOnExist: true,
    dereference: false
  });

  const entries = [];
  const pending = [backupTarget];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to back up linked pinned skill content: ${absolute}`);
      }
      if (stat.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`Pinned skill backup contains an unsupported entry: ${absolute}`);
      }
      entries.push({
        backupRelativePath: path.relative(backupRoot, absolute).replaceAll(path.sep, "/"),
        size: stat.size,
        sha256: hashFile(absolute)
      });
    }
  }
  entries.sort((a, b) => a.backupRelativePath.localeCompare(b.backupRelativePath));
  fs.writeFileSync(
    path.join(backupRoot, BACKUP_MANIFEST_NAME),
    `${JSON.stringify({
      schemaVersion: "codex-chef.backup.v1",
      createdAt: new Date().toISOString(),
      operation: "pinned-skill-replacement",
      skill,
      sourcePackage: expected.package,
      replacedByCommit: expected.commit,
      entries
    }, null, 2)}\n`,
    "utf8"
  );
  return backupTarget;
}

function writeRollbackReceipt({ target, backupRoot, backedUp, expected, managedRoots }) {
  assertManagedTargetPath(backupRoot, managedRoots);
  fs.mkdirSync(backupRoot, { recursive: true });
  const receiptPath = path.join(backupRoot, ROLLBACK_RECEIPT_NAME);
  fs.writeFileSync(
    receiptPath,
    `${JSON.stringify({
      schemaVersion: ROLLBACK_RECEIPT_SCHEMA,
      kind: "pinned-skill-rollback",
      target,
      backupRoot,
      backedUp,
      expected
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  return { kind: "pinned-skill-rollback", receiptPath };
}

function readRollbackReceipt(receiptPath, managedRoots) {
  const receiptState = assertManagedTargetPath(receiptPath, managedRoots);
  const stat = fs.lstatSync(receiptState.canonicalTarget);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing a non-file pinned skill rollback receipt: ${receiptPath}`);
  }
  const receipt = JSON.parse(fs.readFileSync(receiptState.canonicalTarget, "utf8"));
  if (
    receipt?.schemaVersion !== ROLLBACK_RECEIPT_SCHEMA
    || receipt?.kind !== "pinned-skill-rollback"
    || typeof receipt.target !== "string"
    || typeof receipt.backupRoot !== "string"
    || typeof receipt.backedUp !== "boolean"
    || !receipt.expected
    || typeof receipt.expected.package !== "string"
    || typeof receipt.expected.commit !== "string"
    || typeof receipt.expected.skill !== "string"
    || typeof receipt.expected.cliVersion !== "string"
    || typeof receipt.expected.sourceTreeSha256 !== "string"
  ) {
    throw new Error("Pinned skill rollback receipt is invalid.");
  }
  const backupState = assertManagedTargetPath(receipt.backupRoot, managedRoots);
  const expectedReceiptPath = path.join(backupState.canonicalTarget, ROLLBACK_RECEIPT_NAME);
  if (receiptState.canonicalTarget !== expectedReceiptPath) {
    throw new Error("Pinned skill rollback receipt is not located in its declared backup root.");
  }
  return { receipt, receiptPath: receiptState.canonicalTarget, backupRoot: backupState.canonicalTarget };
}

export function compensatePinnedSkillInstall({ receiptPath, managedRoots }) {
  const { receipt, receiptPath: resolvedReceiptPath, backupRoot } = readRollbackReceipt(
    receiptPath,
    managedRoots
  );
  assertManagedTargetPath(receipt.target, managedRoots);
  const installed = inspectPinnedSkillTarget(receipt.target, receipt.expected);
  if (!installed.valid) {
    throw new Error(
      `Refusing pinned skill compensation because target changed since installation: ${receipt.expected.skill} (${installed.reason}).`
    );
  }

  if (receipt.backedUp) {
    const backupTarget = path.join(backupRoot, "agents", "skills", receipt.expected.skill);
    assertManagedTargetPath(backupTarget, managedRoots);
    if (!fs.existsSync(backupTarget)) {
      throw new Error(`Pinned skill compensation backup is missing: ${receipt.expected.skill}.`);
    }
    removeRealDirectory(receipt.target, managedRoots);
    fs.cpSync(backupTarget, receipt.target, {
      recursive: true,
      errorOnExist: true,
      dereference: false
    });
  } else {
    removeRealDirectory(receipt.target, managedRoots);
  }
  fs.unlinkSync(resolvedReceiptPath);
  if (!receipt.backedUp) removeRealDirectory(backupRoot, managedRoots);
  return { compensated: true, restoredPreviousTarget: receipt.backedUp };
}

export function activatePinnedSkill({
  source,
  target,
  backupRoot,
  managedRoots,
  expected,
  allowAdopt = false,
  testHooks = {}
}) {
  const sourceState = inspectSkillTree(source, expected.skill, expected.sourceTreeSha256);
  if (!sourceState.valid) {
    throw new Error(`Pinned skill source is invalid: ${sourceState.reason}.`);
  }
  if (fs.existsSync(target)) {
    const ownership = inspectPinnedSkillOwnership(target, expected);
    if (!ownership.valid && !allowAdopt) {
      throw new Error(
        `Refusing to replace an unowned pinned skill target without explicit adoption: ${expected.skill} (${ownership.reason}).`
      );
    }
  }

  const targetParent = path.dirname(target);
  assertManagedTargetPath(targetParent, managedRoots);
  const targetState = assertManagedTargetPath(target, managedRoots);
  const backupState = assertManagedTargetPath(backupRoot, managedRoots);
  if (
    isPathInside(backupState.canonicalTarget, targetState.canonicalTarget)
    || isPathInside(targetState.canonicalTarget, backupState.canonicalTarget)
  ) {
    throw new Error(
      `Refusing overlapping pinned skill target and backup root: ${expected.skill}.`
    );
  }
  fs.mkdirSync(targetParent, { recursive: true });
  assertManagedTargetPath(targetParent, managedRoots);

  const staging = fs.mkdtempSync(path.join(targetParent, `.codex-chef-${expected.skill}-`));
  let backedUp = false;
  let activated = false;
  let backupTarget = null;
  try {
    assertManagedTargetPath(staging, managedRoots);
    fs.cpSync(source, staging, {
      recursive: true,
      errorOnExist: false,
      force: false,
      dereference: false
    });
    const staged = inspectSkillTree(staging, expected.skill, expected.sourceTreeSha256);
    if (!staged.valid) {
      throw new Error(
        `Pinned skill staging content mismatch: ${staged.reason} (${staged.actualHash || "no hash"}).`
      );
    }
    writePinnedSkillProvenance(staging, expected);
    const stagedWithProvenance = inspectPinnedSkillTarget(staging, expected);
    if (!stagedWithProvenance.valid) {
      throw new Error(`Pinned skill staging provenance mismatch: ${stagedWithProvenance.reason}.`);
    }
    testHooks.afterStage?.({ staging, target, backupRoot });

    if (fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(backupRoot), { recursive: true });
      assertManagedTargetPath(target, managedRoots);
      assertManagedTargetPath(backupRoot, managedRoots);
      backupTarget = createPinnedSkillBackup(
        target,
        backupRoot,
        expected.skill,
        expected,
        managedRoots
      );
      backedUp = true;
      removeRealDirectory(target, managedRoots);
    }

    assertManagedTargetPath(staging, managedRoots);
    assertManagedTargetPath(target, managedRoots);
    fs.renameSync(staging, target);
    activated = true;
    testHooks.afterActivate?.({ target, backupRoot });

    const installed = inspectPinnedSkillTarget(target, expected);
    if (!installed.valid) {
      throw new Error(`Pinned skill activation verification failed: ${installed.reason}.`);
    }
    const compensation = writeRollbackReceipt({
      target,
      backupRoot,
      backedUp,
      expected,
      managedRoots
    });
    return { installed, backedUp, backupRoot: backedUp ? backupRoot : null, compensation };
  } catch (error) {
    if (fs.existsSync(staging)) removeRealDirectory(staging, managedRoots);
    if (activated && fs.existsSync(target)) removeRealDirectory(target, managedRoots);
    if (backedUp) {
      assertManagedTargetPath(backupTarget, managedRoots);
      assertManagedTargetPath(target, managedRoots);
      fs.cpSync(backupTarget, target, {
        recursive: true,
        errorOnExist: true,
        dereference: false
      });
    } else if (fs.existsSync(backupRoot)) {
      removeRealDirectory(backupRoot, managedRoots);
    }
    throw error;
  }
}
