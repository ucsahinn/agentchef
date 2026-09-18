// Claude Code target: home resolution and identity. CLAUDE_CONFIG_DIR moves
// the whole config directory, including the user-scope .claude.json (verified
// on 2026-09-18 with Claude Code 2.1.276), so both paths derive from one root.
import path from "node:path";

export const claudeTarget = Object.freeze({
  id: "claude",
  label: "Anthropic Claude Code",
  command: "claude",
  homeTokens: Object.freeze(["${CLAUDE_HOME}", "${CLAUDE_JSON}"]),
  deniedLiteralHomes: Object.freeze(["${HOME}/.claude", "${HOME}/.claude.json"])
});

export function resolveClaudeHomes({ env = process.env, home, claudeHome, claudeJson } = {}) {
  const resolvedHome = path.resolve(claudeHome || env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"));
  return {
    claudeHome: resolvedHome,
    claudeJson: path.resolve(claudeJson || path.join(resolvedHome, ".claude.json"))
  };
}
