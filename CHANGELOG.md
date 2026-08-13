# Changelog

## Unreleased

## 0.5.70 - 2026-08-14

- Fix Unix installer operation-lock cleanup so a completed install releases only its uniquely identified lock and cannot block a later install for the same Codex home.

## 0.5.69 - 2026-08-14

- Fix cross-platform installer-alignment validation by resolving the fixture contract for the host platform before comparing it with the host installer preflight.

## 0.5.68 - 2026-08-13

- Add an explicit, repository-local coordination board whose tasks must be created by the user; pane selection and route matching do not start work, and reviewed evidence is required before completion.
- Add a read-only Brain health projection that exposes only bounded aggregate and security-status evidence, never vault paths, notes, links, or errors.
- Restore nested support files when repairing a Chef-managed direct skill, with regression coverage for the affected installation layout.

## 0.5.67 - 2026-08-10

- Add bundled and direct-installable `gptpro` and `gptpro-handoff` workflows for manual GPT Pro Project context delivery and manifest-bound returned-report verification.
- Produce a deterministic convenience ZIP, subsystem ZIPs, and directly uploadable text fallback from a fresh, secret-safe external-review snapshot; reject stale source, modified instructions, rebinding, archive mutation, and unexpected archive artifacts.
- Route GPT Pro context and returned-report intents to their narrow workflow owners in English and Turkish, and keep install-plan, runtime, CLI, documentation, package-surface, and installer contracts synchronized.
- Make Chef CLI skill-count smoke expectations derive from the catalog so managed direct-skill growth cannot leave release checks stale.

## 0.5.66 - 2026-08-08

- Keep routine Update applies bounded by replacing the full CI suite with an update-integrity gate that covers repository, installer, plan, MCP, approval, agent, routing, and package contracts.
- Keep exhaustive installer smoke and cross-platform regressions in `npm run check` and CI instead of delaying managed-file refresh for every operator.
- Make installed runtime verification probe the target Codex home once by default and continue to MCP/plugin evidence when `codex doctor --json` times out on large rollout state.
- Add regression coverage for a slow doctor with successful live MCP visibility, and document the resulting attention-level diagnostic behavior.

## 0.5.65 - 2026-08-08

- Add an optional `offline` profile that parks every Chef-managed MCP without reducing the balanced, full, or multi-session defaults.
- Make the update flow preserve unrelated untracked files while still failing closed for tracked or staged changes that could be overwritten.
- Add strict Codex config compatibility checks and installer coverage for all bundled profiles.
- Replace substring route advice with deterministic, catalog-owned weighted phrase and whole-word correlation, including Turkish normalization and explainable confidence evidence.
- Make the status board distinguish capability tiers and catalog/config/runtime evidence without overstating live availability.

## 0.5.64 - 2026-08-07

- Continue validation, backup-backed managed refresh, and installed-runtime verification when the local source is already at the available version.

## 0.5.63 - 2026-08-07

- Make the validation workflow fetch complete Git history so the Gitleaks push-range scan can resolve multi-commit pushes reliably.

## 0.5.62 - 2026-08-07

- Make the Codex Chef update path continue with unrelated untracked local files while still blocking tracked or staged edits that could be overwritten.
- Add regression coverage for the update worktree classification and include it in the repository check suite.
- Keep the update progress, validation, backup-backed managed refresh, and runtime verification path intact after the worktree check.

## 0.5.61 - 2026-08-07

- Fix the Unix profile-launcher test fixture so Codex `-c` overrides are passed after Node's option terminator; this restores the GitHub Actions validation gate for the release candidate.

## 0.5.60 - 2026-08-07

- Repair Codebase Memory startup with an isolated package cache, distinguish cache corruption from Serena cold-start timing, and verify the real MCP handshake and tool call.
- Add a portable profile launcher that reliably applies the reviewed full and multi-session local-MCP states when a Codex CLI profile layer does not.
- Harden the launcher against Windows shell metacharacters, profile traversal, and activation of connectors outside the bundled local-MCP allowlist; include it in repair and runtime drift verification.
- Remove automatic direct package execution for Codebase Memory, preserve its prompt-gated connector boundary, and normalize unexpected Chef CLI errors through the shared redacted contract.
- Replace SessionEnd serialized cleanup snapshots with single-use local state files, rejecting forgeable worker input while retaining exact PID, creation-time, and owner-chain rechecks.
- Gate Control routing on the separately installed router skill and enabled Control MCP, then expand runtime, process-hygiene, installer, security, and profile regression coverage.

## 0.5.59 - 2026-07-29

- Add capability-preserving multi-session MCP profiles: the balanced base keeps remote OpenAI docs plus Context7 and Serena enabled, `full` restores every bundled local stdio MCP for one primary session, and `multi-session` parks local MCP launchers in secondary windows without disabling agents, skills, built-in memories, hooks, or apps.
- Replace flat Node/Python counts with a schema-v2 ownership audit that separates active Codex sessions, logical MCP instances, helper trees, grace-period trees, old unowned candidates, and unrelated runtimes.
- Add preview-first, exact stale-MCP cleanup with a second PID, creation-time, MCP-signature, and active-owner recheck immediately before termination; incomplete process metadata and PID reuse fail closed.
- Add one trust-gated plugin `SessionEnd` hook that captures only the ending Codex owner's MCP descendants, waits 45 seconds, and stops exact survivors only after the owner chain is gone.
- Document the Windows and multi-session operating model in English and Turkish, record the design in ADR-003, and expand installer, CLI, MCP, security, package-surface, and process-hygiene regression coverage.

## 0.5.58 - 2026-07-29

- Add the explicit-only `fetch` bundled skill for authorized, browser-evidenced website reconstruction with public-passive defaults, inert authentication, prompt-injection and SSRF boundaries, lawful asset handling, zero-egress local output, fidelity reporting, and deterministic report validation.
- Replace the upstream SEO reference with a Chef-owned `$seo` workflow that separates local, rendered, deployed, field, and account evidence; corrects retired or restricted Google Search features; implements technical/content/international/local guidance; and validates claim-safe audit reports.
- Add the Chef-owned `$evidence-research` workflow for scoped search, screening, appraisal, claim-level traceability, disagreement and uncertainty synthesis, reproducibility, and ethics-aware decision packages.
- Install Fetch, SEO, and Evidence Research from their canonical plugin source as managed direct skills, with per-target fail-closed collision checks, backup-backed repair, explicit adoption flags, runtime parity checks, and forward-tested report validators.
- Add a shared, sanitized plain/JSON error contract and truthful result receipts across the Chef, status, routing, doctor, Brain, external-review, release-note, and pinned-skill CLIs; expand Continuity and runtime health evidence without exposing local secrets.
- Harden commit-pinned skill installation with native exact-tree hashing, provenance-aware managed upgrades, foreign-target preservation, explicit per-skill adoption, mandatory replacement backups, rollback verification, and functional full-history fetch support.
- Correct layered token-budget diagnostics, tighten external-review snapshot and credential-path containment, align MCP/runtime catalogs and approval boundaries, and expand release, installer, CLI, security, and cross-platform verification coverage.
- Keep forced-color CLI validation hermetic across Node.js versions by removing contradictory `NO_COLOR` inheritance, preventing Node.js 18 warnings from breaking the Ubuntu portability gate.
- Refresh an already-installed Codex Chef plugin's stale versioned cache during installer, update, and repair applies, verify the active version afterward, and leave never-installed plugins untouched.

