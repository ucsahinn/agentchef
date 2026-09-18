# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md) and [CHANGELOG-0.5.md](../CHANGELOG-0.5.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v0.6.0 - 2026-09-18

AgentChef 0.6.0 is the first release under the new name. It retires the
built-in Brain workflow, removes the Kitchen-era artifacts, and renames the
visible identity of the project; the installer still manages the Codex CLI
surface only.

### What Changed

- The built-in Markdown Brain workflow is gone. Durable memory is the job of
  the separate `dual-agent-brain` engine; existing vaults are never touched.
  See [Brain retirement](brain-retirement.md).
- `packages/contracts`, the Chef module manifest, `docs/enterprise-v3`, and the
  tracked agent-result reports are removed; ADR-002, ADR-004, and ADR-005 are
  superseded by [ADR-006](decisions/006-agentchef-independent-dual-target-product.md).
- README and documentation are English and Turkish only; the German, Spanish,
  French, and Brazilian Portuguese summaries are removed.
- Node.js 22.12 or newer is required; the CI portability matrix runs Node 22
  and 24.
- Real installs are faster: directory syncs verify every target with one helper
  process, and subprocess timeouts in tests can be scaled with
  `CODEX_CHEF_TEST_TIMEOUT_SCALE` on slow machines.

### Product Boundary

The installer manages the Codex CLI surface (`~/.codex`, `~/.agents`) exactly
as 0.5.74 did. On-disk identity is unchanged: plugin id, ownership markers,
marketplace root, backup folder names, schema strings, environment variables,
and the Git hook banner still use the `codex-chef` prefix, so no migration is
needed. The Claude Code install target is the next release line (0.9.0); the
identity rename ships in 1.0.0 with a dedicated, preview-first migration
command. See the [upgrade guide](upgrade.md) for the 0.5.74 to 0.6.0 notes.

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
