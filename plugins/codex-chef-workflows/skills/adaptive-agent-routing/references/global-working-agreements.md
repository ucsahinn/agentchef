# Deferred Global Routing Reference

This reference preserves the detailed routing knowledge removed from the always-loaded global `AGENTS.md`. The machine-readable catalogs remain canonical.

## Delegation Decision

Spawn only when at least one condition holds: independent parallel work exists; noisy logs or research should be isolated; or the user explicitly requests delegation. A matching agent is a recommendation, not an unconditional spawn hook. Prefer one specialist, normally cap one task at four, and retain `max_threads = 10` as cross-session capacity.

Agent roles inherit the active profile. Omitted model and reasoning fields are intentional: normal profiles may use medium, token-safe may use low, and review may use high without role files overriding the user.

## Routing Profiles

- `repo-map-before-change`: `code_mapper`, then `engineering_planner` when architecture planning adds value; Serena or codebase memory for bounded reads.
- `current-docs-research`: `docs_researcher` with official OpenAI docs or official project docs/Context7.
- `evidence-backed-research`: `$evidence-research` in the main thread with optional `docs_researcher` or `product_strategist` review, source ledger, and explicit uncertainty.
- `context-surface-decision`: `context_architect` and, for reusable prompts, `prompt_architect`.
- `bug-root-cause`: `root_cause_debugger`; add `test_verifier` when reproduction or verification can run independently.
- `bounded-feature`: main-thread implementation with `engineering_planner`, `test_verifier`, or `code_reviewer` only when separable.
- `frontend-ui`: `design_reviewer` and `frontend_verifier`; add browser evidence through Playwright or Chrome DevTools.
- `security-sensitive`: read-only `security_auditor` and `code_reviewer` before scoped changes.
- `mcp-connector-change`: `mcp_integrator` with official MCP docs and approval parity checks.
- `release-or-publish`: `release_verifier`, `test_verifier`, and `security_auditor`; all external writes remain explicitly gated.
- `seo-web-quality`: `google_seo_auditor`, `performance_auditor`, or `frontend_verifier` according to evidence needed.
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

Aliases remain discoverable for compatibility and user-authored references. They are not deleted or disabled.

Use debugging skills before uncertain fixes, feature/TDD skills for bounded implementation, release and git hygiene only for release-shaped work, MCP connector skills for connector changes, and browser/design/accessibility skills only for UI-shaped work.

## MCP Boundaries

Use OpenAI Docs for current Codex behavior, Context7 for current library APIs, semantic navigation for unfamiliar code, sequential reasoning for genuinely complex decomposition, and browser MCPs for rendered evidence. Enabled-tool allowlists and per-tool approval entries must match exactly. Authenticated, database, production, deploy, publish, broad filesystem, and potentially destructive graph tools stay disabled or prompt-gated until explicitly needed.

## Visibility

Start with one compact `Routing plan:` line containing chosen agents, skills, MCPs, commands, and skips. Finish with one `Routing result:` table or line containing completion states and evidence. Avoid separate `Agent started`, `Skill selected`, and `MCP selected` messages unless verbose telemetry is requested.

## Enterprise UI Standards

For internal tools, optimize task completion, certainty, keyboard access, progressive disclosure, stable hierarchy, role-aware actions, WCAG AA contrast, intentional responsive tables, loading/empty/error/success/disabled/permission states, and restrained motion. Typography and spacing should communicate information architecture rather than decoration.

## Safety And Completion

Keep destructive, install, credential, account, database, production, publish, deploy, and external-write actions approval-gated. Ordinary completion ends at verified working behavior; release artifacts are created only in an explicit release workflow. Preserve user work, user-owned config overlay values, project trust, active profile/model choices, and unrelated connectors.