## 0.5.57 - 2026-07-26

- Make the command center installation-aware: fresh and incomplete setups preview before typed approval, current setups exit without reinstalling, managed drift routes to backup-backed repair, and invalid skill directories route to focused skill recovery.
- Report curated skills from real `SKILL.md` evidence as ready, missing, or invalid; offer only actionable entries for installation and preserve other user-installed skills.
- Read installed MCP configuration separately from catalog defaults, showing configured enabled/disabled, cataloged but missing, and user-added connectors without claiming a live probe.
- Keep the default status board compact while retaining target/ambient runtime, per-MCP, routing, context-budget, setup-note, and log evidence behind `--details`.
- Correct command-center approval/account-guidance badges and remove the nested installer confirmation from backup-backed force refresh.
- Add canonical Brain control workspace canvases, bilingual operator guidance, project/goal/memory surfaces, and Obsidian configuration while preserving existing user vault files.
- Expand temporary-home, transcript, status, installer, documentation, locale, package-surface, and release regression coverage for first install, existing install, idempotence, drift, invalid skills, custom MCPs, and Turkish output.

## 0.5.56 - 2026-07-26

- Keep installer approval preflight compatible with older Codex CLI builds that return `no-match` for read-only PowerShell wrapper commands even when the equivalent direct command is explicitly allowed.
- Continue to require direct `Get-Content` to resolve to `allow` and destructive PowerShell wrappers to resolve to `prompt`, so compatibility does not broaden the write surface.
- Report unsupported read-only wrapper matching as a visible warning instead of blocking an otherwise safe first or existing installation.

## 0.5.55 - 2026-07-26

- Make every primary CLI surface summary-first while preserving full tables, setup notes, and diagnostic evidence behind the new `--details` option.
- Add a compact update progress bar with explicit local and available versions, and stop without confirmation, validation, installation, or managed-file writes when the versions match.
- Fetch the candidate release once and fast-forward from the inspected `FETCH_HEAD`, preventing a second network pull between version comparison and installation.
- Keep successful child-command noise in local logs while still printing complete command output when a step fails.
- Reduce preview, install, refresh, skills, MCP, routing, diagnostics, backup, and log screen density without removing JSON or detailed operator evidence.
- Support both split-token and single-token Windows PowerShell command normalization for the exact read-only approval-harmony probe used by installer preflight.
- Expand CLI and approval regression coverage for compact/default views, detailed views, version-aware updates, and cross-PC Codex CLI compatibility.

## 0.5.54 - 2026-07-26

- Add Codex Chef Brain as a preview-first, project-scoped Markdown knowledge vault with schemas, templates, capture/retrieval CLI commands, backup and restore plans, Windows ACL evidence, documentation, and focused regression tests.
- Restore and refine the colorful U.C.S. operator CLI with clearer menu importance, operation impact, action receipts, post-update version/commit evidence, and a green third signature color.
- Separate first install, safe existing-install reconciliation, managed update, force refresh, and drift repair into explicit behaviors across Windows and Bash installers.
- Preserve user-owned `config.toml` settings during normal updates while synchronizing Codex Chef-managed tables and refreshing managed files after backup.
- Make the colorful CLI the recommended public install path, remove nested installer confirmation after CLI `APPLY`, and retain direct installer/plan commands for reviewed automation.
- Expand CLI and installer validation for update safety, nested-confirmation prevention, Brain packaging, locale parity, and portable public documentation.

## 0.5.53 - 2026-07-26

- Replace generated deep-documentation shells with six concise, human-written README entry points and complete English/Turkish operator guides.
- Remove obsolete completion-audit, local-audit, and SEO documents while preserving useful guidance in the maintained docs, knowledge base, agent corpus, and changelog.
- Rewrite the public README, governance, support, privacy, publishing, GitHub settings, and release-readiness surfaces in direct, natural language.
- Align locale, security, package, token, workflow, doctor, and release validators with the smaller documentation contract without weakening safety gates.
- Document token-budget diagnostics, the optional capability-preserving token-safe profile, and automatic agent model/reasoning inheritance.
- Consolidate GitHub Releases to the current supported line while preserving every historical Git tag and commit.

## 0.5.52 - 2026-07-26

- Make the install and validation contract explicitly cross-platform across Windows, macOS, Linux, and WSL, including macOS CI and Node.js 18 compatibility coverage.
- Add a fail-closed portability validator for personal absolute paths, user identifiers, home resolution, platform command shims, and CI operating-system coverage.
- Replace Desktop-specific filesystem MCP roots with the portable current-workspace root while keeping the connector disabled by default.

- Redesign the interactive CLI as a six-hub command center with full descriptions, ASCII-safe operational indicators, and the exact U.C.S. signature at entry and exit.
- Complete approved updates in one invocation: pull, fresh preview, validation, managed refresh, and installed-runtime verification.
- Verify install, refresh, repair, and update writes against the installed runtime before reporting readiness.
- Expose safe MCP configured/enabled/disabled evidence from `codex mcp list --json` while explicitly distinguishing it from unprobed live-session state.

## 0.5.51 - 2026-07-25

- Added a preview-first `chef review pack|handoff|verify|status` workflow that creates tracked text review bundles outside the target repository, screens them for exposed credentials, pins them with SHA-256, and performs no automatic upload.
- Added manifest and report schemas, stale-snapshot checks, structured finding validation, symlink/path-escape defenses, focused regression tests, and a zero-network validator.
- Added one collision-free `external-review-workflow` bundled skill and one `external-deep-review` routing profile while preserving profile-owned model, reasoning, approval, sandbox, and MCP behavior.
- Documented the manual external-review boundary in English and Turkish and explicitly rejected fleet execution, unsafe flags, hidden upload hooks, and duplicate pack/handoff/verifier skills.

## 0.5.50 - 2026-07-21

- Reworked the full operator menu so write-capable selections preview, request action-scoped typed confirmation, and complete in the same session while direct CLI automation keeps the `--apply` boundary.
- Added same-session backup selection, inspection, restore, and archive deletion flows; restore requires `APPLY`, while deletion requires the exact `DELETE <backup-id>` phrase.
- Kept menu confirmation action-scoped even when the process starts with `--apply`, preventing a session-wide write latch.
- Added a large `U.C.Ş` terminal signature while preserving the existing icons, grouped operator tables, bilingual output, and compact return flow.
- Expanded CLI transcript coverage for repair, refresh, skill installation, backup inspection/restore, signature rendering, and confirmation cancellation.

## 0.5.49 - 2026-07-21

- Replaced unconditional prompt-shape agent spawning with conditional delegation for independent parallel work, noisy research isolation, or explicit user requests while preserving `max_threads = 10` as multi-window capacity.
- Added adaptive agent role selection that inherits the active user profile's model and reasoning choices, plus canonical compatibility aliases for overlapping project-starter, skill-authoring, and prompt-architect skills.
- Reduced the always-loaded global `AGENTS.md` contract to 103 lines and moved the complete routing catalog, specialist map, aliases, MCP guidance, and UI standards into the bundled `adaptive-agent-routing` skill.
- Added catalog-backed MCP allowlist/approval parity, layered token-surface reporting, bounded runtime probes with offline/no-MCP modes, Windows command resolution, and backup-backed legacy profile pin migration.
- Documented and validated the canonical-template plus user-owned-overlay boundary so model, approval, sandbox, project trust, user MCPs, marketplace entries, and installed skills survive normal repair updates.

