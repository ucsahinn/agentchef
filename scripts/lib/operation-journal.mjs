import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identity, journalFileNames, schemaId } from "./identity.mjs";

// The journal a backup root actually holds (current name first, then legacy).
function existingJournalPath(backupRoot) {
  for (const name of journalFileNames) {
    const candidate = path.join(backupRoot, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(backupRoot, identity.journalFile);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function atomicWrite(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const file = fs.openSync(temporary, "wx");
  try {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
    fs.fsyncSync(file);
  } finally {
    fs.closeSync(file);
  }
  fs.renameSync(temporary, filePath);
  try {
    const directory = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    if (!["EINVAL", "EPERM", "EISDIR"].includes(error?.code)) throw error;
  }
}

// Links are refused everywhere by default. A mutation prepared with
// { link: true } (the Claude skill links: a junction or directory symlink
// that points into the AgentChef-managed skill tree) may have a link as its
// top-level output; entries inside directories are still never links.
function fingerprint(targetPath, { allowLink = false } = {}) {
  const linkStat = fs.existsSync(targetPath) ? null : (() => {
    try {
      return fs.lstatSync(targetPath);
    } catch {
      return null;
    }
  })();
  if (linkStat?.isSymbolicLink()) {
    // A dangling link: existsSync follows the link and reports false.
    if (!allowLink) throw new Error(`Operation journal refuses linked output: ${targetPath}`);
    return { kind: "link", target: fs.readlinkSync(targetPath) };
  }
  if (!fs.existsSync(targetPath)) return { kind: "absent" };
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    if (!allowLink) throw new Error(`Operation journal refuses linked output: ${targetPath}`);
    return { kind: "link", target: fs.readlinkSync(targetPath) };
  }
  if (stat.isFile()) return { kind: "file", sha256: sha256(targetPath) };
  if (!stat.isDirectory()) throw new Error(`Operation journal refuses unsupported output: ${targetPath}`);
  const hash = crypto.createHash("sha256");
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) throw new Error(`Operation journal refuses linked output: ${fullPath}`);
      if (stat.isDirectory()) walk(fullPath);
      else if (stat.isFile()) hash.update(path.relative(targetPath, fullPath)).update("\0").update(fs.readFileSync(fullPath)).update("\0");
      else throw new Error(`Operation journal refuses unsupported output: ${fullPath}`);
    }
  };
  walk(targetPath);
  return { kind: "directory", sha256: hash.digest("hex") };
}

function sameFingerprint(left, right) {
  return left?.kind === right?.kind && left?.sha256 === right?.sha256 && left?.target === right?.target;
}

function readInProgressJournal(backupRoot) {
  const journalPath = existingJournalPath(backupRoot);
  if (!fs.existsSync(journalPath)) throw new Error(`Operation journal is missing: ${journalPath}`);
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (journal.state !== "in-progress") throw new Error(`Operation journal is already ${journal.state}: ${journalPath}`);
  journal.mutations ||= [];
  return { journalPath, journal };
}

function assertBackupWithinRoot(backupRoot, backup) {
  const resolvedBackup = backup && backup !== "-" ? path.resolve(backup) : null;
  if (resolvedBackup && resolvedBackup !== backupRoot && !resolvedBackup.startsWith(`${backupRoot}${path.sep}`)) {
    throw new Error("Operation journal backup path escapes its backup root.");
  }
  return resolvedBackup;
}

function prepareMutation(journal, journalPath, backupRoot, { target, backup = null, link = false }) {
  const resolvedTarget = path.resolve(target);
  const resolvedBackup = assertBackupWithinRoot(backupRoot, backup);
  if (journal.mutations.some((entry) => entry.target === resolvedTarget)) {
    throw new Error(`Operation journal already prepared target: ${resolvedTarget}`);
  }
  const mutation = { target: resolvedTarget, backup: resolvedBackup, before: fingerprint(resolvedTarget, { allowLink: link }), output: null, phase: "prepared" };
  if (link) mutation.link = true;
  journal.mutations.push(mutation);
  atomicWrite(journalPath, journal);
}

function markAppliedMutation(journal, journalPath, target) {
  const resolvedTarget = path.resolve(target);
  const mutation = journal.mutations.find((entry) => entry.target === resolvedTarget);
  if (!mutation || mutation.phase !== "prepared") throw new Error(`Operation journal has no prepared mutation: ${resolvedTarget}`);
  mutation.output = fingerprint(resolvedTarget, { allowLink: Boolean(mutation.link) });
  mutation.phase = "applied";
  atomicWrite(journalPath, journal);
}

