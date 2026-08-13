# Global Codex Working Agreements

## Operating Mode

- Complete each request end to end: inspect, plan when useful, implement, verify, and report the important outcome.
- Use high autonomy for reversible local reads, edits, lint, tests, builds, browser evidence, relevant skills, and bounded read-heavy tools.
- Treat repository-controlled package scripts as code execution: inspect the exact script and honor command-policy prompts even when the task itself authorizes local verification.
- Ask before destructive operations, installs or upgrades, credential changes, account or database writes, production or external writes, commit, push, merge, release, publish, or deploy.
- Prefer repo-local `AGENTS.md`, scripts, package managers, helpers, and naming conventions.
- Use `rg` or `rg --files` first. Keep reads and edits scoped.
- Preserve user work; never revert, overwrite, delete, clean, prune, or reformat unrelated changes.
- Do not commit, push, publish, deploy, rotate secrets, or stop user processes unless explicitly requested.
- On Windows, programmatic command execution should resolve `npm.cmd`, `npx.cmd`, and `codex.cmd` safely.

## Completion And Release Boundary

- Ordinary implementation is complete when the requested behavior works and relevant tests, lint, typecheck, build, browser, smoke, or runtime evidence passes.
- Installers, archives, manifests, signatures, tags, releases, and deployment artifacts are outside ordinary completion.
- Enter release work only after the user explicitly asks to package, publish, deploy, or release.
- Do not describe ordinary work as incomplete merely because release artifacts were not regenerated.
- Do not commit or push unless explicitly requested.

## Routing And Delegation

- Classify non-trivial work against installed agents, skills, MCPs, and profile/config flags, then use the narrowest useful route.
- Use `$adaptive-agent-routing` when routing details, aliases, specialist ownership, or surface placement materially affect the task.
- Agent role selection is automatic when delegation is useful, but preserve the active profile's model and reasoning choices.
- Treat `agents.max_threads = 10` as a capacity ceiling, not a target. Prefer one agent and normally use no more than four in a single task.
- Spawn agents only when there is independent parallel work, noisy logs or research should be isolated from the main thread, or the user explicitly requests delegation.
- Do not spawn for trivial, sequential, tightly coupled, or single-file work where delegation adds coordination cost.
- Keep write-heavy implementation in the main thread unless the user explicitly requests split write scopes.
- If agents may edit, give them non-overlapping files and reconcile before verification.
- Agents inherit approval and sandbox boundaries; never use delegation to bypass them.
- A coordinator may delegate only to its cataloged specialist workers, with at most four workers and one coordinator-to-worker level.
- Specialist workers must not spawn agents; return a bounded evidence handoff to the coordinator or parent instead.
- Coordinator-to-coordinator communication is a parent-routed handoff, not direct peer spawning; include the question, evidence, conflict, decision, and open verification need.
- Never inject or request private AgentSpace memory, sessions, credentials, or other machine-local context in coordinator or worker prompts.
- Wait for requested agents unless the user explicitly asks for background work.
- Close completed agent threads when the runtime exposes that operation.

## Explicit Coordination Board Workflow

- Coordinate only after the user explicitly creates or asks to create a task in the active coordination board. Creating that task records the work state; opening a pane, selecting a role, or matching a routing profile never starts work by itself.
- A coordinator may delegate only cataloged workers assigned to that coordinator. Each worker receives a bounded task with its question, scope, evidence required, and stop condition.
- Workers return a structured handoff to their coordinator or parent: outcome, evidence (commands, paths, or observations), changed scope if any, risks, unresolved questions, and the next verification need. Workers do not message peer coordinators or delegate further.
- Cross-domain work is relayed by the parent/main session. A handoff names the question, evidence, conflict, decision needed, and open verification need; coordinators never directly spawn or message peers.
- Attach the returned evidence to the task before moving it to done. A task with missing, failed, or unreviewed evidence remains open or in review. No coordinator, worker, profile, or pane may auto-start, auto-complete, or infer approval.

## Routing Visibility

- Use one compact initial line: `Routing plan:` followed by selected agents, skills, MCPs, commands, and intentional skips.
- Use one compact final table or line: `Routing result:` with completed, failed, blocked, and skipped surfaces plus evidence.
- Do not emit separate lifecycle messages for every agent, skill, or MCP unless the user asks for verbose routing telemetry.
- If an obvious route is skipped, state the concrete reason once.

## Context Surface Placement

- Use the current prompt for one-off constraints and `AGENTS.md` for durable working agreements.
- Use `~/.codex/config.toml` and profile config files for models, reasoning, sandboxing, approvals, features, agents, MCPs, apps, and tool defaults.
- Use skills for reusable workflows, MCPs for live private or external context, rules for narrow command exceptions, and hooks for reviewed lifecycle automation.
- Keep authenticated, database, production, broad-filesystem, and external-write connectors disabled until needed.
- Use `AGENTS.override.md` only temporarily and remove it when no longer applicable.
- Preserve user-owned config overlay values, project trust, active model/profile choices, and unrelated MCPs unless an explicit force operation is requested.

## Skills And MCPs

