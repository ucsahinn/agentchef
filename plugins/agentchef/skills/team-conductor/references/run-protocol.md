# Team Run Protocol

## Commands and exit codes

Run the engine from the AgentChef repository root:

```text
node scripts/team-run.mjs <command> --state <board.json> --json
```

| Step | Command | What to show |
| --- | --- | --- |
| Diagnose | `doctor` | Enablement, prerequisites, resource checks, and latest run |
| Plan | `plan --repo <path> --plan-file <file>` | Run ID, base branch, worker/task/role/sandbox/write-scope table, checks |
| Start | `start --run <runId>` | State and worker launch results |
| Supervise | Internal `supervise --run <runId>` | Engine-owned detached supervisor; do not launch or stop manually |
| Observe | `status --run <runId>` | Each worker's state, latest event, lease/heartbeat health, and scope warning |
| Gather | `collect --run <runId>` | Each handoff, changed paths, scope result, and board evidence |
| Integrate | `integrate --run <runId>` | Integration checks, merged tasks, conflicts, and diff statistics |
| Verify | `verify --run <runId>` | Independent read-only `test_verifier` report and verdict |
| Merge | `merge --run <runId>` | Merge commit result and cleanup result |
| Stop | `abort --run <runId> --reason <reason>` | Aborted workers and board task outcomes |
| Inspect | `watch --run <runId>` / `doctor` | Read-only event view / prerequisites |
| Reclaim | `cleanup --run <runId>` | Exact worktrees, branches, or logs selected for cleanup |

Exit codes: `0` success, `1` refusal or operational failure, `2` usage error,
`3` missing/invalid user gate, and `4` partial completion (worker failure or
integration conflict). Treat code 4 as a stop-and-report gate.

## What to show at each gate

Always include the command result, exit code, run ID, affected tasks, and the
next step. Fill placeholders from the actual output; never invent a passing
check or omit a scope warning.

| Gate | User-facing status template |
| --- | --- |
| Doctor | `Team mode is <enabled/disabled> (<stability>). Prerequisites: <results>. Last run: <runId/none>.` |
| Plan | `Planned <runId> on <base branch>: <task/role/sandbox/scope table>. Checks: <checks>. To start, send exactly: baslat <runId>.` |
| Start/status | `Run <runId> is <state>. Workers: <task/state/latest event>. Heartbeat/lease: <health>. Scope warning: <none/details>.` |
| Collect | `Collected <runId>: <task/verdict/changed paths>. Board evidence: <results>. <If exit 4, list partial/failed tasks and ask whether to continue.>` |
| Integrate | `Integration <runId>: <merged tasks>, checks <results>, diff <stat>, conflicts <list>. <If exit 4, ask how to proceed.>` |
| Verify | `Verification: <pass/warn/fail>, report <reportId>, integration <stat>, open issues <list>.` |
| Merge | `Merge <runId>: <commit/blocked result> on <branch>; cleanup <result>. Push/PR remains separate.` |
| Abort/cleanup | `Run <runId>: <aborted/cleanup result>. Workers stopped <list>; resources removed <exact list>.` |

## User gates and copyable messages

The engine reads a short-lived, single-use gate written by the separate Beyin
workflow. It never creates that file. The user grants each gate in chat; do not
write, copy, or simulate its backing file.

**Before starting:**

> Plan: `<runId>` with `<count>` workers, base `<branch>`, and the scopes shown above. To start, send exactly: `baslat <runId>`.

**Before merging:**

> Verification: `<verdict>`; integration: `<stat>`; report: `<reportId>`. To merge into `<branch>`, send exactly: `birlestir <runId>`.

**Before any push or PR:**

> The local merge is complete. Push/PR is a separate external action. For a board task, send exactly `onayla TASK-x` when you want that action.

If the corresponding command returns 3, stop at that gate and show the exact
message again. Never infer consent from silence, a previous gate, or a plan.

## Run record and isolation

The engine stores `<state-directory>/team-runs/<runId>.json`. Each worker gets
its own worktree and branch `takim/<runId>-<TASK>`; the integration branch is
`takim/<runId>`. The default worktree root is the repository sibling
`.agentchef-worktrees/<runId>/`. Temporary directories and paths inside the
repository are rejected.

Use only 1-4 allowlisted roles. Default to read-only. `test_verifier` is
read-only and verifies the integration branch. Workers cannot push, change
their assigned scope, spawn more agents, or alter global configuration. The
engine owns Codex child processes; the visible terminal pane is only an event
viewer. Do not use taskkill or Stop-Process. Use `abort` for an explicitly
requested stop and `cleanup` only when requested.

The worker limit is 60 minutes. Idle activity warns at 15 minutes and stops at
30. A usage-limit result pauses that worker for reporting; resume is not
available in this release. Team mode is available on every install from
AgentChef 1.6.0. Set `AGENTCHEF_TEAM_MODE=off` to switch team execution off for
a process; the skill never changes this variable for you. Optional controls
are `AGENTCHEF_TEAM_MAX_WORKERS`,
`AGENTCHEF_TEAM_WORKTREE_ROOT`, `AGENTCHEF_TEAM_PANE`, and
`AGENTCHEF_TEAM_CODEX_COMMAND`. `AGENTCHEF_BOARD_STATE` selects the coordination
board state file.
