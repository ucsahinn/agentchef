# Repository Working Agreements (Claude Code)

This file mirrors [AGENTS.md](AGENTS.md) for Claude Code sessions that work on
this repository. Keep the two files aligned; AGENTS.md is the canonical text.

## Scope

This repository packages AgentChef, a safe setup kit for OpenAI Codex CLI and
Anthropic Claude Code. Keep edits focused on installable templates, docs,
validation, and security guardrails.

For the installable global operating contract, review
`templates/codex/AGENTS.md` and `catalog/routing-profiles.json`. This root
file governs maintenance of this repository only.

## Security

- Never commit secrets, auth files, memory files, sessions, local caches, or
  machine-specific private paths.
- Keep authenticated MCP connectors disabled by default.
- Do not add approval rules that auto-allow destructive commands, credential
  access, publishing, deployments, releases, or broad shell execution.
- Do not delete, prune, uninstall, drop, truncate, overwrite, or clean files,
  directories, dependencies, artifacts, local state, or configuration without
  explicit user approval. Non-destructive edits and validation may continue.
- Install scripts must back up overwritten files and must not delete user data.
- Never run installer, repair, verify, or remove flows against the live user
  homes while developing. Point `CODEX_HOME`, `AGENTS_HOME`, and
  `CLAUDE_CONFIG_DIR` at a scratch root first (`npm run dev:assert-scratch`
  refuses live homes).
- Run `npm run validate` before reporting the repo as push-ready.

## Documentation

- Keep `README.md` and `README.tr.md` aligned; keep every `docs/*.md` and
  `kb/*.md` paired with its `.tr.md` twin.
- Cite official Codex and Claude Code documentation for current behavior.
- Prefer concise, copy-pasteable commands.
- When install behavior changes, update `docs/install.md`,
  `docs/install.tr.md`, and `docs/security-model.md`.
- State shipped behavior per release line; never describe a planned target as
  available before it ships.

## Verification

Use the narrowest meaningful check first:

```bash
npm run validate
```

Before commit or push:

```bash
git status --short
git diff --cached
```

Use Gitleaks when available:

```bash
gitleaks detect --redact --no-banner --no-git --verbose
```
