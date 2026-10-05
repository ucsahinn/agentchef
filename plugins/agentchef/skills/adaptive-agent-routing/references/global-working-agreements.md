# Deferred Global Routing Reference

This reference preserves the detailed routing knowledge removed from the always-loaded global `AGENTS.md`. The machine-readable catalogs remain canonical.

## Delegation Decision

Spawn only when at least one condition holds: independent parallel work exists; noisy logs or research should be isolated; or the user explicitly requests delegation. A matching agent is a recommendation, not an unconditional spawn hook. Prefer one specialist, use at most four workers per task (a coordinator is not counted) (more needs the user's explicit request), and retain `max_threads = 10` (legacy alias of `max_concurrent_threads_per_session`) as a capacity ceiling, not a target.

Model tiers: the session the user opens keeps its own model and profile and does the orchestration. Every specialist and coordinator role runs on the catalog `workerModels` (Codex gpt-6-luna, Claude Code sonnet), written as the `model` line of each role file. Reasoning effort is never pinned in a role file, so it stays inherited: normal profiles may use medium, token-safe may use low, and review may use high.

Communication is hierarchical and one-shot: main session, then coordinator, then specialist, at most two levels. Two routes: Direct, the main session briefs one to four specialists itself; Team, for a user-created board task, the main session briefs that task's coordinator, which briefs its own workers. Roles: the user approves; the main session plans, briefs, merges, runs every coordination-board command, and reports; a coordinator (read-only) spawns only its cataloged workers, never general-purpose, fork, or another coordinator, merges their handoffs, and escalates to the parent when approval is needed, a worker is blocked or failed, a write scope changes, another domain is needed, or evidence is still missing after one retry; a worker does one bounded job, never spawns, and names a needed role under Open questions as `needs: <role> - <why>`. Each agent gets one seven-field brief (the `agent-brief` skill) and returns exactly six handoff fields in order: Outcome, Evidence, Changed scope, Risks, Open questions, Next verification. Agents do not message peers. Merge: check each Changed scope against its brief's Write scope, keep conflicting evidence side by side with its sources, resolve or ask the user, and rerun every Done-when check on the merged result; a handoff is a report, not proof. Verify with an agent that did not do the work (never the owner, its session, or its coordinator): `test_verifier` for checks, `code_reviewer` for diffs, `frontend_verifier` for UI, `security_auditor` for security, or the user. In Claude Code, a coordinator's `Agent(...)` worker list is enforced by Claude Code only under `claude --agent`; from 1.3.3 (not released yet) the plugin's PreToolUse hook on the Agent tool denies any AgentChef worker spawn and any coordinator spawn outside its list. Claude's default nesting is three layers; AgentChef stays at two. AgentChef roles get no SendMessage, and Claude agent teams are assumed off. In Codex, `max_depth = 2` is enforced by the default multi-agent backend, not by the opt-in `multi_agent_v2` backend. For a vague or multi-step request, plan with `prompt-architect` in plan-only mode before writing the brief; this is an orchestrator rule, not an automatic step. There is no direct Codex-to-Claude tool: Claude Code can hand read-only work to Codex with `codex exec --sandbox read-only` and the brief on stdin; Codex hands work to Claude through a coordination-board task or the separate Beyin engine's `beyin aktar`.

## Routing Profiles

- `repo-map-before-change`: `code_mapper`, then `engineering_planner` when architecture planning adds value; Serena or codebase memory for bounded reads.
- `current-docs-research`: `docs_researcher` with official OpenAI docs or official project docs/Context7.
- `evidence-backed-research`: `$evidence-research` in the main thread with optional `docs_researcher` or `product_strategist` review, source ledger, and explicit uncertainty.
- `context-surface-decision`: `context_architect` and, for reusable prompts, `prompt_architect`.
- `data-systems`: `backend_coordinator` with `docs_researcher` for read-only data documentation, lineage, metadata, catalog, quality, and source evidence. Database performance, runtime health, or operational diagnostics return a parent-routed handoff for `devops_coordinator`; security needs return to the parent for `qa_coordinator`. Private data and database access remain explicitly gated.
- `bug-root-cause`: `root_cause_debugger`; add `test_verifier` when reproduction or verification can run independently.
- `bounded-feature`: main-thread implementation with `engineering_planner`, `test_verifier`, or `code_reviewer` only when separable.
- `frontend-ui`: `design_reviewer` and `frontend_verifier`; add browser evidence through Playwright or Chrome DevTools.
- `security-sensitive`: read-only `security_auditor` and `code_reviewer` before scoped changes.
- `mcp-connector-change`: `mcp_integrator` with official MCP docs and approval parity checks.
- `release-or-publish`: `release_verifier`, `test_verifier`, and `security_auditor`; all external writes remain explicitly gated.
- `seo-web-quality`: `google_seo_auditor`, `performance_auditor`, or `frontend_verifier` according to evidence needed.
- `onboarding-support`: `devops_coordinator` with `devex_auditor` for setup diagnostics, setup friction, first success, recovery guidance, and support-flow evidence; account and production actions remain explicitly gated.
- `docs-and-adrs`: `docs_author` or `devex_auditor` for independent documentation and onboarding checks.
- `external-deep-review`: `code_reviewer`, with `security_auditor` or `test_verifier` only when separable; use `external-review-workflow` for a manual, hash-pinned, zero-upload handoff.
- `gptpro-project-context`: use `gptpro` to create a fresh, hash-bound GPT Pro context delivery; ZIP upload remains manual and text bundles remain the fallback.
- `gptpro-report-verification`: use `gptpro-handoff` to validate a returned GPT Pro report against the live worktree before implementation.
- `starter-health`: `codex_doctor` and optionally `test_verifier` for setup drift and runtime checks.

Other specialists remain available when their bounded role fits: `mcp_integrator`, `product_strategist`, `spec_author`, `qa_lead`, `performance_auditor`, `docs_author`, `design_reviewer`, `devex_auditor`, `frontend_verifier`, `security_auditor`, and `release_verifier`.

## Canonical Skill Ownership

Choose the narrowest canonical owner and do not load its compatibility alias in the same task:

- `context-engineering-project-starter -> ai-project-starter`
- `codex-skill-forge -> ai-skill-create`
- `codex-enterprise-prompt-architect -> prompt-architect`

Aliases remain discoverable for compatibility and user-authored references. They are not deleted or disabled. The catalog's `compatibilityAliases` also map overlapping optional names to installed skills (for example `request-refactor-plan -> improve-codebase-architecture`, `frontend-skill -> frontend-design`, `git-hygiene -> git-workflow-and-versioning`); entries marked `retired` name their replacement skill or agent role.

Two pinned skills behave differently from their descriptions:

- `improve-codebase-architecture` is user-invoked upstream (disable-model-invocation: true). It never auto-selects; when a task needs it, tell the user to call `$agentchef:improve-codebase-architecture` in Codex or `/agentchef:improve-codebase-architecture` in Claude Code, or invoke it explicitly.
- `git-workflow-and-versioning` says upstream "Use when making any code change". Loading it authorizes nothing: never commit, push, tag, or open a pull request unless the user asked; the working agreement governs the skill.

Use debugging skills before uncertain fixes, feature/TDD skills for bounded implementation, release and git hygiene only for release-shaped work, MCP connector skills for connector changes, and browser/design/accessibility skills only for UI-shaped work.

## MCP Boundaries

Use OpenAI Docs for current Codex behavior, Context7 for current library APIs, semantic navigation for unfamiliar code, sequential reasoning for genuinely complex decomposition, and browser MCPs for rendered evidence. Enabled-tool allowlists and per-tool approval entries must match exactly. Authenticated, database, production, deploy, publish, broad filesystem, and potentially destructive graph tools stay disabled or prompt-gated until explicitly needed.

## Visibility

Start with one compact `Routing plan:` line containing chosen agents, skills, MCPs, commands, and skips. Finish with one `Routing result:` table or line containing completion states and evidence. Avoid separate `Agent started`, `Skill selected`, and `MCP selected` messages unless verbose telemetry is requested.

## Enterprise UI Standards

For internal tools, optimize task completion, certainty, keyboard access, progressive disclosure, stable hierarchy, role-aware actions, WCAG AA contrast, intentional responsive tables, loading/empty/error/success/disabled/permission states, and restrained motion. Typography and spacing should communicate information architecture rather than decoration.

## Safety And Completion

Keep destructive, install, credential, account, database, production, publish, deploy, and external-write actions approval-gated. Ordinary completion ends at verified working behavior; release artifacts are created only in an explicit release workflow. Preserve user work, user-owned config overlay values, project trust, active profile/model choices, and unrelated connectors.
