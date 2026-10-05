# Skills, Plugins, And Specialist Agents

[English](skills-and-agents.md) | [Türkçe](skills-and-agents.tr.md)

This page used to hold every agent and skill in one long list. It is now a
short map so you can reach the useful part without scrolling through the whole
project.

## Skills

Skills are reusable workflows. Codex can select one from the task description,
or you can name it directly when you want a specific workflow.

- [See every skill and how it is installed](skills.md)
- [Open the machine-readable skill catalog](../catalog/skills.json)
- [Read the official Codex skills guide](https://developers.openai.com/codex/skills)

The bundled workflows live under
[`plugins/agentchef/skills`](../plugins/agentchef/skills).
The public catalog also lists optional skills; being listed does not mean every
skill is installed automatically.

## Plugins

The local plugin packages AgentChef's own workflows so they can be installed
and updated together:

- [Plugin manifest](../plugins/agentchef/.codex-plugin/plugin.json)
- [Marketplace entry](../.agents/plugins/marketplace.json)
- [Bundled workflow sources](../plugins/agentchef/skills)

Restart Codex after installing the plugin, then use `/plugins` to inspect it.

## Specialist Agents

Agents are focused roles for work that benefits from a separate reviewer,
researcher, mapper, or verifier. A matching role is a recommendation, not a
reason to open a subagent for every small task.

- [See the 7 coordinators and all 21 specialist workers](agents.md)
- [Open the machine-readable agent catalog](../catalog/agents.json)
- [Read the official Codex subagents guide](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Read the official Claude Code subagents guide](https://code.claude.com/docs/en/sub-agents)

Subagents inherit the current approval and sandbox boundaries. They do not get
extra authority just because the work was delegated.

From 1.3.2, roles run on a cheaper worker model while the
session you open keeps its own; see [Model Tiers](agents.md#model-tiers).
Agents do not chat with each other. From 1.3.3 there are
two routes, both at most two levels deep: Direct, where the main session briefs one to four specialists,
and Team, where for a board task the main session briefs that task's
coordinator and the coordinator briefs its own workers. Use at most four workers per task (a coordinator is not counted); each agent returns one handoff. Codex and
Claude Code have no direct tool between them; see
[How Agents Talk To Each Other](agents.md#how-agents-talk-to-each-other).

## Explicit Coordination Board Workflow

Creating a task explicitly is the only coordination-state trigger. Opening a
pane, selecting an agent, or matching a routing profile does not start work.
From 1.3.3 the main session runs every board command;
coordinators and workers never do.
The coordinator may select only its cataloged workers; each worker returns six
labeled handoff fields: Outcome, Evidence, Changed scope, Risks, Open
questions, and Next verification. The parent/main session relays cross-domain
handoffs. Evidence must be attached and checked by an agent other than the
owner before the task becomes done; there is no auto-start or auto-complete
behavior.

Use a user-chosen, repository-local state path. Initializing or creating a task
records coordination state only; it does not start a coordinator or worker.

```bash
npm run coordination:board -- init --state .coordination-board.json
npm run coordination:board -- create --state .coordination-board.json --id TASK-001 --title "Investigate API timeout" --owner-coordinator backend_coordinator
```

Since 1.3.0 (state schema v3) a task can also name who works it and what it
may write, and work starts only from a complete brief:

- `create … --owner-agent codex --owner-session <name> --write-repo <repo> --write-paths scripts/lib,docs`
  records the owner and a repository-relative write scope.
- `brief --task <id> --brief-file brief.md` stores the brief. A brief has
  seven labeled fields, in English or Turkish: Goal, Evidence, Write scope,
  Boundaries, Done when, Return format, and the user's words verbatim.
  `brief-check --brief-file brief.md` checks one before it is sent, with no
  board needed. The bundled `agent-brief` skill writes this brief and checks
  the handoff that comes back; bilingual labels such as
  `Kapsam / Yazma kapsamı` also parse.
- Starting work (`in_progress`) needs a complete brief, and a task with a write scope
  also needs a live lease: `renew-lease --task <id> --minutes 90` (at most 24
  hours). Other agents read the scope and lease to see what is taken.
- `add-evidence --task <id> --evidence "<command>: <result>"` attaches evidence.
- Without `--state`, `AGENTCHEF_BOARD_STATE` names the board file.

### Board Changes In 1.3.3

From 1.3.3 the board stores state schema 4. A v1, v2, or v3
board is read and migrated in memory, and the next write stores v4; AgentChef
1.3.2 and earlier then refuse that file instead of misreading it.

Statuses are `backlog`, `todo`, `in_progress`, `review`, `done`, `blocked`,
and `cancelled`. The allowed moves:

| Move | Needs |
| --- | --- |
| `backlog` -> `todo` | nothing |
| `todo` -> `in_progress` | an owner, a complete brief, a live lease when the task has a write scope, and no other open task holding a live lease on an overlapping path |
| `in_progress` -> `review` | at least one evidence entry |
| `review` -> `done` | evidence, a linked report, every handoff that needs a decision resolved, and `--verified-by <agent>` |
| `review` -> `in_progress` (rework) | `--reason`; the `in_progress` checks apply again |
| `in_progress` -> `todo` (release) | `--reason`; clears the lease |
| any open status -> `blocked` | `--reason`; a blocked task returns only to the status it was blocked from, and that status's checks apply |
| any open or `blocked` status -> `cancelled` | `--reason`; final |

- Paths overlap when they are in the same repository and one path equals the
  other or starts with it followed by `/`; repository and path compare
  case-insensitively. `renew-lease` refuses an overlapping lease too.
- `assign --task <id> --owner-agent <agent> [--owner-session <name>] [--owner-coordinator <coordinator>] [--by <actor>]`
  sets or changes the owner.
- `--verified-by` must not be the owner agent, the owner session, or the owner
  coordinator; names compare case-insensitively, and `-` and `_` count as the
  same (`root-cause-debugger` is `root_cause_debugger`). `show` lists the
  verifier and time under `verification`. The names are typed by the caller,
  so this stops slips, not impersonation.
- `done` and `cancelled` tasks accept no further change, and their lease is
  cleared.
- `renew-lease --task <id> --minutes <1-1440> [--by <agent>]` refuses a `--by`
  that is not the owner.
- `handoff --task <id> --source-coordinator <a> --target-coordinator <b> --question "<text>" [--decision-needed "<text>"]`
  records a handoff with an id (`H1`, `H2`, ...) and a time. Source and target
  must be different catalog coordinators, and one of them must be the task's
  owner coordinator. `resolve-handoff --task <id> --handoff H1 --answer "<text>"`
  resolves it.
- Every change appends a `history` entry (`at`, `action`, and `from`, `to`,
  `by`, `reason` when they apply) and sets `updatedAt`; `create` sets
  `createdAt`.
- `show [--task <id>] [--status <list>|open] [--owner <agent>]` adds two
  computed fields: `leaseState` (`none`, `live`, or `expired`) and `stale`
  (an `in_progress` or `review` task whose write-scope lease is not live, or
  that nobody changed for 24 hours). `--status open` includes `blocked`.
- Each command rejects options it does not accept, `--help` prints usage,
  `add-evidence` also takes `--evidence-file`, and
  `handoff-check --handoff-file handoff.md` (or `--handoff`) checks a returned
  handoff with no board needed; it exits 1 when a field is missing.
- Brief and handoff labels may be numbered (`1. Goal:`), bold with a
  parenthesized alias (`**Goal** (Hedef):`), or in capitals (`EVIDENCE:`).
  Handoffs also accept `Risks`/`Riskler`, `Open questions`/`Açık sorular`/
  `Unresolved questions`, and `Next verification need`/`Sonraki doğrulama`.
- A lock left by a crashed process (older than 30 seconds) is taken over; a
  busy lock is retried for about two seconds before the command fails.
- Text that looks like a credential is refused, now including Bearer tokens,
  JWTs, and credentials inside URLs.

## Enterprise Routing Profiles

Routing profiles connect a task type with useful agents, skills, MCPs, checks,
and safety boundaries. They help Codex choose a sensible route; they do not
silently run every matching surface.

```bash
npm run chef -- --routing
npm run chef -- --routing --profile starter-health
```

- [Routing profiles](../catalog/routing-profiles.json)
- [Workflow surface map](workflow-surface-map.md)
- [MCP catalog](mcp-catalog.md)

## Manual External Deep Review

The bundled `external-review-workflow` can prepare a tracked, public-safe
snapshot for a review performed elsewhere and verify the returned JSON report.
It does not upload anything or call an external model by itself.

```bash
npm run chef -- review pack --target <repo>
npm run chef -- review verify --target <repo> --manifest <manifest> --report <json>
```

Preview is the default. Applying a handoff still requires an explicit command,
and any real upload remains outside this repository's automatic workflow.

## GPT Pro Project Review

The bundled `gptpro` and `gptpro-handoff` skills build on that same review ID:
the first creates text bundles for a manually managed GPT Pro Project, and the
second writes a bounded prompt plus verifies a returned report. Neither skill
chooses a provider, opens a browser, or uploads source files. The exporter
re-applies the review-pack sensitive-path and binary checks to every manifest
entry on its own, and the handoff ends with a triage record that classifies
every finding as implement-now, needs-decision, or discard.
