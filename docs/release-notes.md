# Release Notes

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md) and [CHANGELOG-0.5.md](../CHANGELOG-0.5.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v1.3.4 - 2026-10-06

AgentChef 1.3.4 uses a skill or a role when a request needs it, by rule and by
a one-line routing hint, instead of by guesswork. Update with
`npm run chef -- --update --apply`, then trust `hooks/routing-hint.json` in
Codex's `/hooks` and start a new Claude Code session.

### What Changed

- **Routing catalog.** Each of the 19 profiles (new: `code-review`) names its
  verifier, whether that verifier is required after file changes (security,
  release, MCP, frontend, data), and the skill to load first; explicit-only
  skills are suggested, not loaded. At most two agents start per task without
  you naming them. Turkish requests route: the scorer folds the dotless ı.
- **Routing hint.** On every prompt the plugin scores your request against the
  catalog in memory and, on a high-confidence match, adds one line of catalog
  identifiers for the model. It keeps no prompt text, never blocks a prompt,
  and can be turned off with `AGENTCHEF_ROUTING_HINT=off`. See
  [security model](security-model.md) and [PRIVACY](../PRIVACY.md).
- **Roles.** Every role has one trigger-style description ("Use proactively
  when ...") and preloads the skill its work needs. `npm run chef -- --routing
  --task "<request>"` shows the matched profile and the hint line.

## v1.3.3 - 2026-10-05

AgentChef 1.3.3 makes the agents work as one team: one protocol, a board
that can send work back, and a spawn rule Claude Code actually enforces.
Update with `npm run chef -- --update --apply`; existing boards keep loading.

### What Changed

- **Board.** Tasks can be sent back for rework, released, blocked, or
  cancelled, each with a reason. Starting needs an owner (new `assign`),
  review needs evidence, and closing needs a report, every open decision
  resolved, and a verifier who did not do the work. Two tasks cannot lease the
  same files; every change is kept in the task history, and `show` marks stale
  work. A lock left by a crash no longer blocks the board.
- **Spawn guard.** Claude Code ignores a coordinator's worker list when the
  coordinator runs as a subagent. A new plugin hook keeps each AgentChef
  coordinator to its own workers and stops workers from spawning.
- **One protocol.** The same seven-field brief and six-field handoff
  everywhere, checked by `brief-check` and the new `handoff-check`; two
  delegation routes; at most four workers per task.
- **Roles.** Clearer spawn, merge, and escalation rules for coordinators;
  workers name the role they need instead of spawning it; several role fixes.

## v1.3.2 - 2026-10-04

AgentChef 1.3.2 runs every agent role on a lower-cost worker model, while the
session you open keeps the model you chose. Update with
`npm run chef -- --update --apply`; no migration step is needed.

### What Changed

- **Worker models.** All 28 roles run on the catalog `workerModels`: Codex
  `gpt-6-luna`, Claude Code `sonnet`. Reasoning effort is not pinned and
  stays inherited. See [Model Tiers](agents.md#model-tiers) to change them.
- **Security and review roles** run on the worker tier too; for a high-stakes
  review, run it in your own session or pass a stronger `model` on that one
  Claude Code `Agent` call.
- **Docs.** How agents talk to each other, two pinned-skill limits, and the
  Codex limit that keeps every thread's MCP servers running until the app
  exits (openai/codex#30408) with its mitigations.

## v1.3.1 - 2026-10-04

AgentChef 1.3.1 fixes three false alarms seen on the first live upgrade to
1.3.0. Nothing in an installed home changes; `verify-install-runtime` now
reports the real state. Update with `npm run chef -- --update --apply`.

### What Changed

- The verifier no longer reports managed config drift for a table that only
  has AgentChef's merge banner under it.
- Pinned skills in the plugin source are no longer listed as extra files.
- A skill copy you installed yourself is reported as yours, not as something
  the migration will retire.

## v1.3.0 - 2026-10-04

AgentChef 1.3.0 makes the whole harness one plugin, counted the same way
everywhere, and lighter to run. Upgrade with `npm run chef -- --update --apply`,
then move a 1.0–1.2 install with
`npm run chef -- --migrate-identity --target both --apply` (preview it first
without `--apply`); see [Upgrade](upgrade.md).

### What Changed

- **One plugin, one name.** The plugin is `agentchef` (was
  `agentchef-workflows`). Every skill reaches both CLIs only through it:
  `$agentchef:<skill>` in Codex, `/agentchef:<skill>` in Claude Code. No
  copies in `~/.agents/skills`, no links in `~/.claude/skills`; the
  migration retires the ones an earlier release left, after a backup.
- **28 agent roles.** Eleven coordinators became seven (new `ui_coordinator`);
  the five removed role files and config tables are retired only when they
  are exactly what AgentChef wrote.
- **Skills.** 11 bundled + 18 commit-pinned upstream skills. New: `agent-brief`
  (the brief and handoff contract between agents), `security-threat-model`,
  `shipping-and-launch`, `git-workflow-and-versioning`; `frontend-design` and
  `improve-codebase-architecture` replace two older pins. Optional duplicates
  became aliases or retired entries.
- **MCP servers.** `memory` and `filesystem` are gone (14 servers). Claude Code
  gets `context7` and `serena` from the plugin; Playwright and Chrome DevTools
  are off by default and added per project, because every session started
  every configured server. An npx server the plugin starts runs in one node
  process instead of a chain of four. Entries an earlier install wrote into
  `~/.claude.json` are retired; your own are reported, or retired with
  `-AdoptMcp` after a backup.
- **Approvals and hooks.** An agent running a pinned npx package, `git
  ls-remote`, or `node --check` is asked first; `rg --pre` is guarded. Claude
  Code now gets the session-end process-hygiene hook as well.
- **One map.** `npm run chef -- --inventory` lists every skill, role, and MCP
  server with its source and state on each target (shadowed, migration
  pending, broken link, drifted); its totals come from the catalog. See
  [Harness map](harness-map.md).
- **Coordination board v3.** Tasks carry an owner, a write scope with a lease,
  the brief, and evidence; work starts only from a complete brief.
- **Fixes.** About thirty bugs from two bug hunts over install, migration,
  status, process hygiene, and the Serena pool, each with a test.

The [CHANGELOG](../CHANGELOG.md) lists every change with its cause.

## v1.2.2 - 2026-10-02

AgentChef 1.2.2 collects the fixes from running every one of the 32 AgentChef
agents once. Update with `npm run chef -- --update --apply`; no migration
step is needed.

### What Changed

- Claude specialists without a shell are told to search with the Grep and
  Glob tools where their shared instructions say `rg`.
- The agent build imports the Serena pool's read-tool list instead of parsing
  its source, so a harmless edit to that list cannot break it.
- `llms.txt`, the banner's accessible description, the root `AGENTS.md`,
  and the README quickstart now match what ships.

The [CHANGELOG](../CHANGELOG.md) lists every fix with its cause.

## v1.2.1 - 2026-10-02

AgentChef 1.2.1 is a fix release. Update with
`npm run chef -- --update --apply`; no migration step is needed.

### What Changed

- Security: Claude specialists get Serena by tool name, limited to its read
  tools. The previous grant (`mcp__serena`) also reached the editing and
  memory-writing tools of a user's own Serena entry. This was found by
  running the agents.
- Status and checks:
  - An empty `codex doctor` report no longer reads as healthy.
  - A failing `claude --version` is no longer reported as a missing CLI.
  - `--cleanup-stale --apply` fails when no cleanup plan could be made.
- MCP: the verifier fails an enabled Supabase connector without a
  `project_ref` or without `read_only=true`.
- Installer and docs:
  - The capability board shows the right MCP lines for a Claude-only
    install.
  - The upgrade guide is in release order.
  - The docs explain why `npm` can be blocked in PowerShell, and that
    `npm.cmd` works.

The [CHANGELOG](../CHANGELOG.md) lists every fix with its cause.

## v1.2.0 - 2026-10-01

AgentChef 1.2.0 closes a four-agent audit of the install, status, removal,
and MCP surfaces. Each finding was measured or checked in code before it was
fixed. Update with `npm run chef -- --update --apply`, which now refreshes
every installed target.

### What Changed

- Security: Serena is pinned to v1.7.0 for GHSA-pp25-4cg4-qcr9, a template
  injection that ran code when a project was activated. On Windows, the
  Serena pool, the pre-commit hook, and the pinned-skill installer no longer
  run an executable committed to the project folder in place of the real
  one. Claude permissions ask before any `npx` launch. The Serena bridge no
  longer exposes `activate_project`. `--no-backup` only creates missing
  files.
- Serena bridge: every tool call is answered with the client's own id. Before
  this, any call after the first could wait out the 180 s timeout. Different
  Codex and Claude copies of the pool no longer stop each other's backends.
- Status and checks:
  - `--status`, `--doctor`, and the check after `--apply` are no longer
    cut off at 180 s, and they verify the target that was installed.
  - "strict config ok" now really loads `config.toml`.
  - An empty home reads as not installed.
  - A broken Claude target fails the run.
  - `--redact-paths` also covers paths inside error messages.
  - JSON reports are no longer cut short on Linux pipes.
- Claude Code: `--update` and `--status` take `--target`, and `--update`
  refreshes whatever is installed. An upgrade moves Claude Code to the new
  plugin version. `code-mapper` gets Serena, and `frontend-verifier` gets
  the browser servers you add.
- Windows: a CLI installed under a folder with a space is found, and a native
  `codex.exe` works in status.
- Removal keeps the Serena bridge and role files that a kept `config.toml`
  still points at, so Codex keeps starting cleanly.

The [CHANGELOG](../CHANGELOG.md) lists every fix with its cause.

### Product Boundary

Unchanged: AgentChef changes only what it can prove it owns. `-Update`
writes the managed `config.toml` tables back to the template, with a backup,
so security approvals reach you. User entries that shadow a managed one are
reported, not replaced.

## v1.1.0 - 2026-10-01

AgentChef 1.1.0 rolls up a self-review round run against a real install.
Every CLI command, MCP server, and bundled skill was run on a live machine,
then a full install, migrate, and remove cycle ran in scratch homes with the
real `codex` and `claude` CLIs. The findings were verified and fixed, then
reviewed again by independent code-review and security agents. There is no
new migration step; `-Update` picks it all up.

### What Changed

- Removal: `--remove` is verified by rerunning both removal plans. It also
  removes AgentChef's pinned-skill download cache and an empty marketplace
  skeleton. It never deletes a file reached through a linked subfolder, and
  every path is re-checked right before its delete.
- Claude Code: permission rules no longer auto-allow commands that can run
  code or write files. An update can retire a rule or refresh an MCP entry it
  wrote earlier, under the same receipt proof. Specialist agents get the MCP
  servers their own instructions use. The verifier compares the cached plugin
  copy, roles and skills alike, with the source, and warns when your own
  `serena` or `context7` entry shadows AgentChef's.
- Serena pool: the shared manager is replaced when its code changes, it stays
  read-only, it releases a disconnecting bridge's sessions, and it is no
  longer reported as an orphan.
- Safety: Node write flows really roll back on failure. A pinned third-party
  skill is checked for three more integrity gaps. Claude Code's local state
  stays out of review snapshots. `--update --apply` refuses a clone that is
  not on `main`. `validate-content-safety` rejects raw control characters.
- Windows: backups copy through Node, so a long `CODEX_HOME` no longer breaks
  `-Update` under PowerShell 5.1, and an npm-installed `codex` or `claude` is
  found.
- Diagnostics: `codex doctor` gets up to five minutes, and the verifier names
  a timeout. `--backups` is much faster. Process hygiene recognizes live
  Claude Code sessions as MCP owners.
- Catalogs: MCP pins were refreshed after probing each server's tool list.
  `codebase-memory` stays at 0.8.1 on purpose.

The [CHANGELOG](../CHANGELOG.md) lists every fix with its cause.

### Product Boundary

Unchanged: AgentChef deletes or rewrites only what it can prove it owns. User
entries that shadow a managed one are reported, not replaced. Generated MCP
profiles and the shared Serena pool token stay after removal.

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
