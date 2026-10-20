# Release Notes

## v1.8.6 - 2026-10-20

AgentChef 1.8.6 lets older completed runs be corrected without editing their records.

### What Changed

- **Recompute on collect.** `collect` on a completed read-only run recomputes its `partial` flag from the current worker verdicts and records the change in the run history.

## v1.8.5 - 2026-10-20

AgentChef 1.8.5 fixes the meaning of a completed read-only run's `partial` flag.

### What Changed

- **`completion.partial` reflects the work.** A completed read-only run is partial when a worker did not finish or its verdict is partial, fail or blocked.

## v1.8.4 - 2026-10-20

AgentChef 1.8.4 closes read-only team runs and flags reports that need a second look.

### What Changed

- **Read-only runs complete.** A run whose workers are all read-only ends as `completed` once its reports are collected, instead of waiting forever for an integration that never comes.
- **Collect warnings.** A worker that passed quotes to `rg` or used `node -e`, or whose report says findings are listed without naming a single line, gets a warning in the run record and in its report.

## v1.8.3 - 2026-10-19

AgentChef 1.8.3 lets Windows team-run workers extract text again.

### What Changed

- **Quote-free reads.** Windows PowerShell 5.1 drops double quotes inside native-program arguments, so quoted search patterns found nothing. Workers now search for a plain word with `rg -n -F` (with context lines) or read with `git show`, and never use `node -e`.

## v1.8.2 - 2026-10-19

AgentChef 1.8.2 fixes a 1.8.1 regression and makes the zero-capacity case explicit.

### What Changed

- **Windows workers read files again.** Inside the Codex sandbox PowerShell runs in ConstrainedLanguage mode, where the 1.8.1 UTF-8 prefix failed. Workers now read file text with native programs (`rg -F`, `git show`, `node`), which keep Turkish characters intact.
- **Capacity 0 stops the run.** A recommendation of 0 refuses `plan` with the measured reason; `--max-workers 1` runs one worker on purpose and is recorded.
- **Start measures again.** `start` can lower the worker cap to the current recommendation, never raise it, and refuses at 0 without the override.

## v1.8.1 - 2026-10-19

AgentChef 1.8.1 fixes two Windows issues found in the first real 1.8.0 team run.

### What Changed

- **No false mojibake from Windows workers.** Workers and the verifier are told to read files as UTF-8 in Windows PowerShell 5.1 and to check the bytes before reporting broken characters.
- **`merge --as-patch` keeps line endings.** An LF file stays LF and a CRLF file stays CRLF under `core.autocrlf=true`; only the changed lines change.

## v1.8.0 - 2026-10-19

AgentChef 1.8.0 lets team runs work alongside uncommitted work and sizes them to the machine.

### What Changed

- **`plan --snapshot`.** A repository with uncommitted changes can run a team run. The working tree goes into a private snapshot commit (`refs/agentchef/snapshots/<runId>`); your branch, index and files stay untouched. `cleanup` removes the snapshot ref.
- **`merge --as-patch`.** Delivers the verified result to your working tree as unstaged changes and creates no commit. It refuses before touching anything if the files changed in a conflicting way since planning.
- **Worker count follows live capacity.** The fixed limit of four is gone. The cap follows `beyin kapasite` (or free RAM), with a hard ceiling of 8; `--max-workers` above the recommendation is refused with the measured reason.
- **"Takım koşusu" means `beyin takim`.** The rules and skills say so, and a validator keeps the old fixed-four wording from coming back.

## v1.7.10 - 2026-10-16

AgentChef 1.7.10 makes team-run readable in a plain terminal.

### What Changed

- **Readable `team-run` output.** Without `--json` every command used to print `[object Object]`. It now prints a short summary: the run, one line per worker, supervisor liveness, scope warnings and checks. `--json` output is unchanged.

## v1.7.9 - 2026-10-15

AgentChef 1.7.9 lets a team run recover when a worker finishes without changes.

### What Changed

- **`integrate --recheck --covers TASK-x`.** The conductor completes the failed worker's scope in the integration branch, commits, and records it. The engine checks that the repair stays inside that worker's write scope and the plan; verification and the merge approval still apply.

This page follows the release users should install now. Older engineering history remains available in [CHANGELOG.md](../CHANGELOG.md) and [CHANGELOG-0.5.md](../CHANGELOG-0.5.md), so the public release guide stays useful instead of becoming an ever-growing archive.

## v1.7.8 - 2026-10-14

AgentChef 1.7.8 closes the repair loop of a team run and adds the regression tests that its first live run produced.

### What Changed

- **`integrate --recheck`.** After the conductor repairs a failed integration and commits the fix, the checks run again and the run can go on to verification.
- **Regression tests.** Memory guard at supervisor level and usage-limit parser edge cases, written by two Codex workers in team run R20261014-d760.

## v1.7.7 - 2026-10-14

