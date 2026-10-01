# Changelog

## Unreleased

- Grant Serena to read-only roles by tool name. `mcp__serena` grants every tool of
  the active Serena entry; the AgentChef pool serves only read tools, but a
  user's own Serena entry (which AgentChef never replaces) also serves its
  editing and memory-writing tools, and `code-mapper` reported having
  `replace_symbol_body` and `write_memory` on a live machine. Roles now get
  `mcp__serena__<tool>` for the pool's read allowlist only.
- Close the remaining low-severity findings from the 1.2.0 audit:
  - `codex-status` treated a `codex doctor --json` that printed nothing as
    zero checks, all passing. It now reports that the checks could not be
    read.
  - The verifier said "claude CLI is not available on PATH" when `claude
    --version` timed out or failed. It now names what happened.
  - `--processes --cleanup-stale --apply` ended "ready" when only the
    name-count fallback audit could run, although nothing was cleaned. It
    now fails and says why.
  - The verifier fails when the Supabase connector is enabled without a
    `project_ref` (account-wide scope) or without `read_only=true`. The
    template only asked for them in a comment.
  - The installer's capability board listed the Codex MCP defaults for a
    Claude-only install. It now shows the Codex lines only for the Codex
    target and adds what the Claude target installs (`context7`, `serena`).
  - The upgrade guide is in release order, has a 1.x → 1.2.0 section, and no
    longer calls the 1.0.0 rename "scheduled".
  - The troubleshooting guide and both READMEs say that under the Windows
    default execution policy `npm` itself is blocked in PowerShell
    ("npm.ps1 cannot be loaded", measured) and that `npm.cmd` works.

## 1.2.0 - 2026-10-01

- Update the Claude Code plugin on an AgentChef upgrade. Applying 1.1.0 live
  left Claude Code on plugin 1.0.0 while Codex moved to 1.1.0:
  `claude plugin install` does nothing for a plugin that is already
  installed, and nothing ran `claude plugin update`. The verifier missed it
  too. The new version was not cached yet, so it compared the old copy,
  whose files happened to match. The installer now runs
  `claude plugin marketplace update` and `claude plugin update` whenever
  Claude Code records a version other than the package version. The verifier
  compares the registered version with the source and names the fix.
- Security hardening from an audit of the install, repair, and MCP surfaces:
  - On Windows a process that spawns a bare command from a project folder
    ran an executable committed to that folder before the one on PATH
    (measured with a stand-in `uvx.exe` and `git.exe`). Setting
    `NoDefaultCurrentDirectoryInExePath` only in the child's env does not
    help. The Serena pool, which starts `uvx` from the project root, the
    global pre-commit hook, which runs `git` and `gitleaks` from the
    repository, and the pinned-skill installer now set it for themselves.
    Claude Code already sets it, and Codex does not search the working
    directory.
  - The pinned-skill installer drops inherited `GIT_DIR`, `GIT_WORK_TREE`,
    and the other Git location variables, which would have pointed its
    `git init`/`fetch`/`checkout` at the caller's own repository.
  - The Serena bridge no longer exposes `activate_project`. It accepted any
    path, was auto-approved, and created `.serena/project.yml` there; the
    pool already starts each backend on its project.
  - `install-claude-target.mjs --no-backup` is creation-only, as its help
    said. A direct call replaced an existing `settings.json` or
    `.claude.json` without a backup, and a later failure then rolled it back
    by deleting it. The journal rollback also never deletes a replaced file
    that has no backup.
  - Claude permissions no longer auto-allow any `npx` launch, because `npx`
    prefers a matching package in the project's `node_modules`. They also
    ask for the gitleaks `-r=`/`--log-opts` forms, for `npm pack` flags that
    run scripts or write elsewhere, and for `gh config get … token`. An
    update retires the dropped allow rules through their receipt.
  - The previous pre-commit hook hash stays in the ownership list, so an
    installed copy is still refreshed by `--install-git-guards`.
- Pin Serena to v1.7.0 (`949a27e`). The previous pin (1.5.4.dev0) is
  affected by GHSA-pp25-4cg4-qcr9: template injection through a project's
  mode config runs code when the project is activated, and the pool activates
  every project it serves. The pin was probed before it was accepted:
  - v1.7.0 adds a writing tool, `replace_in_files`. It is now in the
    read-only mode, so on the pooled backend it answers "not active" and
    leaves the file unchanged, like `write_memory` and `rename_symbol`.
    Without the mode, all three changed the probe project.
  - Every allowlisted read tool still exists.
  - The web dashboard server is now turned off, not only kept from opening.
  - `validate-mcp-config` checks the pool against the catalog's `sourceRef`
    instead of a commit hard-coded in the validator.
- Answer each Serena bridge tool call with the client's own request id. The
  backend's response, which carries the pool's own request id (always 2),
  was spread over the client's id. A client therefore got every answer as
  id 2 and waited out the 180 s tool timeout for any call with another id.
  This dates back to 0.5.x. A test now sends id 7 through a stand-in
  manager, and a real bridge → manager → Serena 1.7.0 run returned
  `find_symbol` as id 3 in 14 s.
