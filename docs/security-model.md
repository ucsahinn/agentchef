# Security Model

The setup is designed for high-leverage local work without weakening the core
Codex safety model.

## Defaults

- `sandbox_mode = "workspace-write"` keeps writes inside the workspace by
  default.
- `approval_policy = "on-request"` keeps escalations interactive.
- `approvals_reviewer = "auto_review"` can automatically review eligible
  approval prompts; it does not expand the workspace sandbox or override command
  rules. Risky and unmatched operations remain prompt-gated.
- Network access stays disabled in the workspace-write sandbox unless a trusted
  profile or explicit approval changes that.
- `shell_environment_policy` uses `inherit = "core"` and keeps default secret
  exclusions active so subprocesses do not inherit broad local token variables
  by default.
- Authenticated remote connectors are present as disabled examples.
- App/connector defaults keep destructive and open-world tools disabled unless
  a reviewed app-specific override changes them.
- Global command rules are narrow and biased toward read-only discovery and
  local verification.
- Every repository-controlled `npm run...` command prompts, including familiar
  build, test, check, validate, dev, and status script names, because the
  repository controls the shell code behind them. Exact read-only npm
  inspections (`ls`, `outdated`, `view`) and the reviewed no-script package
  dry-run remain allowed.

AgentSpace account profiles resolve an isolated `CODEX_HOME`. A worker session
therefore receives the safe defaults only when its own root `config.toml` carries
the same workspace-write, on-request, and auto-review trio. Changing another
Codex home cannot update an already running worker; start a new pane after the
profile is changed.
- Git mutations such as fetch, branch/tag/remote changes, config writes, staging,
  commit, push, reset, checkout, and restore prompt. Exact read-only inspections
  such as status/diff/log/show, `branch --show-current`/`--list`, `remote
  get-url`, `tag --list`, and allowlisted config-key reads remain allowed.
- `token-safe.config.toml` reduces verbosity, default reasoning, compaction
  threshold, and tool-output size without disabling skills, agents, MCP
  servers, memory, hooks, or apps.
- Deletion, cleanup, pruning, uninstall, overwrite, database drop/truncate, and
  other destructive operations require explicit user approval. Safe
  non-destructive work can continue while the destructive part waits.

## MCP Boundaries

MCP servers can expose tools outside the shell sandbox. Treat them as powerful
connectors, not harmless documentation helpers.

Rules used in this starter:

- OpenAI Docs and the lazy Serena semantic bridge are enabled by default in
  the Codex base config. Playwright and Chrome DevTools are off by default on
  both CLIs: the Codex `full` profile turns them on, `multi-session` and
  `offline` keep them off, and on Claude Code a project adds them when a task
  needs browser evidence (catalog `scope: "project"`). Context7 is an opt-in library-documentation helper on
  Codex because it starts an additional Node process and may need first-run
  network access.
- The former `memory` and `filesystem` servers are no longer cataloged. A Codex
  `-Update` drops their config tables only when they are byte-identical to what
  AgentChef wrote (`templates/codex/retired-tables.json`); an edited table stays
  and is reported.
- Playwright and Chrome DevTools are local browser verification tools; only
  evidence/navigation tools are allowlisted by default, while interaction,
  evaluation, upload, and request-detail tools stay prompt-gated or disabled.
- Codebase Memory is packaged as a local code-intelligence connector. Graph
  read/query tools are allowlisted, but indexing and destructive/admin graph
  tools stay prompt-gated or disabled because they write local graph state.
- GitHub, Figma, Linear, Notion, Sentry, Vercel, and Supabase are disabled until
  the user intentionally enables and authenticates them.
- Token values must come from environment variables, not repo files.
- External write-capable tools should use prompt approval.
- Reviewed documentation and reasoning MCP tools may use
  `default_tools_approval_mode = "approve"`. Browser, semantic-code, and
  codebase-graph MCP servers use `default_tools_approval_mode = "prompt"` with
  explicit `enabled_tools` allowlists for evidence, navigation, and read-only
  graph queries. Browser request/response detail, browser interaction, symbol
  edits, graph indexing, account, database, production, deploy, publish, and
  mutating tools should use `"prompt"` or stay disabled.
