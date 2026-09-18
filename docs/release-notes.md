# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md) and [CHANGELOG-0.5.md](../CHANGELOG-0.5.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v1.0.0 - 2026-09-18

AgentChef 1.0.0 completes the rename: everything the installer writes now
carries the `agentchef` spelling, and one explicit command migrates an
existing home. Until you run it, every reader still accepts the pre-1.0.0
`codex-chef` names, so nothing breaks on upgrade day.

### What Changed

- Markers, journal, lock, backup prefixes, schema strings, plugin folder,
  operator skill, marketplace name, plugin id, hook banner, and environment
  variables are renamed; see the [upgrade guide](upgrade.md).
- `npm run chef -- --migrate-identity --target both` previews the
  conversion; add `--apply` to run it with backups under
  `CODEX_HOME/backups/agentchef-migrate-*`.
- The Claude target now merges MCP entries into the file Claude Code reads:
  `~/.claude.json`, or `$CLAUDE_CONFIG_DIR/.claude.json` only when that
  variable is set. 0.9.0 wrote `~/.claude/.claude.json` instead; see the
  [upgrade guide](upgrade.md) if that file exists on your machine.
- Skill links cover only skills that are still in the catalog; a managed
  directory that left it (the retired `codex-chef-brain`, for example) is
  reported as `retired` and left alone.
- Review follow-ups: removal deletes both marker spellings from a partially
  migrated skill folder, redacted plans keep the real shape of the
  `.claude.json` path, and the install contract honours `CLAUDE_CONFIG_DIR`.
- The global Git ignore template is retitled for AgentChef; an installed copy
  from an earlier release is still recognized as AgentChef-owned.

### Product Boundary

The migration touches only files that carry a known legacy spelling. User
content, foreign skills, old backup folders, `config.toml` blocks, and Beyin
data are never rewritten; legacy environment variables are reported, not
changed.

## v0.9.0 - 2026-09-18

AgentChef 0.9.0 adds Claude Code as a second install target next to the
OpenAI Codex CLI. Existing Codex installs are unaffected by default: the Codex
target stays the default, and the Claude Code target is managed only after an
explicit `--target claude` or `--target both`, or an interactive confirmation.

### What Changed

- One catalog, two targets. Every install operation names its target
  (`codex`, `claude`, or `shared`); shared operations such as the managed
  skill tree, the plugin source tree, Git guards, and curated skills run once.
- The Claude Code surface is installed by one transaction helper: a user-level
  rule file rendered from the same working agreement as `AGENTS.md`, additive
  `settings.json` permission rules and `.claude.json` MCP entries recorded in
  sidecar receipts, skill links into the managed `~/.agents/skills` tree, a
  Claude plugin marketplace, 32 namespaced `agentchef:<role>` subagents, and
  plugin registration through the `claude plugin` CLI. See
  [Claude Code surfaces](claude-surfaces.md) and the
  [target capability map](target-capability-map.md).
- `npm run chef -- --remove --target <t>` removes only AgentChef-owned files,
  links, marketplace entries, and receipt-recorded settings on either target.
- `verify-install-runtime`, `codex:status`, and `codex:doctor` verify the
  Claude target (`--target claude|both`); status also relays the read-only
  Beyin summary line when the separate memory engine is installed.
- The session-end process-hygiene hook stays Codex-only in this release.

### Product Boundary

On-disk identity is still the `codex-chef` prefix (plugin id, ownership
markers, marketplace root, backup folders, schema strings, environment
variables); 1.0.0 ships the preview-first identity migration. AgentChef never
edits your `~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth state, or any
`.claude.json` key other than `mcpServers`, and never writes Claude's plugin
cache by hand. See the [upgrade guide](upgrade.md) for the 0.6.0 to 0.9.0 notes.

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
