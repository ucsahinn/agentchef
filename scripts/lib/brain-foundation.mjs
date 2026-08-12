import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const BRAIN_SCHEMA_VERSION = "codex-chef.brain.v1";
export const BRAIN_CANDIDATE_SCHEMA_VERSION = "codex-chef.brain-candidate.v1";
export const BRAIN_CONTEXT_SCHEMA_VERSION = "codex-chef.brain-context-pack.v1";
export const OBSIDIAN_URI_SCHEMA_VERSION = "codex-chef.obsidian-uri.v1";

const NOTE_TYPES = new Set(["capture", "project", "goal", "decision", "knowledge", "research", "profile", "preference", "active-thread", "session-summary"]);
const PRIVACY_CLASSES = new Set(["public", "local", "restricted"]);
const CONFIDENCE_CLASSES = new Set(["confirmed", "observed", "inferred", "unverified"]);
const RETENTION_CLASSES = new Set(["permanent", "project", "review-90d", "ephemeral-30d"]);

export const BRAIN_REQUIRED_FILES = Object.freeze([
  ".codex-chef-brain.json",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "brain.config.json",
  "00-inbox/README.md",
  "10-command-center/dashboard.md",
  "20-goals/README.md",
  "30-projects/README.md",
  "40-knowledge/README.md",
  "50-research/README.md",
  "60-decisions/README.md",
  "70-personal/README.md",
  "80-memory/profile.md",
  "80-memory/current-context.md",
  "80-memory/active-threads.md",
  "80-memory/decisions.md",
  "80-memory/session-index.md",
  "90-archive/README.md",
  "templates/note.md",
  "10-command-center/system-map.canvas",
  "10-command-center/control-brain-flow.canvas",
  "10-command-center/portfolio-map.canvas",
  ".obsidian/core-plugins.json"
]);

function normalize(filePath) {
  return path.resolve(filePath);
}

function samePath(left, right) {
  const normalizeCase = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  return normalizeCase(normalize(left)) === normalizeCase(normalize(right));
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertRelativeVaultPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error("Brain operation requires a non-empty relative vault path.");
  }
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("\0") || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("//")) {
    throw new Error(`Brain path escapes the vault: ${relativePath}`);
  }
  for (const part of normalized.split("/")) {
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || /[. ]$/.test(part) || part.includes(":")) {
      throw new Error(`Brain path is unsafe on Windows: ${relativePath}`);
    }
  }
  return normalized;
}

function resolveInside(root, relativePath) {
  const normalized = assertRelativeVaultPath(relativePath);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const prefix = `${path.resolve(root)}${path.sep}`;
  const normalizeCase = (value) => process.platform === "win32" ? value.toLowerCase() : value;
  if (!normalizeCase(absolute).startsWith(normalizeCase(prefix))) throw new Error(`Brain path escapes the vault: ${relativePath}`);
  return absolute;
}

export function buildObsidianOpenUri({ target, note }) {
  const root = assertSafeBrainTarget(target);
  const relativePath = assertRelativeVaultPath(note);
  if (!/\.(?:md|canvas)$/i.test(relativePath)) throw new Error("Obsidian URI accepts an existing Markdown or Canvas note only.");
  const absolute = resolveInside(root, relativePath);
  assertNoReparseBetween(root, absolute);
  if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) throw new Error(`Brain note does not exist: ${relativePath}`);
  const config = JSON.parse(fs.readFileSync(path.join(root, "brain.config.json"), "utf8"));
  if (typeof config.vaultName !== "string" || config.vaultName.trim().length === 0) throw new Error("Brain config requires vaultName for Obsidian URI generation.");
  const vault = config.vaultName.trim();
  return {
    schemaVersion: OBSIDIAN_URI_SCHEMA_VERSION,
    action: "open",
    vault,
    note: relativePath,
    uri: `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(relativePath)}`
  };
}

