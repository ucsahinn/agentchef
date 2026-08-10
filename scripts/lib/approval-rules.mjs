export function parsePrefixRules(text) {
  const rules = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const match = /^prefix_rule\(\s*pattern\s*=\s*(\[[^\]]*\])\s*,\s*decision\s*=\s*"([^"]+)"/.exec(line);
    if (!match) continue;
    let pattern;
    try {
      pattern = JSON.parse(match[1]);
    } catch {
      pattern = null;
    }
    if (!Array.isArray(pattern)) continue;
    rules.push({
      line,
      lineNumber: index + 1,
      pattern: pattern.map((value) => String(value)),
      decision: match[2]
    });
  }
  return rules;
}

export function significantRulesLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatPattern(pattern) {
  return `[${pattern.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function samePattern(pattern, expected) {
  return pattern.length === expected.length && expected.every((value, index) => pattern[index] === value);
}

function isPowerShellCommandPrefix(pattern) {
  const commandIndex = pattern.findIndex((value) => value.toLowerCase() === "-command");
  return /(?:^|\\)powershell\.exe$/i.test(pattern[0] || "")
    && commandIndex >= 0
    && commandIndex === pattern.length - 1;
}

function isBroadNpxPrefix(pattern) {
  return samePattern(pattern, ["npx"])
    || samePattern(pattern, ["npx.cmd"])
    || samePattern(pattern, ["cmd.exe", "/c", "npx"])
    || samePattern(pattern, ["cmd.exe", "/d", "/s", "/c", "npx"]);
}

function isBroadGitConfigPrefix(pattern) {
  return samePattern(pattern, ["git", "config"]);
}

function isCredentialGhAuthAllow(pattern) {
  return samePattern(pattern, ["gh", "auth", "status"])
    || samePattern(pattern, ["gh", "auth", "token"])
    || samePattern(pattern, ["gh", "auth", "refresh"])
    || samePattern(pattern, ["gh", "auth", "setup-git"])
    || samePattern(pattern, ["gh", "auth", "switch"]);
}

function isGitConfigValueDumpAllow(pattern) {
  return samePattern(pattern, ["git", "config", "--get"])
    || samePattern(pattern, ["git", "config", "--get-all"])
    || samePattern(pattern, ["git", "config", "--list"])
    || samePattern(pattern, ["git", "config", "--show-origin"])
    || samePattern(pattern, ["git", "config", "--global", "--get"]);
}

function isBroadGhPrefix(pattern) {
  return samePattern(pattern, ["gh"]);
}

function isBroadNpmRunPrefix(pattern) {
  return samePattern(pattern, ["npm", "run"]) || samePattern(pattern, ["npm.cmd", "run"]);
}

function isRepositoryControlledNpmAllow(pattern) {
  const executable = (pattern[0] || "").toLowerCase();
  if (executable !== "npm" && executable !== "npm.cmd") return false;
  const command = (pattern[1] || "").toLowerCase();
  return command === "run" || command === "test" || command === "audit";
}

function isMutableGitFamilyAllow(pattern) {
  return samePattern(pattern, ["git", "branch"])
    || samePattern(pattern, ["git", "remote"])
    || samePattern(pattern, ["git", "tag"])
    || samePattern(pattern, ["git", "fetch"]);
}

function isDestructiveAllow(pattern) {
  const destructiveCommands = new Set([
    "Remove-Item",
    "rm",
    "del",
    "git reset",
    "git checkout",
    "git restore",
    "git push",
    "npm install",
    "npm.cmd install",
    "npm publish",
    "npm.cmd publish"
  ]);
  const first = pattern[0] || "";
  const pair = `${pattern[0] || ""} ${pattern[1] || ""}`.trim();
  return destructiveCommands.has(first) || destructiveCommands.has(pair);
}

export function classifyRule(rule) {
  const pattern = rule.pattern;
  const decision = rule.decision;

  if (decision === "allow") {
    if (isBroadGhPrefix(pattern)) return "broad gh allow would permit external GitHub writes";
    if (isCredentialGhAuthAllow(pattern)) return "GitHub auth commands can expose or change credentials and must not be auto-allowed";
    if (isBroadNpxPrefix(pattern)) return "broad npx allow would permit arbitrary package execution";
    if (isBroadGitConfigPrefix(pattern)) return "broad git config allow would permit config mutation";
    if (isGitConfigValueDumpAllow(pattern)) return "broad git config value dumps can expose credential-bearing config and must not be auto-allowed";
    if (isPowerShellCommandPrefix(pattern)) return "broad PowerShell wrapper allow would permit arbitrary shell actions";
    if (isBroadNpmRunPrefix(pattern)) return "broad npm run allow would permit arbitrary repository scripts";
    if (isRepositoryControlledNpmAllow(pattern)) return "repository-controlled npm scripts and audit mutation must not be auto-allowed";
    if (isMutableGitFamilyAllow(pattern)) return "mutable Git command family must not be broadly auto-allowed";
    if (isDestructiveAllow(pattern)) return "destructive or external-write command must not be auto-allowed";
  }

  if (decision === "prompt") {
    if (isBroadGhPrefix(pattern)) return "broad gh prompt shadows exact read-only GitHub allow rules";
    if (isBroadNpxPrefix(pattern)) return "broad npx prompt shadows exact MCP and skill helper allow rules";
    if (isBroadGitConfigPrefix(pattern)) return "broad git config prompt shadows exact read-only config allow rules";
    if (isPowerShellCommandPrefix(pattern)) return "broad PowerShell wrapper prompt shadows exact read-only PowerShell allow rules";
  }

  return null;
}

export function findProblemRules(text, { sourceText = null } = {}) {
  const sourceLines = sourceText ? new Set(significantRulesLines(sourceText)) : null;
  return parsePrefixRules(text)
    .filter((rule) => !sourceLines || !sourceLines.has(rule.line))
    .map((rule) => ({ ...rule, reason: classifyRule(rule) }))
    .filter((rule) => rule.reason);
}