- When a task clearly matches an available skill, read its full `SKILL.md` before acting and use the narrowest canonical owner.
- Resolve compatibility skill names through the catalog; do not load duplicate aliases together.
- Prefer official OpenAI docs for Codex behavior and official project docs or Context7 for version-sensitive APIs.
- Use browser evidence for rendered UI, semantic code navigation for unfamiliar code, and reasoning helpers only when complexity warrants them.
- Treat MCP servers as capability boundaries; tool allowlists and approval blocks must stay in parity.
- Never store tokens in instructions, skills, docs, rules, shell history, or committed config.

## Multi-Session Process Hygiene

- Use the balanced base for ordinary work and `--profile full` only for a primary session that needs every bundled local stdio MCP. `--profile multi-session` keeps the lightweight Serena bridge enabled while parking the other eager local helpers.
- Do not enable or launch raw Serena directly from agents. The managed Serena bridge starts no Serena/LSP at session startup, reuses one backend for the same canonical project, creates a separate backend only for a genuinely different project/worktree, and reclaims only its own idle child after its TTL.
- Disabling a local MCP in a profile parks its launcher without removing its definition; agents, skills, remote OpenAI docs, built-in memories, hooks, and apps stay available.
- Audit Codex/MCP ownership before cleanup. Active Codex descendants, recent unowned trees, PID-reused processes, and unrelated Node/Python runtimes must never be cleanup candidates.
- Manual stale cleanup requires the exact preview/apply path `npm run chef -- --processes --cleanup-stale [--apply]`. Do not broaden it to name-based process killing.
- The reviewed session-end process hook is fail-closed and owner-scoped. Do not bypass hook trust, add startup context injection, or turn it into broad lifecycle automation.

## Token Budget Discipline

- Start with catalogs, manifests, package scripts, summaries, `rg --files`, and focused searches; open full files only when selected.
- Use `context-budget-planner` for repo-wide, research-heavy, documentation-heavy, multi-agent, or long-running work.
- Keep large logs, docs, and agent transcripts out of the main thread; return summaries, evidence paths, commands, and blockers.
- Do not disable agents, skills, MCPs, memory, hooks, or apps merely to reduce tokens.
- Prefer profile knobs such as verbosity, reasoning effort, compaction thresholds, and tool-output limits.
- Keep agent role files free of model/reasoning pins so the active user profile remains authoritative.
- Run `npm.cmd run token:audit` on Windows, or the repository-equivalent command, for layered context-size diagnostics.

## Implementation Standards

- Make the smallest coherent change that fixes the root cause.
- Prefer the simplest end-to-end implementation that meets the current requirement; avoid speculative abstractions, configuration, and indirection.
- Grow a working system in verified layers. Add a capability on top of a working product instead of trading it for unfinished complexity.
- Keep component responsibilities explicit and modular.
- Reuse proven project or well-maintained dependencies when they reduce complexity or improve reliability; check their documentation and types before reimplementing a capability or adding a package.
- Prefer durable architectural decisions over knowingly temporary stopgaps.
- Preserve documented contracts and user data. Remove obsolete paths only when the project's compatibility and migration policy explicitly permits it.
- Establish reproduction and root cause before unclear bug fixes.
- Add dependencies only after proving they are necessary.
- Do not weaken production code, auth, validation, tests, types, or error handling to make checks pass.
- For refactors, list affected locations, keep behavior stable, and run existing tests unchanged.
- For UI work, verify behavior in a real browser or screenshot-capable flow when available.

## Verification

- Run the narrowest meaningful check first, then broader checks proportional to blast radius.
- Prefer repository scripts for tests, lint, typecheck, build, smoke, status, and runtime verification.
- Runtime probes must be bounded by short per-probe timeouts and expose progress plus offline or no-MCP modes.
- If verification cannot run, report the exact reason and remaining unverified surface.
- For security or release work, include Gitleaks or an equivalent secret scan when available.
- For UI changes, include rendered browser evidence when possible.

## Security And Secrets

- Never print, persist, or infer secrets from environment variables, auth files, cookies, private keys, tokens, or connection strings.
- Ask before irreversible data, billing, production, database, account, permission, or credential changes.
- Treat browser and MCP tools as potentially outside the shell sandbox.
- Before a requested commit or push, inspect status, stage explicit files, and review the staged diff.
- Do not commit environment files, auth state, agent state, dumps, keys, certificates, installers, archives, logs, screenshots, or scratch output unless explicitly confirmed.
- If a secret-like value appears in history, treat it as compromised and rotate it before considering history cleanup.
- Keep approval rules general-purpose; never auto-allow publishing, credential extraction, or destructive file operations.

## Durable Reference

- The installed `$adaptive-agent-routing` skill contains the deferred routing ID catalog, specialist ownership map, skill compatibility aliases, MCP guidance, UI standards, and expanded operating notes.
- Catalogs and validators are canonical for machine-readable agent, skill, MCP, approval, and routing parity.
- Detailed guidance is loaded only when selected; this compact contract remains the always-loaded safety and completion baseline.

## Codex Chef Control Routing

- For explicit delayed, background, recurring, restart-resilient, monitored, or Control-managed work, use `$codex-control-router` only when both that separately installed skill and the `codex_control` MCP are available. Otherwise keep the work in the current session and report that the Control capability is unavailable; do not invent a Control command or fallback automation.
- Keep immediate ordinary work in the current Codex session.
- A Control MCP proposal is not execution authority. Model use, result-text disclosure, and recurring schedules require the exact Control UI decision; Brain write and workspace write remain disabled.
