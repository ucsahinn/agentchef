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
  // -r also takes its value attached (-r=/path, -r/path); --log-opts passes
  // --output through to the inner git log.
  { when: "Bash(gitleaks detect --redact --no-banner --verbose *)", ask: ["Bash(gitleaks *--report-path*)", "Bash(gitleaks * -r *)", "Bash(gitleaks * -r=*)", "Bash(gitleaks * -r/*)", "Bash(gitleaks *--log-opts*)"] },
  { when: "Bash(gitleaks detect --redact --no-banner --no-git --verbose *)", ask: ["Bash(gitleaks *--report-path*)", "Bash(gitleaks * -r *)", "Bash(gitleaks * -r=*)", "Bash(gitleaks * -r/*)", "Bash(gitleaks *--log-opts*)"] },
  // A later flag wins: --no-ignore-scripts runs the package's prepack and
  // prepare scripts, --no-dry-run with --pack-destination writes anywhere.
  { when: "Bash(npm pack --dry-run --json --ignore-scripts *)", ask: ["Bash(npm pack *--no-ignore-scripts*)", "Bash(npm pack *ignore-scripts=*)", "Bash(npm pack *--no-dry-run*)", "Bash(npm pack *dry-run=*)", "Bash(npm pack *--pack-destination*)"] },
  // gh config get prints a token stored in plain text (insecure storage).
  { when: "Bash(gh config get *)", ask: ["Bash(gh config get *token*)"] }
];
const claudeDemotedToAsk = [
  "Bash(node --check *)", // --require/-r/--import/--loader/--env-file load and run code
  "Bash(git ls-remote *)" // --upload-pack/-u run a local command
];
// `npx -y <pkg>@<version>` prefers a matching package in the project's own
// node_modules, so a repository can supply the code it runs, and the trailing
// argument wildcard lets server options that launch a binary or write a file
// through. Claude Code starts MCP servers from .claude.json itself and never
// needs these launches as Bash commands; every npx launch asks.
const claudeDemotedPrefixes = ["Bash(npx ", "Bash(npx.cmd ", "Bash(cmd.exe /c npx "];

// Claude Code asks on every `ask` rule in every permission mode, including
// bypassPermissions, so each ask rule is a question the user answers by hand.
// The default profile keeps the questions for what cannot be taken back or
// leaves the machine: force, delete and mirror pushes, branch and tag
// deletion, repository and release deletion, credential commands, publishing,
// stopping processes, and the repository scripts that deploy, destroy,
// migrate, seed, prune, release, reset, or repair. Every other Codex prompt
// (a commit, a plain push, a dependency install, a file removal) and the
// option guards above are left to the permission mode the user chose. The
// `full` profile keeps all of them; nothing selects it at install time yet.
const criticalAskRules = [
  /^PowerShell\(Stop-Process \*\)$/,
  /^Bash\(gh (repo|release) delete \*\)$/,
  /^Bash\(gh auth (login|logout|refresh|setup-git|switch|token) \*\)$/,
  /^Bash\(gh config get \*token\*\)$/,
  /^Bash\(git branch (-D|--delete) \*\)$/,
  /^Bash\(git tag (-d|--delete) \*\)$/,
  /^Bash\(npm(\.cmd)? publish \*\)$/,
  /^Bash\(npm(\.cmd)? run (publish|deploy|destroy|drop|db:drop|wipe|truncate|delete|db:migrate|migrate|prune|release|remove|reset|seed|ship|repair:install -- --apply|repair:install -- --prune-managed-plugin-extras) \*\)$/
];
// A plain push is an ordinary step; only the forms that rewrite or remove
// remote history keep asking.
const criticalAskNarrowing = {
  "Bash(git push *)": ["Bash(git push *--force*)", "Bash(git push * -f *)", "Bash(git push *--delete*)", "Bash(git push *--mirror*)"]
};
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
  for (const rule of allow) {
    if (claudeDemotedPrefixes.some((prefix) => rule.startsWith(prefix))) ask.add(rule);
  }
  // A rule that appears in both sets keeps the stricter decision.
  for (const rule of ask) allow.delete(rule);
  // Claude Code asks on every ask rule in every permission mode, so only the
  // prompts for what cannot be taken back or leaves the machine become
  // questions; the other prompts, and the option guards, are neither allowed
  // nor asked and the user's permission mode decides.
  const askRules = [...ask].flatMap((rule) => criticalAskNarrowing[rule] ?? (criticalAskRules.some((pattern) => pattern.test(rule)) ? [rule] : []));
  return {
    permissions: {
      allow: [...allow].sort(),
      ask: askRules.sort()
    },
    skipped
  };
}
