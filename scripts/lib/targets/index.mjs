// Install targets. "codex" is the compatible default; "claude" is opt-in
// through --target or the interactive detect-and-confirm flow. "shared"
// operations belong to every selected target and run exactly once.
import { claudeTarget } from "./claude.mjs";

export const codexTarget = Object.freeze({
  id: "codex",
  label: "OpenAI Codex CLI",
  command: "codex",
  homeTokens: Object.freeze(["${CODEX_HOME}", "${AGENTS_HOME}"]),
  deniedLiteralHomes: Object.freeze([])
});

export const installTargets = Object.freeze({ codex: codexTarget, claude: claudeTarget });
export const targetIds = Object.freeze(Object.keys(installTargets));
export const defaultTargets = Object.freeze(["codex"]);

export function parseTargetSelection(value) {
  if (value === undefined || value === null || value === "") return new Set(defaultTargets);
  // Case-insensitive, like PowerShell's ValidateSet, so every entry point
  // agrees on what it accepts.
  const parts = String(value).toLowerCase().split(/[,+\s]+/).filter(Boolean);
  const selected = new Set();
  for (const part of parts) {
    if (part === "both" || part === "all") {
      for (const id of targetIds) selected.add(id);
      continue;
    }
    if (!installTargets[part]) throw new Error(`Unknown install target: ${part} (expected codex, claude, or both)`);
    selected.add(part);
  }
  return selected;
}

export function operationAppliesToTargets(operation, selected) {
  const target = operation.target || "codex";
  if (target === "shared") return true;
  return selected.has(target);
}
