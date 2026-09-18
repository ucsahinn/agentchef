// Claude Code target: home resolution and identity. CLAUDE_CONFIG_DIR moves
// the whole config directory, including the user-scope .claude.json (verified
// on 2026-09-18 with Claude Code 2.1.276). Without the variable Claude Code
// keeps .claude.json in the home directory itself (~/.claude.json), not inside
// ~/.claude (verified the same day on a live Windows home: ~/.claude.json is
// the file Claude Code writes; ~/.claude/.claude.json does not exist).
import path from "node:path";

export const claudeTarget = Object.freeze({
  id: "claude",
  label: "Anthropic Claude Code",
  command: "claude",
  homeTokens: Object.freeze(["${CLAUDE_HOME}", "${CLAUDE_JSON}"]),
  deniedLiteralHomes: Object.freeze(["${HOME}/.claude", "${HOME}/.claude.json"])
});

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// The config directory counts as relocated when CLAUDE_CONFIG_DIR is set or an
// explicit --claude-home names something other than the default ~/.claude;
// only then does .claude.json live inside it. An explicit --claude-json wins.
export function resolveClaudeHomes({ env = process.env, home, claudeHome, claudeJson } = {}) {
  const defaultHome = path.join(home, ".claude");
  const resolvedHome = path.resolve(claudeHome || env.CLAUDE_CONFIG_DIR || defaultHome);
  const relocated = Boolean(env.CLAUDE_CONFIG_DIR) || (Boolean(claudeHome) && !samePath(resolvedHome, defaultHome));
  return {
    claudeHome: resolvedHome,
    claudeJson: path.resolve(claudeJson || (relocated ? path.join(resolvedHome, ".claude.json") : path.join(home, ".claude.json"))),
    relocated
  };
}