- Browser network listing can be approved for local QA. Request/response
  detail tools such as Playwright `browser_network_request` and Chrome DevTools
  `get_network_request` stay prompt-gated or disabled because they may expose
  headers, cookies, or response bodies.
- The managed Playwright launcher uses `--isolated` and
  `--block-service-workers`, so its default browser profile is not persisted
  and service-worker registration cannot retain cross-task state.
- Windows npm-backed stdio launchers disable `cmd.exe` AutoRun with `/d`, use
  `/s /c npx.cmd`, and forward
  `NoDefaultCurrentDirectoryInExePath=1`. This prevents the inner `npx.cmd`
  lookup from preferring a workspace-local shadow command. The outer
  `cmd.exe` path is still resolved by the Codex host before the per-server
  environment exists; a fully path-independent static template cannot prove
  that outer launcher provenance on every Windows installation. Hosts that run
  Codex from untrusted working directories should also set
  `NoDefaultCurrentDirectoryInExePath=1` in the parent environment or
  materialize trusted absolute launcher paths for that machine.
- On Claude Code the `agentchef` plugin ships `context7` and `serena`
  (`plugins/agentchef/mcp/claude.mcp.json`). The npx servers start
  through `plugins/agentchef/scripts/mcp-launch.mjs`, which refuses anything but
  an exact `name@x.y.z` pin (a range or tag would start whatever the registry
  serves that day) and any argument with shell syntax; on Windows it goes
  through `cmd.exe /d /s /c npx.cmd` with
  `NoDefaultCurrentDirectoryInExePath=1`. When npx's cache already holds that
  exact version (its installed `package.json` version equals the pin and the
  bin stays inside the package folder), the launcher runs that entry point in
  its own node process instead of starting npx again; the code that runs is
  the same npx would run. Serena runs the plugin's copy of the
  shared pool bridge with `--project-root ${CLAUDE_PROJECT_DIR}`, so both CLIs
  share one read-only backend per project.
- A user-scope `.claude.json` entry outranks a plugin server of the same name.
  The installer therefore retires the `context7` and `serena` entries a 1.0–1.2
  install wrote there, but only when the value still matches the hash in the
  MCP receipt. Any other same-name entry is the user's: it is kept and reported
  as shadowing the plugin, and only `-AdoptMcp` / `--adopt-mcp` retires it,
  after a backup of `.claude.json`.
- Claude Code has no per-server tool allowlist, so the Codex decisions become
  permission rules generated from the catalog: `approve` → `allow`, `prompt` →
  `ask`, and `deny` for codebase-memory's `delete_project`, `index_repository`,
  `ingest_traces`, and `manage_adr` plus Playwright's
  `browser_run_code_unsafe`, `browser_evaluate`, and `browser_file_upload`.
  Playwright's rules use the plain `mcp__playwright__<tool>` names, so the deny
  rules keep its riskiest tools shut as soon as a project adds the server.
  Claude Code cannot turn off one plugin MCP server on its own (only
  `--strict-mcp-config` disables every server), which is why the browser
  servers are not in the plugin.
- Apps/connectors also have a separate `[apps._default]` gate:
  `enabled = false`, `destructive_enabled = false`, and
  `open_world_enabled = false` are part of the reviewed templates.
- New MCP servers should prefer narrow config flags such as `enabled_tools`,
  `disabled_tools`, `startup_timeout_sec`, and `tool_timeout_sec` over broad
  prose-only instructions.
- Generated code-intelligence graph state such as `.codebase-memory/` stays out
  of source control unless it is explicitly reviewed for a private workflow.
- `catalog/mcp-servers.json` records source URL, auth mode, setup kind, setup
  hint, risk, approval mode, and default-enable rationale for each starter
  connector. Installers and `npm run codex:status` surface setup requirements
  without collecting credentials.

Official reference: https://developers.openai.com/codex/mcp

## Authorized Website Reconstruction

The bundled explicit-only `fetch` skill reconstructs client-observable website
behavior from real browser evidence. A URL-only invocation stays public,
passive, bounded, and local: no login, no external mutations, no production
endpoint replay, and no claim that server source, databases, secrets, or
private authorization logic were recovered.