## 0.5.48 - 2026-07-09

- Added a first-class bilingual `kb/` surface for task-shaped install preview,
  runtime verification, agent/MCP routing, public release hygiene,
  Windows/PowerShell setup, Skills CLI cache, custom home drift, MCP no-tools,
  managed-file drift, and public visual-asset guidance.
- Added `npm run validate:kb-locales` to enforce English/Turkish KB article
  pairing, index coverage, headings, placeholder checks, and Turkish-language
  content signals.
- Updated public handoff docs and generated locale templates to use redacted
  install-plan JSON examples so maintainers do not paste machine-specific paths
  into public issues or releases.
- Refreshed the social preview SVG and PNG so the GitHub preview copy fits the
  image without clipping.

## 0.5.47 - 2026-07-09

- Increased the Codex status aggregator budget for installed runtime
  verification so slower Windows Codex/MCP probes no longer turn a valid
  runtime into a false `fail`.
- Increased `verify-install-runtime` Codex doctor probe timeouts from 60s to
  120s, matching the status probe budget and reducing noisy timeout warnings
  during post-release health checks.
- Preserved the same safety boundary: timeouts are more tolerant, but runtime
  drift, missing managed files, missing skills, Git guard drift, and MCP
  mismatches still fail verification.

## 0.5.46 - 2026-07-09

- Expanded the default approval rules for safe Codex Chef verification and
  release-readiness commands so routine checks no longer create avoidable
  allow prompts.
- Added regression coverage for the new auto-allow surface: package dry-runs,
  granular validators, online skill verification, runtime verification,
  security audit, supply-chain scan, Codex read-only diagnostics, GitHub run
  watching, and read-only git object inspection.
- Removed auto-allow coverage from credential-bearing GitHub auth inspection and
  broad Git config value dumps so `--show-token`, auth token output, and
  credential-bearing config keys cannot run without review.
- Kept write and high-blast-radius paths gated: repair apply/prune, cleanup,
  publish, deploy, release creation, push, credentials, dependency installs,
  destructive file operations, and ad-hoc package execution still require
  approval.

## 0.5.45 - 2026-07-09

- Added a validator-enforced `World-class specialist upgrade` block to all 21
  specialist agent role files so each agent names its domain failure mode,
  applies evidence grading, challenges its own output, preserves its role
  boundary, and routes adjacent work instead of drifting into a generalist.
- Hardened agent validation so the new specialist block must appear in the
  correct order, stay source-backed, include role-specific catalog context, and
  negate each agent's `mustNot` boundary with explicit `do not` language.
- Hardened npm package-surface validation so ignored or untracked files inside
  packaged `files` entries fail the release gate, including nested template
  `tmp`, `node_modules`, build, coverage, Codex local-state, and auth/log
  residue.
- Added `templates/.npmignore` so npm pack honors local template ignore rules
  even though the root package manifest intentionally includes `templates/`.

## 0.5.44 - 2026-07-09

- Added `codebase-memory` as a default-enabled but tool-narrowed MCP connector
  for graph-backed repository mapping, architecture queries, and diff impact
  analysis.
- Kept the new code-intelligence connector prompt-gated outside its read/query
  allowlist, with persistent graph state documented, generated
  `.codebase-memory/` artifacts ignored, and indexing/project-state tools
  disabled by default.
- Added status-board context-budget visibility and token-safe profile guidance
  for long repo-wide work without disabling any Codex capability surface.
- Added token-audit category budgets, `token-safe` active/available status
  visibility, runtime-vs-validator script classification, and stronger
  `codex-status --output` regression coverage.
- Made normal `npm run chef -- --preview` output summary-first while keeping
  full install-plan evidence available through `--verbose-plan`.
- Kept `codebase-memory` indexing and graph-admin tools prompt-gated or
  disabled while allowlisting graph read/query tools, and made graph-indexing
  approval boundaries visible across routing, status, README, MCP catalog, and
  installed AGENTS guidance.
- Tightened release and update gates with a read-only `release:notes:check`
  script, full `npm run check` before managed refresh, and README prerequisite
  checks before copy-paste install.
- Updated MCP catalog, Windows/Unix config templates, security docs, install
  copy, release metadata, and expected-output examples for the new opt-in
  connector surface.

## 0.5.43 - 2026-06-25

- Refined the interactive Chef CLI into a grouped operator board with
  responsive stacked rows, clearer write-boundary wording, and locale-aware
  Turkish headings.
- Reworked Skills, MCP, Backups, Diagnostics, Process Audit, Auth, and preview
  screens so submenus use the same summary-first natural-language UX as the
  main menu.
- Expanded CLI transcript and localized smoke coverage so menu/submenu wording,
  Turkish copy, and safe no-write preview behavior stay under regression tests.

## 0.5.42 - 2026-06-25

- Changed repair previews so non-curated user-installed skills are reported as
  notes instead of attention, keeping clean managed installs visibly clean.
- Added regression coverage for the note-only repair state so user skill
  inventory does not look like a repair problem.

## 0.5.41 - 2026-06-24

- Fixed the interactive CLI readline lifecycle so menu actions that ask follow-up
  questions reuse the active menu prompt instead of opening a second stdin
  owner.
- Added regression coverage for the Skills selection flow returning cleanly to
  the menu and for Ctrl+C-style question aborts exiting without Node stack
  traces or unsettled top-level-await warnings.

## 0.5.40 - 2026-06-24

- Replaced the global Git pre-commit hook with a Windows-safe Node guard so
  staged secret-like filenames are blocked without requiring `sh` or `grep`.
- Added release-note extraction, release-readiness checks, localized release
  note freshness checks, and CI Gitleaks coverage so releases publish only the
  current section and keep secret scanning independent of local hooks.
- Added a GitHub-compatible PNG social preview asset requirement while keeping
  the SVG as editable source artwork.
- Tightened high-risk MCP connector defaults with timeout checks and a safer
  Supabase boundary that does not commit `SUPABASE_DB_URL` into launcher args.
- Clarified Memory MCP wording so the docs distinguish non-secret local memory
  use from copying private memory/session state.

## 0.5.39 - 2026-06-24

- Restored the emoji-rich agent team, skill catalog, and MCP connector tables on
  the English and Turkish README entry points while keeping the shorter
  first-run install flow from v0.5.38.
- Kept the restored tables explicit about runtime boundaries: agents are role
  definitions for visible delegation, skills do not execute by themselves, and
  high-risk MCP connectors remain disabled until opt-in.

## 0.5.38 - 2026-06-24

- Simplified the English and Turkish landing pages so first-run users see the
  install path, operating boundary, and trust signals before the detailed CLI
  reference.
- Moved the full Codex Chef CLI command inventory into the install guides while
  keeping the README command path short and scannable.
- Clarified agent, skill, MCP, and runtime routing language so visible
  delegation is documented as an explicit runtime/user-authorized flow rather
  than a hidden automatic promise.
- Updated CLI help, routing/status validators, and release gates so the new
  documentation shape is enforced before publication.

## 0.5.37 - 2026-06-24