function assertNoReparseBetween(root, destination) {
  const relative = path.relative(root, destination);
  let current = path.resolve(root);
  for (const part of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Brain path crosses a symbolic link, junction, or non-directory: ${current}`);
  }
}

function assertNoSecretLikeContent(text) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
    /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|connection[_-]?string)\s*[:=]\s*[^\s]{12,}/i,
    /\b(?:sk-(?:proj-)?|gh[pousr]_)[A-Za-z0-9_-]{16,}\b/
  ];
  if (patterns.some((pattern) => pattern.test(text))) throw new Error("Brain content contains a secret-like value and was rejected.");
}

function safeSlug(value) {
  const slug = String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || "note";
}

function renderCandidate(candidate, now) {
  const lines = [
    "---",
    `brain_schema: ${JSON.stringify("codex-chef.brain-note.v1")}`,
    `id: ${JSON.stringify(`brn_${candidate.candidateId}`)}`,
    `type: ${JSON.stringify(candidate.type)}`,
    `title: ${JSON.stringify(candidate.title)}`,
    `project_id: ${JSON.stringify(candidate.projectId)}`,
    `status: ${JSON.stringify("inbox")}`,
    `privacy: ${JSON.stringify(candidate.privacy)}`,
    `confidence: ${JSON.stringify(candidate.confidence)}`,
    `retention: ${JSON.stringify(candidate.retention)}`,
    `created: ${JSON.stringify(now)}`,
    `updated: ${JSON.stringify(now)}`,
    `source_refs: ${JSON.stringify(candidate.sourceRefs)}`,
    `agent_roles: ${JSON.stringify(candidate.agentRoles || [])}`,
    "---",
    "",
    `# ${candidate.title}`,
    "",
    candidate.bodyMarkdown.trim(),
    ""
  ];
  return lines.join("\n");
}

function parseFlatFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const property = line.match(/^([a-z0-9_]+):\s*(.*)$/i);
    if (!property) return null;
    const [, key, raw] = property;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return { data, body: text.slice(match[0].length) };
}

function walkVaultContent(root) {
  if (!fs.existsSync(root)) return [];
  return walkFiles(root).filter((absolute) => {
    const relative = toPosix(path.relative(root, absolute));
    return !relative.startsWith(".brain/") && !relative.startsWith(".obsidian/");
  });
}

export function assertSafeBrainTarget(target) {
  if (!target || typeof target !== "string") throw new TypeError("Brain target must be a path string.");
  if (/^(?:\\\\|\/\/)/.test(target)) throw new Error("Brain target cannot be a network or UNC path.");
  if (/^(?:\\\\\?\\|\\\\\.\\)/.test(target)) throw new Error("Brain target cannot use a Windows device namespace.");
  const resolved = normalize(target);
  const parsed = path.parse(resolved);
  if (samePath(resolved, parsed.root)) throw new Error("Brain target cannot be a filesystem root.");
  if (samePath(resolved, os.homedir())) throw new Error("Brain target cannot be the user profile root.");
  if (path.basename(resolved).trim().length === 0) throw new Error("Brain target must name a dedicated directory.");

  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) throw new Error("Brain target cannot be a symbolic link or junction.");
    if (!stat.isDirectory()) throw new Error("Brain target exists and is not a directory.");
  }
  return resolved;
}