Authenticated routes require explicit ownership or authorization, a dedicated
test account, and user-performed login in an ephemeral browser. The skill never
requests or persists credentials, cookies, storage state, unsanitized HAR, or
private browser profiles. Reconstructed login, registration, recovery, MFA,
and payment forms are inert or local mocks by default.

Remote page content is untrusted data. Network discovery starts from an exact
origin, revalidates redirects, rejects private or metadata destinations, uses
bounded public `GET`/`HEAD`, honors applicable robots restrictions, and does not
bypass CAPTCHA, paywalls, rate limits, anti-bot controls, or access checks.
Protected assets require user ownership or reuse permission. Local output is
zero-egress by default and commit, publish, deploy, account, database, or other
external writes remain separately approval-gated.

## SEO And Evidence Research Integrity

The bundled `$seo` workflow distinguishes local source, locally rendered,
deployed-public, and authorized account evidence. It does not turn a passing
build, sitemap entry, Lighthouse run, or structured-data validator into a claim
that a URL is indexed, ranking, receiving field traffic, or eligible for a
visible rich result. Search Console, analytics, sitemap submission, DNS,
production redirects, publication, listings, outreach, and deployment stay
behind their own authorization and external-write gates.

The bundled `$evidence-research` workflow requires a charter, reproducible
search log at the claimed rigor, checked source records, claim-level references,
confidence, disagreement, limitations, and explicit separation of facts,
inferences, and recommendations. It never fabricates sources, interviews,
statistics, search counts, or systematic-review compliance. Paid APIs, private
datasets, participant contact, surveys, licensed material, and publication
require explicit approval. Both skills reject credentials and secret-like
material in their machine-checkable reports.

## Skill Sources

Installable skills must be represented in both `catalog/skills.json` and
`catalog/skills-lock.json`. The lock records the package, full upstream commit
SHA, skill, exact Skills CLI version, registry integrity, and install command.
The installer fetches the locked commit into an isolated temporary checkout,
verifies `HEAD` and the selected skill, stages and hashes an exact native copy,
and activates it without executing fetched repository code or the recorded
registry package. The CLI metadata remains a compatibility/discovery pin. The
default gate checks this contract offline; `npm run
verify:skills:online` verifies every pinned checkout and the npm integrity value.
An absent target is installed directly. A valid, internally consistent AgentChef
provenance marker permits a managed upgrade with a mandatory full-tree
backup. Unmarked, foreign, or locally drifted same-name targets are preserved
by default. Adoption is deliberately per-skill: the operator must inspect the
exact target and rerun only that helper command with `--adopt-existing`; there
is no broad installer adoption switch.

Default command approval rules do not auto-allow global skill installation.
Read-only Skills CLI discovery can be allowlisted, but `skills add` and broad
Skills CLI invocations prompt because they change the agent instruction supply
chain.

## Specialist Agent Boundaries

Specialist agents are tracked in `catalog/agents.json` and validated against
both Codex config templates and the role TOML files under
`templates/codex/agents/`.

Agent templates must not use `danger-full-access`,
`approval_policy = "never"`, or embedded token environment variable names.
Read-only specialists stay read-only, while verifier/release roles can use
`workspace-write` only for local evidence such as smoke-test output.
From 1.3.2, agent role templates carry only the catalog
worker `model` (`workerModels`) and never `model_reasoning_effort`, so the
profile still sets effort and the session you open keeps the model you chose.
The model line changes no role boundary or approval gate.

`max_threads = 10` is a concurrency capacity ceiling, not permission to fan
out every task. Conditional routing normally uses one to four agents. From
1.3.4, an agent starts only when one of these holds: an
autoVerify routing profile matched and files changed, so its verifier runs
before the task is reported done; independent parallel work exists; noisy logs
or research should be isolated from the main thread; the user explicitly
requests delegation. Trivial, strictly sequential, tightly coupled, and
single-file work stays in the main thread, and at most 2 agents start per task
without the user naming them. Automatic role selection never overrides the
user's active profile.

## Install Planning And Collision Policy

