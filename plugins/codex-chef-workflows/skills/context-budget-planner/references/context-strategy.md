# Context Strategy Reference

Use this reference when a task can sprawl across many files, tools, agents,
docs, or long outputs.

## Objective First

Write the objective as a concrete completion condition. Preserve:

- exact user approvals
- target repo and branch
- exact file paths
- exact commands
- external systems that are in or out of scope
- what must not be changed

## Source Priority Tiers

Load context in this order unless the task requires otherwise:

1. User request, explicit approvals, and latest corrections.
2. Repo `AGENTS.md`, package scripts, manifests, schemas, catalogs, and indexes.
3. Files directly named by the user or by failing commands.
4. Official docs for version-sensitive product behavior.
5. Focused external docs or standards.
6. Prior memory only as a hint, then verify when cheap.
7. Broad web/practitioner feedback only as pattern signal.

## Load, Defer, Ignore

Create three lists before broad work:

- Load now: files that define behavior or safety boundaries.
- Defer: detailed docs, full logs, generated outputs, or reference files that
  may be useful later.
- Ignore: unrelated build output, screenshots, caches, private state, or
  external systems outside the current approval.

## Context Risk Patterns

- Context pollution: irrelevant logs, copied docs, or old conclusions crowd out
  the real task.
- Context rot: stale memory or old research overrides current repo evidence.
- Lost-in-the-middle: important constraints buried in large pasted output.
- Duplicate capability: too many overlapping skills hide important entries from
  the initial skill list.
- Tool-output sprawl: command output is copied wholesale instead of summarized
  with exact failing lines.

## Surface Routing

Put durable behavior in the narrowest useful surface:

| Surface | Use for |
| --- | --- |
| Prompt | One-off task constraints |
| `AGENTS.md` | Durable repo or global working agreements |
| Skill | Reusable workflow or domain procedure |
| Plugin | Distribution of skills, app integrations, or MCP bundles |
| MCP | Live external or private context that should stay out of prompts |
| Hook | Reviewed lifecycle automation, not the main security boundary |
| Rule | Narrow command-approval exceptions |
| Config | Models, sandboxing, profiles, tool defaults, MCP enablement |
| Memory | Non-secret local context that should persist across sessions |
| Script | Deterministic checks or fragile repeated transformations |

## Multi-Agent Use

Use subagents for read-heavy or noisy work when they reduce main-thread context:

- code mapping across many files
- official docs research
- security or release review
- browser/UI evidence
- test failure triage

Ask subagents for summaries, evidence, file paths, and commands. Do not paste
raw logs unless they are essential.

## Compaction Handoff

When a task may exceed context, keep a handoff with:

- objective and current status
- decisions made
- files edited
- commands run and results
- remaining steps
- blockers and approvals needed
- exact verification still required

## Security And Privacy

- Do not move secrets, tokens, cookies, auth files, sessions, private memory, or
  private local paths into prompts, docs, diagrams, issues, or PR bodies.
- Redact paths or account details when output leaves the local machine.
- Prefer read-only checks until mutation is explicitly approved.

## Token-Saving Tactics

- Start with `rg --files`, manifests, catalogs, and script names.
- Search before opening large files.
- Read authoritative instruction files completely once selected.
- Use line-focused reads for code after finding the relevant function.
- Summarize command output, but keep exact commands and failing lines.
- Use references only when the selected skill or task needs them.
- Run `npm run token:audit` in AgentChef to identify the largest startup,
  config, agent-role, skill, docs, and validator surfaces before optimizing.
- Use `templates/codex/profiles/token-safe.config.toml` when a session needs
  lower verbosity, lower default reasoning, earlier compaction, and capped tool
  output without disabling skills, agents, MCP servers, memory, hooks, or apps.
- Avoid adding a per-agent model/reasoning pin unless the role has a proven
  task-specific need; automatic selection keeps specialists adaptable to the
  current profile and task complexity.
