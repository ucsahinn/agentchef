import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function atomicWrite(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporary, filePath);
}

function fingerprint(targetPath) {
  if (!fs.existsSync(targetPath)) return { kind: "absent" };
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`Operation journal refuses linked output: ${targetPath}`);
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
  return left?.kind === right?.kind && left?.sha256 === right?.sha256;
}

function readInProgressJournal(backupRoot) {
  const journalPath = path.join(backupRoot, ".codex-chef-operation-journal.json");
  if (!fs.existsSync(journalPath)) throw new Error(`Operation journal is missing: ${journalPath}`);
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (journal.state !== "in-progress") throw new Error(`Operation journal is already ${journal.state}: ${journalPath}`);
  journal.mutations ||= [];
  return { journalPath, journal };
}

export function createOperationJournal({ backupRoot, operation }) {
  if (!backupRoot || !operation) throw new TypeError("backupRoot and operation are required.");
  fs.mkdirSync(backupRoot, { recursive: true });
  const journalPath = path.join(backupRoot, ".codex-chef-operation-journal.json");
  if (fs.existsSync(journalPath)) {
    throw new Error(`Operation journal already exists: ${journalPath}`);
  }
  const journal = {
    schemaVersion: "codex-chef.operation-journal.v1",
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
        journal.backups.push({ path: path.relative(backupRoot, filePath).split(path.sep).join("/"), size: fileStat.size, sha256: sha256(filePath) });
      };
      record(backupPath);
      atomicWrite(journalPath, journal);
    },
    finish(state = "complete") {
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
  if (!backupRoot || !value || !["start", "record", "track", "track-tree", "finish", "rollback"].includes(command)) {
    console.error("Usage: node operation-journal.mjs <start|record|track|track-tree|finish|rollback> <backup-root> <operation|backup-path|target|complete|failed> [backup-path|source-root|allowed-root ...]");
    process.exitCode = 2;
  } else {
    const resolvedBackupRoot = path.resolve(backupRoot);
    if (command === "start") {
      createOperationJournal({ backupRoot: resolvedBackupRoot, operation: value });
    } else {
      const { journalPath, journal } = readInProgressJournal(resolvedBackupRoot);
      if (command === "finish") {
        if (!["complete", "failed"].includes(value)) throw new Error("Operation journal finish state must be complete or failed.");
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
      } else if (command === "track" || command === "track-tree") {
        const target = path.resolve(value);
        const track = (trackedTarget, backupValue) => {
          const backup = backupValue && backupValue !== "-" ? path.resolve(backupValue) : null;
          if (backup && (backup !== resolvedBackupRoot && !backup.startsWith(`${resolvedBackupRoot}${path.sep}`))) {
            throw new Error("Operation journal backup path escapes its backup root.");
          }
          const existing = journal.mutations.find((entry) => entry.target === trackedTarget);
          const mutation = { target: trackedTarget, backup: existing?.backup || backup, output: fingerprint(trackedTarget) };
          if (existing) Object.assign(existing, mutation);
          else journal.mutations.push(mutation);
        };
        if (command === "track") {
          track(target, extra);
        } else {
          if (!extra) throw new Error("Operation journal track-tree requires a source root.");
          const sourceRoot = path.resolve(extra);
          const backupRootForTree = process.argv[6] && process.argv[6] !== "-" ? path.resolve(process.argv[6]) : null;
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
                track(targetPath, backupPath);
              }
            }
          };
          walk(sourceRoot);
        }
        atomicWrite(journalPath, journal);
        const failAfter = Number(process.env.CODEX_CHEF_TEST_INSTALL_FAIL_AFTER_MUTATIONS || 0);
        if (
          process.env.CODEX_CHEF_TEST_MODE === "1"
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
          const current = fingerprint(target);
          if (!sameFingerprint(current, mutation.output)) {
            unresolved.push(`preserved changed target: ${target}`);
            continue;
          }
          fs.rmSync(target, { recursive: true, force: true });
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
