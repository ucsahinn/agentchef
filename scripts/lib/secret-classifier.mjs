const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY(?: BLOCK)?-----/i],
  ["labeled-secret", /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|connection[_-]?string|token|secret|account[_-]?key)\s*[:=]\s*[^\s]{12,}/i],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["stripe-key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ["npm-token", /\bnpm_[A-Za-z0-9]{30,}\b/],
  ["gitlab-token", /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["bearer-token", /\bbearer\s+[A-Za-z0-9._~+/-]{20,}=*/i],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["url-credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i]
];

export function secretLikeCategory(value) {
  const text = typeof value === "string" ? value : "";
  return SECRET_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function assertNoSecretLikeContent(value) {
  const category = secretLikeCategory(value);
  if (category) throw new Error(`Content contains a ${category} and was rejected.`);
}
