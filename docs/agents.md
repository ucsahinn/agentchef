# AgentChef Agents

[English](agents.md) | [Türkçe](agents.tr.md)

An agent is the **who** in a Codex workflow: a focused role with a clear job,
boundaries, and evidence to return.

AgentChef includes 7 coordination roles and 21 specialist worker roles. They
are not background services and they do not all run on every task. A role can
guide the main session without being spawned. From 1.3.4 (not released yet),
an agent is started only when one of four conditions holds: a routing profile
that requires a verifier matched and files changed, independent parallel work
exists, noisy logs or research should stay out of the main thread, or you
explicitly ask for delegation (see [Routing profiles and automatic
use](#routing-profiles-and-automatic-use)).

Official references: [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
(the old `developers.openai.com/codex/subagents` URL redirects there) and
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents), both
checked 2026-10-05.

## Call A Coordinator

Ask for a named role in ordinary language. State the task, the coordinator,
whether independent work should run in parallel, and the evidence you want
returned. For example:

> Have `backend_coordinator` own this API bug. Let it use only its cataloged
> specialists, wait for their results, and return the root cause, proposed fix,
> test evidence, conflicts, and remaining risks.

Use a human-friendly nickname to identify the coordinator, but invoke the
canonical `*_coordinator` ID. Nicknames are matching labels only: they do not
create a new agent, a separately installed role, or an additional delegation
level.

| Nickname candidates | Callable canonical ID |
| --- | --- |
| `Engineering Lead`, `Leadership Coordinator`, `Delivery Lead` | `leadership_coordinator` |
| `Product Lead`, `Product Coordinator`, `Scope Lead` | `product_coordinator` |
| `Backend Lead`, `Backend Coordinator`, `Integration Lead` | `backend_coordinator` |
| `DevOps Lead`, `DevOps Coordinator`, `Operations Lead` | `devops_coordinator` |
| `QA Coordinator`, `Assurance Lead`, `Quality Lead` | `qa_coordinator` |
| `UI Lead`, `UI Coordinator`, `UX Evidence Lead` | `ui_coordinator` |
| `Marketing Lead`, `Marketing Coordinator`, `Growth Lead` | `marketing_coordinator` |

From 1.3.3 the QA coordinator no longer answers to
`QA Lead`, which is the `qa_lead` worker's role; 1.3.2 and earlier still list
`QA Lead`, `QA Coordinator`, and `Assurance Lead`.

The main session remains the decision and permission boundary. A coordinator
correlates evidence; it does not silently publish, deploy, broaden permissions,
or take over unrelated work. In the CLI, use `/agent` to inspect or switch to an
agent thread. In the app or IDE, use the subagent activity panel when available;
you can also ask Codex to steer, stop, or close an agent.

The routing path has two routes, both at most two levels deep:

- **Direct**: `task -> routing profile -> main session briefs one to four specialists + narrow skills/MCPs`
- **Team**: for a board task you created, `task -> routing profile -> main session briefs that task's coordinator -> its cataloged workers`

A coordinator is therefore not always in the path; it is used only for the Team
route. Cross-domain work returns a compact handoff to the main session, which
decides whether another coordinator is needed.

The bundled `agent-brief` skill (`$agentchef:agent-brief` in Codex,
`/agentchef:agent-brief` in Claude Code) fixes that exchange: the seven-field
brief a worker receives and the six-field handoff it returns (Outcome,
Evidence, Changed scope, Risks, Open questions, Next verification).
`coordination-board brief-check` checks a brief before it is sent; from 1.3.3
`coordination-board handoff-check` checks the handoff that
comes back.

The detailed coordination-board contract is in
[Skills, Plugins, And Specialist Agents](skills-and-agents.md): work begins
only with an explicit user-created board task; pane selection, role selection,
and routing matches never auto-start it. Coordinators select only their
cataloged workers, workers return the six handoff fields, the main session
relays cross-domain questions and runs every board command, and evidence must
be attached and checked by an agent that did not do the work before the task
becomes done.

## 🗺️ Understand The Problem

| Agent | Bring it in when... |
| --- | --- |
| [`code_mapper`](../templates/codex/agents/code_mapper.toml) | You need the real files, call paths, ownership boundaries, and existing patterns before changing code. |
| [`docs_researcher`](../templates/codex/agents/docs_researcher.toml) | An API, tool, standard, or version-sensitive fact needs a current primary source. |
| [`context_architect`](../templates/codex/agents/context_architect.toml) | You need to decide whether durable behavior belongs in a prompt, `AGENTS.md`, skill, plugin, MCP, hook, memory, rule, or config. |
| [`prompt_architect`](../templates/codex/agents/prompt_architect.toml) | A vague request needs a reliable brief, mode contract, or reusable prompt workflow. |
| [`mcp_integrator`](../templates/codex/agents/mcp_integrator.toml) | A connector needs least-privilege planning, an auth boundary, a tool allowlist, or startup troubleshooting. |

## 🧭 Decide What To Build

| Agent | Bring it in when... |
| --- | --- |
| [`product_strategist`](../templates/codex/agents/product_strategist.toml) | The product goal, audience, scope, or smallest useful version is still unclear. |
| [`engineering_planner`](../templates/codex/agents/engineering_planner.toml) | A broad change needs architecture, data flow, invariants, edge cases, and a test strategy before implementation. |
| [`spec_author`](../templates/codex/agents/spec_author.toml) | Intent needs to become an executable specification with evidence and quality gates. |
| [`design_reviewer`](../templates/codex/agents/design_reviewer.toml) | A UI needs a clear hierarchy, stronger UX decisions, accessibility awareness, or an AI-slop check. |
| [`devex_auditor`](../templates/codex/agents/devex_auditor.toml) | Onboarding, documentation, or the first run feels harder than it should. |

## 🔍 Investigate And Verify

| Agent | Bring it in when... |
| --- | --- |
| [`root_cause_debugger`](../templates/codex/agents/root_cause_debugger.toml) | A bug, regression, or failing test needs reproduction and a tested root-cause hypothesis before a fix. |
| [`qa_lead`](../templates/codex/agents/qa_lead.toml) | A workflow needs end-to-end bug finding, regression coverage, and a re-verification plan. |
| [`performance_auditor`](../templates/codex/agents/performance_auditor.toml) | Page speed, Core Web Vitals, runtime cost, or another hot path needs measured evidence. |
| [`frontend_verifier`](../templates/codex/agents/frontend_verifier.toml) | A rendered UI needs browser, screenshot, responsive-layout, console, or interaction evidence. |
| [`test_verifier`](../templates/codex/agents/test_verifier.toml) | Lint, typecheck, tests, build, smoke, or runtime checks can be verified independently. |

## ✍️ Review And Explain

| Agent | Bring it in when... |
| --- | --- |
| [`docs_author`](../templates/codex/agents/docs_author.toml) | Documentation needs a clearer map, a missing guide, a release update, or stale-content cleanup. |
| [`code_reviewer`](../templates/codex/agents/code_reviewer.toml) | A fresh reviewer should look at a diff or pull request for correctness risks, regressions, and missing tests before it is merged or reported done. |
| [`google_seo_auditor`](../templates/codex/agents/google_seo_auditor.toml) | Public pages need crawlability, metadata, structured data, and Search Console readiness. Core Web Vitals measurement belongs to `performance_auditor`. |

## 🛡️ Protect The Boundary

| Agent | Bring it in when... |
| --- | --- |
| [`security_auditor`](../templates/codex/agents/security_auditor.toml) | Auth, secrets, permissions, APIs, data access, or abuse paths need a read-only security pass. |
| [`release_verifier`](../templates/codex/agents/release_verifier.toml) | A real release needs Git hygiene, artifact checks, a secret scan, and publish gates. |
| [`codex_doctor`](../templates/codex/agents/codex_doctor.toml) | The starter, catalog, install plan, docs, or installed runtime may have drifted. |

## How Selection Works

1. The session matches the task shape to a routing profile and the narrowest
   useful role.
2. A match does **not** force a subagent. The main session can use the role's
   guidance directly. Codex delegates only when you ask for it directly or when
   `AGENTS.md` or a skill instruction asks for it; AgentChef's working agreement
   is such an instruction, and from 1.3.4 (not released yet) it names four spawn
   conditions: a routing profile that requires a verifier matched and files
   changed; independent parallel work exists; noisy logs or research should be
   isolated from the main thread; you explicitly request delegation. It skips
   trivial, strictly sequential, tightly coupled, and single-file work where
   delegation adds coordination cost.
3. Spawned agents inherit the current approval and sandbox boundaries.
4. Parallel write-heavy work stays limited because overlapping edits create
   coordination cost.
5. The session you open keeps its own model and profile. Delegated roles run
   on the cheaper worker model; see [Model Tiers](#model-tiers).

The routing board includes a narrow data-documentation route: `backend_coordinator`
with `docs_researcher` correlates read-only lineage, catalog, quality, and source
evidence. It does not claim data-engineering, database-performance, security, or
operations expertise. Database performance measurement, runtime health, and
operational diagnostics needs return a concise parent-routed handoff to
`devops_coordinator` with the question, inspected evidence, conflict, decision
needed, and open verification need. Customer support/onboarding (`devops_coordinator`
with `devex_auditor`) is also advisory. Neither route grants database,
customer-account, or production access.

### Routing profiles and automatic use

From 1.3.4 (not released yet), `catalog/routing-profiles.json` (version 0.4.0)
has 19 routing profiles, including the new `code-review` profile. Each profile
names:

- a **verifier**, the independent role that checks the work. It is required for
  the five `autoVerify` profiles (`security-sensitive`, `release-or-publish`,
  `mcp-connector-change`, `frontend-ui`, `data-systems`): after files changed,
  the verifier runs before the task is reported done. For every other profile
  the verifier is only suggested.
- an **auto-skill** to load first. A skill that is explicit-only
  (`implicitInvocation: false`, see [Skills](skills.md)) is suggested to you
  instead of being loaded.

At most 2 agents start per task without you naming them; agents you name are not
counted, and the four-workers-per-task limit still applies. The matching is
advice: the main session still judges whether the work needs an agent.

To see the match for a request, run:

```bash
npm run chef -- --routing --task "<request>"
```

It prints the profile, its Verifier and Auto-skill, and a `[hint]` line (the
one-line routing hint; the hook that injects it into a session is covered in
the security model, commit C). See [Codex Flags](codex-flags.md) for the
confidence rules.

Each role has one trigger-style `description` ("Use proactively when ...") in
`catalog/agents.json`, and 13 roles preload one skill: Claude Code reads it from
the `skills:` frontmatter of the plugin agent file; Codex role files say "Load
the `<skill>` skill before starting".

| Role | Preloaded skill |
| --- | --- |
| `docs_researcher` | `evidence-research` |
| `context_architect` | `context-budget-planner` |
| `prompt_architect` | `prompt-architect` |
| `mcp_integrator` | `mcp-builder` |
| `design_reviewer` | `frontend-design` |
| `root_cause_debugger` | `systematic-debugging` |
| `performance_auditor` | `web-quality-audit` |
| `google_seo_auditor` | `seo` |
| `docs_author` | `documentation-and-adrs` |
| `spec_author` | `ai-project-starter` |
| `frontend_verifier` | `webapp-testing` |
| `release_verifier` | `shipping-and-launch` |
| `codex_doctor` | `agentchef-operator` |

### The same roles in Claude Code

The Claude Code target ships the same 28 roles as plugin subagents named
`agentchef:<role>` (for example `agentchef:code-mapper`). They are generated
from the catalog by `npm run render:targets`: read-only Codex roles become
subagents with `Read`, `Grep`, and `Glob` tools and `Write`, `Edit`,
`Bash` disallowed; workspace-write roles keep edit tools. AgentChef never
writes `~/.claude/agents/` and never emits `bypassPermissions`.

From 1.3.3:

- `performance-auditor` also gets the `chrome-devtools` tools. They work only
  when you added a `chrome-devtools` MCP server yourself, per project (see
  [MCPs](mcp-catalog.md)); AgentChef does not enable it.
- `chrome-devtools` is granted by tool name, limited to the eleven tools the
  catalog reviewed, as Serena already was; script evaluation, form filling, and
  uploads stay out of reach.
- No role gets the `Skill` tool: a skill can fork a `general-purpose`
  subagent or run shell commands outside the role's own tool list.

No role's tool list names `SendMessage`, so a role cannot message another
agent while it works. Only coordinator files list the `Agent` tool, as
`Agent(agentchef:<worker>, ...)` with their own catalog workers. Claude Code
enforces that list only when the coordinator runs as the main thread
(`claude --agent`); when it runs as an ordinary subagent, the names in the
parentheses are ignored and the coordinator could spawn any agent type. From
1.3.3 the plugin closes that gap with a `PreToolUse` hook
on the `Agent` tool (`plugins/agentchef/scripts/agent-spawn-guard.mjs`):

- An AgentChef coordinator that asks for a worker outside its list is denied
  (exit code 2, reason shown to the caller); the allowed list is read from its
  own agent file, so the hook and the frontmatter cannot drift apart.
- The worker must be named in full (`agentchef:test-verifier`): a bare
  `test-verifier` would resolve to a project or user agent of that name first,
  so it is denied.
- Any spawn by an AgentChef worker is denied, and so is any spawn by an
  AgentChef-named caller the plugin has no agent file for.
- The main session, your own agents, and non-AgentChef plugin agents are never
  blocked, except a session started with `claude --agent agentchef:<role>`,
  which runs under that role's rule. Input the hook cannot read is let
  through, so Claude Code's own rules decide.
- The hook recognizes the caller as `agentchef:<role>`,
  `plugin_agentchef_<role>`, or `plugin:agentchef:<role>`, and the tool as
  `Agent` or its earlier name `Task`.

In 1.3.2 and earlier there is no such hook: a coordinator's worker list is
guidance only when it runs as a subagent.

## Model Tiers

AgentChef splits the work between two model tiers. This applies from 1.3.2;
in 1.3.1 and earlier every role runs on the session model.

| Tier | Who runs on it | Model | Where it is set |
| --- | --- | --- | --- |
| Orchestrator | The session you open (the main thread) | Your choice; AgentChef never changes it | Codex: `model` in your `config.toml` or the active profile. Claude Code: `/model`, `--model`, or your settings |
| Worker | All 28 roles: 21 specialists and 7 coordinators | Codex `gpt-6-luna`, Claude Code `sonnet` | `workerModels` in [`catalog/agents.json`](../catalog/agents.json) |

The worker model reaches each CLI as one line per role file:
`model = "gpt-6-luna"` in every `templates/codex/agents/*.toml` (installed to
`~/.codex/agents/`), and `model: sonnet` in the frontmatter of every
`plugins/agentchef/agents/*.md`. Coordinators run on the worker model too, so
only the session you open plans on its own model.

Reasoning effort is not pinned. No role file sets `model_reasoning_effort`;
the official Codex subagents guide says a custom agent file that sets only
`model` keeps the effort already resolved for the spawn. Claude Code supports
an `effort` frontmatter field for subagents (it overrides the session effort);
AgentChef does not set it, so Claude roles inherit the session effort too.

Which value wins when several are set:

- Codex: a `model` in the custom agent file takes precedence
  ([Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents),
  checked 2026-10-05).
- Claude Code: a `model` passed on the individual `Agent` call comes first,
  then the agent's `model:` frontmatter, then the
  `CLAUDE_CODE_SUBAGENT_MODEL` variable, then the main conversation's model
  ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents), checked
  2026-10-05). The environment variable alone therefore does not override
  AgentChef's `sonnet`; a per-call `model` does.
- Claude Code with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (Claude Code v2.1.257
  or later): every subagent runs on `CLAUDE_CODE_SUBAGENT_MODEL`, or on the
  main conversation's model when that variable is unset. This overrides
  AgentChef's `sonnet` and any per-call `model`.
- Claude Code with a Sonnet main session: the `sonnet` alias resolves to the
  main conversation's exact model (including a `[1m]` suffix), not to the
  version the alias normally points to.

Security and review verdicts come from the worker tier too: `security-auditor`,
`code-reviewer`, and `release-verifier` run on the worker model like every
other role. For a high-stakes review, run it in the session you opened, or in
Claude Code pass a stronger `model` on that one `Agent` call.

The worker model has to be available to your account. If spawning a role
fails with a model error, change the worker model as below.

To change `workerModels` in your checkout:

1. Edit `workerModels.codex` and `workerModels.claude` in
   `catalog/agents.json`.
2. Set the same value on the `model = "..."` line of all 28
   `templates/codex/agents/*.toml` files; `node scripts/validate-agent-config.mjs`
   fails until every line matches the catalog.
3. Update the model names in `templates/shared/working-agreement.md` and in
   `scripts/tests/claude-emitters.test.mjs`, which pins both values.
4. Run `npm run render:targets` to regenerate the Claude agent files, the
   Codex `AGENTS.md`, and the Claude rule, then `npm run check`.
5. Preview and apply with `npm run chef -- --update` and
   `npm run chef -- --update --apply`.

Editing the `model` line of one installed `~/.codex/agents/<role>.toml` works
for that machine, but it is a managed file: the next update or repair writes
the template back (after a backup) and reports the edit as drift.

## How Agents Talk To Each Other

Communication is hierarchical and one-shot, not a continuous conversation:

`main session -> coordinator -> specialist`

From 1.3.3 one team protocol applies in the working
agreement, the `agent-brief` skill, every role file, and these docs. It works
like an office team:

| Who | Does | Never does |
| --- | --- | --- |
| You | Approve risky actions and ask for board tasks. | - |
| Main session | Plans, writes each brief, merges handoffs, runs every coordination-board command, picks the verifier, and reports to you. | Create a board task you did not ask for. |
| Coordinator | Picks only its own cataloged workers, briefs each one, merges their handoffs, and escalates to the main session. Read-only. | Spawn `general-purpose`, `fork`, another coordinator, or a worker outside its list; run board commands; verify its own task. |
| Worker | Does one bounded job and returns the six handoff fields. | Spawn any agent. When another role is needed it writes `needs: <role> - <why>` under Open questions, and the parent decides. |

Two routes, both at most two levels deep:

- **Direct**: the main session briefs one to four specialists itself.
- **Team**: for a board task you created, the main session briefs that task's
  coordinator, which briefs its own workers.

Use at most four workers per task (a coordinator is not counted); more needs your
explicit request.

- An agent receives one brief and returns one handoff. Agents do not message
  each other while they work; cross-domain questions go back to the main
  session as a parent-routed escalation, which decides the next step.
- The orchestrator writes the brief with the `agent-brief` skill. For a vague
  or multi-step request, the skill says to plan first with `prompt-architect`
  in plan-only mode. This is a rule the orchestrator follows, not an automatic
  step: nothing forces a plan before a brief.
- Merge: the main session (or the coordinator, for its workers) checks each
  Changed scope against its brief's Write scope, keeps conflicting evidence
  side by side with its sources instead of averaging it, resolves conflicts or
  asks you, and reruns every Done-when check on the merged result. A handoff
  is a report, not proof.
- A coordinator escalates when approval is needed, a worker is blocked or
  failed, a write scope changes, another domain is needed, or evidence is
  still missing after one retry.
- Verification is done by an agent that did not do the work: never the owner,
  its session, or its coordinator. Pick by work type: `test_verifier` for
  checks, `code_reviewer` for diffs, `frontend_verifier` for UI,
  `security_auditor` for security, or you.

Between the two CLIs there is no direct tool:

- Claude Code can hand read-only work to Codex by piping a brief into
  `codex exec --sandbox read-only - < brief.md`; Codex reads the prompt from
  stdin when it is `-`. `codex exec` asks no questions, so the sandbox is the
  only boundary, and Codex still starts your enabled MCP servers and web
  search. Write the brief outside the repository, keep secrets out of it, and
  add `--profile offline` when the work needs no MCP server (it does not turn
  off web search or shell network access).
- Codex cannot call Claude Code. It hands work over through a
  coordination-board task (see
  [Skills, Plugins, And Specialist Agents](skills-and-agents.md)) or through
  `beyin aktar` in the separate Beyin engine
  ([`dual-agent-brain`](https://github.com/ucsahinn/dual-agent-brain)), which
  AgentChef does not install.

### Depth And Spawn Limits In Each CLI

Codex (checked 2026-10-05 against
[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)):

- Current local Codex releases spawn subagents only after a direct request or
  an applicable project or skill instruction. AgentChef's working agreement is
  such an instruction, and it limits delegation to the cases above.
- AgentChef writes `max_depth = 2` under `[agents]`. The default multi-agent
  backend enforces it; the opt-in `multi_agent_v2` backend ignores it, so
  there the two-level rule rests on the role instructions.
- `max_threads = 10` is a legacy alias of
  `max_concurrent_threads_per_session`: a ceiling across the session, not a
  target. The four-agents-per-task rule still applies.
- AgentChef also writes `job_max_runtime_seconds = 3600`; it no longer has an
  effect upstream and is harmless. The current configuration reference does
  not list `max_depth` or `job_max_runtime_seconds`.

Claude Code (checked 2026-10-05 against
[Claude Code subagents](https://code.claude.com/docs/en/sub-agents) and
[agent teams](https://code.claude.com/docs/en/agent-teams)):

- By default a subagent can spawn its own subagents up to three layers below
  the main conversation (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes this).
  From 1.3.3 an AgentChef tree stays at two levels: workers
  have no `Agent` tool, and the spawn guard hook above denies any worker spawn
  and any coordinator spawn outside its list. In 1.3.2 and earlier a
  coordinator running as a subagent could spawn another agent type, which
  could nest further.
- Agent teams are experimental and off unless
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set. With teams on, a subagent
  Claude names can launch as a teammate, and Claude Code adds `SendMessage` to
  in-process teammates, so agents could talk outside the brief and handoff.
  AgentChef assumes agent teams are off.

## AgentSpace Ownership, Knowledge, And Worker Safety

| Coordinator | Bounded specialist workers |
| --- | --- |
| `leadership_coordinator` | `context_architect`, `engineering_planner`, `code_reviewer`, `release_verifier` |
| `product_coordinator` | `prompt_architect`, `product_strategist`, `spec_author` |
| `backend_coordinator` | `code_mapper`, `mcp_integrator`, `root_cause_debugger`, `docs_researcher` |
| `devops_coordinator` | `performance_auditor`, `codex_doctor`, `devex_auditor` |
| `qa_coordinator` | `qa_lead`, `test_verifier`, `security_auditor` |
| `ui_coordinator` | `frontend_verifier`, `design_reviewer` |
| `marketing_coordinator` | `google_seo_auditor`, `docs_author` |

The seven installed coordinators own work: leadership, product, backend, DevOps,
QA, UI, and marketing. The 21 AgentChef specialists remain narrow task workers.
`catalog/agents.json` records the complete 7-to-21 ownership map. A
coordinator may select only its cataloged worker group, within the limit of
four workers per task (the coordinator itself is not counted), and workers do
not delegate further.

Starting with 1.3.0, upgrading from a 1.2 install retires the five removed
coordinator role files (`data_coordinator`, `frontend_coordinator`,
`design_coordinator`, `security_coordinator`, and `support_coordinator`); the
installer migration handles this, so no manual cleanup is needed.

Cross-domain coordination is a concise, parent-routed handoff rather than direct
peer spawning: the primary coordinator returns its question, evidence, conflict,
decision, and open verification need to the main session, which decides whether a
peer coordinator is needed. This keeps the runtime at two delegation levels and
prevents recursive agent trees. A routing result exposes each selected worker's
owner and a `knowledgeRef` equal to the specialist name. That reference resolves
only to reviewed metadata in `catalog/agent-research-corpus.json`; routing never
injects AgentSpace memory, auth, session, or other machine-local content.

Every installed coordinator and worker TOML applies `approval_policy = "on-request"`.
An AgentSpace worker session has a separate runtime profile:
`sandbox_mode = "workspace-write"`, `approval_policy = "on-request"`, and
`approvals_reviewer = "auto_review"`. Routing reports this effective session
profile and the specialist's narrower `roleSandboxMode` separately. Because
AgentSpace account profiles use an isolated `CODEX_HOME`, those root keys must
exist in that profile; another Codex home's defaults are not inherited.
The official [Codex Configuration Reference](https://developers.openai.com/codex/config-reference#configtoml)
defines `approvals_reviewer = "auto_review"` as the reviewer-subagent mode and
states that it does not change sandboxing.
Coordinators remain read-only, and specialist role files retain their catalog
sandbox (`read-only` or `workspace-write`). The reviewed
`rules/default.rules` surface can allow narrow safe inspection commands while
destructive, credentialed, publishing, deployment, broad-shell, and other risky
classes remain prompt-gated. Workers never use `danger-full-access` or a global
`approval_policy = "never"` default.

To see the reviewed metadata behind this page, open
[`catalog/agents.json`](../catalog/agents.json). Routing profiles live in
[`catalog/routing-profiles.json`](../catalog/routing-profiles.json).

Return to [the README](../README.md) or continue with
[skills](skills.md) and [MCPs](mcp-catalog.md).
