# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v0.5.74 - 2026-08-14

Codex Chef 0.5.74 is the final standalone Codex Chef maintenance release. It
keeps the independent installation contract intact while correcting the
cross-platform test fixtures needed to prove it on every supported CI host.

### What Changed

- Uses the executing host's repair contract in cross-platform fixtures rather
  than applying Windows path rules to POSIX temporary homes.
- Makes the Unix Git-hook fixture executable before asserting an exact managed
  state, and accepts the documented unavailable Brain-health projection on
  platforms where Windows ACL inspection is unsupported.

### Product Boundary

This release remains independently installable and receives the compatibility
promises documented in this repository. It does **not** install Kitchen or move
global Codex, Agents, Git, Brain, session, credential, or cache state into
Kitchen. After the Kitchen migration cutover, Kitchen will be the only public
installer and release train; Chef will be a versioned internal module governed
by the compatibility and migration rules in
[ADR-005](decisions/005-kitchen-unified-workspace-and-module-boundaries.md).
