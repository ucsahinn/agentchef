# Public Release Hygiene

Use this checklist when preparing a public commit, tag, GitHub Release, or
repository metadata update. AgentChef is public-source-first and keeps npm
publishing disabled with `private: true`.

## Pre-Release Gate

```bash
npm run check
npm run validate:release
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Also inspect:

```bash
git status --short
git diff --cached
```

Stage explicit files only. Do not use a broad add command when generated files,
logs, archives, screenshots, or local agent state are present.

## Keep Out Of Source

- Auth files, tokens, cookies, private keys, certificates, signing material.
- Local sessions, Codex memories, local caches, diagnostics with private paths,
  screenshots containing private data, and logs.
- Archives, installers, dependency folders, build output, coverage, temporary
  reports, or package tarballs.
- Database files, dumps, browser profiles, and private app connector state.

## Public Metadata

- Repository description and topics should match [GitHub repository settings](../docs/github-settings.md).
- GitHub social preview should use `assets/social-preview.png`.
- Release notes should use the current section extracted by
  `npm run release:notes`, not the full historical release-notes file.
- GitHub Actions validation must stay read-only and pinned.

## Stop Conditions

Do not publish if:

- The worktree has unclassified generated or private files.
- Gitleaks reports a real secret.
- Package-surface validation includes an untracked, ignored, archive, auth, or
  local-state path.
- The target tag already exists and has not been verified against the intended
  commit.
