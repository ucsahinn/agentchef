// Translates the curated Codex approval rules (templates/codex/rules/default.rules)
// into Claude Code permission rules. Codex "allow" becomes permissions.allow and
// Codex "prompt" becomes permissions.ask; nothing is ever emitted as deny, and
// no rule is broader than its Codex source. PowerShell cmdlets map to the
// PowerShell tool rule shape; everything else maps to Bash prefix rules.
const ruleLine = /^prefix_rule\(pattern = \[([^\]]*)\], decision = "(allow|prompt)"(?:, justification = "((?:[^"\\]|\\.)*)")?\)\s*$/;
const cmdletShape = /^[A-Z][A-Za-z]+-[A-Z][A-Za-z]+$/;

function parsePattern(rawList) {
  return rawList.split(",").map((item) => item.trim()).filter(Boolean).map((item) => JSON.parse(item));
}

function isPowerShellHost(token) {
  const executable = String(token).split(/[\\/]/).pop().toLowerCase();
  return ["powershell.exe", "powershell", "pwsh.exe", "pwsh"].includes(executable);
}

function isPowerShellPattern(tokens) {
  if (isPowerShellHost(tokens[0])) return true;
  return cmdletShape.test(tokens[0]);
}

function claudeRule(tokens) {
  if (isPowerShellHost(tokens[0])) {
    const commandIndex = tokens.findIndex((token) => token === "-Command" || token === "-c");
    const command = commandIndex >= 0 ? tokens.slice(commandIndex + 1) : tokens.slice(1);
    if (command.length === 0) return null;
    return `PowerShell(${command.join(" ")} *)`;
  }
  if (isPowerShellPattern(tokens)) return `PowerShell(${tokens.join(" ")} *)`;
  return `Bash(${tokens.join(" ")} *)`;
}

export function parseCodexRules(text) {
  const rules = [];
  for (const [index, line] of text.replace(/\r\n/g, "\n").split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = ruleLine.exec(trimmed);
    if (!match) throw new Error(`Unrecognized rule syntax at line ${index + 1}: ${trimmed}`);
    rules.push({ pattern: parsePattern(match[1]), decision: match[2], justification: match[3] || null });
  }
  return rules;
}

export function emitClaudePermissions(rulesText) {
  const allow = new Set();
  const ask = new Set();
  const skipped = [];
  for (const rule of parseCodexRules(rulesText)) {
    const claude = claudeRule(rule.pattern);
    if (!claude) {
      skipped.push(rule);
      continue;
    }
    (rule.decision === "allow" ? allow : ask).add(claude);
  }
  // A rule that appears in both sets keeps the stricter Codex decision.
  for (const rule of ask) allow.delete(rule);
  return {
    permissions: {
      allow: [...allow].sort(),
      ask: [...ask].sort()
    },
    skipped
  };
}