function assertReadyToComplete(journal) {
  if (journal.mutations.some((mutation) => mutation.phase === "prepared")) {
    throw new Error("Operation journal cannot complete with prepared mutations.");
  }
}

export function createOperationJournal({ backupRoot, operation }) {
  if (!backupRoot || !operation) throw new TypeError("backupRoot and operation are required.");
  const resolvedBackupRoot = path.resolve(backupRoot);
  fs.mkdirSync(resolvedBackupRoot, { recursive: true });
  const journalPath = path.join(resolvedBackupRoot, identity.journalFile);
  for (const name of journalFileNames) {
    if (fs.existsSync(path.join(resolvedBackupRoot, name))) {
      throw new Error(`Operation journal already exists: ${path.join(resolvedBackupRoot, name)}`);
    }
  }
  const journal = {
    schemaVersion: schemaId("operation-journal", 1),
    operation,
    createdAt: new Date().toISOString(),
    state: "in-progress",
    backups: [],
    mutations: []
  };
  atomicWrite(journalPath, journal);
  return {
    journalPath,
    recordBackup(backupPath) {
      const stat = fs.statSync(backupPath);
      const record = (filePath) => {
        const fileStat = fs.statSync(filePath);
        if (fileStat.isDirectory()) {
          for (const entry of fs.readdirSync(filePath, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) throw new Error(`Operation journal refuses linked backup entry: ${entry.name}`);
            record(path.join(filePath, entry.name));
          }
          return;
        }
        if (!fileStat.isFile()) throw new Error(`Operation journal can record regular files only: ${filePath}`);
        journal.backups.push({ path: path.relative(resolvedBackupRoot, filePath).split(path.sep).join("/"), size: fileStat.size, sha256: sha256(filePath) });
      };
      record(backupPath);
      atomicWrite(journalPath, journal);
    },
    prepareMutation({ target, backup = null, link = false }) {
      prepareMutation(journal, journalPath, resolvedBackupRoot, { target, backup, link });
    },
    markApplied(target) {
      markAppliedMutation(journal, journalPath, target);
    },
    finish(state = "complete") {
      if (state === "complete") assertReadyToComplete(journal);
      journal.state = state;
      journal.finishedAt = new Date().toISOString();
      atomicWrite(journalPath, journal);
    }
  };
}

