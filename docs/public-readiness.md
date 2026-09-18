# Public Readiness

Public-ready means more than “the files are on GitHub.” A new reader should understand what AgentChef changes, what it deliberately leaves alone, and how to verify both claims without trusting marketing copy.

## The Honest Position

AgentChef is an unofficial community project, not an OpenAI product. It is a local, cross-platform setup kit for Codex on Windows, macOS, Linux, and WSL. It provides reviewable defaults and tools; it is not a hosted control plane and it does not silently connect private accounts, databases, production systems, or broad filesystem roots.

The public landing page has two human-written README entry points, English and Turkish. Complete operator documentation is maintained in English and Turkish. The shorter German, Spanish, Brazilian Portuguese, and French pages point to those canonical guides instead of presenting generated summaries as full translations.

## What A Public User Must Be Able To Prove

- The install plan can be previewed before any global write.
- PowerShell and Bash installers create backups before replacing managed targets.
- Normal install and repair preserve user-owned config, skills, MCPs, profiles, and unrelated plugin files.
- Authenticated and high-risk connectors remain disabled until a user enables them deliberately.
- The source tree contains no auth state, sessions, memories, private paths, generated archives, installers, or local caches.
- The package allowlist contains only tracked, reviewed source files.
- CI checks Windows installer behavior plus Ubuntu/Node 22 and macOS/Node 24 portability.
- Release notes describe the current public release; complete historical detail remains in `CHANGELOG.md`.

## Repository Hygiene

Keep source and release storage separate:

- Source belongs in Git.
- Generated archives and installers belong in GitHub Releases if they ever exist.
- Ignored `.serena/`, `tmp/`, logs, caches, screenshots, and local agent state never belong in a public commit.
- Old GitHub Release pages may be retired when they make the current download path confusing, but signed/tagged Git history should remain unless there is a separate, reviewed reason to rewrite it.

## Completion Evidence

Run the broad local gate from the repository root:

```bash
npm run check
npm run verify:skills:online
node scripts/plan-install.mjs --all --json --redact-paths
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Before a release, also inspect every changed and staged path. After push, require a green GitHub Actions run and confirm that the release tag resolves to the intended commit.

A passing narrow command does not prove broad readiness. If one of these surfaces was skipped, say exactly what remains unverified.
