// Additive merge of an AgentChef fragment into Claude Code's settings.json.
// Rules: never remove or reorder anything the user has; never overwrite an
// existing scalar; append missing permission rules, missing hook handlers, and
// missing env keys; report every addition as a receipt entry. Containers
// (permissions, permissions.<list>, env, hooks, hooks.<event>) are created
// lazily, only when something is appended into them, and are recorded as
// "container" entries so --remove can prune them again when they end up empty.
import { pointerFor, valueSha256 } from "./json-merge-receipt.mjs";

const permissionLists = ["allow", "ask", "deny"];

function containerEntry(segments) {
  return { kind: "container", pointer: pointerFor(segments), valueSha256: valueSha256(null), preview: `${pointerFor(segments)} (created)` };
}

function assertShape(value, key, shape) {
  if (value === undefined || value === null) return;
  const isArray = Array.isArray(value);
  if (shape === "array" ? !isArray : (typeof value !== "object" || isArray)) {
    throw new Error(`settings.json key ${key} must be an ${shape === "array" ? "array" : "object"} to merge into it`);
  }
}

// Returns the child container, creating it when absent and recording the
// creation. Existing values must already have the requested shape.
function ensureContainer(parent, key, shape, segments, entries) {
  if (parent[key] === undefined || parent[key] === null) {
    parent[key] = shape === "array" ? [] : {};
    entries.push(containerEntry([...segments, key]));
    return parent[key];
  }
  assertShape(parent[key], key, shape);
  return parent[key];
}

function hookHandlerKey(handler) {
  return valueSha256({ type: handler.type, command: handler.command ?? null, url: handler.url ?? null });
}

export function planSettingsMerge(current, fragment, { previousEntries = [], retire = false } = {}) {
  const next = structuredClone(current);
  const entries = [];
  const skipped = [];
  const retired = [];

  // Rules AgentChef added last time, by list, so a superseded one can be taken
  // back. `deny` is deliberately absent: it is never widened or narrowed here.
  const recordedRules = new Map();
  if (retire) {
    for (const entry of previousEntries) {
      if (entry.kind !== "array-item") continue;
      for (const list of ["allow", "ask"]) {
        if (entry.pointer !== pointerFor(["permissions", list])) continue;
        if (!recordedRules.has(list)) recordedRules.set(list, new Map());
        recordedRules.get(list).set(entry.valueSha256, entry.preview);
      }
    }
  }

  if (fragment.permissions) {
    assertShape(next.permissions, "permissions", "object");
    for (const list of permissionLists) {
      const wanted = fragment.permissions[list];
      if (!Array.isArray(wanted) || wanted.length === 0) continue;
      assertShape(next.permissions?.[list], list, "array");
      const existingRules = Array.isArray(next.permissions?.[list]) ? next.permissions[list] : [];
      const known = new Set(existingRules.map((rule) => String(rule)));
      // A rule already present in a stricter list must not be re-added below it.
      const stricter = list === "allow" ? ["deny", "ask"] : list === "ask" ? ["deny"] : [];
      const stricterRules = new Set(stricter.flatMap((name) => Array.isArray(next.permissions?.[name]) ? next.permissions[name].map(String) : []));
      const additions = [];
      for (const rule of wanted) {
        if (known.has(rule)) {
          skipped.push({ pointer: pointerFor(["permissions", list]), value: rule, reason: "already-present" });
          continue;
        }
        if (stricterRules.has(rule)) {
          skipped.push({ pointer: pointerFor(["permissions", list]), value: rule, reason: "stricter-list-wins" });
          continue;
        }
        known.add(rule);
        additions.push(rule);
      }
      // Take back only what this install added and no longer wants.
      const owned = recordedRules.get(list);
      const wantedSet = new Set(wanted.map(String));
      const removals = owned
        ? existingRules.filter((rule) => owned.has(valueSha256(String(rule))) && !wantedSet.has(String(rule)))
        : [];
      if (additions.length === 0 && removals.length === 0) continue;
      const permissions = ensureContainer(next, "permissions", "object", [], entries);
      const target = ensureContainer(permissions, list, "array", ["permissions"], entries);
      for (const rule of removals) {
        const at = target.findIndex((candidate) => String(candidate) === String(rule));
        if (at === -1) continue;
        target.splice(at, 1);
        retired.push({ pointer: pointerFor(["permissions", list]), valueSha256: valueSha256(String(rule)), preview: String(rule) });
      }
      for (const rule of additions) {
        target.push(rule);
        entries.push({ kind: "array-item", pointer: pointerFor(["permissions", list]), valueSha256: valueSha256(rule), preview: rule });
      }
    }
  }

  if (fragment.env) {
    assertShape(next.env, "env", "object");
    for (const [key, value] of Object.entries(fragment.env)) {
      if (next.env && key in next.env) {
        skipped.push({ pointer: pointerFor(["env", key]), reason: "already-present" });
        continue;
      }
      const env = ensureContainer(next, "env", "object", [], entries);
      env[key] = value;
      entries.push({ kind: "object-key", pointer: pointerFor(["env", key]), valueSha256: valueSha256(value), preview: `${key}=${value}` });
    }
  }

  if (fragment.hooks) {
    assertShape(next.hooks, "hooks", "object");
    for (const [event, groups] of Object.entries(fragment.hooks)) {
      assertShape(next.hooks?.[event], event, "array");
      const existingGroups = Array.isArray(next.hooks?.[event]) ? next.hooks[event] : [];
      const knownHandlers = new Set(existingGroups.flatMap((group) => (group.hooks || []).map(hookHandlerKey)));
      for (const group of groups) {
        const handlers = (group.hooks || []).filter((handler) => !knownHandlers.has(hookHandlerKey(handler)));
        if (handlers.length === 0) {
          skipped.push({ pointer: pointerFor(["hooks", event]), reason: "handler-already-present" });
          continue;
        }
        const hooks = ensureContainer(next, "hooks", "object", [], entries);
        const eventGroups = ensureContainer(hooks, event, "array", ["hooks"], entries);
        const added = { ...group, hooks: handlers };
        eventGroups.push(added);
        for (const handler of handlers) knownHandlers.add(hookHandlerKey(handler));
        entries.push({ kind: "array-item", pointer: pointerFor(["hooks", event]), valueSha256: valueSha256(added), preview: `${event}: ${handlers.map((handler) => handler.command || handler.url).join("; ")}` });
      }
    }
  }
  return { next, entries, skipped, retired, changed: entries.length > 0 || retired.length > 0 };
}