- Hardened independent install behavior for zero-config, existing-config,
  existing-install, stale-plugin, odd-path, and ambient `CODEX_HOME` scenarios.
- Added installer smoke validation that proves no-write full previews,
  explicit `CODEX_HOME`/`AGENTS_HOME` targeting, agent/profile/rule/plugin
  installation, marketplace registration, idempotent refresh, and default
  approval boundaries.
- Backfilled missing managed root config defaults at the real TOML root while
  preserving user-defined root settings and custom MCP tables.
- Changed existing plugin installs to refresh managed files after backup while
  preserving extra user files unless a destructive prune is explicitly chosen.
- Added Windows-native installer CI coverage and package/repo gates for the new
  smoke validator, profile files, and installer path/prerequisite guards.

## 0.5.36 - 2026-06-22

- Fixed the PowerShell installer success path so `-All -WhatIf` exits with
  code `0` after a successful dry run instead of leaking a previous native
  command exit code into CI.
- Added installer alignment validation for the explicit successful PowerShell
  exit contract.

## 0.5.35 - 2026-06-22

- Changed the enterprise routing profiles to document visible specialist
  routing for clear, non-trivial prompt shapes while keeping actual subagent
  spawning bounded by the current runtime and explicit user/delegation request
  support.
- Updated the installed `AGENTS.md` contract, routing board, status boundary,
  README files, and skills/agents docs so matching agents and skills are
  surfaced visibly without treating subagents as hidden always-on background
  automation.
- Added readable `nickname_candidates` to all 21 bundled custom agent role files
  and extended agent validation so future releases cannot drop the UI-label
  contract.

## 0.5.34 - 2026-06-21

- Added a historical log signal scan to `npm run chef -- --diagnostics` and
  `npm run chef -- --logs`, including fail/warn/attention/raw-value counts,
  newest matching lines, and explicit wording that current health still comes
  from Status and Doctor.
- Tightened CLI log classification so historical `0 fail` summaries and
  account-connector warning text do not read as current failures.
- Completed the Turkish MCP operator screen by localizing setup hints for
  default, browser, account, filesystem, memory, Serena, and database
  connectors.
- Expanded CLI validation to cover the Turkish MCP screen, historical log
  signal output, menu transcripts, process/tunnel audit, diagnostics, and
  write-gated install/update/reset/repair previews.

## 0.5.33 - 2026-06-21

- Passed the selected CLI language through to the status subprocess so Turkish
  mode no longer falls back to an English status body.
- Localized the status board progress lines, state labels, MCP setup notes,
  warning summaries, and no-log footer while preserving machine-readable JSON
  values.
- Polished Turkish menu copy for managed-file repair, process audit, auth,
  diagnostics, and update actions.

## 0.5.32 - 2026-06-21

- Reworked `npm run chef` human output so menu write boundaries, MCP evidence
  states, diagnostics tables, and repo-only status no longer expose raw
  `none`, `null`, `not_checked`, or `configured_unverified` sentinel values.
- Added current package version, branch, commit, release-note target, and
  update safety behavior to the `--update` preview so users can see what they
  are on before applying a backup-backed managed refresh.
- Improved status readability with an MCP quick view, clearer skipped-probe
  wording, and safer display labels for profile-specific skill routing and
  uninspected managed hooks.

## 0.5.31 - 2026-06-21

- Clarified task-shape routing so Codex Chef's installed `AGENTS.md`, docs,
  routing profiles, status board, and validators treat subagent delegation as
  explicit user/runtime authorization instead of hidden auto-spawn behavior.
- Hardened the default command and MCP approval baseline: repository-controlled
  `npm run ...`, broad `git config`, raw `gitleaks dir`, and browser
  request/response detail tools now prompt instead of being globally
  auto-approved.
- Changed PowerShell and Bash installers to upsert only the Codex Chef plugin
  marketplace entry, preserving unrelated marketplace plugins and failing
  closed on invalid marketplace JSON.
- Improved `npm run chef` interactive UX with an in-menu language control,
  aligned compact menu rows, selected-action separators, Enter-to-return flow
  after long output, and terminal-safe compact tables for skills and MCP boards.
- Added a shared marketplace-entry helper so installer and repair flows preserve
  canonical plugin UI metadata and tolerate valid UTF-8 JSON files with a BOM
  on Windows.
- Tightened Bash installer replacement handling so backup and managed-directory
  replacement failures fail closed while dry-run still prints the full preview.

## 0.5.30 - 2026-06-20

- Added `token-safe.config.toml`, `npm run token:audit`,
  `npm run token:audit:json`, and `npm run validate:tokens` so context/token
  optimization is visible, validated, and profile-based instead of disabling
  skills, MCPs, subagents, hooks, apps, or memory.
- Changed specialist agent catalog metadata to automatic model/reasoning
  selection and removed per-agent model/reasoning pins from the role TOML files
  so the active Codex profile can choose the right effort for each task.
- Extended CI, release validators, README files, English/Turkish docs, and
  generated localized docs so token-safe, token audit, and agent-auto behavior
  remain documented across all six documentation languages.
- Added `npm run chef -- --processes` and `npm run chef:processes` as a
  read-only process audit for Serena, MCP, browser, Python, and Node processes;
  the command reports counts but never stops processes.
- Reconciled installed managed Codex Chef runtime files through backup-backed
  repair so `verify:install:runtime` can prove `38/38` managed files current.

## 0.5.29 - 2026-06-20

- Added `npm run chef -- --diagnostics` / `--diagnose` and
  `npm run chef:diagnostics` as a read-only diagnostic hub with repo-only
  health, attention reasons, next safe actions, backup/log summaries, update
  and repair preview entry points, runtime parity, and Serena/MCP process-audit
  commands.
- Extended Chef CLI validation and English/Turkish docs so the diagnostic menu,
  parseable `npm run --silent ... --json` path, log root, recent log metadata,
  and no-process-stop safety contract remain covered.

## 0.5.28 - 2026-06-20

- Added Turkish operator text for the Chef CLI through `--lang tr`, `--tr`,
  and `CODEX_CHEF_LANG=tr` while keeping JSON output stable and English flags
  unchanged.
- Made `npm run chef -- --update` concise by default with managed overwrite
  targets, backup behavior, skipped surfaces, next command, and a
  `--verbose-plan` path for the full installer dry-run evidence.
- Added subagent and MCP lifecycle hygiene to the routing board, shipped global
  `AGENTS.md` template, README, and skill/agent docs so completed agent
  threads are closed and persistent MCP processes such as Serena are reported
  instead of silently accumulating.
- Added preview-first `npm run chef -- --backups --backup <id> --delete`
  support, with `--apply` required before a selected Codex Chef backup archive
  is removed.
- Relabeled repo-only status progress from `codex:doctor` to `repo:doctor` so
  skipped direct Codex CLI doctor checks are not misrepresented as running.
- Extended Chef CLI and status validators with Turkish CLI smokes, concise
  update preview checks, backup Turkish output coverage, routing lifecycle
  coverage, and repo-doctor label checks.

## 0.5.27 - 2026-06-20

- Added `npm run chef -- --backups` and `npm run chef:backups` so operators can
  list Codex Chef backup archives, inspect metadata, and preview restore targets
  without touching global/user state.