`manifests/install-plan.json` records the managed install surface, risk level,
backup expectation, required flags, and collision policy for each operation.
`node scripts/plan-install.mjs --all --json` prints this plan without invoking
installers or mutating global state.
The selected manifest profile is normative for operation selection and order.
Generated profiles, ownership-marker writes, installed-plugin cache refresh,
and the Unix hook-permission step are explicit operations in that contract; the
planner, install/repair preflights, repair file execution, and runtime drift
checks consume its resolved action ledger. Platform installers keep explicit
PowerShell and shell execution code; semantic parity validation and behavioral
smokes compare those paths with the contract so the manifest remains normative.

The manifest intentionally keeps ECC-inspired improvements narrow: plan/apply
separation and collision metadata are allowed; broad external config, MCP,
hook, telemetry, or skill catalogs are not imported by default.

The canonical template and user-owned overlay are separate trust domains.
Normal merge/repair preserves model/profile choice, approval and sandbox
settings, project trust, custom MCPs, and unrelated marketplace entries.
Chef-managed agent/MCP safety tables remain validated, while wholesale
file replacement requires the explicit force path and a backup. Force and
update synchronize source-owned entries in managed directories and preserve
unrelated extras; neither mode authorizes wholesale directory deletion.
The generated `full` and `multi-session` profiles retain the installed local
MCP transport definitions and change only their enabled state, so selecting a
profile cannot turn a local MCP entry into an incomplete command definition.
Serena is the exception to eager per-session process ownership: its installed
stdio bridge is lightweight and uses a local bearer token held only under the
user's Codex home. The bridge binds its manager and pinned Serena children to
`127.0.0.1`, exposes only the reviewed read/navigation allowlist, starts a
backend only after an allowlisted tool call, serializes calls per project, and
starts every backend in a read-only mode: a backend listens on its own loopback
port without the pool token, so its editing, symbol rename/delete,
memory-writing, and `switch_modes` tools are not active at all, and a local
process that connects to the port directly can only read. Serena itself rejects
a request with a foreign `Origin`. The bridge also
reclaims only children it started after an idle TTL. It does not expose a LAN
listener, persist request content, or allow a project to select another
client's backend.
The interactive command center inspects this state before a full install. It
does not silently reinstall an already current setup or present managed drift as
a clean first install; current setups become a no-op, while drift is directed to
the explicit backup-backed repair boundary. The same status inspection treats
user-added skills and MCP connectors as preserved inventory, not deletion
targets.
`scripts/validate-install-plan.mjs` keeps every destination inside the roots
its target owns: Codex operations stay under `CODEX_HOME` and `AGENTS_HOME`,
Claude operations under `CLAUDE_HOME` (`CLAUDE_CONFIG_DIR` or `~/.claude`),
the user-scope `.claude.json` (`~/.claude.json`, or inside `CLAUDE_CONFIG_DIR`
when that variable is set), and the shared `AGENTS_HOME/plugins` tree, and
shared operations under `AGENTS_HOME` or the reviewed Git-guard targets. A
literal `${HOME}/.claude` destination is still rejected, as are `.cursor`,
`.opencode`, `.zed`, `.vscode`, `.gemini`, `.qwen`, and `.kiro`, so adjacent
harness homes cannot drift into the install surface silently.

On-disk identity is the `agentchef` spelling since 1.0.0 (markers, journal,
lock, backup prefixes, schema strings, plugin folder, marketplace name, plugin
id, hook banner). Every reader also accepts the pre-1.0.0 `codex-chef`
spelling, so drift detection, repair, status, and removal treat an un-migrated
home as managed rather than foreign; the conversion happens only through the
explicit `--migrate-identity` command, which previews first and is journaled
and backup-backed like every other write. A Git hook is rewritten by the
migration only when its bytes match a shipped template; any other hook stays a
conflict that needs explicit adoption.

