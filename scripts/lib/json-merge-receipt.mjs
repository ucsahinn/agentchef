// Sidecar receipts record exactly which entries AgentChef added to a JSON file
// it does not own (Claude Code settings.json and .claude.json). The vendor may
// rewrite those files at any time, so ownership lives beside the file, not in
// it: each receipt names the file, its hash before and after the merge, and
// the added entries by JSON pointer plus value hash. Removal only takes back
// entries whose current value still matches the recorded hash.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const receiptSchemaVersion = "agentchef.json-merge-receipt.v1";
export const legacyReceiptSchemaVersion = "codex-chef.json-merge-receipt.v1";

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

export function valueSha256(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export function fileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function readJsonOrDefault(filePath, fallback) {
  if (!fs.existsSync(filePath)) return structuredClone(fallback);
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing to merge into a linked or non-regular file: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  if (text.trim() === "") return structuredClone(fallback);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Merge target must hold a JSON object: ${filePath}`);
  }
  return parsed;
}

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

export function pointerFor(segments) {
  return `/${segments.map(escapePointerSegment).join("/")}`;
}

export function pointerSegments(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function getAtPointer(document, pointer) {
  let current = document;
  for (const segment of pointerSegments(pointer)) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

export function createReceipt({ product, target, beforeSha256, afterSha256, entries, backupPath = null }) {
  return {
    schemaVersion: receiptSchemaVersion,
    product,
    target: path.resolve(target),
    createdAt: new Date().toISOString(),
    beforeSha256,
    afterSha256,
    backupPath,
    entries
  };
}

export function writeReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const temporary = `${receiptPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporary, receiptPath);
}

export function readReceipt(receiptPath) {
  if (!fs.existsSync(receiptPath)) return null;
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8").replace(/^\uFEFF/, ""));
  if (![receiptSchemaVersion, legacyReceiptSchemaVersion].includes(receipt?.schemaVersion) || !Array.isArray(receipt.entries)) {
    throw new Error(`Unsupported merge receipt: ${receiptPath}`);
  }
  return receipt;
}

// Inspect whether each recorded entry is still present and unchanged.
export function inspectReceipt(receipt, document) {
  return receipt.entries.map((entry) => {
    if (entry.kind === "container") {
      const container = getAtPointer(document, entry.pointer);
      return { ...entry, status: container && typeof container === "object" ? "present" : "missing" };
    }
    if (entry.kind === "array-item") {
      const array = getAtPointer(document, entry.pointer);
      const present = Array.isArray(array) && array.some((item) => valueSha256(item) === entry.valueSha256);
      return { ...entry, status: present ? "present" : "missing" };
    }
    const current = getAtPointer(document, entry.pointer);
    if (current === undefined) return { ...entry, status: "missing" };
    return { ...entry, status: valueSha256(current) === entry.valueSha256 ? "present" : "changed" };
  });
}

function isEmptyContainer(value) {
  if (Array.isArray(value)) return value.length === 0;
  return Boolean(value) && typeof value === "object" && Object.keys(value).length === 0;
}

// Remove only entries that are still exactly what the receipt recorded.
// Containers the merge created are pruned last, and only when they are empty
// again; a container the user filled with their own content is kept.
export function removeRecordedEntries(receipt, document) {
  const next = structuredClone(document);
  const removed = [];
  const kept = [];
  const containers = receipt.entries.filter((entry) => entry.kind === "container");
  for (const entry of receipt.entries.filter((entry) => entry.kind !== "container")) {
    if (entry.kind === "array-item") {
      const segments = pointerSegments(entry.pointer);
      const parent = getAtPointer(next, pointerFor(segments));
      if (!Array.isArray(parent)) {
        kept.push({ ...entry, reason: "array-missing" });
        continue;
      }
      const index = parent.findIndex((item) => valueSha256(item) === entry.valueSha256);
      if (index === -1) {
        kept.push({ ...entry, reason: "value-missing" });
        continue;
      }
      parent.splice(index, 1);
      removed.push(entry);
      continue;
    }
    const segments = pointerSegments(entry.pointer);
    const key = segments.pop();
    const parent = getAtPointer(next, pointerFor(segments));
    if (!parent || typeof parent !== "object" || !(key in parent)) {
      kept.push({ ...entry, reason: "key-missing" });
      continue;
    }
    if (valueSha256(parent[key]) !== entry.valueSha256) {
      kept.push({ ...entry, reason: "user-changed" });
      continue;
    }
    delete parent[key];
    removed.push(entry);
  }
  // Deepest containers first so an emptied list lets its parent empty too.
  for (const entry of [...containers].sort((left, right) => right.pointer.length - left.pointer.length)) {
    const segments = pointerSegments(entry.pointer);
    const key = segments.pop();
    const parent = segments.length === 0 ? next : getAtPointer(next, pointerFor(segments));
    if (!parent || typeof parent !== "object" || !(key in parent)) {
      kept.push({ ...entry, reason: "key-missing" });
      continue;
    }
    if (!isEmptyContainer(parent[key])) {
      kept.push({ ...entry, reason: "user-content" });
      continue;
    }
    delete parent[key];
    removed.push(entry);
  }
  return { next, removed, kept };
}