- Added `npm run chef -- --backups --backup <id> --restore --apply` for
  apply-gated restore of known Codex Chef-managed files, with a fresh rollback
  backup created before current targets are overwritten.
- Added backup manifest generation for new installer, repair, and restore
  rollback archives, including package version, operation, platform,
  backup-relative paths, sizes, hashes, and archive issues.
- Extended Chef CLI validation with temporary-home backup smokes for list,
  inspect, restore preview, restore apply, rollback backup creation, and JSON.
- Updated install, upgrade, verification, security, README, and Turkish docs so
  backup inventory and restore behavior are documented as first-class CLI
  surfaces.

## 0.5.26 - 2026-06-20

- Added `npm run chefg` as a compatibility typo alias for the same Chef CLI
  menu, while keeping `npm run chef` as the canonical documented command.
- Added validator coverage so the alias remains wired to the Chef CLI and does
  not drift into a missing-script npm error again.

## 0.5.25 - 2026-06-20

- Added `npm run chef -- --update` and `npm run chef:update` as a safe
  update preview/apply flow for Windows-first Codex Chef refreshes.
- Kept update preview no-write by default; `--apply` now requires a clean
  worktree, runs `git pull --ff-only`, stops for review after a changed pull,
  runs local validation/security audit before same-tree refresh, and only then
  uses the existing backup-backed managed installer path.
- Scoped update refresh to managed Codex Chef files only so it does not install
  curated global skills or optional global Git guards.
- Tightened repo-only status output so it explicitly skips installed runtime,
  global skill inventory, Codex log metadata, and live Codex CLI probes.
- Added forced-color/plain-output smoke checks plus validator coverage for the
  update command, parseable JSON mode, unknown CLI options, stale package
  examples, wrong `npx run` entrypoints, and skill activation contract.
- Updated install, security, upgrade, verification, README, and Turkish docs so
  the documented command surface matches the CLI.

## 0.5.24 - 2026-06-18

- Added a read-only Chef routing menu/flag so operators can inspect task-shape
  agent routing, skill triggers, MCP choices, subagent wait policy, and final
  "Surfaces used" reporting from the CLI.
- Strengthened the Codex `AGENTS.md` template with visible `Agent plan`,
  `Agent started`, `Agent result`, `Skill selected`, `MCP selected`, and
  `Surfaces used` contracts so delegated work is tracked instead of silent.
- Added validator and smoke coverage for the routing visibility contract and
  installed the updated global AGENTS template through the backup-backed repair
  flow.
- Fixed wrong-current-directory CLI/script execution by resolving repository
  roots from script locations and documented `npm --prefix` usage for
  PowerShell users who start outside the repo.
- Added `--status --repo-only` for fast local status checks that skip installed
  runtime and live Codex CLI probes, while full status keeps progress messages.
- Expanded routing profiles with owner, durability, privilege, validation, and
  rollback metadata, and made MCP status evidence distinguish cataloged,
  installed-config, live `codex mcp list`, and `/mcp` session-visible states.
- Normalized MCP JSON parsing across status and runtime verification so array,
  `servers`, `mcp_servers`, and object-map shapes are handled consistently.

## 0.5.23 - 2026-06-17

- Added immediate progress messages to the Chef status wrapper, direct status
  board, and install runtime verifier so long Codex/runtime checks do not look
  silent or broken while they collect evidence.

## 0.5.22 - 2026-06-17

- Fixed the Codex status validator for CI and fresh machines where the Codex
  CLI is not installed: ambient status now remains visible as an attention
  state instead of failing validation before users install Codex.

## 0.5.21 - 2026-06-17

- Upgraded the Codex Chef status board with an end-user quick start,
  target/ambient Codex runtime checks, live MCP/login/version probes, Git
  health, routing/effective-control summaries, and metadata-only log reporting.
- Fixed false terminal-health warnings by letting the Codex child process inherit
  the real terminal environment instead of forcing `TERM=dumb`.
- Strengthened release validation for visual CLI icons, mojibake regressions,
  escaped Windows path redaction, fake Codex command probes, dirty Git worktree
  attention states, and no log-content inspection.

## 0.5.20 - 2026-06-17

- Removed remaining machine-specific local-audit path details from public
  verification docs so the latest main commit is included in a release tag.

## 0.5.19 - 2026-06-17

- Replaced public README and CLI auth guidance that printed account-scoped
  re-auth commands with safer GitHub authentication boundary guidance.
- Added a `--auth` CLI smoke check so public-safe auth guidance stays covered
  by `npm run validate:chef-cli`.

## 0.5.18 - 2026-06-17

- Fixed the `validate:chef-cli` reset-preview smoke assertion so it works on
  both Windows PowerShell `-WhatIf` output and Linux Bash dry-run output.
- Kept the `v0.5.17` CLI hardening intact: `--no-log`, richer MCP tables,
  runtime CLI smoke checks, and repaired Turkish MCP catalog text.

## 0.5.17 - 2026-06-17

- Added `--no-log` to the Codex Chef CLI for strict audit runs that should not
  create repo-local `tmp/chef-cli/logs` files.
- Expanded the MCP operator view with transport, endpoint/package, source, and
  config-detail guidance so connector choices are safer from the CLI alone.
- Strengthened `validate:chef-cli` with no-log runtime smoke checks for help,
  MCP, skills, and reset preview flows.
- Repaired the Turkish MCP catalog encoding with ASCII-safe Turkish text.

## 0.5.16 - 2026-06-16

- Completed the Codex Chef CLI operator flow with `--reset` for backup-backed
  managed refresh/reinstall previews and apply-gated execution.
- Added interactive skill selection so users can pick one reviewed skill by
  number and install it only with `--skills --apply`.
- Added interactive MCP selection so users can pick one connector by number and
  see setup, auth, verification, and rollback guidance without enabling it.

## 0.5.15 - 2026-06-16

- Added `npm run chef`, a Windows-friendly Codex Chef operator menu for
  status, doctor, preview, install, repair, skills, MCP, auth, and log flows.
- Added `scripts/validate-chef-cli.mjs` and wired it into `npm run check` so the
  CLI keeps write boundaries, redaction, log placement, and auth guidance under
  release validation.
- Replaced concrete GitHub CLI and Git Credential Manager recovery commands with
  public-safe auth boundary guidance that keeps token scope decisions and global
  credential setup outside repo files or config.

## 0.5.14 - 2026-06-16

- Disabled app/connectors by default through `apps._default.enabled = false`
  and taught repair mode to migrate existing Codex Chef installs to that safer
  default while preserving the destructive/open-world app gates.
- Expanded README install-parameter coverage and clarified that English and
  Turkish carry the full operator details while the other localized docs provide
  safety summaries with source indexes.

## 0.5.13 - 2026-06-16

- Added `catalog/routing-profiles.json`, `npm run codex:routing`, and status
  board routing summaries so Codex Chef exposes the task-shape mapping between
  agents, skills, MCPs, and config/profile flags.
- Extended installer capability boards to show enterprise routing profiles
  alongside agents, MCP defaults, plugin skills, and reviewed global skills.
- Added MCP setup hints to the machine-readable catalog, installer capability
  board, status board, and MCP docs so tooling, OAuth, filesystem-path, and
  `SUPABASE_DB_URL` requirements are visible before connector opt-in.
- Added an effective-controls summary to `npm run codex:status` and a routing
  profile visibility gate for the global `AGENTS.md` template.