Every manifest operation names its target (`codex`, `claude`, or `shared`).
The Codex target is the default; the Claude target is selected only by an
explicit `--target` or an interactive confirmation. Claude-side files that
Since 1.3.0 the installer writes no MCP entry into `.claude.json`; it only
retires the entries an earlier release wrote, and only while the value still
hashes to what the receipt records. An entry that was edited, or that
AgentChef never wrote, is reported and left as it is unless `-AdoptMcp` /
`--adopt-mcp` is passed, which backs the file up first. Permission rules are additive by
default. An update may also retire a rule it added earlier once the fragment no
longer asks for it, under the same ownership proof, so a moved package pin does
not leave its old allow rule behind forever. `deny` rules are only ever added
(the generated MCP denials), never retired, and existing ones are never
changed. Claude files
AgentChef does not own (`settings.json`, `.claude.json`) are merged
additively and every added entry is recorded in a sidecar receipt under
`~/.claude/agentchef/receipts/`; repair, status, and removal act only on
entries whose current value still matches the receipt. The Claude plugin cache
is owned by the `claude plugin` CLI and is never written by hand. The
process-hygiene hook reaches Claude Code only through the plugin manifest;
nothing hook-related is written to `settings.json`.

Installers upsert only the `agentchef` marketplace entry. They do
not replace the full marketplace file, and they fail closed if an existing
marketplace file is invalid, unreadable, or not a JSON object.

Removal (`--remove`) deletes only what AgentChef can prove it owns: files
byte-identical to the template, directories carrying an ownership marker,
receipt-recorded entries, and the marketplace entry. It backs each one up
first. A file reached through a linked subfolder is never deleted, and every
path is checked again right before its delete. The pinned-skill download cache
(`CODEX_HOME/cache/pinned-skill-sources`) is deleted without a backup, because
a reinstall fetches it again. Only a directory named by the key its own receipt
yields is deleted, re-checked for a swapped-in link just before. A marketplace
file is deleted only when AgentChef's empty skeleton is all that remains.

On Windows, a process that runs a bare command name (`uvx`, `git`,
`gitleaks`) from a project folder can pick up an executable committed to that
folder before the one on PATH. Only the spawning process's own environment
turns that lookup off. The Serena pool, the global pre-commit hook, and the
pinned-skill installer set `NoDefaultCurrentDirectoryInExePath` for
themselves, and the installer also drops inherited Git location variables
(`GIT_DIR`, `GIT_WORK_TREE`, …). `--no-backup` only creates missing files;
a rollback never deletes a replaced file that has no backup.

Since 1.3.0 every AgentChef skill reaches both CLIs only through the plugin.
The eleven bundled skills ship inside the plugin source
`AGENTS_HOME/plugins/sources/agentchef/skills/<name>`, and pinned skills are
written into the same folder with their `.agentchef-source.json` provenance
record. The installer writes nothing into `AGENTS_HOME/skills` and creates no
links under `~/.claude/skills`, so user skills there are never a collision
target. The `-Adopt*Skill` and `--adopt-skill-links` flags have no effect.
Direct copies left by a 1.0–1.2 install are retired only by the explicit
`--migrate-identity` command (backup first, and only for copies whose marker
or provenance proves they are AgentChef's and whose skill the plugin source
already holds); foreign directories and links are never touched. The Claude
installer retires links its previous receipt recorded only after the plugin
registered successfully. Fetch keeps `allow_implicit_invocation: false`;
SEO and Evidence Research allow implicit activation only when their
descriptions unambiguously match.

The marketplace entry points to a managed mirror under
`AGENTS_HOME/plugins/sources/agentchef`, which always stays inside
the marketplace root required by the current Codex schema. This registration
makes the plugin discoverable, not installed or enabled; namespaced plugin use
requires an explicit plugin install and a new session. Marketplace JSON, the
platform launcher, `serena-pool.mjs`, copied/generated profiles, every
selected source, and every existing target path component are
preflighted before installers write any managed file. Linked or junctioned
descendants that escape the configured homes fail closed.

After that explicit first plugin install, installer, repair, and update applies
inspect the installed plugin version through the targeted `CODEX_HOME`. They
run `codex plugin add agentchef@agentchef --json` only when the
plugin is already installed and its versioned cache is stale, then read the
installed version again before reporting success. A missing or uninstalled
plugin remains uninstalled, and a failed refresh fails closed instead of
claiming runtime parity.

## Repair Mode

