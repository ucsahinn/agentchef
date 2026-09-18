# GitHub Repository Settings

These settings shape the project’s public first impression. Apply them manually only after the source tree is verified and the account-level change is explicitly approved.

Release candidate baseline: **v1.0.0**.

Live read-back after the approved account writes on 2026-07-29: secret scanning,
push protection, vulnerability alerts, Dependabot security updates, and private
vulnerability reporting are enabled; Wiki is disabled; the topic set matches
the list below; and `main` requires the four validation checks while blocking
force-pushes and deletion. Repository administrators remain exempt so approved
maintainer pushes are possible. A custom social preview is the only pending
target: GitHub exposes upload through an authenticated web session, while the
available isolated browser session is anonymous and the public GraphQL field
still returns GitHub's generated image.

## Repository Rename

The repository was renamed from `codex-chef` to `agentchef` with
`gh repo rename agentchef`. GitHub redirects the old URL, stars, forks, issues,
releases, and tags are preserved. After the rename, every local clone must run
`git remote set-url origin https://github.com/ucsahinn/agentchef.git`, and the
branch-protection status-check names below must be re-applied because the
portability job names changed with the Node baseline.

## Description

```text
An unofficial, cross-platform setup kit for OpenAI Codex CLI and Anthropic Claude Code: specialist agents, curated skills, safe MCP defaults, preview-first installation, and clear verification.
```

## Topics

```text
agentchef
codex
codex-cli
claude-code
openai
anthropic
ai-agents
agent-tooling
mcp
model-context-protocol
agent-skills
windows
macos
linux
powershell
developer-tools
security
setup
```

## Website And Social Preview

Leave the website blank unless a stable public project page exists. Never use a local path, temporary preview URL, or private workspace link.

Use `assets/social-preview.png` for GitHub’s social preview. Keep
`assets/social-preview.svg` as the editable source. The PNG is prepared and
validated locally but is not yet uploaded to the account-level setting.

## Repository Features

- Issues: keep enabled.
- Vulnerability alerts and Dependabot security updates: enabled.
- Private vulnerability reporting: enabled; this makes the route documented in
  `SECURITY.md` directly available.
- Discussions: enable only if maintainers plan to answer community questions.
- Wiki: disabled while the versioned docs in this repository remain canonical.
- Projects: optional.
- Packages and sponsorships: disabled unless someone will actively maintain them.

## Branch And Actions

- Default branch: `main`.
- `main` protection requires `validate`, `windows-installer`,
  `portability (ubuntu-latest, Node 22)`, `claude-target`, and
  `portability (macos-latest, Node 24)` with strict branch freshness.
- Force-pushes and branch deletion are disabled; repository administrators are
  not enforced so an explicitly approved maintainer push remains possible.
- Keep workflow permissions read-only and action references pinned to full commit SHAs.
- Keep release publication manual; validation workflows must not push, tag, or publish.

## Release Metadata

For the next release (replace `<version>`):

```text
Title: AgentChef v<version>
Tag: v<version>
Notes: tmp/release-notes-current.md
```

Before publishing a future release, run `npm run check`, `npm run verify:skills:online`, `npm run release:notes`, `gitleaks detect --redact --no-banner --no-git --verbose`, and the local/remote commit equality check described in [Publishing](publish.md).