AgentChef 1.7.7 lets a team run wait out a usage limit on its own and keeps workers from starving the machine.

### What Changed

- **`resume --wait`.** Reads the reset time from the limit message, waits (30 minutes when no time is given, at most 12 hours) and resumes. `status` shows the expected time as `resumeAt`.
- **Memory guard.** Queued workers wait while free RAM is short; one worker always runs. Tunable with `AGENTCHEF_TEAM_MIN_FREE_MB`, off with `AGENTCHEF_TEAM_MEMORY_GUARD=off`.

## v1.7.6 - 2026-10-14

AgentChef 1.7.6 makes long team runs survive the machine. If Windows sleeps, the terminal crashes or the PC restarts mid-run, the run used to stay `running` with nobody behind it. Now `resume --run <runId>` recovers it.

### What Changed

- **Crash recovery.** With no live supervisor and a heartbeat older than a minute, orphaned workers continue their saved Codex thread in the same worktree. A live worker process blocks recovery, and the approved plan hash is still enforced.

## v1.7.5 - 2026-10-14

AgentChef 1.7.5 makes the team conductor's split decision predictable: one worker per independent write scope, parallel workers only for disjoint and independent scopes, dependent work in a later run, never more than four.

### What Changed

- **Fan-out rule.** Written into the team-conductor skill and the skills guide, so the same request splits the same way every time.

## v1.7.4 - 2026-10-14

AgentChef 1.7.4 makes independent verification of team runs reliable. The read-only verifier cannot create temp directories in its sandbox, so it now receives the host's integration results with the diff and judges from those instead of trying to re-run test suites.

### What Changed

- **Verifier prompt.** Host integration results (pass or fail per check, a short sanitized tail for failures) are part of the verification brief, with an explicit rule not to re-run writing suites.

## v1.7.3 - 2026-10-14

AgentChef 1.7.3 lets a team run continue after a Codex usage limit. When the limit resets, `resume` picks up the paused workers on their saved Codex threads in the same worktrees, with the plan hash checked so the approved plan cannot change.

### What Changed

- **Resume.** `team-run resume --run <runId>` (or `beyin takim resume --run <runId>`) requeues only the workers a usage limit paused and continues each on its saved thread.
- **Docs.** The conductor skill and the operator guides explain when to resume and when to collect instead.

## v1.7.2 - 2026-10-14

AgentChef 1.7.2 closes the findings of an independent security audit and code review of team mode. Workers no longer see the conductor's secrets, their handoff text cannot inject approval lines, a plan cannot change after you approve it, and collection can no longer be bypassed or wedged.

### What Changed

- **Worker isolation.** Secret-named environment variables stay with the conductor; handoff text is sanitized and capped.
- **Plan integrity.** `start` refuses briefs that changed after `plan`; brief files must live in the plan directory.
- **Collection and supervision.** Worker commits and dirty files are both scope- and secret-checked; a stuck abort, a board rejection or a re-run no longer wedges a run.
- **Board.** The review gate reads only the leading Verdict and Mutation check; Mutation check needs a reason or paths; glob conflicts and report paths are stricter.

## v1.7.1 - 2026-10-14

AgentChef 1.7.1 makes the first team run work for someone who installs AgentChef and dual-agent-brain from scratch on their own machine. A clean-profile rehearsal found that a new user's doctor was red before any run, that nothing told them the start and merge approvals come from dual-agent-brain, and that running the skill outside `beyin takim` used a board the approval hook never sees.

### What Changed

- **Doctor.** `last-run` is informational, `codex.login` names the fix, and new `board` and `approval-writer` checks show which board is used and whether chat approvals can reach it.
- **Conductor skill.** With dual-agent-brain installed it runs every command through `beyin takim`; without an approval writer it stops and explains why.
- **Docs.** The install guide, README and skills guide explain installing both projects together and how Beyin finds the AgentChef checkout.

## v1.7.0 - 2026-10-14

AgentChef 1.7.0 makes the coordination board harder to close on weak evidence and makes broad process kills ask first. It was built by a three-worker team run and finished by the conductor.

### What Changed

- **Board evidence.** Reports attach from a real, non-empty, secret-scanned file; open tasks show what evidence is missing; and a task reaches `review` only when its latest evidence names a `Verdict` and a `Mutation check`.
- **Write-scope conflicts.** Conflicts list every task and path, glob scopes are compared conservatively, `create` warns (or rejects with `--strict-scope`), and a blocked task releases its lease.
- **Handoff contract.** The agent-brief skill and parser support `Verdict`, `Mutation check`, environment traps and isolation, a strict mode, and templates for conflict notices, QA attempts and escalations.
- **Process-kill approvals.** `taskkill`, `tskill`, `kill`, `pkill`, `killall` and `wmic process` ask for approval in Codex and Claude.
- **Windows reliability.** Board and run-record writes retry a brief sharing violation, and one failed supervisor tick no longer fails a running team.

