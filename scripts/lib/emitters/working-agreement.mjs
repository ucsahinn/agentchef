// Renders the single shared working-agreement source into one file per target.
// Fences: <!-- target:codex --> ... <!-- /target:codex --> keep a block for one
// target only; lines outside fences are shared. Tokens: {{NAME}}; the
// per-target ones live below, the catalog-derived ones (spawn conditions,
// the auto-spawn cap, worker models) are passed in by the renderer.
export const workingAgreementTargets = Object.freeze({
  codex: Object.freeze({
    id: "codex",
    output: "templates/codex/AGENTS.md",
    tokens: Object.freeze({
      AGENT_NAME: "Codex",
      REPO_INSTRUCTIONS_FILE: "AGENTS.md",
      ROUTING_SKILL: "`$adaptive-agent-routing`",
      VENDOR_DOCS: "OpenAI docs"
    })
  }),
  claude: Object.freeze({
    id: "claude",
    output: "templates/claude/rules/agentchef-working-agreement.md",
    tokens: Object.freeze({
      AGENT_NAME: "Claude Code",
      REPO_INSTRUCTIONS_FILE: "CLAUDE.md",
      ROUTING_SKILL: "`adaptive-agent-routing`",
      VENDOR_DOCS: "Anthropic docs"
    })
  })
});

const openFence = /^<!--\s*target:([a-z]+)\s*-->\s*$/;
const closeFence = /^<!--\s*\/target:([a-z]+)\s*-->\s*$/;
const tokenPattern = /\{\{([A-Z_]+)\}\}/g;

export function renderWorkingAgreement(sourceText, targetId, sharedTokens = {}) {
  const target = workingAgreementTargets[targetId];
  if (!target) throw new Error(`Unknown working-agreement target: ${targetId}`);
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const output = [];
  let activeFence = null;
  for (const [index, line] of lines.entries()) {
    const open = openFence.exec(line);
    const close = closeFence.exec(line);
    if (open) {
      if (activeFence) throw new Error(`Nested target fence at line ${index + 1}`);
      if (!workingAgreementTargets[open[1]]) throw new Error(`Unknown fence target ${open[1]} at line ${index + 1}`);
      activeFence = open[1];
      continue;
    }
    if (close) {
      if (activeFence !== close[1]) throw new Error(`Unbalanced target fence at line ${index + 1}`);
      activeFence = null;
      continue;
    }
    if (activeFence && activeFence !== targetId) continue;
    output.push(line.replace(tokenPattern, (match, name) => {
      if (name in target.tokens) return target.tokens[name];
      if (name in sharedTokens) return String(sharedTokens[name]);
      throw new Error(`Unknown token ${match} at line ${index + 1}`);
    }));
  }
  if (activeFence) throw new Error("Unclosed target fence at end of source");
  return output.join("\n");
}