- Removed the deprecated `apps._default.default_tools_enabled` field from
  Codex config templates and taught repair mode to remove that managed field
  from existing installs so `codex exec --strict-config` can start cleanly.
- Changed runtime repair and verification for `rules/default.rules` to require
  the managed safety baseline while preserving local approval rules added by
  normal Codex use.
- Updated first-party Skills CLI mappings to the current upstream skill names
  `ai-project-starter`, `prompt-architect`, and `ai-skill-create`.

## 0.5.12 - 2026-06-16

- Polished `npm run codex:status` skill inventory reporting so it shows
  curated, missing, and other installed skill counts without exposing the names
  of user-installed extra skills.
- Added `scripts/repair-install.mjs`, `npm run repair:install`, and installer
  `-Repair` / `--repair` entry points for backup-backed repair of existing
  global Codex setups without deleting user skills.
- Kept the status board read-only and preserved the v0.5.11 source-backed
  agent, runtime-verifier, and installer safety improvements.

## 0.5.11 - 2026-06-16

- Promoted additional official enterprise setup sources into the specialist
  agent research corpus: PowerShell execution policy, Git config, GitHub
  supply-chain/dependency review, SLSA, npm provenance/trusted publishing, and
  Sigstore.
- Strengthened `devex_auditor`, `codex_doctor`, `security_auditor`,
  `release_verifier`, and `code_reviewer` so Windows setup, global Git guards,
  dependency review, provenance, tokenless npm publishing, and artifact
  signing are handled with source-backed runtime guidance.
- Preserved the safe installer model: existing Codex config is merged, managed
  files are preserved unless force is chosen, optional Git guards remain
  explicit opt-in, and authenticated MCP connectors stay disabled by default.
- Expanded read-only runtime verification so installed managed files are
  compared against the current repo templates and ambient `CODEX_HOME` drift is
  reported separately from the installed target under test.
- Updated research notes, advisory-source docs, release notes, plugin metadata,
  and release guidance for the new source-backed patch.

## 0.5.10 - 2026-06-16

- Made the recommended Windows path a guided `.\scripts\install.ps1 -All
  -Interactive` setup so first-time users see the decisions before anything
  real is installed.
- Expanded `-Interactive` / `--interactive` to ask about reviewed skill
  installation, backup-backed force replacement, optional Git guards, and final
  continue/cancel confirmation while never asking for credentials.
- Added a post-install capability board to PowerShell and Bash installers that
  lists installed specialist agents, default-ready MCP servers, opt-in MCP
  connectors, local plugin skills, and reviewed global skills.
- Kept automation simple with the unchanged noninteractive `-All` / `--all`
  path for CI, scripts, and users who already know the defaults.
- Updated installer alignment validation, expected-output docs, install guides,
  release notes, and package/plugin metadata for the richer guided setup.
- Tightened specialist-agent validator coverage for the operational research
  blocks that were added to the agent corpus.

## 0.5.9 - 2026-06-16

- Reworked the README first screen with a more prominent MCP connector board
  so enabled local/research servers and disabled account/database connectors
  are visible beside agents and skills.
- Replaced the Codex Chef icon with a more polished animated badge while
  preserving title, description, motion, and reduced-motion accessibility.
- Updated the banner install command to show the safe default `-All` path
  instead of implying force should be used on first install.
- Added PowerShell `-Interactive` and `-PlainOutput` switches so Windows users
  can choose guided path/Git-guard prompts or ASCII-only output without
  weakening the default noninteractive installer.
- Added Bash `--plain-output` and aligned installer section/status output
  across PowerShell and Bash while preserving backup-first merge behavior.
- Updated install and expected-output docs for the guided install path, config
  merge behavior, runtime verification command, and current patch version.

## 0.5.8 - 2026-06-16

- Added `scripts/merge-codex-config.mjs` so existing `config.toml` files are
  preserved by default while missing Codex Chef agent, MCP, and safety tables
  are merged in after backup.
- Updated PowerShell and Bash installers to use safe config merge when
  `config.toml` already exists and `-Force` / `--force` was not requested.
- Corrected the install-plan collision policy for `codex-config` to advertise
  merge-missing-blocks behavior instead of skip-only behavior.
- Expanded the English and Turkish README MCP sections into icon-rich enabled
  and opt-in connector lists so MCPs are as visible as agents and skills.
- Added installer-alignment validation for the config merge helper.

## 0.5.7 - 2026-06-16

- Added `scripts/verify-install-runtime.mjs` and
  `npm run verify:install:runtime` for read-only post-install verification of
  installed Codex Chef files, MCP blocks, specialist agents, optional skills,
  optional Git guards, and active Codex CLI `CODEX_HOME` drift.
- Updated the default README and install-guide commands to omit force on first
  install so existing user config, MCP settings, agents, rules, and marketplace
  files are skipped unless the user explicitly chooses a backup-backed
  upgrade.
- Clarified that `-Force` / `--force` is an upgrade path, not the safe default
  first-run path.
- Added runtime-verifier guidance to install, troubleshooting, verification,
  and upgrade docs so sandbox/offline Codex homes are diagnosed without
  mutating user-global config.
- Updated installer success output to include the read-only runtime verifier.

## 0.5.6 - 2026-06-16

- Added reviewed per-tool MCP approval overrides for read-only browser,
  repository-indexing, and memory lookup tools so common evidence gathering is
  smoother while interactive, account, filesystem, and mutating tools still
  prompt.
- Tightened MCP config parsing in `scripts/codex-doctor.mjs` and
  `scripts/validate-mcp-config.mjs` so nested tool override tables are not
  counted as separate MCP servers.
- Expanded conservative command-approval rules for read-only PowerShell, Git,
  GitHub CLI, Gitleaks, and local validation commands without allowing
  deletion, publishing, credential access, or broad shell execution.
- Updated release metadata, plugin version, and expected-output examples for
  the new patch release.

## 0.5.5 - 2026-06-16

- Added a root `llms.txt` agent-readable index inspired by high-signal
  catalog repositories such as Awesome Copilot, while keeping Codex Chef's
  installer and connector defaults unchanged.
- Made `llms.txt` part of the required public source surface through
  `package.json`, `scripts/validate-repo.mjs`, and
  `scripts/validate-package-surface.mjs`.
- Linked the agent-readable index from all six README entry points and the
  completion audit so future agents can find install targets, safety
  boundaries, verification commands, and high-signal comparison sources quickly.
- Added per-agent expertise-signal metadata and validation so each specialist
  has machine-checkable decision heuristics, failure modes, and verification
  signals, not just source references.
- Added an `Expertise signal contract` to every specialist role file so the
  reviewed expertise signals change runtime behavior instead of living only in
  the corpus manifest.
- Added `supplementalResearchRefs` to the agent research corpus so repo
  patterns, skill examples, command snapshots, and research papers are
  machine-checkable without becoming default runtime authority.
- Added authority-reference source freshness cadence metadata and validation so
  stale official docs, standards, vendor guidance, and tool-source references
  fail `validate-agent-research-corpus.mjs` before specialist role prompts
  drift.

## 0.5.4 - 2026-06-15

- Added a read-only `google_seo_auditor` specialist for Google Search
  visibility, crawlability, metadata, structured data, Core Web Vitals, and
  Search Console-ready checks.
