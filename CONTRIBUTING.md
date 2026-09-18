# Contributing

AgentChef changes global developer tooling, so small and reviewable beats clever and surprising. Explain the behavior you are changing, keep the diff focused, and include evidence that matches the risk.

## Ground Rules

- Never commit secrets, auth state, sessions, memories, logs, caches, private paths, or generated archives.
- Keep authenticated and high-risk MCP connectors disabled by default.
- Do not broaden approval rules for publishing, credential access, destructive file operations, or unrestricted shells.
- Prefer environment placeholders over static credentials.
- Keep English and Turkish operator docs aligned when behavior changes.
- Preserve user-owned config, profiles, skills, MCPs, and unrelated plugin files
  during install or repair. Replacement is allowed only for an exact direct
  skill adopted with its named flag, or an exact commit-pinned skill adopted by
  manually rerunning its reviewed helper command with `--adopt-existing`.
  Direct-skill adoption preserves unrelated files inside that target; pinned
  adoption creates a complete mandatory backup before exact-tree replacement.

## Verification

For a focused documentation or metadata change:

```bash
npm run validate
```

For installer, security, package-surface, release, or broad public-doc changes:

```bash
npm run check
npm run validate:release
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

## Commit Hygiene

Inspect every path before staging:

```bash
git status --short
git diff
git diff --cached
```

Stage explicit files. Do not use a broad add command while generated output, screenshots, logs, local agent state, or unrelated user work is present.