- Fixes to what the CLI reports, from a review of the status and verify
  code:
  - `--status`, `--doctor`, and the check after every `--apply` ran under the
    wrapper's 180 s default. Their children take longer on a real home (codex
    doctor alone has 300 s), so the check was killed while still working and
    reported as failed. They now get 10–15 minutes, and the wrapper's output
    buffer is 64 MiB.
  - The check after an install verified the Codex target only. A Claude-only
    install came out red, and the Claude half of `--target both` went
    unchecked. It now verifies the installed target.
  - `--doctor` always expected the optional Git guards, so a default install
    failed its Full checkup. It now expects them only when a hook or
    `core.hooksPath` is present.
  - `--update` and `--status` accept `--target`. Without it, `--update`
    refreshes whatever is installed, using the Claude install receipt and the
    Codex pool file. Before, it only ever updated Codex, so a Claude Code
    install could not be updated from the CLI.
  - `codex-status`:
    - An empty home is reported as not installed. It used to be reported as
      drift, with repair suggested, because `Number()` of a file list is
      `NaN`.
    - A broken Claude target fails the run.
    - `--target claude` skips the Codex runtime, CLI, and doctor checks.
  - The skills screen treats a managed skill with extra local files as valid,
    as the verifier does, so `--install` is no longer blocked.
  - `codex-status`, `verify-install-runtime`, `codex-doctor`, `repair-install`,
    and `plan-install` set their exit code instead of calling
    `process.exit()` right after printing. On a Linux pipe, stdout writes are
    asynchronous, so a large `--json` report was cut off mid-document. Found
    by CI: status read the verifier report as unparseable (`unknown`), and
    `chef --doctor --json` stopped at the 64 KiB pipe buffer; chef now exits
    only after stdout drains.
- More hardening from the same audits:
  - A `.cmd` shim in a folder with a space did not run. cmd.exe `/s /c`
    strips the outer quotes of the line, so a shim path with a space (a
    profile folder whose user name has one, or `D:\tools\node global\claude.cmd`)
    was cut at the space and the CLI looked missing (measured). The command line is now
    built verbatim. An argument holding `"`, `%`, or a newline is refused
    rather than handed to cmd.exe.
  - `codex-status` resolves `codex` from PATH like a shell. A native
    `codex.exe` with no `codex.cmd` shim failed every status probe.
  - `install.sh` fails when merging the config blocks fails. Before, it
    went on and printed "completed".
  - The verifier warns when the AgentChef plugin is not registered in Claude
    Code at all. This happens when the claude CLI was missing at install
    time.
  - Chrome DevTools `take_snapshot` and `take_screenshot` now prompt.
    Their `filePath` accepts an absolute path, so an auto-approved call
    could write a file anywhere. Playwright saves only into its own output
    directory and stays auto-approved.

- Keep the files a kept `config.toml` still points at when removing the Codex
  target. A config merged into your own settings stays after removal and
  still references the Serena bridge and the agent role files. Removing
  those left Codex warning "Ignoring malformed agent role definition ...
  must point to an existing file" for every role on each session (measured)
  and starting a Serena entry whose bridge was gone. Such files now stay as
  `kept-referenced`; once you drop the tables, a second removal deletes them.

- Make "strict config ok" in `codex-status` a real check. The probe was
  `codex --strict-config --version`, which exits 0 without reading
  `config.toml` (measured on 0.158.0 with an invented table), so it could
  never fail. Status now runs `codex exec --strict-config` with a provider
  that does not exist: a valid config stops at "provider not found", and an
  invalid one is reported. The probe runs on a copy of `config.toml` and
  `agents/` in a temporary home, so status still writes nothing to the real
  Codex home.

- Give two Claude specialists the MCP servers their own instructions use.
  `code-mapper` is told to escalate to semantic navigation but had no Serena
  grant. `frontend-verifier` is told to use Playwright or browser MCP tools
  but had neither, and a subagent `tools:` list filters out every MCP server
  it does not name, even after you add the server. It now has `mcp__serena`
  and `mcp__playwright`/`mcp__chrome-devtools` respectively. The surface
  validator allows the two local, account-free browser servers from the
  catalog and still rejects account, path, and local-state servers.

- Redact the paths inside the verifier's error messages. With
  `--redact-paths`, failures and warnings that quote an absolute path (a
  refused managed path, a spawn error naming the resolved `codex.exe`) were
  still printed in full; one report on a linked home held 394 home-path hits.
  Every string in the report is now redacted before it is printed, so status
  and `chef --status`, which embed it, are covered too.

- Keep different Serena pool copies from stopping each other. The Codex and
  Claude targets each install a copy of the pool. With one fixed port, two
  different copies (one target updated, the other not) kept replacing each
  other's manager, and each replacement stopped the other side's backends.
  The default port is now derived from the manager profile: identical copies
  share one manager, and different ones run side by side until they match.
  `AGENTCHEF_SERENA_POOL_PORT` still wins.
- Say in the install guide that `-Update` writes the managed `config.toml`
  tables back to the template (by design, so security approvals and pins
  arrive), and that an edit inside one of them survives only in the backup.

## 1.1.0 - 2026-10-01

