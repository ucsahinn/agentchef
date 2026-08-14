# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v0.5.72 - 2026-08-14

Codex Chef 0.5.72 is the final standalone Codex Chef maintenance release. It
keeps the reviewed independent installation, preview, backup, repair, and
runtime verification flows intact while the next product phase moves Chef
behind Kitchen's internal module boundary.

### What Changed

- Creates the selected Unix `CODEX_HOME` before the atomic per-home lock acquisition, preserves concurrent-install rejection, and adds a real two-install regression test that checks the lock is absent after both runs.
- Makes routing output distinguish the isolated AgentSpace worker session policy (`workspace-write`, `on-request`, `auto_review`) from the specialist role's own sandbox boundary.
- Adds reviewed suite, threat, and portability contracts plus a private fail-closed observation-envelope package and Chef module manifest/compatibility validation included in the source package and full test gate.
- Keeps the legacy GPT Pro project exporter compatible with external-review manifest schemas `1.0.0` and `1.1.0`.
- Adds canonical managed-home locks, durable operation/update recovery
  receipts, safe pinned-skill compensation, and atomic staging for restore and
  GPT Pro delivery. Interrupted operations now fail closed with a recovery
  record instead of silently presenting a partially published result.
- Hardens Git-guard receipts, owned stale-process cleanup, and Serena's early
  startup failure handling; expands the related contention, rollback, and
  lifecycle regression coverage.
- Retains representative real installer smoke coverage while removing only
  redundant launcher invocations, reducing the full verification duration
  without changing the supported installer contract.

### Product Boundary

This release remains independently installable and receives the compatibility
promises documented in this repository. It does **not** install Kitchen or move
global Codex, Agents, Git, Brain, session, credential, or cache state into
Kitchen. After the Kitchen migration cutover, Kitchen will be the only public
installer and release train; Chef will be a versioned internal module governed
by the compatibility and migration rules in
[ADR-005](decisions/005-kitchen-unified-workspace-and-module-boundaries.md).

## v0.5.71 - 2026-08-14

Codex Chef 0.5.71 ensures the Unix installer releases its operation lock when a successful install finishes.

### What Changed

- Completes the successful operation path explicitly while preserving the exit trap for failed or interrupted installs.

## v0.5.70 - 2026-08-14

Codex Chef 0.5.70 fixes Unix installer lock cleanup so completed installs do not block a later safe refresh.

### What Changed

- Gives each Unix installer operation a unique lock owner identity and releases only that lock through a non-reentrant exit trap.

## v0.5.69 - 2026-08-14

Codex Chef 0.5.69 restores the cross-platform validation gate for the current coordination release.

### What Changed

- Fixes the installer-alignment fixture so it resolves paths for the host platform before comparing the preflight contract, allowing Windows, macOS, and Linux validation to agree.

## v0.5.68 - 2026-08-13

Codex Chef 0.5.68 makes cross-role coordination explicit and auditable while preserving the boundary between safe health evidence and private Brain contents.

### What Changed

- Adds a repository-local coordination board: only an explicit user-created task records work state; pane selection, role selection, and routing matches never auto-start work.
- Limits coordinators to their cataloged workers and requires structured evidence handoffs, parent-routed cross-domain questions, and review before a task can close.
- Adds the read-only `brain health` command, which reports only bounded aggregate health and security status rather than vault paths, notes, links, or error text.
- Repairs nested support files for Chef-managed direct skills and covers the affected repair layout with regression tests.

## v0.5.67 - 2026-08-10

Codex Chef 0.5.67 adds a complete, review-bound path for bringing a repository to a manually managed GPT Pro Project without granting automatic upload or execution authority.

### What Changed

- Adds bundled `gptpro` and `gptpro-handoff` workflows, available through the plugin and Chef-managed direct-skill installation.
- Builds deterministic delivery packages from a fresh secret-safe review snapshot: one convenience ZIP, subsystem ZIPs, named text bundles, and a directly uploadable text fallback.
- Fails closed on stale source, altered Project instructions, review-ID rebinding, ZIP mutation, unexpected archives, source escapes, and untrusted returned reports.
- Routes English and Turkish GPT Pro context and returned-report requests to their narrow owners, and verifies installer, runtime, CLI, packaging, and documentation contracts end to end.

## v0.5.66 - 2026-08-08

Codex Chef 0.5.66 makes routine Update reliable on machines with a large local Codex rollout history.

### What Changed

- Replaces the full CI suite in routine Update with a bounded integrity gate; exhaustive installer smoke remains in CI and release verification.
- Refreshes managed profiles and plugins without waiting for unrelated multi-platform fixture scenarios.
- Treats a slow `codex doctor --json` as visible attention when target MCP and plugin probes still complete, rather than blocking a valid managed refresh.
- Adds a regression test for this exact slow-doctor path.

## v0.5.65 - 2026-08-08

Codex Chef 0.5.65 makes cross-PC updates and route advice more dependable without reducing the normal capability set.

### What Changed