// Shell installers use this narrow CLI only after a backup copy has completed.
// It intentionally has no delete or recovery command.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, backupRoot, value, extra] = process.argv.slice(2);
  if (!backupRoot || !value || !["start", "record", "prepare", "applied", "track", "track-tree", "prepare-tree", "applied-tree", "finish", "rollback"].includes(command)) {
    console.error("Usage: node operation-journal.mjs <start|record|prepare|applied|track|track-tree|prepare-tree|applied-tree|finish|rollback> <backup-root> <operation|backup-path|target|complete|failed> [backup-path|source-root|allowed-root ...]");
    process.exitCode = 2;
  } else {
    const resolvedBackupRoot = path.resolve(backupRoot);
    if (command === "start") {
      createOperationJournal({ backupRoot: resolvedBackupRoot, operation: value });
    } else {
      const { journalPath, journal } = readInProgressJournal(resolvedBackupRoot);
      if (command === "finish") {
        if (!["complete", "failed"].includes(value)) throw new Error("Operation journal finish state must be complete or failed.");
        if (value === "complete") assertReadyToComplete(journal);
        journal.state = value;
        journal.finishedAt = new Date().toISOString();
        atomicWrite(journalPath, journal);
      } else if (command === "record") {
        const target = path.resolve(value);
        if (target !== resolvedBackupRoot && !target.startsWith(`${resolvedBackupRoot}${path.sep}`)) {
          throw new Error("Operation journal backup path escapes its backup root.");
        }
        const record = (filePath) => {
          const fileStat = fs.lstatSync(filePath);
          if (fileStat.isSymbolicLink()) throw new Error(`Operation journal refuses linked backup entry: ${filePath}`);
          if (fileStat.isDirectory()) {
            for (const entry of fs.readdirSync(filePath, { withFileTypes: true })) record(path.join(filePath, entry.name));
            return;
          }
          if (!fileStat.isFile()) throw new Error(`Operation journal can record regular files only: ${filePath}`);
          journal.backups.push({ path: path.relative(resolvedBackupRoot, filePath).split(path.sep).join("/"), size: fileStat.size, sha256: sha256(filePath) });
        };
        record(target);
        atomicWrite(journalPath, journal);
      } else if (command === "prepare") {
        prepareMutation(journal, journalPath, resolvedBackupRoot, { target: value, backup: extra });
      } else if (command === "applied") {
        markAppliedMutation(journal, journalPath, value);
      } else if (["track", "track-tree", "prepare-tree", "applied-tree"].includes(command)) {
        const target = path.resolve(value);
        const track = (trackedTarget, backupValue) => {
          const backup = assertBackupWithinRoot(resolvedBackupRoot, backupValue);
          const existing = journal.mutations.find((entry) => entry.target === trackedTarget);
          const mutation = { target: trackedTarget, backup: existing?.backup || backup, output: fingerprint(trackedTarget) };
          if (existing) Object.assign(existing, mutation);
          else journal.mutations.push(mutation);
        };
        if (command === "track") {
          track(target, extra);
        } else {
          if (!extra) throw new Error(`Operation journal ${command} requires a source root.`);
          const sourceRoot = path.resolve(extra);
          const backupRootForTree = command === "applied-tree" || !process.argv[6] || process.argv[6] === "-"
            ? null
            : path.resolve(process.argv[6]);
          const walk = (directory) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
              const sourcePath = path.join(directory, entry.name);
              if (entry.isSymbolicLink()) throw new Error(`Operation journal refuses linked source entry: ${sourcePath}`);
              if (entry.isDirectory()) walk(sourcePath);
              else if (entry.isFile()) {
                const relative = path.relative(sourceRoot, sourcePath);
                const targetPath = path.join(target, relative);
                const backupPath = backupRootForTree && fs.existsSync(path.join(backupRootForTree, relative))
                  ? path.join(backupRootForTree, relative)
                  : null;
                if (command === "prepare-tree") prepareMutation(journal, journalPath, resolvedBackupRoot, { target: targetPath, backup: backupPath });
                else if (command === "applied-tree") markAppliedMutation(journal, journalPath, targetPath);
                else track(targetPath, backupPath);
              }
            }
          };
          walk(sourceRoot);
        }
        atomicWrite(journalPath, journal);
        const failAfter = Number(process.env.AGENTCHEF_TEST_INSTALL_FAIL_AFTER_MUTATIONS || 0);
        if (
          process.env.AGENTCHEF_TEST_MODE === "1"
          && Number.isInteger(failAfter)
          && failAfter > 0
          && journal.mutations.length >= failAfter
        ) {
          throw new Error("Injected installer post-mutation failure");
        }
      } else {
        const allowedRoots = process.argv.slice(5).map((root) => path.resolve(root));
        if (allowedRoots.length === 0) throw new Error("Operation journal rollback requires at least one allowed root.");
        const unresolved = [];
        for (const mutation of [...journal.mutations].reverse()) {
          const target = path.resolve(mutation.target || "");
          if (!allowedRoots.some((root) => target === root || target.startsWith(`${root}${path.sep}`))) {
            unresolved.push(`refused target outside allowed roots: ${target}`);
            continue;
          }
          const current = fingerprint(target, { allowLink: Boolean(mutation.link) });
          const unmarkedCreate = mutation.output === null
            && mutation.before?.kind === "absent"
            && (current.kind === "file" || (mutation.link && current.kind === "link"))
            && !mutation.backup;
          if (!sameFingerprint(current, mutation.output) && !unmarkedCreate) {
            unresolved.push(`preserved changed target: ${target}`);
            continue;
          }
          // A link is removed as a link so the managed tree it points at is never touched.
          if (current.kind === "link") fs.unlinkSync(target);
          else fs.rmSync(target, { recursive: true, force: true });
          if (mutation.backup) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.cpSync(mutation.backup, target, { recursive: true, force: true });
          }
        }
        journal.reconciliation = { attemptedAt: new Date().toISOString(), unresolved };
        atomicWrite(journalPath, journal);
        if (unresolved.length > 0) {
          console.error(unresolved.join("\n"));
          process.exitCode = 1;
        }
      }
    }
  }
}