- Fixes from a full install → migrate → remove cycle with the real `codex` and
  `claude` CLIs in scratch homes:
  - `-Update` failed when `CODEX_HOME` was long: the backup layout adds ~131
    characters and Windows PowerShell 5.1 still enforces 260 (measured: 264).
    Backups are now copied by Node, which handles long paths.
  - A successful `--remove --apply` was reported as a failure, because it was
    checked with the install verifier ("0/334 current"). It is now verified by
    rerunning both removal plans, labelled "Remove AgentChef", and its next
    step no longer says to reload refreshed files.
  - `--migrate-identity --apply` on a current home ran the plugin swap anyway:
    it installed a Codex plugin the user never had, rewrote `config.toml`, and
    exited 1 on the Claude uninstall of a plugin that was not there. The swap
    now runs only when the legacy plugin is really installed, and "not found"
    on removal counts as done.
  - Codex removal decided on `config.toml` before `codex plugin remove`
    rewrote it, so a config that returned to AgentChef's bytes was left
    behind. The plugin removal now runs first and file decisions are taken at
    apply time; the removal note says which config is removed and which kept.
  - Removal always planned `codex plugin remove`, even for a plugin never
    added to Codex, so its own verification then failed. It now runs only when
    `config.toml` has the plugin table or the plugin cache exists.
  - Removal left AgentChef's pinned-skill source cache behind (5,900 files in
    the scratch cycle). Directories carrying AgentChef's source receipt
    (current or pre-1.0 name) are now removed, without a backup because a
    reinstall fetches them again; anything else there is kept. A
    `marketplace.json` left as AgentChef's empty skeleton is removed too
    (backed up); the removal notes now name the shared Serena pool token
    that stays.
  - From an independent review of the fixes above:
    - Removal verification read a planner's error output (which is also JSON)
      as an empty, clean plan. It now requires exit 0 and the expected plan
      shape.
    - An emptied plugin cache tree left by `codex plugin remove` counted as an
      installed plugin, in removal and in `--migrate-identity`. The migration
      would have re-added a plugin on every later run. Only a cache that
      still holds files counts now, and the legacy cache is judged again
      after the plugin swap.
    - The "already removed" match in `--migrate-identity` held raw U+0008
      bytes where `\b` was meant, so it never matched. It now also requires
      the message to name the plugin being removed.
      `validate-content-safety` now rejects raw control characters.
    - A pinned-source cache delete that failed midway rolled back the whole
      removal. The receipt now goes last, and a failure is reported per
      entry.
    - The Node backup copy follows links like `Copy-Item` did, so a backup
      is a snapshot and needs no symlink privilege.
  - From a security audit of every deletion path:
    - Codex removal deleted a template-identical file even when it was reached
      through a linked subfolder, for example a skill's `references` folder
      linked to a repo checkout for live editing. The file was deleted in the
      checkout (after a backup). Such files are now foreign, and every
      delete re-checks its path.
    - A pinned-source cache entry swapped for a junction between planning
      and deleting would have had its target's contents deleted without a
      backup. The entry is re-checked right before the delete, which is now
      one `rmSync` that does not follow links. A cache directory also has to
      be named by the key derived from its receipt, and the receipt must be a
      regular file.
    - A Claude merge-receipt path taken from the install receipt is now
      confined to `CLAUDE_CONFIG_DIR/agentchef/receipts` before deletion.
    - `--migrate-identity` no longer aborts when `codex plugin remove` has
      already deleted the legacy cache directory.
    - Pruning empty folders is bounded by a path separator, not a string
      prefix.

- Fixes from running every CLI command, MCP server, and skill on a live
  install:
  - The verifier ran `claude mcp list` and `claude plugin validate` with
    `CLAUDE_CONFIG_DIR` forced to `~/.claude`, which makes Claude Code read
    `~/.claude/.claude.json` instead of `~/.claude.json`: the probe saw none of
    the 19 configured MCP servers and left a stray state file behind. The
    variable is now set only for a relocated home (also in
    `--migrate-identity`), and the MCP probe gets a 90 s budget because it
    health-checks every server.
  - AgentChef never overwrites a user's MCP entry, so a user-defined `context7`
    or `serena` silently replaced AgentChef's while the receipts read
    "current". The verifier now warns which defaults are shadowed; for serena
    that means a per-session Serena instead of the shared read-only pool.
  - `codex doctor` integrity-checks every session rollout; it took 137 s on a
    machine with 767 rollouts (14 GB). The verifier's 12 s and status's 120 s
    budgets made `chef --doctor` fail and status warn on a working CLI. Both
    now allow 300 s and name the cause; `--doctor` no longer prints
    "matches target: undefined" when doctor did not report it.
  - `chef --backups` rebuilt the restore allowlist for every file of every
    archive: 110 s for 131 backups, 9.6 s now, identical output.
  - Docs claimed other catalog servers were documented with `claude mcp add`
    commands that did not exist; they now say how to add them and that
    GitHub's remote MCP needs a token header (no dynamic client registration).
  - `--cleanup-stale` help and the process-hygiene docs still named only a
    Codex owner.

- Replace the Serena pool manager whenever its code changes. The launch
  profile only covered the Serena pin and the read-only mode, so a change to the
  manager itself (such as the new session release endpoint) left an older
  manager running until it happened to exit. The profile now also carries a
  hash of the pool script; measured: changing the script moved the profile from
  `...:592a98e1...` to `...:71c1f0f3...` and the next bridge replaced the
  manager.

