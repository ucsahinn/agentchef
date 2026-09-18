# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md) and [CHANGELOG-0.5.md](../CHANGELOG-0.5.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v0.5.74 - 2026-08-14

Codex Chef 0.5.74 is the last Codex-only standalone release. It keeps the
independent installation contract intact while correcting the cross-platform
test fixtures needed to prove it on every supported CI host.

### What Changed

- Uses the executing host's repair contract in cross-platform fixtures rather
  than applying Windows path rules to POSIX temporary homes.
- Makes the Unix Git-hook fixture executable before asserting an exact managed
  state, and accepts the documented unavailable Brain-health projection on
  platforms where Windows ACL inspection is unsupported.

### Product Boundary

This release is independently installable and receives the compatibility
promises documented in this repository. It does **not** install Kitchen or move
global Codex, Agents, Git, session, credential, or cache state anywhere.

The direction after this release is recorded in
[ADR-006](decisions/006-agentchef-independent-dual-target-product.md): the
project continues as an independent product, it is not folded into Kitchen, the
built-in Brain workflow is retired in favor of the separate `dual-agent-brain`
engine (see [Brain retirement](brain-retirement.md)), and the next release line
adds Claude Code as a second install target. Until a release that says
otherwise ships, the installer targets Codex only.
