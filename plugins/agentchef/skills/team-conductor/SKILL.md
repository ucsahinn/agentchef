---
name: team-conductor
description: Orchestrate AgentChef team runs from Claude Code with bounded Codex workers, explicit user gates, isolated worktrees, and verified integration.
---

# Team Conductor

Read [the run protocol](references/run-protocol.md) before operating a team run.
This skill is explicit-only. Team mode is available on every install from
AgentChef 1.6.0. Set `AGENTCHEF_TEAM_MODE=off` to switch team execution off for
a process; this skill never changes this variable for you.

Start and merge approvals are written only by the dual-agent-brain (Beyin) chat
hook, and only for Beyin's board. When Beyin is installed (`~/.beyin/vault.txt`
exists), run every engine command as `beyin takim <command> ...` instead of
`node scripts/team-run.mjs`; it supplies Beyin's board, creates it when missing,
and opens the run and worker panels. Without Beyin, `doctor` reports a failing
`approval-writer` check: say that team runs need dual-agent-brain and stop.

1. Run `doctor`. If the `execution` check fails, explain that
   `AGENTCHEF_TEAM_MODE=off` switches team execution off for this process and
   stop. Never change the variable for the user.
2. Split the request into 1-4 independent tasks. Write one `agent-brief` per
   worker and check each with
   `npm run coordination:board -- brief-check --brief-file <file> --json`.
   Choose roles from the allowlist in the team-mode catalog and default to a
   read-only role. Fan-out rule: one worker per independent write scope; run
   two or more workers only when their write scopes are disjoint and no task
   needs another task's output; put dependent work in a later run; never more
   than four. A change that touches one file stays with one worker. Tell an
   implementing role to change code, not only diagnose it.
3. Run `plan`. Show the plan and worker table, then ask the user to send the
   exact chat sentence `baslat <runId>`. Never create or edit an approval file.
   If `start` returns 3, stop and ask again; do not retry around the gate.
4. Run `start`, then poll `status` every 60-120 seconds. Do not edit worker
   scopes while they run. Never use taskkill or Stop-Process; use `abort` only
   when the user asks to stop the run.
5. Run `collect`. On exit 4, show partial reports and ask how to proceed. Run
   `integrate`; on exit 4, show conflicts and checks and ask how to proceed.
6. Run `verify` on the integration branch. Show integration statistics,
   verification report, and verdict. Ask the user to send the exact chat
   sentence `birlestir <runId>` before running `merge`.
7. `merge` creates a merge commit on the user's branch. Push/PR and
   `onayla TASK-x` are separate actions and need their own request. If usage
   limits pause a worker, report it and stop; when the user says the limit has
   reset, run `resume` (same plan, same worktrees, each paused worker continues
   its saved Codex thread). After abort, run cleanup only if the user asks.

Show the gate-specific command, exit code, affected tasks, and next action at
each step. Do not claim a later gate passed when an earlier gate is partial or
blocked.