export function buildBrainPlan({ templateRoot, target }) {
  const sourceRoot = normalize(templateRoot);
  const destinationRoot = assertSafeBrainTarget(target);
  if (samePath(sourceRoot, destinationRoot)) throw new Error("Brain template source and target must be different directories.");
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Brain template root does not exist: ${sourceRoot}`);
  }

  const operations = [];
  const identical = [];
  const conflicts = [];
  for (const sourcePath of walkFiles(sourceRoot)) {
    const relativePath = path.relative(sourceRoot, sourcePath).split(path.sep).join("/");
    const destinationPath = path.join(destinationRoot, ...relativePath.split("/"));
    const sourceBuffer = fs.readFileSync(sourcePath);
    const entry = {
      relativePath,
      sourcePath,
      destinationPath,
      sha256: sha256(sourceBuffer),
      status: "create"
    };
    if (fs.existsSync(destinationPath)) {
      const destinationStat = fs.lstatSync(destinationPath);
      if (!destinationStat.isFile() || destinationStat.isSymbolicLink()) {
        entry.status = "conflict";
        conflicts.push(entry);
      } else if (fs.readFileSync(destinationPath).equals(sourceBuffer)) {
        entry.status = "identical";
        identical.push(entry);
      } else {
        entry.status = "conflict";
        conflicts.push(entry);
      }
    } else {
      operations.push(entry);
    }
  }

  return { templateRoot: sourceRoot, target: destinationRoot, operations, identical, conflicts };
}

export function applyBrainPlan(plan) {
  assertSafeBrainTarget(plan.target);
  const created = [];
  for (const entry of plan.operations) {
    const destinationPath = resolveInside(plan.target, entry.relativePath);
    if (!samePath(destinationPath, entry.destinationPath)) throw new Error(`Brain plan destination changed after preview: ${entry.relativePath}`);
    assertNoReparseBetween(plan.target, destinationPath);
    const currentSourceHash = sha256(fs.readFileSync(entry.sourcePath));
    if (currentSourceHash !== entry.sha256) throw new Error(`Brain template changed after preview: ${entry.relativePath}`);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(entry.sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    created.push(entry.relativePath);
  }
  return {
    target: plan.target,
    created,
    identical: plan.identical.map((entry) => entry.relativePath),
    conflicts: plan.conflicts.map((entry) => entry.relativePath),
    overwritten: []
  };
}

export function buildCapturePlan({ target, candidate, now = new Date().toISOString() }) {
  const root = assertSafeBrainTarget(target);
  if (!candidate || candidate.schemaVersion !== BRAIN_CANDIDATE_SCHEMA_VERSION) throw new Error(`Candidate must use ${BRAIN_CANDIDATE_SCHEMA_VERSION}.`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.candidateId || "")) throw new Error("Candidate ID must be a UUID.");
  if (!NOTE_TYPES.has(candidate.type)) throw new Error("Candidate note type is unsupported.");
  if (typeof candidate.title !== "string" || candidate.title.trim().length < 3 || candidate.title.length > 160) throw new Error("Candidate title must be 3-160 characters.");
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(candidate.projectId || "")) throw new Error("Candidate projectId is invalid.");
  if (!PRIVACY_CLASSES.has(candidate.privacy) || !CONFIDENCE_CLASSES.has(candidate.confidence) || !RETENTION_CLASSES.has(candidate.retention)) throw new Error("Candidate policy metadata is invalid.");
  if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length === 0 || candidate.sourceRefs.some((ref) => typeof ref !== "string" || /^[A-Za-z]:[\\/]|^\\\\/.test(ref))) throw new Error("Candidate sourceRefs must contain portable provenance.");
  if (candidate.agentRoles !== undefined && (!Array.isArray(candidate.agentRoles) || candidate.agentRoles.length > 12 || candidate.agentRoles.some((role) => typeof role !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(role)) || new Set(candidate.agentRoles).size !== candidate.agentRoles.length)) {
    throw new Error("Candidate agentRoles must be distinct lowercase role IDs.");
  }
  if (typeof candidate.bodyMarkdown !== "string" || candidate.bodyMarkdown.trim().length === 0 || candidate.bodyMarkdown.length > 100_000) throw new Error("Candidate bodyMarkdown must be 1-100000 characters.");
  const content = renderCandidate(candidate, now);
  assertNoSecretLikeContent(content);
  const relativePath = `00-inbox/captures/${safeSlug(candidate.title)}-${candidate.candidateId}.md`;
  const destinationPath = resolveInside(root, relativePath);
  let status = "create";
  if (fs.existsSync(destinationPath)) status = sha256(fs.readFileSync(destinationPath)) === sha256(Buffer.from(content)) ? "identical" : "conflict";
  return { schemaVersion: "codex-chef.brain-operation-plan.v1", kind: "capture", target: root, relativePath, destinationPath, content, sha256: sha256(Buffer.from(content)), status, approvalRequired: true };
}

export function applyCapturePlan(plan) {
  assertSafeBrainTarget(plan.target);
  const destination = resolveInside(plan.target, plan.relativePath);
  assertNoReparseBetween(plan.target, destination);
  if (plan.status === "identical") {
    if (!fs.existsSync(destination)) throw new Error(`Identical Brain capture disappeared after preview: ${plan.relativePath}`);
    const stat = fs.lstatSync(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || sha256(fs.readFileSync(destination)) !== plan.sha256) {
      throw new Error(`Identical Brain capture changed after preview: ${plan.relativePath}`);
    }
    return { status: "already-applied", relativePath: plan.relativePath, sha256: plan.sha256 };
  }
  if (plan.status === "conflict") throw new Error(`Brain capture conflicts with an existing note: ${plan.relativePath}`);
  assertNoSecretLikeContent(plan.content);
  if (sha256(Buffer.from(plan.content)) !== plan.sha256) throw new Error("Brain capture changed after preview.");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, plan.content, { encoding: "utf8", flag: "wx" });
  return { status: "created", relativePath: plan.relativePath, sha256: plan.sha256 };
}

export function retrieveBrainNotes({ target, projectId, agentRole = null, query = "", maxNotes = 8, maxTotalChars = 20_000, maxExcerptChars = 5_000 }) {
  const root = assertSafeBrainTarget(target);
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const notes = [];
  for (const absolute of walkVaultContent(root)) {
    const relativePath = toPosix(path.relative(root, absolute));
    if (!relativePath.endsWith(".md") || relativePath.startsWith("90-archive/") || relativePath.startsWith("templates/")) continue;
    const text = fs.readFileSync(absolute, "utf8");
    const parsed = parseFlatFrontmatter(text);
    if (!parsed || parsed.data.brain_schema !== "codex-chef.brain-note.v1") continue;
    if (parsed.data.project_id !== projectId || parsed.data.privacy === "restricted") continue;
    const agentRoles = Array.isArray(parsed.data.agent_roles) ? parsed.data.agent_roles : [];
    if (agentRole && !agentRoles.includes("shared") && !agentRoles.includes(agentRole)) continue;
    const haystack = `${parsed.data.title || ""}\n${parsed.body}`.toLocaleLowerCase();
    const score = terms.length === 0 ? 1 : terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    if (score === 0) continue;
    notes.push({
      id: parsed.data.id,
      relativePath,
      title: parsed.data.title,
      type: parsed.data.type,
      projectId: parsed.data.project_id,
      privacy: parsed.data.privacy,
      confidence: parsed.data.confidence,
      updated: parsed.data.updated,
      sourceRefs: parsed.data.source_refs || [],
      agentRoles,
      excerpt: parsed.body.slice(0, maxExcerptChars),
      sha256: sha256(Buffer.from(text)),
      score,
      truncated: parsed.body.length > maxExcerptChars
    });
  }
  notes.sort((a, b) => b.score - a.score || String(b.updated).localeCompare(String(a.updated)) || a.relativePath.localeCompare(b.relativePath));
  const selected = [];
  let totalChars = 0;
  for (const note of notes.slice(0, maxNotes)) {
    const remaining = maxTotalChars - totalChars;
    if (remaining <= 0) break;
    const excerpt = note.excerpt.slice(0, remaining);
    selected.push({ ...note, excerpt, truncated: note.truncated || excerpt.length < note.excerpt.length });
    totalChars += excerpt.length;
  }
  return { schemaVersion: BRAIN_CONTEXT_SCHEMA_VERSION, projectId, agentRole, query, notes: selected, totalChars, truncated: selected.length < notes.length, untrusted: true };
}

export function buildBackupPlan({ target, backupId = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}` }) {
  const root = assertSafeBrainTarget(target);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(backupId)) throw new Error("Backup ID is invalid.");
  const backupRoot = resolveInside(root, `.brain/backups/${backupId}`);
  if (fs.existsSync(backupRoot)) throw new Error(`Backup already exists: ${backupId}`);
  const files = walkVaultContent(root).map((absolute) => {
    const relativePath = toPosix(path.relative(root, absolute));
    return { relativePath, sourcePath: absolute, sha256: sha256(fs.readFileSync(absolute)) };
  });
  return { schemaVersion: "codex-chef.brain-backup-plan.v1", kind: "backup", target: root, backupId, backupRoot, files, approvalRequired: true };
}

