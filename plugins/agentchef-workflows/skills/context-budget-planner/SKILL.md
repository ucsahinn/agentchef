---
name: context-budget-planner
description: Plan token and context usage before broad Codex work. Use for repo-wide, research-heavy, multi-agent, documentation-heavy, or long-running tasks that need a context budget, source priority map, compaction handoff, and verification gates.
---

# Context Budget Planner

Use this skill before broad, long-running, or multi-source Codex work. The goal
is to keep useful capability while reducing wasted context.

## Output

Return:

1. Objective and completion evidence
2. Must-load context
3. Defer-until-needed context
4. Ignore or exclude list
5. Tool and source routing
6. Token-saving tactics
7. Compaction-safe handoff
8. Verification gates

## Reference Routing

Read `references/context-strategy.md` for broad repo work, research-heavy
tasks, multi-agent delegation, long command outputs, compaction handoffs,
surface-routing decisions, or token/context tradeoffs.

## Rules

- Preserve user constraints, approval gates, file paths, exact commands, and
  named artifacts.
- Prefer current files and command outputs over memory or guesses.
- Load indexes, manifests, catalogs, and summaries before full files when that
  still gives reliable evidence.
- Read a selected authoritative instruction file completely before acting on
  it.
- Do not paste huge logs into the main thread. Summarize the key lines and keep
  command names exact.
- Do not move secrets, tokens, auth files, session data, private memory, or
  private local paths into prompts, docs, diagrams, or issue comments.
- Use subagents for bounded read-heavy work only when they reduce noise or
  produce clearer evidence.
- Put durable behavior in the right surface: prompt, `AGENTS.md`, skill,
  plugin, MCP, hook, memory, rule, config, or script.
- Use current official docs or verified sources when external facts affect the
  answer.
- Keep overlapping optional skills discoverable, but prefer the smallest
  default set that covers the task without duplicate trigger noise.

## Context Budget Template

```text
Objective:
- ...

Completion evidence:
- ...

Must load now:
- ...

Defer until needed:
- ...

Ignore/exclude:
- ...

Tool/source routing:
- Local repo:
- Official docs:
- External docs:
- Browser/UI:
- Security/release:

Token-saving tactics:
- Start from indexes/manifests/catalogs before full files.
- Read only the relevant sections after symbol or text search.
- Summarize long command output instead of copying it wholesale.
- Keep exact commands, paths, versions, and failures.

Compaction handoff:
- Current decision:
- Files changed or inspected:
- Commands run:
- Known blockers:
- Next verification:

Verification gates:
- ...
```

## When Not To Use

- Tiny single-file edits.
- Simple factual answers where no repo or external context is needed.
- Tasks where the user explicitly asks for direct execution and context is
  already small.