- Recreate a removed skill link when a Claude removal rolls back. A link has no
  file backup, so the rollback left it deleted even though the journal had
  recorded where it pointed. It is now recreated as a link to the same managed
  directory (junction on Windows), never as a copy. Found by a read-only
  GPT-6-Luna review of journal recovery.

- Release a Serena bridge's sessions when it disconnects. Each bridge client
  got a Serena session per project backend, kept in the manager until that
  backend went idle, so a continuously used project accumulated one session per
  client ever started. A closing bridge now asks the manager to drop its
  sessions (and ends them inside Serena, best effort); another client's
  sessions are untouched. Found by a read-only GPT-6-Luna review.

- Check skills, not only roles, in the Claude plugin cache. The verifier
  compared only `agents/`, so a same-version change to a skill left Claude
  sessions on the stale copy while the check stayed clean. It now compares
  every file under `agents/` and `skills/` (what Claude loads) and ignores the
  Codex-only `scripts/`; the check also moved to `scripts/lib/claude-plugin-cache.mjs`
  and has its first test.

- Refresh the Codex plugin cache when its files change, not only its version.
  Codex keys the cache by version, and the refresher re-added the plugin only
  on a version change, so every same-version fix since 1.0.0 (including the
  process-hygiene owner fixes) never reached the copy Codex runs; the verifier
  reported it clean. Measured here: the cached hygiene script hashed
  `3305755d...` against the source's `a630a051...`, and re-adding the plugin at
  the same version replaced it. The refresher now compares the cached files
  with the local plugin source and re-adds on drift, and the verifier warns
  with the refresh command. The Claude plugin cache check from 1.0.x already
  compared its agent files.

- Stop listing the shared Serena pool as orphaned. The pool manager is detached
  on purpose and reclaims its own backends, but the process audit only knew
  Codex and Claude Code sessions as owners, so a live pooled backend (22
  processes, about 1 GB on this machine) was a cleanup candidate that
  `--processes --cleanup-stale --apply` would have killed under every session
  using it. The audit now treats `serena-pool.mjs manager` as an owner; the
  live audit went from 1 candidate to 0.

- Keep the pooled Serena backend read-only even for a direct connection. The
  bridge exposes only read tools, but each backend listens on a loopback port
  without the pool token. Measured on the pinned build: a local process could
  call 23 tools directly, including `replace_symbol_body`, `rename_symbol`,
  `safe_delete_symbol`, and `write_memory` ("Memory agentchef_probe written.").
  Backends now start with a read-only mode in which every writing tool and
  `switch_modes` is inactive ("Tool 'write_memory' is not active"). A foreign
  `Origin` was already rejected (HTTP 403).

- Replace a Serena pool manager started by an older file. The manager outlives
  the script it was started from and the bridge only checked that it answered,
  so an updated `serena-pool.mjs` never took effect until the manager died. The
  manager now reports a launch profile and the bridge shuts down a mismatched
  one before starting the current one; measured replacing a live old manager.

- Make the Node write flows actually roll back when they fail. The Claude
  install and removal, `--migrate-identity`, and Codex `--remove` marked their
  journal "failed" and then asked for a rollback, but rollback accepted only an
  in-progress journal, so it exited with "Operation journal is already failed"
  and changed nothing; the flows discarded that output, so a half-applied run
  looked rolled back. Rollback now accepts a failed journal, and a shared
  `rollbackAfterFailure` appends anything it could not restore to the original
  error. The Claude flows also allow `~/.claude.json` as an exact rollback
  target: it lives outside both managed roots, so it was refused even once the
  rollback ran. Found while verifying a GPT-6-Luna review of journal recovery;
  a new test injects a failure after the settings and MCP merges and checks
  both files come back byte for byte.

- Explain a lock left by an interrupted run. Any existing lock directory was
  reported as "Another operation is already in progress" with no owner and no
  way out. The message now names the operation, pid, and start time, says
  whether that process is still running, and how to recover; the lock is still
  never removed automatically.

- Stop auto-allowing Claude Code commands that can run code or write files.
  The Claude permissions were translated one to one from the Codex rules, but
  Codex runs them inside its OS sandbox and Claude Code does not, and an
  explicit allow rule also skips Claude Code's own read-only flag analysis.
  Measured on Claude Code 2.1.282 with harmless marker files:
  `node --check --require ./x.js` ran `x.js`, `git log --output=f` wrote `f`,
  and `rg --pre` passed the permission layer; `git ls-remote --upload-pack`
  runs a local command. Claude-only `ask` rules now guard `rg --pre`,
  `git diff/log/show --output` and `--ext-diff`, and `gitleaks --report-path`
  (ask outranks allow, so the plain read-only forms still run), and
  `node --check` and `git ls-remote` move to `ask`. Codex rules are unchanged.
  A GPT-6-Luna review also flagged `ForEach-Object`/`Where-Object` scriptblocks
  and `Get-Content`/`Select-String`; the same measurement showed Claude Code
  already blocks scriptblocks itself, and its built-in `cat`/`head` read the
  same files without a prompt, so those rules are unchanged.

