# Publishing Checklist

Publishing is the point where local confidence becomes a public claim. Keep it deliberate: verify first, review the exact diff, and only then create commits, tags, or releases with explicit approval.

Release candidate baseline: **v0.5.71**.

## Before Commit Or Push

```bash
npm run check
npm run validate:release
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
npm run validate:install-state
npm run release:notes:check
git status --short
git diff --check
git diff --cached --check
```

`npm run check` can run during development with a dirty worktree. The separate
`validate:release` gate is intentionally strict: the index and worktree must be
clean, and the package version must not already have a local tag.

If Gitleaks is available:

```bash
gitleaks detect --redact --no-banner --no-git --verbose
```

Review the staged diff file by file. Do not stage ignored `.serena/`, `tmp/`, logs, caches, screenshots, archives, package tarballs, auth state, sessions, or memories.

## Prepare Release Notes

`docs/release-notes.md` describes the release users should install now. `CHANGELOG.md` keeps the complete history. Generate the GitHub Release body from only the current section:

```bash
npm run release:notes
```

The generated file is `tmp/release-notes-current.md`; it is local release input, not tracked source.

## Publish An Existing Repository

After explicit approval and a clean staged review:

```bash
git commit -m "Prepare Codex Chef public docs"
git push origin main
```

For a future version, replace `<version>` only after package metadata and both release-note files are aligned:

```bash
git tag -a v<version> -m "Codex Chef v<version>"
git push origin v<version>
gh release create v<version> --title "Codex Chef v<version>" --notes-file tmp/release-notes-current.md
```

## Verify The Public State

```bash
git rev-parse HEAD
git -c http.sslBackend=openssl ls-remote origin refs/heads/main
gh run list --workflow validate --branch main --limit 1
gh release view v<version>
```

The local and remote commits must match, CI must be green, and the release tag must resolve to the intended commit.

## Never Publish

- credentials, auth files, cookies, private keys, or signing material
- Codex sessions, memories, logs, browser profiles, or local databases
- machine-specific paths or project trust state
- generated installers, archives, build output, dependency folders, or scratch reports as regular source files
