const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i],
  ["labeled-secret", /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|connection[_-]?string)\s*[:=]\s*[^\s]{12,}/i],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/]
];

export function secretLikeCategory(value) {
  const text = typeof value === "string" ? value : "";
  return SECRET_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function assertNoSecretLikeContent(value) {
  const category = secretLikeCategory(value);
  if (category) throw new Error(`Content contains a ${category} and was rejected.`);
}