- Close three integrity gaps in pinned third-party skills, found by a
  read-only GPT-6-Luna supply-chain review:
  - A cached checkout was trusted when its `HEAD` matched the pin, without
    checking its files, so an edited or added file in the cache was hashed and
    installed as if it were pinned content. A cache with any change other than
    its own receipt is now discarded and the commit refetched.
  - The tree hash skipped a file named like the provenance marker at every
    depth, so a nested `.agentchef-source.json` in a pinned skill escaped both
    install and drift checks. Only the generated marker at the skill root is
    excluded now; the fifteen installed pinned skills still verify.
  - Restoring the previous version (after a failed activation, or through the
    rollback receipt) copied the backup straight into the active path without
    checking it: a changed backup was restored as is, and a copy failure left a
    partial tree. The backup is now checked against its manifest, copied to a
    staging directory, and swapped in with a rename; a restore that fails keeps
    the original error first.

- Keep Claude Code's local state out of external-review snapshots. The packer
  excluded `.codex`, `.agents`, and `.serena` but not `.claude`, so a tracked
  `.claude/settings.local.json` (per-user permission grants with machine
  paths) or `CLAUDE.local.md` went into the bundle a user uploads to an
  external model, and GPT Pro exports copy the same manifest. `.claude`,
  `.agentspace`, and `CLAUDE.local.md` are now sensitive paths. Found by a
  read-only GPT-6-Luna review of snapshot secret safety; the new test fails
  without the fix.

- Refuse `--update --apply` unless the clone is on `main`. The update fetches
  `origin main` and fast-forwards whatever is checked out, so on a feature
  branch behind main it silently moved that branch to main, and on a detached
  HEAD it moved HEAD. It now stops before contacting the remote, changes
  nothing, and says to run `git switch main`. Proven in a scratch clone on a
  feature branch and on a detached HEAD. Found by a read-only GPT-6-Luna review
  of the update path.

- Find an npm-installed `codex` or `claude` on Windows. Node's spawn ignores
  `PATHEXT` and refuses `.cmd` shims, and `platformCommand` only recognized
  `win32` while the installers pass `windows`, so plugin registration, plugin
  removal during `--remove`, identity migration's plugin step, and interactive
  target detection all spawned the bare name: it worked only when a native
  `.exe` happened to be on `PATH`, and otherwise the step was skipped as
  "CLI not available". A shared `spawnHarnessCli` now resolves the CLI the way
  a shell does (first `PATH` directory with `.exe` or `.cmd`) and runs a shim
  through `cmd.exe`. Proven on this machine by hiding the native binaries:
  bare `codex` gave ENOENT, `codex.cmd` gave EINVAL.

- Fail a Claude removal that left the plugin registered. When the unregister
  commands failed, or the CLI was missing although the receipt recorded a
  registration, `--remove` still deleted its receipt and exited 0, so the
  plugin stayed registered with nothing left to retry from. It now keeps the
  receipt, exits 1, and prints the commands to run; a rerun finishes the job.
  Claude Code's "not found" for an entry that is already gone counts as done.
  Found by a read-only GPT-6-Luna review of the removal path.

- Stop failing local validation on Claude Code's own per-user settings file.
  Claude Code writes permission grants to `.claude/settings.local.json` in any
  project where you approve a command, and this repository ships a `CLAUDE.md`
  for Claude Code sessions, so `validate-repo`, `security-audit`, and
  `validate-installer-alignment` failed for every contributor working that way.
  The repository also did not ignore the file, so it could be committed by
  accident on a machine without a global rule. It is now ignored and skipped
  like AgentSpace's `docs/.agent-notifications`; `.claude/settings.json` is
  still checked.

- Say when `codex doctor` timed out, and how to allow more time. The runtime
  verifier reported "spawnSync cmd.exe ETIMEDOUT", which reads like a broken
  CLI. On this machine `codex doctor --json` took between 11 and 64 seconds
  against a 12-second default; the warning now names the limit and
  `--doctor-timeout-ms`.

- Scan only staged changes in the global pre-commit hook. It ran `gitleaks
  detect` without `--staged`, which scans the whole history: once a secret had
  ever been committed, even one deleted since, every later commit in that
  repository was blocked, and each commit got slower as history grew.
  Reproduced in a scratch repository: a clean commit was refused over a key
  removed two commits earlier. The hook now runs `gitleaks git --staged`
  (gitleaks 8.19+) or `protect --staged` on older releases, still blocks a newly
  staged secret, and the 1.0.0 hook is recognized as AgentChef's own so it is
  upgraded without `--adopt-file`. Found because this machine's owner had
  already patched their own copy for the same reason.

- Make the Codex config compatibility check actually load the config, and drop
  `windows.sandbox_private_desktop`. The check ran `codex --strict-config
  --version`, which exits 0 without reading `config.toml`; it passed even with an
  invented table. Codex 0.156 retired `windows.sandbox_private_desktop`, so the
  shipped Windows template failed a strict load and every session warned about
  it, while the check stayed green. The check now runs `codex exec
  --strict-config` against a provider that does not exist, which stops right
  after a successful load, covers the rendered profiles, and fails if an
  unknown-field canary is not rejected. The template no longer sets the key, and
  config merge and repair remove it from existing installs.

- Retire a pre-1.0.0 ownership marker that repair used to leave behind. A direct
  skill carrying both `.agentchef-managed.json` and `.codex-chef-managed.json`
  counted as current, so the legacy marker stayed forever. Repair now rewrites
  the marker, backs up the legacy one, and removes it inside the same rollback
  transaction.