## v1.6.0 - 2026-10-14

AgentChef 1.6.0 makes team mode available on every install. After two releases and six multi-role live runs, the conductor and the bounded Codex workers no longer need an opt-in flag. Start and merge still require the user's typed approvals, workers still run in isolated worktrees with bounded sandboxes, and the runner still never pushes or publishes.

### What Changed

- **Available to everyone.** The team-mode contract sets `execution.enabled` to true and `stability` to stable. `AGENTCHEF_TEAM_MODE` is now the off switch: `off`, `0`, `false` or `disabled` switch team execution off for a process; `experimental` is accepted and has no effect.
- **Doctor and status.** Doctor reports an `execution` check instead of `opt-in` and no longer launches wt.exe to detect Windows Terminal, because Windows Terminal 1.24 answers unknown flags with a modal Help dialog. `codex status` reports team mode as enabled (stable) unless the switch is off.
- **Docs.** The agents, skills-and-agents and security-model guides and the team-conductor skill describe the always-available mode in English and Turkish.

## v1.5.1 - 2026-10-13

AgentChef 1.5.1 hardens the experimental team runner after its first multi-role live runs. Collection scans only added diff lines, rejects unsafe worker content per worker instead of stopping the whole run, survives long worker evidence, and reuses an existing delivery commit. Worker prompts carry a configurable language and Windows test guidance. Execution remains opt-in and disabled by default; start and merge still require separate human approvals.

### What Changed

- **Collection.** Only added diff lines are scanned for secret-like content, with file and line diagnostics and never the value. A rejected worker is marked `rejected_content` and releases its lease while the other workers are still collected. The report and board evidence are validated before the delivery commit, board evidence is truncated to the board limit, an existing delivery commit on a clean worktree is reused, and untracked files are listed individually for the write-scope check.
- **Worker prompts.** `workers.language` in the team-mode contract sets the language of worker progress messages and handoffs while code, paths, and commands stay verbatim. On Windows, workers are told to run Node tests with `--test-isolation=none` because the Codex sandbox blocks child processes.
- **Docs.** The operator guides document approval gates, recovery and rollback, worker lease outcomes, constrained Codex resume, and platform process handling. The Turkish 1.5.0 release notes are re-encoded.

## v1.5.0 - 2026-10-12

AgentChef 1.5.0 adds an experimental, opt-in team runner. A Claude conductor plans isolated Codex worker tasks, then collects and integrates their changes for independent verification. Execution remains disabled unless `AGENTCHEF_TEAM_MODE=experimental` is set; start and merge require separate human approvals. The runner does not push or publish.

### What Changed

- **Team runs.** The conductor skill and `team:run` CLI support planning, supervised Codex workers, status, collection, integration, independent verification, and approval-gated merge. Each worker uses its own Git worktree and bounded sandbox; execution is opt-in and disabled by default.
- **Safety and visibility.** The team-mode contract validator checks role and sandbox limits. Run records, worker events, and usage are available for review, and Windows Codex configuration arguments are passed without TOML quotes that the .cmd shim cannot preserve.

## v1.3.5 - 2026-10-12

AgentChef 1.3.5 starts the Serena pool on a machine whose port range is
reserved, asks on Claude Code only about what cannot be taken back, and runs
Codex on `gpt-6-luna`. Update with `npm run chef -- --update --apply`, then
start a new session in both CLIs.

### What Changed

- **Serena pool.** Windows reserves port ranges that no listing shows, and on
  one machine the whole derived range refused to bind, so every session
  reported `serena CONNECTION_CLOSED`. When the preferred port cannot be
  bound, the manager now walks a fixed sequence of fallback ports, binds the
  first free one, and records it under `~/.codex/serena-pool/port`; the
  bridges read that record first, and two managers started at once meet on
  one port. `AGENTCHEF_SERENA_POOL_PORT` is still the preferred port.
  `codex-status` prints a `Serena pool:` line with the preferred port, whether
  this machine can bind it, and the manager that answers.
- **Claude ask rules.** Claude Code asks on every `permissions.ask` rule in
  every permission mode, including `bypassPermissions`, so the 186 ask rules
  the fragment carried were 186 questions. It now carries 56: force, delete,
  and mirror pushes; branch, tag, repository, and release deletion; `gh auth`
  and token commands; publishing; `Stop-Process`; and the deploy, destroy,
  migrate, seed, prune, release, reset, and repair scripts. Every other
  prompt, and the prompted browser tools, are neither allowed nor asked; the
  permission mode you chose decides. The update retires the dropped rules
  from `settings.json` with the usual backup, and a rule you already removed
  is released instead of added back or counted as missing.
- **Codex model.** `config.toml` sets `model` and `review_model` to
  `gpt-6-luna`; the role files already ran their workers on it.
- **Routing hint.** A message relayed from another Claude session no longer
  produces a routing hint.

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
