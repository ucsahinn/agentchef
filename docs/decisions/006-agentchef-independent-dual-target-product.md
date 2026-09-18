# ADR-006: Continue Codex Chef as an independent, dual-target product (AgentChef)

## Status

Accepted

## Date

2026-09-18

## Context

[ADR-005](005-kitchen-unified-workspace-and-module-boundaries.md) made Kitchen
the sole distributable Agent Workspace and froze this repository at v0.5.74 as
the "final standalone release". Kitchen carries hash-pinned copies of its four
internal packages (`internal-source-integrity.v1.json`) and treats this
repository only as an optional historical provenance checkout. Kitchen does not
depend on this repository at build, test, or run time.

Kitchen's completion horizon is open-ended. Meanwhile the operator needs a
maintained setup kit for two terminal agents, OpenAI Codex CLI and Anthropic
Claude Code, and the durable-memory need that the built-in Brain workflow once
served is now met by the separately developed `dual-agent-brain` engine, which
both agents already share.

Measured baseline on 2026-09-18 (maintainer's Windows machine): `npm run
check` took 550 s and two real-install tests hit their 300 s timeout; a real
PowerShell install into a scratch home took 274 s, of which the two plugin
directory syncs took 53 s and 54 s and the preflight took 43 s.

## Decision

1. **Independent product.** This repository continues as an independently
   installed and released product. It is renamed **AgentChef** in stages:
   visible identity (repository, documentation, package metadata) in 0.6.0;
   on-disk identity (plugin id, ownership markers, marketplace root, backup
   prefixes, schema strings, environment variables, Git hook banner) in 1.0.0
   behind a dual-read, write-new, one-shot migration.
2. **Kitchen is neither modified nor depended on.** Kitchen-era artifacts in
   this repository (`packages/contracts`, the Chef module manifest and its
   validator, `docs/enterprise-v3`, the agent-result reports and their
   indexer) are removed. Git history and the `v0.5.74` tag remain the archive.
3. **The built-in Brain workflow is retired.** Durable memory is the separate
   `dual-agent-brain` engine. AgentChef never creates, reads, reconciles, or
   writes a vault; it may only surface the engine's read-only status line.
   See [Brain retirement](../brain-retirement.md).
4. **Claude Code becomes a second install target** in the 0.9.0 line: one
   catalog, two emitters; a single `manifests/install-plan.json` with a
   per-operation `target`; Claude-side ownership recorded in sidecar receipts
   because `settings.json` and `.claude.json` cannot carry markers; skills
   reach Claude through junctions/symlinks from `~/.claude/skills/<name>` to
   the managed `~/.agents/skills/<name>` tree; subagents ship namespaced inside
   the plugin; the global working agreement is added to `~/.claude/CLAUDE.md`
   through one `@import` line so the user's own file stays theirs.
5. **Node.js baseline** becomes `>=22.12.0`; Node 18 and 20 are end-of-life.

## Consequences

- ADR-002, ADR-004, and ADR-005 are superseded. The safety constraints ADR-004
  established (preview-first installation, path ownership, backup before
  replacement, fail-closed health checks) remain in force.
- The release notes, install guide, security model, and README must describe
  shipped behavior per release line and must not present planned Claude Code
  support as available before it ships.
- `dual-agent-brain` currently locates `brain-cli.mjs` on disk for its vault
  backup command. Until the engine gains a native backup, that dependency is
  satisfied by an explicit `BEYIN_BRAIN_CLI` setting that points at a frozen
  copy of the last AgentChef checkout that shipped the CLI.
- Documentation stays bilingual (English and Turkish) at full parity; the
  German, Spanish, French, and Brazilian Portuguese README summaries are
  dropped.

## Alternatives considered

- **Wait for Kitchen.** Rejected: leaves a working product frozen for an
  unknown period and forces every improvement through an unfinished shell.
- **Keep Codex-only.** Rejected: the operator already maintains a hand-ported
  Claude Code agreement; the duplication is the problem this decision solves.
- **Big-bang rename with on-disk identity change now.** Rejected: installed
  machines would face two migrations (rename now, dual-target installer later)
  instead of one.