`scripts/repair-install.mjs` is the repair/reconcile path for users who already
have a global Codex setup. Without `--apply`, it is read-only and reports
managed drift, missing config blocks, marketplace drift, extra managed plugin
files, non-curated skills, and duplicate skill names. With `--apply`, it backs
up and repairs only AgentChef-managed files, including the Serena bridge,
merges missing config blocks, and
updates the AgentChef marketplace entry while preserving unrelated marketplace
plugins. With explicit apply authority, the CLI may backup and replace a
managed target; preview never does so. It also reports or refreshes stale versioned cache state only for an
already-installed AgentChef plugin.

`--no-backup` is accepted only when the complete resolved operation is
creation-only and all selected targets are absent. Any existing target, merge,
replacement, deletion, prune, adoption, cache refresh, or global mutation makes
preflight reject the run before its first write.

Repair mode does not delete user skills. Extra global skills and duplicate
skill names are cleanup candidates because they can pressure Codex's initial
skill-list budget, but they may have been installed intentionally. Deleting
extra files inside the managed AgentChef plugin directory requires the
explicit `--prune-managed-plugin-extras` flag and still stays scoped to that
single managed plugin target after backup. Pinned skills in the plugin source
that carry their provenance record are not extra files, even with that flag.
Repair no longer reconciles direct skill copies.

## Update Mode

`npm run chef -- --update` does not change managed/global files; ordinary
repo-local CLI logs are still written unless `--no-log` is supplied. It uses
the managed-file install plan and installer dry-run path, excluding curated
global skill installs and optional global Git guards.
`npm run chef -- --update --apply` first refuses a clone that is not on `main`
(a feature branch or detached HEAD would otherwise be moved), blocks tracked or
staged Git worktree changes while preserving unrelated untracked files, then
runs `git pull --ff-only`. If new commits are pulled, it prints a fresh preview
by running the installer dry-run from the updated tree, continues local validation and the managed
refresh in the same approved session, and verifies installed-runtime parity; a
second invocation is not required. If the repository is already current, it
runs local validation before the managed refresh, then refreshes scoped managed
AgentChef files through the backup-backed installer. That refresh synchronizes
source-owned files, preserves unrelated directory extras, and refreshes an
already-installed stale plugin cache in place. It
does not install the plugin for users who have not opted in or publish. It does
not perform unscoped cleanup, install curated
global skills, install optional global Git guards, delete user skills, rotate
credentials, or enable account/database/broad-filesystem connectors.

## Backup Inventory And Restore

## Portable Workspace OS Boundary

AgentChef is portable because its installer resolves `CODEX_HOME` and
`AGENTS_HOME` at execution time rather than embedding a machine path. A
repository-relative temporary root is suitable for preview and isolated smoke
testing; a real home remains an explicit user choice and any managed replacement
stays backup-backed.

The package boundary is intentional: Chef installs Codex capability and
distribution assets only. It does not install or control companion tools such
as a memory engine or a control plane, read or write their data, adopt existing
terminal sessions, or transfer `auth.json`, session, credential, or machine
state between PCs. Those tools may integrate through their separately
versioned, least-privilege contracts, never through an installer side effect.

`npm run chef -- --backups` lists backup archives under the active Codex home
without changing global/user state. `npm run chef -- --backups --backup <id>`
inspects backup archive metadata only: paths, sizes, hashes, manifest status,
issues, and restorable targets. It does not print file contents.

An interrupted install or repair archive can use its atomic operation journal
as a recovery manifest only when every recorded path, size, and SHA-256 value
still matches the archive. This does not broaden the restore allowlist or
permit unrecorded files.

Before mutation, installers create the atomic operation journal and acquire
separately owned locks under both canonical managed homes when they are
distinct. Each mutation is journal-prepared before it is made and marked
applied only after it completes. On Unix, a missing managed home is created
before its atomic lock is acquired. A lock collision fails closed; cleanup
releases only locks whose recorded owner identity matches the current
installer. Successful, failed, and interrupted paths share that ownership
check, so foreign concurrent locks are never removed. A failed install also
uses compensation receipts to roll back completed commit-pinned skill installs
before journal recovery.