- Explain why a pre-1.0.0 backup cannot be restored. Such an archive stores paths
  under the old Codex Chef names; restore maps only current AgentChef paths, so
  it blocked with a list of every file and no reason. Blocking is kept on
  purpose, since mapping old names onto a migrated home would mix the two
  identities, but the preview now says so and the JSON reports
  `legacyIdentityEntries`. Both found by an independent review run on
  GPT-6-Luna through Codex.

- Accept the install target in any capitalization, and stop mislabeling a failed
  preflight. PowerShell's `ValidateSet` let `-Target Claude` through, the value
  was forwarded verbatim to a case-sensitive Node parser, and the installer
  reported the rejection as "Managed install surface contains an unsafe linked
  path", a security error pointing at a symlink that did not exist. Bash refused
  the same input outright, so the two installers disagreed. Both installers and
  the shared parser now normalize the value, and the preflight message no longer
  asserts a cause it did not establish. Found by an independent installer
  parity review run on GPT-6-Luna through Codex.

- Give the Claude CLI probes their own switch. `--skip-codex-cli` is documented as
  skipping `codex doctor` and `codex mcp list`, but it also skipped every live
  Claude check: the version, `plugin validate`, `mcp list`, the plugin-cache
  drift check, and even the warning that the `claude` CLI is missing.
  `codex-status` forwarded it into its Claude summary, so
  `--target claude --skip-codex-cli` reported Claude as verified while checking
  none of it. `--skip-claude-cli` now controls those probes in both tools.
  Found by an independent review run on GPT-6-Luna through Codex.

- Recognize a live Claude Code session as an MCP owner in the process-hygiene
  audit. Ownership meant "has a Codex ancestor", so the MCP servers a running
  Claude Code session started were reported as orphans and a manual
  `--cleanup-stale --apply` would have terminated them. On the machine this was
  found on, 42 of 46 MCP trees belonged to seven live Claude sessions and none
  were actually unowned. Both launch styles are recognized, the native binary
  and the npm CLI entry, and `--processes` now reports Claude Code sessions.
  The session-end hook stays Codex-only, since it runs inside a Codex session.

- Report a Claude plugin cache copy that no longer matches the managed source.
  Claude Code serves a plugin from its own cache and refreshes it by version,
  while the plugin source is a local directory whose contents can change without
  a version bump. Every session then loads the previous role definitions even
  though the install verifies clean, which is exactly how an agent change can
  land on disk and never reach a session. The runtime verifier now compares the
  served copy with the source and prints the reinstall command; older cache
  directories are not served and are not reported. A served copy with no agent
  definitions at all counts as full drift rather than being skipped.

- Make the repair preflight timeout visible and adjustable. Repair refuses to
  write when a validator cannot run, which is the right posture, but the budget
  was a hardcoded two minutes and the failure said only `spawnSync ETIMEDOUT`,
  so a busy machine looked like a broken install. The message now names the
  timeout and `AGENTCHEF_PREFLIGHT_TIMEOUT_MS`, and troubleshooting explains it
  in both languages.
- Harden the new surface validator against the failure class it exists for: the
  routing-reference check no longer relies on an id-prefix heuristic that let an
  undefined profile pass, and a granted MCP server is now checked against the
  catalog and against the servers AgentChef installs for Claude, so a typo can
  no longer emit an allowlist entry that silently grants nothing.

- Give a Claude specialist the MCP servers its own instructions depend on. A
  subagent `tools:` list is an allowlist, and one that names no `mcp__` entry
  filters MCP out entirely, so every role told to consult Context7 or the Serena
  bridge could not reach it. 21 roles now declare the servers their role file
  actually references, recorded as `claudeMcp` in `catalog/agents.json` so the
  grant is reviewable data rather than a guess in the emitter.
- Add `scripts/validate-agent-surface-consistency.mjs` to `check`. Each of its
  six checks exists because a real defect reached a release past the structural
  validators: an unreachable specialist, two roles in different coordinator
  domains claiming the same work, a routing profile id the catalog never
  defined, a role asked for command output it cannot produce, a bundled skill
  description that only triggers on one target, and a command naming a binary
  this package does not ship.
- Route `spec_author` and `qa_lead`, which no routing profile could reach, and
  give the Core Web Vitals and edge-case overlaps a boundary clause naming the
  other role, the way `design_reviewer` already did.

- Let an update retire a Claude permission rule it added earlier once the
  fragment no longer asks for it. A version bump used to add the new pinned
  package rule and keep the old one forever, which widened the allowed set on
  every bump. A rule is only taken back under the same ownership proof used for
  MCP entries, and `deny` is never changed.

- Point the external-review skill and the CLI usage at a command that resolves.
  Both told people to run `chef review ...`, but the package is private with no
  bin entry and the skill installs into other repositories, so every step failed
  at the first line. The validator now checks for the runnable form.
- Drop `Codex` from three bundled skill descriptions. Those descriptions are the
  trigger text a Claude Code session matches against, so the routing, context
  budget, and diagram skills were unlikely to fire on the Claude target at all.
- Name real routing profiles in the adaptive-agent-routing reference: two ids it
  used are not defined in `catalog/routing-profiles.json`.
