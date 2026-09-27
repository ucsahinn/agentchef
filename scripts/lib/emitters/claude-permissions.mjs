// Translates the curated Codex approval rules (templates/codex/rules/default.rules)
// into Claude Code permission rules. Codex "allow" becomes permissions.allow and
// Codex "prompt" becomes permissions.ask; nothing is ever emitted as deny, and
// no rule is broader than its Codex source. Claude-only ask rules below narrow
// a few allows that run code without a sandbox. PowerShell cmdlets map to the
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

// Codex runs these commands inside its OS sandbox; Claude Code has none by
// default, and an explicit allow rule also bypasses Claude Code's own
// read-only analysis of the flags. Each entry below was measured on Claude
// Code to run code or write files without a prompt through an allow rule.
// A narrow option is guarded with an ask rule (ask outranks allow, so the
// common read-only form still runs); a prefix whose code-loading options are
// too many to list is demoted to ask as a whole.
const claudeOptionGuards = [
  { when: "Bash(rg *)", ask: ["Bash(rg *--pre*)"] }, // --pre runs any command on each file
  { when: "Bash(git diff *)", ask: ["Bash(git diff *--output*)", "Bash(git diff *--ext-diff*)"] },
  { when: "Bash(git log *)", ask: ["Bash(git log *--output*)", "Bash(git log *--ext-diff*)"] },
  { when: "Bash(git show *)", ask: ["Bash(git show *--output*)", "Bash(git show *--ext-diff*)"] },
  { when: "Bash(gitleaks detect --redact --no-banner --verbose *)", ask: ["Bash(gitleaks *--report-path*)", "Bash(gitleaks * -r *)"] },
  { when: "Bash(gitleaks detect --redact --no-banner --no-git --verbose *)", ask: ["Bash(gitleaks *--report-path*)", "Bash(gitleaks * -r *)"] }
];
const claudeDemotedToAsk = [
  "Bash(node --check *)", // --require/-r/--import/--loader/--env-file load and run code
  "Bash(git ls-remote *)" // --upload-pack/-u run a local command
];

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
  for (const guard of claudeOptionGuards) {
    if (allow.has(guard.when)) for (const rule of guard.ask) ask.add(rule);
  }
  for (const rule of claudeDemotedToAsk) {
    if (allow.has(rule)) ask.add(rule);
  }
  // A rule that appears in both sets keeps the stricter decision.
  for (const rule of ask) allow.delete(rule);
  return {
    permissions: {
      allow: [...allow].sort(),
      ask: [...ask].sort()
    },
    skipped
  };
}