Restore treats backup archives as untrusted input. `npm run chef -- --backups
--backup <id> --restore` is a preview. The apply path requires `--apply`,
loads and verifies the exact source bytes, creates a fresh rollback backup of
current targets, rejects unsafe archive paths and symlinks, and restores only
known AgentChef-managed files under the active Codex or Agents homes. If a
later write fails, already-written targets are restored from the fresh rollback
backup. Commit-pinned skill archives are limited to a cataloged skill ID and
replace that skill tree atomically enough to preserve exact-tree semantics
during handled failures. A valid `agentchef.backup.v1` manifest must exactly
match the archive path, size, and SHA-256 set; legacy, missing, extra, altered,
or unsupported control-plane files fail closed. Inventory calls a backup
restorable only after those checks and the target allowlist pass. Backup archive
cleanup and deletion are not automated; they remain manual, reviewed operator
actions.

## Rules

`templates/codex/rules/default.rules` allows fast read-only discovery and
project-native verification commands. The reviewed allowlist includes granular
validators, release-note checks, skill/runtime verification, package dry-runs,
read-only Codex diagnostics, CI run watching, and read-only git object
inspection. It prompts for:

- destructive file operations
- deletion, cleanup, pruning, overwrite, and uninstall actions
- broad shell wrappers
- dependency installation
- global skill installation
- package publishing
- GitHub API operations, including auth status/token commands that can expose
  credential material
- every repository-controlled `npm run...` script execution
- broad `git config` value-dump commands and raw, unredacted `gitleaks dir`
- git commit, push, reset, checkout, and restore
- repair apply and managed plugin pruning
- ad-hoc `npx` package execution outside exact allowlisted helpers
- an agent starting a pinned npx MCP package by hand (`npx -y <pkg@ver>`,
  `npx.cmd`, or `cmd.exe /c npx...`); Codex starts enabled MCP servers itself,
  outside these rules
- `git ls-remote`, which contacts a remote and can run a transport or
  credential helper
- `node --check`, which still loads `--require` / `--import` modules
- `rg --pre` and `rg --pre-glob` as the first argument (a prefix rule sees
  nothing later; the Claude Code rules ask on `--pre` anywhere)

Official reference: https://developers.openai.com/codex/rules

## Hooks

Hooks are useful for lifecycle checks, but they are not a primary security
boundary. Codex requires plugin hooks to be reviewed and trusted by exact source
hash before they run. Claude Code has no such step: it runs a plugin's hooks
once the plugin is enabled.

The local plugin ships three reviewed hooks: the `Agent` spawn guard (before a
tool call, Claude Code only), the session-end process sweep, and, from 1.3.4
the routing hint (on prompt submit). Claude Code runs all
three from `plugins/agentchef/.claude-plugin/plugin.json`; Codex runs the sweep
and, from 1.3.4, the routing hint, each from its own file
under `hooks/`. Neither CLI loads the other's hook. The Claude manifest is
generated by `scripts/render-target-artifacts.mjs`, and `npm run check` fails
when the committed copy drifts.

**Session-end process sweep.** Codex reads it from `hooks/process-hygiene.json`
through its own manifest. Claude Code gets it inline (exec form,
`node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude`,
timeout 15 s, no matcher), not from `hooks/hooks.json`, which Claude would load
on its own. The hook reads no prompt or transcript text and injects no context.
On normal session end it captures only local MCP descendants of the exact Codex
or Claude Code owner, waits 45 seconds in a detached sweep, and stops only
captured processes whose PID and creation time still match after the owner chain
is gone. Subagent lifecycle events do not invoke `SessionEnd`. Missing process
metadata, live owners, recent trees, or PID reuse all fail closed.

**Routing hint (prompt submit).** From 1.3.4, this is the
only hook that reads prompt text, and the only one that adds context for the
model. Design and threats are in
[ADR-007](decisions/007-routing-hint-hook-and-auto-verification.md). It keeps
these promises:

- It reads the submitted prompt from standard input, scores it in memory against
  the plugin's rendered copy of the routing catalog
  (`plugins/agentchef/scripts/routing-index.json`), and exits. It keeps no
  prompt text, matched words, or working directory anywhere.
- On a high-confidence match it writes exactly one line of plain text, built
  from a fixed template and regex-validated catalog identifiers (profile, skill,
  verifier, roles, spawn cap, plugin version), at most 300 characters. The line
  is advice; the model still judges whether the work needs an agent.