- Tell a Claude subagent that has no execution tool to ask the parent for command
  output. Codex read-only still allows commands, so only the Claude rendering
  loses them, and roles such as the reviewer and the security auditor were being
  told to pull evidence from a diff they cannot produce.

- Let an update refresh the Claude Code MCP entries AgentChef wrote, so a
  catalog version bump reaches an installed home instead of stopping at the
  first install. The entry is only rewritten while its value still hashes to
  what the receipt records; an edited entry, or one AgentChef never wrote, is
  reported and left alone. `-Update` (`--update`) passes the new
  `--refresh-managed` flag, mirroring how the Codex side synchronizes its
  managed config tables. Permission rules remain strictly additive.
- Key object and container receipt entries by pointer when merging receipts, so
  a refreshed value replaces the record of the value it replaced instead of
  leaving a stale entry for removal to trip over.

- Refresh the MCP catalog: `@upstash/context7-mcp` 4.1.1,
  `chrome-devtools-mcp` 1.9.0, `@playwright/mcp` 0.0.82, and the three
  `@modelcontextprotocol/*` servers at 2026.8.31. Each pin was verified by
  starting the server over stdio, completing the handshake, and diffing the
  advertised tool names against the allowlist, rather than from release notes.
- Keep `codebase-memory` pinned at 0.8.1: 0.11.0 refuses to start when the
  user cache directory is writable by another local account, and it forces a
  one-time full reindex.
- Drop `navigate_page_history` from the `chrome-devtools` allowlist and
  approval tables. Probing both the old and the new version shows the tool has
  never existed; page history is a parameter of `navigate_page`.
- Read the Context7 pin from the catalog in the approval-harmony matrix instead
  of repeating the version string, so the case cannot go stale on a bump.
- Re-date the agent, skill, and MCP catalogs after re-checking them: skills by
  resolving all 15 pinned sources online, agents by the Codex config
  compatibility validator against the installed CLI.

- Print `AGENTCHEF` in the operator console header; the colour branch still
  carried the pre-rename `CODEX CHEF` wordmark.
- Introduce the Serena bridge to its backend as `agentchef-serena-pool`.
- Extend `--migrate-identity` to `CODEX_HOME/config.toml`: AgentChef's own
  template and merge banners and its plugin-id keys (including the
  `[hooks.state."<plugin id>:…"]` entry) are rewritten, and an emptied legacy
  plugin-cache directory is removed. Foreign tables, project trust entries, and
  other products' plugin, marketplace, and hook state are left untouched.

## 1.0.0 - 2026-09-18

- Rename the on-disk identity from `codex-chef` to `agentchef`: ownership
  markers (`.agentchef-managed.json`, `.agentchef-source.json`), the
  operation journal and lock names, backup-folder prefixes, receipt and report
  schema strings (`agentchef.<name>.vN`), the plugin folder
  (`plugins/agentchef-workflows`), the operator skill
  (`agentchef-operator`, with a `compatibilityAliases` entry for the old
  name), the personal marketplace name and plugin id
  (`agentchef-workflows@agentchef`), the Git hook banner, the config-merge
  banners, the npm cache folder, and the `AGENTCHEF_*` environment variables.
- Read both spellings everywhere (`scripts/lib/identity.mjs`): legacy markers,
  journals, locks, receipts, backup ids, plugin ids, and `CODEX_CHEF_*`
  variables keep working, and the installed plugin id follows the personal
  marketplace's name until it is migrated.
- Add `npm run chef -- --migrate-identity [--target codex|claude|both] [--apply]`
  (`scripts/migrate-identity.mjs`): a preview-first, journaled, backup-backed
  conversion of markers, folders, marketplace entries, plugin registrations, a
  legacy-banner Git hook (only when its bytes match a shipped template), and
  Claude receipts and links.
- Fix where the Claude target finds the user-scope `.claude.json`:
  `~/.claude.json` by default, and `$CLAUDE_CONFIG_DIR/.claude.json` only when
  that variable (or a relocated `--claude-home`) moves the config directory.
  0.9.0 merged MCP entries into `~/.claude/.claude.json`, which Claude Code
  never reads without the variable; the upgrade guide covers the stray file.
- Link only catalog skills into `~/.claude/skills`: a managed directory that
  left `catalog/skills.json` (such as the retired `codex-chef-brain`) is
  reported as `retired` and never linked, adopted, or removed.
- Follow-ups from review: Codex removal deletes every ownership-marker spelling
  present in a direct skill folder, `plan-install --redact-paths` reports the
  real shape of the `.claude.json` path (an explicit `--claude-json` elsewhere
  shows as `${CLAUDE_JSON}`), and the install contract derives the default
  Claude home from `CLAUDE_CONFIG_DIR` itself.
- Raise the runtime verifier probe buffer: `codex plugin list --available
  --json` on a home with many plugins exceeded the 1 MiB default and the
  plugin-state check reported `ENOBUFS` instead of a result.
- Retitle the shipped global Git ignore template (`# AgentChef global Git
  ignore.`); the previous template hash stays in the legacy ownership list, so
  an installed copy is still recognized and refreshed by `--install-git-guards`.

## 0.9.0 - 2026-09-18

