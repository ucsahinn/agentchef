---
name: adaptive-agent-routing
description: Select the narrowest useful agent, skill, MCP, and config route for non-trivial work. Use when delegation, context placement, specialist ownership, duplicate skill aliases, or routing visibility materially affects execution; avoid for trivial single-surface work.
---

# Adaptive Agent Routing

Select routes by expected value, not by catalog match alone.

## Workflow

1. Classify the task shape and identify the smallest owning surface.
2. Read [global-working-agreements.md](references/global-working-agreements.md) only when the detailed route, specialist map, alias policy, or MCP boundary is relevant.
3. Preserve the active session's profile and model. Role files carry only the catalog worker `model`; they never pin reasoning effort, and spawns pass no model override.
4. Spawn an agent only when one of the four catalog conditions holds: an autoVerify routing profile matched and files changed, so its verifier runs before the task is reported done; independent parallel work exists; noisy logs or research should be isolated from the main thread; the user explicitly requests delegation. Skip trivial, strictly sequential, tightly coupled, and single-file work where delegation adds coordination cost.
5. When a request matches a routing profile, load the profile's auto-skill first (suggest it instead when it is explicit-only), and run the required verifier for autoVerify profiles after file changes. Start at most 2 agents per task without the user naming them; treat ten threads as capacity, not a target, and size the workers per task to the work and to the live capacity recommendation (`beyin kapasite`, hard ceiling 8; a coordinator is not counted); a request above the recommendation is refused with the measured reason. "Takım koşusu" means `beyin takim` (the `team-conductor` skill), not the Workflow tool.
6. Pick one of two routes, both at most two levels deep: Direct (the main session briefs the specialists the task needs) or Team (for a user-created board task, the main session briefs its coordinator, which briefs only its own cataloged workers). Workers never spawn; they name a needed role under Open questions as `needs: <role> - <why>`. Brief and check handoffs with the `agent-brief` skill.
7. Emit one `Routing plan:` update and one `Routing result:` summary instead of per-surface narration.
8. Keep destructive, credentialed, account, database, publish, deploy, and external-write actions approval-gated.

## Effort scaling

Use one worker for a single file or strictly sequential work. Use a team only
for independent file groups. For an explicitly requested substantial team run,
plan 3-5 workers with 5-6 bounded tasks per worker when the scope warrants it;
the worker count never exceeds live capacity. These are sizing guidelines,
not a minimum or a reason to invent tasks. The automatic spawn cap still applies.
Keep one active owner per file. `team-run plan --serialize-overlaps` records
ordered dependencies for overlapping groups; otherwise planning refuses them.

## Output Contract

Return selected and skipped surfaces, summarized evidence, commands run, and blockers. Do not paste raw agent transcripts or large logs.