- Rebalanced the optional installable skill catalog away from Vercel/design
  overlap toward maintenance, security, testing, SEO, accessibility, web
  quality, docs, CI, and one broad frontend workflow.
- Expanded the optional installable skill allowlist from nine to sixteen
  verified sources by adding `systematic-debugging`,
  `request-refactor-plan`, `webapp-testing`, `mcp-builder`, and the
  first-party `ai-project-starter`, `prompt-architect`, and
  `ai-skill-create` skills.
- Added the bundled local `context-budget-planner` skill for token/context
  budgeting, source prioritization, compaction handoff, and verification gates.
- Added reference-backed bundled skill guidance with `references/*.md`,
  `agents/openai.yaml`, and `npm run validate:plugin-skills` so local plugin
  skills cannot silently lose instructions, UI metadata, or catalog coverage.
- Documented the exact offline diagram contract for the supported Mermaid
  subset, editable Excalidraw scene shape, and SVG/PNG/Markdown outputs.
- Moved the first-party ecosystem skills `ai-project-starter`,
  `prompt-architect`, and `ai-skill-create` into the reviewed `-All` /
  `-InstallSkills` set.
- Kept global Git ignore, hook, and Git config changes out of `-All`; they now
  require the explicit `-InstallGitGuards` / `--install-git-guards` opt-in.
- Kept `impeccable`, extra design-taste, Vercel, prompt, context, memory, and
  token-related skills visible as manual opt-in catalog references without
  adding duplicate default triggers.
- Fixed Codex Chef doctor skill lock counting and added a guard that keeps
  lock entries aligned with installable skills.
- Added agent-template validation against Google credential environment names.
- Added explicit app/connector safety defaults that keep destructive and
  open-world connector tools disabled unless a reviewed override changes them.
- Added content-safety validation for likely UTF-8/Windows-1252 mojibake
  regressions in tracked text files.
- Sandboxed online skill-source checks under ignored `tmp/skill-source-check`
  so `npm run verify:skills:online` cannot treat the repo root as its working
  project and mutate tracked templates.
- Expanded GStack/ECC research notes to document adopted role, manifest,
  doctor, and diagram patterns while excluding default cookie, tunnel, deploy,
  raw-CDP, hook-injection, and cross-harness sync behavior.
- Added role-specific research-synthesis and adversarial-validation guidance to
  all twenty-one specialist agent templates so external starter patterns become
  compact evidence-backed decisions instead of copied hidden behavior.
- Added role-specific source-refresh, source-currency, and corpus-expansion
  guidance to all twenty-one specialist agent templates so stale evidence is
  refreshed and broader local, official, standards, vendor, and specialist
  sources become compact operating rules.
- Added role-specific expert-calibration guidance to all twenty-one specialist
  agent templates so each role checks its output against senior-quality gates
  before handing work back.
- Strengthened `validate-agent-config.mjs` so every specialist agent template
  must keep exactly one copy of each required guardrail block, at least 100
  source-backed instruction items, and at least 20 distinct source markers.
- Added `catalog/agent-research-corpus.json` plus
  `validate-agent-research-corpus.mjs` so each specialist agent's research
  domains, source types, refresh triggers, and handoffs are machine-checkable.
- Added reviewed authority-reference metadata to the agent research corpus so
  specialist source families, URLs, source types, staleness risk, and source
  markers are centralized instead of repeated differently across roles. The
  corpus validator now ties those keys back to source markers in each role TOML
  file.
- Added an `Authority metadata contract` block to every specialist TOML so the
  reviewed corpus metadata changes agent runtime behavior when the role is
  invoked, not only offline validation.
- Mapped cross-model review workflows explicitly to `code_reviewer` and manual
  Codex CLI use while keeping automatic external-agent launch out of the
  default setup.

## 0.5.3 - 2026-06-15

- Published the final README render fix so release/tag views no longer show the
  older long agent table text.
- Converted the English and Turkish agent/skill catalogs to short bullet-style
  summaries that stay readable in GitHub's narrow README layout.
- Kept install behavior, agent templates, MCP defaults, skill sources, and
  security gates unchanged.

## 0.5.2 - 2026-06-15

- Removed duplicated first-screen README messaging by keeping the install
  outcome summary short and moving detailed agent/skill descriptions into
  dedicated catalogs.
- Reworked the English and Turkish agent/skill tables so friendly names, icons,
  config IDs, install modes, and use cases live in separate columns instead of
  stacked duplicate labels.
- Clarified that Codex Chef installs Codex subagent role definitions, not
  separate background services.

## 0.5.1 - 2026-06-15

- Polished root README onboarding so users can see install commands, the
  bundled agent team, skills, and MCP defaults at a glance.
- Reworked the English and Turkish agent/skill tables with icons, friendly role
  names, and clearer explanations while keeping the actual Codex config IDs
  visible.
- Added natural-language install-outcome summaries to the German, Spanish,
  Brazilian Portuguese, and French README entry points.
- Removed the duplicate language tagline from all six root README entry
  points.
- Updated the validation workflow to Node 24-era pinned GitHub Actions:
  `actions/checkout` v6.0.3 and `actions/setup-node` v6.4.0.
- Kept installer behavior, global-write boundaries, skill allowlists, and
  disabled-by-default authenticated connectors unchanged.

## 0.5.0 - 2026-06-15

- Rebranded the project as Codex Chef with the public package slug
  `codex-chef`.
- Added Codex Chef visual identity assets: `assets/icon.svg` and
  `assets/social-preview.svg`.
- Added SEO/discoverability guidance for GitHub description, topics, social
  preview, search-safe claims, and post-publication measurement.
- Renamed the local plugin surface to `codex-chef-workflows` and the bundled
  maintenance skill to `codex-chef-operator`.
- Updated README, GitHub metadata guidance, release notes, install paths,
  validators, and package metadata for the rebrand.

## 0.4.0 - 2026-06-15

- Added four Codex specialist agents: `context_architect`,
  `prompt_architect`, `mcp_integrator`, and `codex_doctor`.
- Expanded the bundled specialist set to twenty agents with product strategy,
  engineering planning, design review, DevEx audit, root-cause debugging, QA,
  performance, docs authoring, and spec authoring roles.
- Added `npm run codex:doctor` and `npm run validate:doctor` for no-write
  starter health, catalog drift, docs matrix, MCP, skills, and install-plan
  diagnostics.
- Added a six-language Codex capability map documenting prompts, AGENTS.md,
  config, rules, skills, plugins, MCP, subagents, and doctor/status boundaries.
- Added a six-language workflow surface map that converts ECC/GStack-style
  slash workflows into Codex-native skills, subagents, MCP, plugins, and
  approval gates.
- Added a bundled `offline-diagram-triplet` skill plus a zero-network renderer
  that emits Mermaid, editable Excalidraw, SVG, PNG, and Markdown artifacts.
- Added `npm run diagram:triplet` and `npm run validate:diagram` so the diagram
  workflow is executable and smoke-tested locally.
- Hardened the offline diagram renderer with cyclic-graph rejection, graph size
  limits, pixel budget checks, PNG initialization ordering, and temp cleanup in
  validation.
- Expanded README and setup docs so the starter presents a fuller Codex
  operating model without enabling broad connectors, hooks, or global writes.

## 0.3.1 - 2026-06-15

