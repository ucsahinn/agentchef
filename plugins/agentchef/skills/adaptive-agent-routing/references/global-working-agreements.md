# Deferred Global Routing Reference

This reference preserves the detailed routing knowledge removed from the always-loaded global `AGENTS.md`. The machine-readable catalogs remain canonical.

## Delegation Decision

Spawn only when at least one condition holds: independent parallel work exists; noisy logs or research should be isolated; or the user explicitly requests delegation. A matching agent is a recommendation, not an unconditional spawn hook. Prefer one specialist, use at most four workers per task (a coordinator is not counted) (more needs the user's explicit request), and retain `max_threads = 10` (legacy alias of `max_concurrent_threads_per_session`) as a capacity ceiling, not a target.

Model tiers: the session the user opens keeps its own model and profile and does the orchestration. Every specialist and coordinator role runs on the catalog `workerModels` (Codex gpt-6-luna, Claude Code sonnet), written as the `model` line of each role file. Reasoning effort is never pinned in a role file, so it stays inherited: normal profiles may use medium, token-safe may use low, and review may use high.

Communication is hierarchical and one-shot: main session, then coordinator, then specialist, at most two levels. Two routes: Direct, the main session briefs one to four specialists itself; Team, for a user-created board task, the main session briefs that task's coordinator, which briefs its own workers. Roles: the user approves; the main session plans, briefs, merges, runs every coordination-board command, and reports; a coordinator (read-only) spawns only its cataloged workers, never general-purpose, fork, or another coordinator, merges their handoffs, and escalates to the parent when approval is needed, a worker is blocked or failed, a write scope changes, another domain is needed, or evidence is still missing after one retry; a worker does one bounded job, never spawns, and names a needed role under Open questions as `needs: <role> - <why>`. Each agent gets one seven-field brief (the `agent-brief` skill) and returns exactly six handoff fields in order: Outcome, Evidence, Changed scope, Risks, Open questions, Next verification. Agents do not message peers. Merge: check each Changed scope against its brief's Write scope, keep conflicting evidence side by side with its sources, resolve or ask the user, and rerun every Done-when check on the merged result; a handoff is a report, not proof. Verify with an agent that did not do the work (never the owner, its session, or its coordinator): `test_verifier` for checks, `code_reviewer` for diffs, `frontend_verifier` for UI, `security_auditor` for security, or the user. In Claude Code, a coordinator's `Agent(...)` worker list is enforced by Claude Code only under `claude --agent`; from 1.3.3 the plugin's Agent spawn-guard hook denies any AgentChef worker spawn and any coordinator spawn outside its list. Claude's default nesting is three layers; AgentChef stays at two. AgentChef roles get no SendMessage, and Claude agent teams are assumed off. In Codex, `max_depth = 2` is enforced by the default multi-agent backend, not by the opt-in `multi_agent_v2` backend. For a vague or multi-step request, plan with `prompt-architect` in plan-only mode before writing the brief; this is an orchestrator rule, not an automatic step. There is no direct Codex-to-Claude tool: Claude Code can hand read-only work to Codex with `codex exec --sandbox read-only` and the brief on stdin; Codex hands work to Claude through a coordination-board task or the separate Beyin engine's `beyin aktar`.

## Routing Profiles

<!-- agentchef:routing-profiles:start -->
Rendered from `catalog/routing-profiles.json` by `scripts/render-target-artifacts.mjs`; do not edit by hand. A matched profile loads its auto-skill first (explicit-only skills are suggested instead), runs its verifier before a file-changing task is reported done when the verifier is required, and starts at most 2 agents per task without the user naming them.

- `repo-map-before-change`: agents `code_mapper`, `engineering_planner`; skills `context-budget-planner`, `improve-codebase-architecture`; auto-skill `context-budget-planner`; verifier `test_verifier` (suggested).
- `current-docs-research`: agents `docs_researcher`; skills none; auto-skill none; verifier `test_verifier` (suggested).
- `evidence-backed-research`: agents `docs_researcher`, `product_strategist`; skills `evidence-research`, `context-budget-planner`; auto-skill `evidence-research`; verifier `test_verifier` (suggested).
- `context-surface-decision`: agents `context_architect`, `prompt_architect`; skills `ai-project-starter`, `ai-skill-create`, `prompt-architect`; auto-skill `prompt-architect`; verifier `test_verifier` (suggested).
- `bug-root-cause`: agents `root_cause_debugger`, `qa_lead`, `test_verifier`; skills `systematic-debugging`, `test-driven-development`, `gh-fix-ci`; auto-skill `systematic-debugging`; verifier `test_verifier` (suggested).
- `bounded-feature`: agents `spec_author`, `engineering_planner`, `test_verifier`, `code_reviewer`; skills `test-driven-development`, `documentation-and-adrs`, `dependency-upgrade`; auto-skill `test-driven-development`; verifier `code_reviewer` (suggested).
- `data-systems`: agents `docs_researcher`; skills `evidence-research`; auto-skill none; verifier `test_verifier` (required after file changes). Cross-domain: `devops_coordinator` via parent-routed-handoff when The task needs database performance measurement, runtime health, or operational diagnostics.
- `frontend-ui`: agents `design_reviewer`, `frontend_verifier`, `performance_auditor`; skills `frontend-design`, `webapp-testing`, `accessibility`, `web-quality-audit`; auto-skill `frontend-design`; verifier `frontend_verifier` (required after file changes).
- `security-sensitive`: agents `security_auditor`, `code_reviewer`; skills `security-best-practices`, `security-threat-model`; auto-skill `security-best-practices` (explicit-only: suggest, do not load); verifier `security_auditor` (required after file changes).
- `mcp-connector-change`: agents `mcp_integrator`, `security_auditor`; skills `mcp-builder`; auto-skill `mcp-builder`; verifier `security_auditor` (required after file changes).
- `code-review`: agents `code_reviewer`, `test_verifier`; skills none; auto-skill none; verifier `test_verifier` (suggested).
- `release-or-publish`: agents `release_verifier`, `test_verifier`, `security_auditor`; skills `shipping-and-launch`, `git-workflow-and-versioning`; auto-skill `shipping-and-launch`; verifier `release_verifier` (required after file changes).
- `seo-web-quality`: agents `google_seo_auditor`, `performance_auditor`, `frontend_verifier`; skills `seo`, `web-quality-audit`, `accessibility`; auto-skill `seo`; verifier `test_verifier` (suggested).
- `onboarding-support`: agents `devex_auditor`; skills none; auto-skill none; verifier `test_verifier` (suggested).
- `docs-and-adrs`: agents `docs_author`, `devex_auditor`; skills `documentation-and-adrs`, `ai-project-starter`, `offline-diagram-triplet`; auto-skill `documentation-and-adrs`; verifier `test_verifier` (suggested).
- `external-deep-review`: agents `code_reviewer`, `security_auditor`, `test_verifier`; skills `external-review-workflow`; auto-skill `external-review-workflow`; verifier `test_verifier` (suggested).
- `gptpro-project-context`: agents `code_reviewer`, `test_verifier`; skills `gptpro`; auto-skill `gptpro`; verifier `test_verifier` (suggested).
- `gptpro-report-verification`: agents `code_reviewer`, `test_verifier`; skills `gptpro-handoff`; auto-skill `gptpro-handoff`; verifier `test_verifier` (suggested).
- `starter-health`: agents `codex_doctor`, `test_verifier`; skills `agentchef-operator`, `context-budget-planner`; auto-skill `agentchef-operator`; verifier `test_verifier` (suggested).
<!-- agentchef:routing-profiles:end -->

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

Start with one compact `Routing plan:` line containing chosen agents, skills, MCPs, commands, and skips. Finish with one `Routing result:` table or line containing completion states and evidence. Avoid separate per-agent, per-skill, and per-MCP lifecycle messages unless verbose telemetry is requested.

## Enterprise UI Standards

For internal tools, optimize task completion, certainty, keyboard access, progressive disclosure, stable hierarchy, role-aware actions, WCAG AA contrast, intentional responsive tables, loading/empty/error/success/disabled/permission states, and restrained motion. Typography and spacing should communicate information architecture rather than decoration.

## Safety And Completion

Keep destructive, install, credential, account, database, production, publish, deploy, and external-write actions approval-gated. Ordinary completion ends at verified working behavior; release artifacts are created only in an explicit release workflow. Preserve user work, user-owned config overlay values, project trust, active profile/model choices, and unrelated connectors.
