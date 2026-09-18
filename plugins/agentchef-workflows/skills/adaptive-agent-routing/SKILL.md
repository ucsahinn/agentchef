---
name: adaptive-agent-routing
description: Select the narrowest useful Codex agent, skill, MCP, and config route for non-trivial work. Use when delegation, context placement, specialist ownership, duplicate skill aliases, or routing visibility materially affects execution; avoid for trivial single-surface work.
---

# Adaptive Agent Routing

Select routes by expected value, not by catalog match alone.

## Workflow

1. Classify the task shape and identify the smallest owning surface.
2. Read [global-working-agreements.md](references/global-working-agreements.md) only when the detailed route, specialist map, alias policy, or MCP boundary is relevant.
3. Preserve the active user's profile, model, and reasoning settings. Agent role files must not pin them.
4. Delegate only for independent parallel work, noisy log or research isolation, or explicit user-requested agent work.
5. Treat ten threads as capacity for concurrent sessions. Normally use one agent and no more than four agents for one task.
6. Emit one `Routing plan:` update and one `Routing result:` summary instead of per-surface narration.
7. Keep destructive, credentialed, account, database, publish, deploy, and external-write actions approval-gated.

## Output Contract

Return selected and skipped surfaces, summarized evidence, commands run, and blockers. Do not paste raw agent transcripts or large logs.