- Preserves unrelated untracked local notes during Update while still blocking tracked or staged edits that could be overwritten.
- Adds the opt-in `offline` MCP profile while keeping balanced, `full`, and `multi-session` behavior unchanged.
- Validates base and bundled profile syntax against the installed Codex CLI, then covers the same states in installer smoke tests.
- Replaces substring route matches with explainable weighted catalog phrases and whole-word terms, including Turkish character normalization.
- Shows capability tiers separately from catalog and runtime evidence so operators can see what is configured without a false live-health claim.

## v0.5.64 - 2026-08-07

Codex Chef 0.5.64 completes the update flow even when the local source is already current.

### What Changed

- The update action no longer exits before validation and managed refresh when the available version matches the local version.
- The same approved flow now continues through backup-backed managed refresh and installed-runtime verification.

## v0.5.63 - 2026-08-07

Codex Chef 0.5.63 fixes the CI history boundary used by the Gitleaks push scan.

### What Changed

- The validation workflow now fetches complete Git history, so multi-commit
  pushes can be scanned from the previous commit without an unknown-revision
  failure.

## v0.5.62 - 2026-08-07

Codex Chef 0.5.62 makes the normal update flow complete in one approved run
when unrelated untracked local files are present.

### What Changed

- Preserves unrelated untracked files during update while still blocking tracked
  or staged worktree edits that could be overwritten.
- Keeps the progress bar, source fast-forward, full validation, backup-backed
  managed refresh, and installed-runtime verification in the same flow.
- Adds regression coverage for the worktree decision and runs it through the
  repository check suite.

## v0.5.61 - 2026-08-07

Codex Chef 0.5.61 restores the Linux validation path for the portable profile
launcher test fixture.

### What Changed

- Passes Codex configuration overrides after Node's option terminator in the
  Unix fake-launcher fixture, preventing `-c` from being interpreted as a Node
  `--check` flag during GitHub Actions validation.

## v0.5.60 - 2026-08-07

Codex Chef 0.5.60 hardens the cross-PC runtime path without broadening local
connector or process-control authority.

### What Changed

- Repairs Codebase Memory startup using an isolated cache and adds a portable,
  allowlisted profile launcher for reliable full and multi-session MCP states.
- Keeps Codebase Memory prompt-gated even when its package launcher is invoked
  directly, and routes unexpected Chef CLI errors through the shared redacted
  error contract.
- Replaces forgeable SessionEnd worker snapshots with single-use local state
  files while retaining exact identity and owner-chain rechecks.
- Requires both the separately installed Control router skill and enabled
  Control MCP before Control-managed routing can be selected.

### Compatibility

- Node.js 18 or newer
- Windows PowerShell, macOS, Linux, and WSL
- Existing user-owned config, skills, connectors, and plugin files remain
  outside normal prune behavior.

## v0.5.59 - 2026-07-29

Codex Chef 0.5.59 keeps five or six concurrent Codex sessions practical by
reducing eager local MCP startup without removing capabilities. It also adds an
ownership-aware audit and a fail-closed cleanup path for stale MCP trees.

### What Changed

- Changes the balanced base to three complementary MCPs:
  `openaiDeveloperDocs`, `context7`, and `serena`. The five overlapping local
  stdio helpers remain configured but disabled.
- Adds `full.config.toml` for one capability-heavy primary session and
  `multi-session.config.toml` for low-process secondary sessions. Agents,
  skills, remote OpenAI docs, built-in memories, hooks, and apps remain
  available.
- Replaces flat Node/Python counts with a schema-v2 process audit that separates
  active Codex owners, logical MCP instances, helper trees, grace-period trees,
  old unowned candidates, and unrelated runtimes.
- Adds preview-first stale cleanup. Immediately before termination it rechecks
  the exact PID, creation time, MCP signature, and absence of an active Codex
  owner; missing metadata and PID reuse fail closed.
- Adds one trust-gated plugin `SessionEnd` hook. It captures only the ending
  Codex owner's MCP descendants, waits 45 seconds, and stops exact survivors
  only after the owner chain disappears.
- Adds focused regression tests, security allowlists, installer/package checks,
  ADR-003, and complete English/Turkish operator guidance for the new boundary.

### Install Or Upgrade

First installation:

```bash
npm run chef -- --install
npm run chef -- --install --apply
```

Existing installation:

```bash
npm run chef -- --update --plain --no-log
npm run chef -- --update --apply
```

Use the state-aware status screens before and after installation:

```bash
npm run chef -- --skills
npm run chef -- --mcp
npm run chef -- --processes --no-log
npm run chef -- --status --details
```

Then restart Codex, inspect and trust the exact process-hygiene source in
`/hooks`, and verify the installed runtime:

```bash
npm run verify:install:runtime
npm run codex:status
```

For concurrent work, keep one normal or `full` primary session and start
secondary windows with:

```bash
codex --profile multi-session
```

### Compatibility

- Node.js 18 or newer
- Windows PowerShell, macOS, Linux, and WSL
- Existing user-owned skills, MCPs, profile choices, custom config tables, and unrelated plugin files remain outside normal prune behavior
