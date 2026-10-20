---
name: team-conductor
description: Orchestrate AgentChef team runs ("takım koşusu", run with `beyin takim`) from Claude Code with Codex workers sized to live capacity, explicit user gates, isolated worktrees, and verified integration.
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

"Takım koşusu" (also "takım koştur", "işçi koştur", "team run") means this
skill and `beyin takim`. Do not substitute the Claude Code Workflow tool or a
fan-out of in-session subagents for it. Use the Workflow tool only when the
work cannot run as a team run (no Codex login, no Beyin, or the user names the
Workflow tool), and say which reason applies in one line before starting.

1. Run `doctor`. If the `execution` check fails, explain that
   `AGENTCHEF_TEAM_MODE=off` switches team execution off for this process and
   stop. Never change the variable for the user.
2. Split the request into as many independent tasks as the work needs. The
   number of workers running at once follows the live capacity
   recommendation (`beyin kapasite`; without Beyin, free RAM at 1.5 GB per
   worker), with a hard ceiling of 8; `plan` records it under `capacity`. If
   the user asks for more, pass `--max-workers <n>`; `plan` refuses a number
   above the recommendation and quotes the measured reason. Show that reason
   and do not retry around it. A recommendation of 0 refuses the plan; pass
   `--max-workers 1` only when the user explicitly asks to run one worker at a
   time anyway (recorded as `capacity.ownerOverride`). `start` measures again:
   the cap can only go down, and a recommendation of 0 without that override
   refuses the start without consuming the approval. Write one `agent-brief` per
   worker and check each with
   `npm run coordination:board -- brief-check --brief-file <file> --json`.
   Choose roles from the allowlist in the team-mode catalog and default to a
   read-only role. Fan-out rule: one worker per independent write scope; run
   two or more workers only when their write scopes are disjoint and no task
   needs another task's output; put dependent work in a later run. A change
   that touches one file stays with one worker. Tell an
   implementing role to change code, not only diagnose it.
3. Run `plan`. If the repository has uncommitted changes, add `--snapshot`:
   workers start from a private snapshot commit
   (`refs/agentchef/snapshots/<runId>`) and the user's branch, index and files
   stay untouched. Never commit, stash or clean the user's work to make the
   tree clean. Show the plan and worker table, then ask the user to send the
   exact chat sentence `baslat <runId>`. Never create or edit an approval file.
   If `start` returns 3, stop and ask again; do not retry around the gate.
4. Run `start`, then poll `status` every 60-120 seconds. Do not edit worker
   scopes while they run. Never use taskkill or Stop-Process; use `abort` only
   when the user asks to stop the run.
5. Run `collect`. On exit 4, show partial reports and ask how to proceed. A
   run whose workers are all read-only ends here with status `completed`
   (`completion.reason` "read-only, reports collected"): show the reports and
   stop; there is nothing to integrate, verify or merge. Run
   `integrate`; on exit 4, show conflicts and checks and ask how to proceed.
6. Run `verify` on the integration branch. Show integration statistics,
   verification report, and verdict. Ask the user to send the exact chat
   sentence `birlestir <runId>` before running `merge`.
7. `merge` creates a merge commit on the user's branch and needs a clean tree.
   `merge --as-patch` creates no commit: it applies the verified diff to the
   working tree as unstaged changes, after `git apply --check`, and only when
   the branch is still at the planned commit. A `--snapshot` run must use
   `--as-patch`, and so must any run where the user did not ask for a commit.
   Push/PR and
   `onayla TASK-x` are separate actions and need their own request. If usage
   limits pause a worker, report it and stop; when the user says the limit has
   reset, run `resume` (same plan, same worktrees, each paused worker continues
   its saved Codex thread); `resume --wait` waits for the reset time read from
   the limit message (or 30 minutes, at most 12 hours) and then resumes. If an
   integration check fails and you repair the integration branch yourself,
   commit the repair and run `integrate --recheck`; never merge it by hand.
   If a worker finished without changes (for example it only diagnosed), finish
   its scope yourself in the integration branch, commit, and run
   `integrate --recheck --covers TASK-x`. Tell implementing roles to change
   code, not only diagnose it. If the machine slept, crashed or restarted and the
   run shows `running` with no supervisor heartbeat, the same `resume`
   recovers it: orphaned workers continue their saved thread in the same
   worktree. After abort, run cleanup only if the user asks.

Show the gate-specific command, exit code, affected tasks, and next action at
each step. Do not claim a later gate passed when an earlier gate is partial or
blocked.