- Its only state is a per-session file of profile identifiers and skip counters
  under the user's plugin-data or temporary directory, named by the SHA-256 of
  the session id. It is written with exclusive-create and rename, and the
  directory and file are checked for symlinks and ownership before every read
  and write. The hook removes only its own files older than seven days.
- Every failure, low-confidence match, short or synthetic turn, subagent turn,
  or `AGENTCHEF_ROUTING_HINT=off` ends with exit code 0 and no output. It never
  blocks a prompt (exit code 2 and JSON output are forbidden and audited) and
  never writes to standard error.
- It has no network or child-process code and imports only inert Node modules
  (audited).
- Codex trusts a hook by the hash of its definition. That trust covers the
  command line, not the script or index it runs; those are protected by the
  plugin directory's permissions and by the install-source hash comparison
  (`npm run chef -- --inventory`). Claude Code has no hash review at all.
- Claude Code and Codex may record the one line in their own debug logs or
  transcripts, under their own terms.

The starter still rejects every other form of hook context injection: automatic
`SessionStart` injection, `hookSpecificOutput.additionalContext`, a second
prompt hook, unrelated hook runtimes, plugin-bundled MCP/apps, and `Write`
capabilities. `scripts/security-audit.mjs` allowlists each hook event name per
reviewed file, compares the Codex hook file and the Claude manifest to the
renderer's constants exactly, fails on any `hooks/hooks.json`, and requires
`plugins/agentchef/hooks` to hold exactly the two reviewed files
(`process-hygiene.json`, `routing-hint.json`). It also fails if hook runtimes
appear through root hook folders, other nested `hooks/` paths, `scripts/hooks`,
`.cursor/hooks`, `.kiro/hooks`, `.opencode` hook plugins, templates, or plugin
bundles without an explicit reviewed change. The hooks never delete files other
than the routing hint's own state files, read credentials, or treat unrelated
Node/Python processes as cleanup candidates.

Official references: https://developers.openai.com/codex/hooks and
https://code.claude.com/docs/en/hooks

Operational contract:
[multi-session process hygiene](process-hygiene.md).

## Git Hygiene

Global Git guards are optional because they modify the user's Git defaults.
Inspection reports current and proposed state without writing. Apply fails
closed when either managed file or either Git config key contains foreign state.
The operator must review and adopt only the exact conflict with
`AdoptGitIgnore`, `AdoptGitHook`, `AdoptGitExcludesFile`, or
`AdoptGitHooksPath` (the Bash installer uses the corresponding kebab-case
flags); one adoption never implies another.

Before the first Git-guard mutation, apply persists the exact prior two-file and
two-key state in a typed `agentchef.global-git-guards-receipt@1` receipt. The
receipt distinguishes absent files/keys, preserves exact file bytes and modes,
preserves ordered multi-values, and binds the expected post-apply file hashes,
Unix modes, and key values. A handled failure rolls the transaction back.
Restore validates the schema, recorded home, exact allowlist, size, paths, and
link safety, then refuses to write unless the current state still matches that
post-apply binding. Only then does it restore or unset each surface exactly. The installer
prints the receipt path and exact `manage-global-git-guards.mjs restore`
command; this receipt is deliberately separate from `agentchef.backup.v1`.

When installed, they:

- keep obvious local secret and build-output paths ignored
- run Gitleaks when available
- block staged secret-like files such as `.env`, `.pem`, `.key`, `.pfx`

The repository `.gitleaks.toml` extends the default Gitleaks rules and only
excludes local scratch, dependency, build, and cache directories such as `tmp/`,
`node_modules/`, `dist/`, and `.next/`.

The hook is intentionally conservative and does not delete files.

Security validation also fails if tracked source files appear under ignored
scratch, dependency, build, coverage, or release-output directories.

## What Must Never Be Included

- Codex sessions or memories
- `.env` files
- private keys or signing material
- auth files, cookies, token caches
- local database dumps
- installers and release archives
- generated screenshots, logs, reports, and build output

## External Account Actions

The repo can document secure GitHub, Supabase, Vercel, or Sentry setup, but it
must not perform account-level actions automatically. Enabling repository
protections, rotating keys, changing billing, deploying, or publishing requires
separate user approval and account context.