- Added German, Spanish, Brazilian Portuguese, and French deep documentation
  files for every English guide, bringing the docs matrix to six languages.
- Added `npm run validate:doc-locales` and `npm run sync:doc-locales` so deep
  doc locale coverage is generated, checked, and included in `npm run check`.
- Updated multilingual README positioning so root README files no longer imply
  that deep documentation is only English/Turkish.

## 0.3.0 - 2026-06-14

- Added an ECC-informed manifest-backed install plan with a dependency-free
  `npm run plan:install` preview command.
- Added no-write install discovery commands for profiles and operations:
  `node scripts/plan-install.mjs --list-profiles` and
  `node scripts/plan-install.mjs --list-operations`.
- Added install-plan schema documentation and validation so managed files,
  collision policies, backups, platforms, risk levels, and explicit flags stay
  reviewable before installer execution.
- Added an install-state preview schema and validator so machine-readable plan
  output has a stable, dependency-free contract.
- Added `--redact-paths` for publish-safe install-state preview evidence.
- Documented ECC compatibility boundaries in English and Turkish: adapt
  manifest/plan/state patterns, but do not import broad global sync, implicit
  dependency installation, or enabled-by-default authenticated connectors.
- Expanded security and public-readiness gates to reject unsafe install-plan
  operations, implicit installer dependency installs, yolo Codex profiles, and
  active `@latest` package specs.
- Pinned all npm-based MCP package specs in Codex config templates and MCP
  catalog metadata instead of allowing unversioned or floating package
  resolution.
- Tightened command-approval rules so cleanup scripts prompt instead of being
  auto-allowed.
- Tightened command-approval rules so global skill installation and broad Skills
  CLI commands prompt instead of being auto-allowed.
- Hardened online skill-source verification to use argv-based invocation and a
  temporary Windows wrapper instead of an interpolated PowerShell command
  string.
- Clarified that the skill lock file is a reviewed source allowlist rather than
  an immutable upstream commit lock, and made this expectation machine-gated.
- Added MCP catalog/config drift validation and supply-chain IOC scanning to
  the default check pipeline.
- Added release-readiness validation for source-controlled release notes,
  GitHub metadata docs, workflow hardening, Gitleaks gates, and artifact hygiene.
- Added manifest-to-installer alignment validation so PowerShell and Bash setup
  surfaces stay synchronized with the install plan.
- Added a specialist-agent catalog and validator so bundled agent metadata,
  Windows/Unix config blocks, and role TOML files stay synchronized.
- Added install-plan output smoke coverage for parseable JSON, Windows UNC and
  extended-length paths, `--force`, and `--no-backup`.
- Added versioned release notes and GitHub repository settings guidance for the
  v0.3.0 publication path.
- Added CODEOWNERS, feature/question issue templates, disabled blank issues,
  and advisory-source docs so public triage stays owned and public-safe.
- Added German, Spanish, Brazilian Portuguese, and French root README entry
  points, plus a six-language README switcher and validation gate.
- Added README locale validation and workflow-security validation so language
  links, checkout credential persistence, workflow permissions, and
  no-publish/no-auth workflow boundaries stay machine-gated.
- Pinned GitHub Actions workflow dependencies to full commit SHAs and extended
  workflow validation so future tag-based action refs fail locally and in CI.
- Extended ECC drift gates to reject plugin-bundled hooks, MCP/apps surfaces,
  write-capable plugin manifests, marketplace auth requirements, broad hook
  runtime paths, workflow write permissions, unpinned git MCP launchers, plugin
  `.mcp.json` drift, and install-plan destinations outside reviewed
  Codex/Agents/Git-guard targets.
- Added dangerous invisible Unicode character validation for text source files
  while preserving legitimate README emoji/icon usage.
- Expanded local-path leak detection to catch non-placeholder Windows, macOS,
  and Linux home paths, not only one maintainer machine path.
- Added security validation that blocks imported ECC-style lifecycle hook
  runtimes and automatic session/additional-context injection patterns unless a
  future change explicitly reviews and documents them.
- Added package-surface dry-run validation with a repo-local npm cache and
  `--ignore-scripts`, plus bounded online skill-source resolution timeouts.
- Added an explicit `package.json` source package allowlist and validation so
  package dry-runs stay deterministic and exclude local agent state, scratch
  folders, archives, and auth material.

## 0.2.0 - 2026-06-14

- Added PowerShell `-WhatIf` and Bash `--dry-run` installer previews, including
  safer managed-directory assertions and no-write skill previews.
- Added a reviewed installable skill catalog and online source verification that
  uses an ignored workspace-local npm cache for Windows-safe checks.
- Added Markdown/workflow validation, expanded security validation, and CI
  coverage for Node, PowerShell, Bash, and repo checks.
- Rebuilt the English and Turkish README experience with icon-rich quick starts,
  setup boundaries, trust signals, and official reference links.
- Added bilingual troubleshooting, upgrade, and expected-output docs.
- Added shell environment policy defaults to Codex config templates so common
  token, password, key, and secret environment names stay excluded.
- Clarified global and template subagent routing so task-shape automation uses
  deliberate specialist delegation instead of implying hidden background
  spawning.
- Added stronger skill-routing guidance for implicit triggers, full `SKILL.md`
  loading, and plugin packaging boundaries.
- Added MCP routing and config-flag guidance covering approval modes, tool
  allow/deny lists, startup/tool timeouts, and environment-backed credentials.
- Added explicit subagent depth and MCP timeout defaults to the Windows, Unix,
  and live global Codex config templates.
- Made matching skill, specialist-agent, MCP, and config-flag routing mandatory
  when the task shape calls for it.
- Strengthened deletion and cleanup approval rules while allowing safe
  non-destructive work to continue.

## 0.1.0 - 2026-06-10

- Initial Windows-first Codex enterprise setup starter.
- Added bilingual documentation.
- Added safe Codex templates for AGENTS, config, rules, agents, and profiles.
- Added MCP and skill catalogs.
- Added install scripts for PowerShell and Bash.
- Added validation script and GitHub Actions workflow.
- Added optional local plugin marketplace package.
- Added public-readiness, verification, privacy, support, and conduct docs.
- Added security audit script covering safe defaults, disabled authenticated MCPs, and leak patterns.
- Added one-shot installer flags and complete English/Turkish docs pairing.
- Added completion audit docs that map requirements to repository evidence.
- Added README storefront visuals, real badges, Turkish first-screen signal, and SVG asset validation.
- Added bilingual public-safe issue templates and a pull request template.
- Added README trust-signal tables and expanded repository map entries.
- Added Dependabot configuration for GitHub Actions and npm manifest updates.
- Added icon-rich README polish, animated SVG visuals, emoji accents, and reduced-motion validation.
- Ignored local Serena state in Git and repository scans.
- Fixed optional skill installation to use verified packages with
  `--skill`, `--yes`, and `--global` instead of cloning plain skill names.
- Added senior best-practice operating docs and a skill-source verification
  script so installable packages are checked before users run the installer.
- Hardened full installer skill handling so existing global skills are skipped,
  new installs target Codex only, GitHub clone uses an OpenSSL override, and
  reported skill install failures stop the installer.
- Suppressed raw Skills CLI progress output on successful installs so Windows
  PowerShell users see short ASCII status lines instead of mojibake blocks.