- Add Claude Code as a second install target. Every `manifests/install-plan.json`
  operation now names its target (`codex`, `claude`, or `shared`; schema
  `codex-chef.install-plan.v2`), `plan-install`, the safety preflight, the
  install-surface assertion, and both shell installers take
  `--target codex|claude|both` (`-Target` in PowerShell), and
  `npm run chef -- --install` detects the installed CLIs and confirms the
  target. Non-interactive runs keep the Codex default; the Claude target is
  never selected implicitly.
- Install the Claude surface through one transaction helper,
  `scripts/install-claude-target.mjs`: a user-level rule file rendered from
  the shared working agreement, the Serena bridge, additive `settings.json`
  permission rules and `.claude.json` MCP entries recorded in sidecar receipts,
  junction/symlink skill links into the managed `~/.agents/skills` tree, the
  Claude plugin marketplace manifest, and plugin registration through the
  `claude plugin` CLI. Foreign directories and user content are never
  replaced; AgentChef-marked copies are adopted only with `--adopt-skill-links`.
- Generate the Claude artifacts from the Codex catalog with
  `npm run render:targets` (checked by `npm run check`): 32 namespaced plugin
  subagents (`agentchef:<role>`), the `.claude-plugin/plugin.json` manifest,
  `templates/claude/settings.fragment.json` from `default.rules`, and both
  working-agreement renders from `templates/shared/working-agreement.md`.
- Add `npm run chef -- --remove --target <t>` (preview-first): Claude removal
  reverts only receipt-recorded entries, AgentChef-created links, and
  hash-matching files; Codex removal (`scripts/remove-install.mjs`) deletes
  only byte-identical managed files, marker-carrying skills, source-owned
  plugin files, the marketplace entry, and the plugin cache entry.
- Teach `verify-install-runtime`, `codex-status`, and `codex-doctor` the
  Claude target (`--target claude|both`, `--claude-home`): receipt, link, and
  file verification plus `claude --version`, `claude plugin validate --strict`,
  and `claude mcp list` probes; status also relays the read-only Beyin summary
  line when the launcher exists.
- Let the operation journal record link mutations explicitly
  (`prepareMutation({ link: true })`) and prune merge-created containers on
  removal; add a `claude-target` CI job and `npm run check:claude`.
- The session-end process-hygiene hook stays Codex-only; the Claude plugin
  manifest publishes no hook in this release.

## 0.6.0 - 2026-09-18

- Continue the project as an independent product named AgentChef
  ([ADR-006](docs/decisions/006-agentchef-independent-dual-target-product.md));
  Kitchen is neither modified nor depended on. Visible identity (repository,
  documentation, package metadata, assets) is renamed now; on-disk identity
  (plugin id, ownership markers, marketplace root, backup prefixes, schema
  strings, environment variables, Git hook banner) is unchanged until 1.0.0.
- Retire the built-in Markdown Brain workflow in favor of the separate
  `dual-agent-brain` engine: remove the `codex-chef-brain` bundled skill and
  its direct-install step, `scripts/brain-cli.mjs`, the vault template,
  schemas, validators, tests, the `--continuity`/`--control-brain` operator
  screen, the AGENTS.md Control routing section, and `CODEX_CHEF_BRAIN_HOME`.
  Existing vaults and their `.codex-chef-brain.json` markers are never touched
  (see `docs/brain-retirement.md`).
- Remove Kitchen-era artifacts: `packages/contracts`, the Chef module manifest
  and its validator/test, `docs/enterprise-v3` (the portability contract moves
  to `docs/portability-contract.md`), the tracked agent-result reports and
  their indexer. Supersede ADR-002, ADR-004, and ADR-005.
- Drop the German, Spanish, French, and Brazilian Portuguese README summaries;
  English and Turkish remain at full parity. Rewrite `docs/harness-compatibility.md`
  (formerly `ecc-compatibility.md`) for the dual Codex CLI + Claude Code
  target and add the Claude Code alignment sources.
- Raise the Node.js baseline to `>=22.12.0` (Node 18 and 20 are end-of-life);
  the CI portability matrix now runs Node 22 and 24.
- Speed up real installs: directory syncs verify every target with one helper
  process instead of two Node spawns per copied file, and `Ensure-Dir` results
  are memoized. A full PowerShell install on the maintainer's machine dropped
  from over 300 s to about 110 s. Subprocess timeouts in tests and validators
  can be stretched uniformly with `CODEX_CHEF_TEST_TIMEOUT_SCALE` on slow
  machines; CI defaults are unchanged.
- Wire four previously unrun tests into `npm run check` (agent worker routing
  acceptance, token audit, content-safety boundary, repair-validator
  lifecycle) and add `npm run dev:assert-scratch`, which refuses to run
  installer flows against live homes.
- Rename the `agentSpaceRoles` catalog key to `coordinatorDomains`; archive
  the 0.5.x changelog history in `CHANGELOG-0.5.md`.
- Pin `actions/checkout` to v7.0.1 and `actions/setup-node` to v7.0.0 in the
  validate workflow (the two open Dependabot updates).

## 0.5.74 - 2026-08-14

- Finalize the standalone maintenance release with host-correct repair fixtures,
  executable Unix Git-hook fixtures, and an explicit unavailable Brain-health
  projection branch. These changes make the cross-platform test contract match
  its documented platform behavior without weakening installer or repair gates.

Older 0.5.x entries are archived in [CHANGELOG-0.5.md](CHANGELOG-0.5.md).