export function applyBackupPlan(plan) {
  assertSafeBrainTarget(plan.target);
  if (fs.existsSync(plan.backupRoot)) throw new Error(`Backup already exists: ${plan.backupId}`);
  for (const entry of plan.files) {
    const source = resolveInside(plan.target, entry.relativePath);
    if (sha256(fs.readFileSync(source)) !== entry.sha256) throw new Error(`Vault changed after backup preview: ${entry.relativePath}`);
    const destination = resolveInside(plan.backupRoot, entry.relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
  const manifest = { schemaVersion: "codex-chef.brain-backup.v1", backupId: plan.backupId, createdAt: new Date().toISOString(), files: plan.files.map(({ relativePath, sha256: hash }) => ({ relativePath, sha256: hash })) };
  fs.writeFileSync(path.join(plan.backupRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { backupId: plan.backupId, fileCount: plan.files.length };
}

export function buildRestorePlan({ target, backupId }) {
  const root = assertSafeBrainTarget(target);
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(backupId || "")) throw new Error("Backup ID is invalid.");
  const backupRoot = resolveInside(root, `.brain/backups/${backupId}`);
  const manifestPath = path.join(backupRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Backup manifest is missing: ${backupId}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== "codex-chef.brain-backup.v1" || !Array.isArray(manifest.files)) throw new Error("Backup manifest is invalid.");
  const operations = manifest.files.map((entry) => {
    const sourcePath = resolveInside(backupRoot, entry.relativePath);
    const destinationPath = resolveInside(root, entry.relativePath);
    const backupHash = sha256(fs.readFileSync(sourcePath));
    if (backupHash !== entry.sha256) throw new Error(`Backup file hash mismatch: ${entry.relativePath}`);
    const currentHash = fs.existsSync(destinationPath) && fs.lstatSync(destinationPath).isFile() ? sha256(fs.readFileSync(destinationPath)) : null;
    return { relativePath: entry.relativePath, sourcePath, destinationPath, backupHash, currentHash, status: currentHash === backupHash ? "identical" : currentHash === null ? "create" : "replace" };
  }).filter((entry) => entry.status !== "identical");
  return { schemaVersion: "codex-chef.brain-restore-plan.v1", kind: "restore", target: root, backupId, operations, approvalRequired: true };
}

export function applyRestorePlan(plan) {
  assertSafeBrainTarget(plan.target);
  if (plan.operations.length === 0) return { backupId: plan.backupId, restored: [], rollbackBackupId: null };
  const backupRoot = resolveInside(plan.target, `.brain/backups/${plan.backupId}`);
  const verified = plan.operations.map((entry) => {
    const destination = resolveInside(plan.target, entry.relativePath);
    const source = resolveInside(backupRoot, entry.relativePath);
    if (!samePath(destination, entry.destinationPath) || !samePath(source, entry.sourcePath)) throw new Error(`Brain restore plan path changed after preview: ${entry.relativePath}`);
    assertNoReparseBetween(plan.target, destination);
    const currentHash = fs.existsSync(destination) && fs.lstatSync(destination).isFile() ? sha256(fs.readFileSync(destination)) : null;
    if (currentHash !== entry.currentHash) throw new Error(`Vault changed after restore preview: ${entry.relativePath}`);
    if (sha256(fs.readFileSync(source)) !== entry.backupHash) throw new Error(`Backup changed after restore preview: ${entry.relativePath}`);
    return { ...entry, destinationPath: destination, sourcePath: source };
  });
  const rollbackBackupId = `rollback-${crypto.randomUUID()}`;
  applyBackupPlan(buildBackupPlan({ target: plan.target, backupId: rollbackBackupId }));
  const restored = [];
  const applied = [];
  try {
    for (const entry of verified) {
      const destination = entry.destinationPath;
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.brain-restore-${crypto.randomUUID()}.tmp`;
      fs.copyFileSync(entry.sourcePath, temporary, fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporary, destination);
      applied.push({ ...entry, outputHash: entry.backupHash, existedBefore: entry.currentHash !== null });
      restored.push(entry.relativePath);
    }
  } catch (restoreError) {
    const rollbackFailures = [];
    for (const entry of applied.reverse()) {
      try {
        const currentHash = fs.existsSync(entry.destinationPath) && fs.lstatSync(entry.destinationPath).isFile()
          ? sha256(fs.readFileSync(entry.destinationPath))
          : null;
        if (currentHash !== entry.outputHash) {
          rollbackFailures.push(`${entry.relativePath}: destination changed after restore write`);
          continue;
        }
        if (entry.existedBefore) {
          const original = resolveInside(plan.target, `.brain/backups/${rollbackBackupId}/${entry.relativePath}`);
          const temporary = `${entry.destinationPath}.brain-rollback-${crypto.randomUUID()}.tmp`;
          fs.copyFileSync(original, temporary, fs.constants.COPYFILE_EXCL);
          fs.renameSync(temporary, entry.destinationPath);
        } else {
          fs.unlinkSync(entry.destinationPath);
        }
      } catch (rollbackError) {
        rollbackFailures.push(`${entry.relativePath}: ${rollbackError.message}`);
      }
    }
    const suffix = rollbackFailures.length > 0
      ? ` Restore rollback incomplete: ${rollbackFailures.join("; ")}`
      : " Restore rollback completed.";
    throw new Error(`Brain restore failed: ${restoreError.message}.${suffix}`);
  }
  return { backupId: plan.backupId, restored, rollbackBackupId };
}

function listCanonicalBrainNotes(root) {
  const notes = [];
  for (const absolute of walkVaultContent(root)) {
    const relativePath = toPosix(path.relative(root, absolute));
    if (!relativePath.endsWith(".md") || relativePath.startsWith("templates/")) continue;
    const parsed = parseFlatFrontmatter(fs.readFileSync(absolute, "utf8"));
    if (!parsed || parsed.data.brain_schema !== "codex-chef.brain-note.v1") continue;
    notes.push({
      relativePath,
      data: parsed.data,
      body: parsed.body
    });
  }
  return notes.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function resolveBrainLink(fromPath, rawTarget, knownPaths) {
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), rawTarget));
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) return null;
  for (const candidate of [normalized, `${normalized}.md`, `${normalized}.canvas`]) {
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

export function auditBrainVault({ target, now = new Date().toISOString(), staleAfterDays = 30 } = {}) {
  const root = assertSafeBrainTarget(target);
  if (!Number.isInteger(staleAfterDays) || staleAfterDays < 1 || staleAfterDays > 3660) {
    throw new RangeError("staleAfterDays must be an integer between 1 and 3660.");
  }
  const asOf = new Date(now);
  if (!Number.isFinite(asOf.getTime())) throw new TypeError("now must be a valid ISO timestamp.");

  const validation = validateBrainVault(root);
  const notes = listCanonicalBrainNotes(root);
  const notePaths = new Set(notes.map((note) => note.relativePath));
  const linkTargets = new Set(walkVaultContent(root).filter((absolute) => /\.(?:md|canvas)$/i.test(absolute)).map((absolute) => toPosix(path.relative(root, absolute))));
  const incoming = new Map(notes.map((note) => [note.relativePath, 0]));
  const resolvedLinks = [];
  const brokenLinks = [];
  const stale = [];

  for (const note of notes) {
    const updatedAt = Date.parse(note.data.updated);
    const ageDays = Number.isFinite(updatedAt) ? Math.floor(Math.max(0, asOf.getTime() - updatedAt) / 86_400_000) : null;
    if (ageDays !== null && ageDays > staleAfterDays) {
      stale.push({ relativePath: note.relativePath, updated: note.data.updated, ageDays });
    }
    for (const match of note.body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const target = match[1].trim();
      if (!target) continue;
      const resolved = resolveBrainLink(note.relativePath, target, linkTargets);
      if (!resolved) {
        brokenLinks.push({ from: note.relativePath, target });
        continue;
      }
      incoming.set(resolved, (incoming.get(resolved) || 0) + 1);
      resolvedLinks.push({ from: note.relativePath, to: resolved });
    }
  }

  const orphanNotes = notes
    .filter((note) => incoming.get(note.relativePath) === 0)
    .map((note) => note.relativePath);
  const projectIds = [...new Set(notes.map((note) => note.data.project_id).filter((projectId) => typeof projectId === "string"))].sort();

  return {
    schemaVersion: "codex-chef.brain-audit.v1",
    ok: validation.ok && brokenLinks.length === 0,
    target: root,
    asOf: asOf.toISOString(),
    staleAfterDays,
    errors: validation.errors,
    notes: { total: notes.length, projectIds },
    freshness: { stale },
    relationships: { resolvedLinks, brokenLinks, orphanNotes }
  };
}

export function validateBrainVault(target) {
  const root = assertSafeBrainTarget(target);
  const errors = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return { ok: false, target: root, errors: ["Brain vault directory is missing."] };
  }

  for (const relativePath of BRAIN_REQUIRED_FILES) {
    const absolute = path.join(root, ...relativePath.split("/"));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      errors.push(`Missing required Brain file: ${relativePath}`);
    }
  }

  for (const relativePath of [".codex-chef-brain.json", "brain.config.json"]) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
      if (parsed.schemaVersion !== BRAIN_SCHEMA_VERSION) {
        errors.push(`${relativePath} must use schemaVersion ${BRAIN_SCHEMA_VERSION}.`);
      }
    } catch (error) {
      errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    }
  }

  const noteIds = new Set();
  for (const absolute of walkVaultContent(root)) {
    if (!/\.(?:md|json|gitignore)$/.test(absolute) && path.basename(absolute) !== ".gitignore") continue;
    const text = fs.readFileSync(absolute, "utf8");
    const relativePath = path.relative(root, absolute).split(path.sep).join("/");
    if (/\{\{[^}]+\}\}/.test(text)) errors.push(`Unresolved placeholder in ${relativePath}.`);
    if (/\b(?:MEM0_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*[:=]\s*[^\s]+/i.test(text)) {
      errors.push(`Secret-like value in ${relativePath}.`);
    }
    if (relativePath.startsWith("templates/") || !relativePath.endsWith(".md") || !/^---\r?\n/.test(text)) continue;
    const note = parseFlatFrontmatter(text);
    if (!note) {
      if (/^brain_schema:/m.test(text)) errors.push(`${relativePath} has malformed Brain frontmatter.`);
      continue;
    }
    if (note.data.brain_schema !== "codex-chef.brain-note.v1") continue;
    const required = ["id", "type", "title", "project_id", "status", "privacy", "confidence", "retention", "created", "updated", "source_refs"];
    for (const key of required) if (!(key in note.data)) errors.push(`${relativePath} is missing required Brain note field ${key}.`);
    if (typeof note.data.id !== "string" || !/^brn_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(note.data.id)) {
      errors.push(`${relativePath} has invalid Brain note id.`);
    } else if (noteIds.has(note.data.id)) {
      errors.push(`${relativePath} duplicates Brain note id ${note.data.id}.`);
    } else {
      noteIds.add(note.data.id);
    }
    if (!NOTE_TYPES.has(note.data.type)) errors.push(`${relativePath} has invalid Brain note type.`);
    if (typeof note.data.title !== "string" || note.data.title.length < 1 || note.data.title.length > 160) errors.push(`${relativePath} has invalid Brain note title.`);
    if (typeof note.data.project_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(note.data.project_id)) errors.push(`${relativePath} has invalid project_id.`);
    if (typeof note.data.status !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(note.data.status)) errors.push(`${relativePath} has invalid status.`);
    if (!PRIVACY_CLASSES.has(note.data.privacy)) errors.push(`${relativePath} has invalid privacy.`);
    if (!CONFIDENCE_CLASSES.has(note.data.confidence)) errors.push(`${relativePath} has invalid confidence.`);
    if (!RETENTION_CLASSES.has(note.data.retention)) errors.push(`${relativePath} has invalid retention.`);
    const created = Date.parse(note.data.created);
    const updated = Date.parse(note.data.updated);
    if (!Number.isFinite(created)) errors.push(`${relativePath} has invalid created timestamp.`);
    if (!Number.isFinite(updated)) errors.push(`${relativePath} has invalid updated timestamp.`);
    if (Number.isFinite(created) && Number.isFinite(updated) && updated < created) errors.push(`${relativePath} has updated before created.`);
    if (!Array.isArray(note.data.source_refs) || note.data.source_refs.length < 1 || note.data.source_refs.length > 32 || note.data.source_refs.some((ref) => typeof ref !== "string" || ref.length < 3 || ref.length > 500)) {
      errors.push(`${relativePath} has invalid source_refs.`);
    }
    if (note.data.agent_roles !== undefined && (!Array.isArray(note.data.agent_roles) || note.data.agent_roles.length > 12 || note.data.agent_roles.some((role) => typeof role !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(role)) || new Set(note.data.agent_roles).size !== note.data.agent_roles.length)) {
      errors.push(`${relativePath} has invalid agent_roles.`);
    }
  }

  return { ok: errors.length === 0, target: root, errors };
}
