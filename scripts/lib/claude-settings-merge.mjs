// Additive merge of an AgentChef fragment into Claude Code's settings.json.
// Rules: never remove or reorder anything the user has; never overwrite an
// existing scalar; append missing permission rules, missing hook handlers, and
// missing env keys; report every addition as a receipt entry.
import { pointerFor, valueSha256 } from "./json-merge-receipt.mjs";

const permissionLists = ["allow", "ask", "deny"];

function ensureObject(parent, key) {
  if (parent[key] === undefined || parent[key] === null) parent[key] = {};
  if (typeof parent[key] !== "object" || Array.isArray(parent[key])) {
    throw new Error(`settings.json key ${key} must be an object to merge into it`);
  }
  return parent[key];
}

function ensureArray(parent, key) {
  if (parent[key] === undefined || parent[key] === null) parent[key] = [];
  if (!Array.isArray(parent[key])) throw new Error(`settings.json key ${key} must be an array to merge into it`);
  return parent[key];
}

function hookHandlerKey(handler) {
  return valueSha256({ type: handler.type, command: handler.command ?? null, url: handler.url ?? null });
}

export function planSettingsMerge(current, fragment) {
  const next = structuredClone(current);
  const entries = [];
  const skipped = [];

  if (fragment.permissions) {
    const permissions = ensureObject(next, "permissions");
    for (const list of permissionLists) {
      const wanted = fragment.permissions[list];
      if (!Array.isArray(wanted) || wanted.length === 0) continue;
      const existing = ensureArray(permissions, list);
      const known = new Set(existing.map((rule) => String(rule)));
      // A rule already present in a stricter list must not be re-added below it.
      const stricter = list === "allow" ? ["deny", "ask"] : list === "ask" ? ["deny"] : [];
      const stricterRules = new Set(stricter.flatMap((name) => Array.isArray(permissions[name]) ? permissions[name].map(String) : []));
      for (const rule of wanted) {
        if (known.has(rule)) {
          skipped.push({ pointer: pointerFor(["permissions", list]), value: rule, reason: "already-present" });
          continue;
        }
        if (stricterRules.has(rule)) {
          skipped.push({ pointer: pointerFor(["permissions", list]), value: rule, reason: "stricter-list-wins" });
          continue;
        }
        existing.push(rule);
        known.add(rule);
        entries.push({ kind: "array-item", pointer: pointerFor(["permissions", list]), valueSha256: valueSha256(rule), preview: rule });
      }
    }
  }

  if (fragment.env) {
    const env = ensureObject(next, "env");
    for (const [key, value] of Object.entries(fragment.env)) {
      if (key in env) {
        skipped.push({ pointer: pointerFor(["env", key]), reason: "already-present" });
        continue;
      }
      env[key] = value;
      entries.push({ kind: "object-key", pointer: pointerFor(["env", key]), valueSha256: valueSha256(value), preview: `${key}=${value}` });
    }
  }

  if (fragment.hooks) {
    const hooks = ensureObject(next, "hooks");
    for (const [event, groups] of Object.entries(fragment.hooks)) {
      const existingGroups = ensureArray(hooks, event);
      const knownHandlers = new Set(existingGroups.flatMap((group) => (group.hooks || []).map(hookHandlerKey)));
      for (const group of groups) {
        const handlers = (group.hooks || []).filter((handler) => !knownHandlers.has(hookHandlerKey(handler)));
        if (handlers.length === 0) {
          skipped.push({ pointer: pointerFor(["hooks", event]), reason: "handler-already-present" });
          continue;
        }
        const added = { ...group, hooks: handlers };
        existingGroups.push(added);
        entries.push({ kind: "array-item", pointer: pointerFor(["hooks", event]), valueSha256: valueSha256(added), preview: `${event}: ${handlers.map((handler) => handler.command || handler.url).join("; ")}` });
      }
    }
  }

  return { next, entries, skipped, changed: entries.length > 0 };
}
