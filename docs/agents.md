# AgentChef Agents

[English](agents.md) | [Türkçe](agents.tr.md)

An agent is the **who** in a Codex workflow: a focused role with a clear job,
boundaries, and evidence to return.

AgentChef includes 7 coordination roles and 21 specialist worker roles. They
are not background services and they do not all run on every task. A role can
guide the main session without being spawned. Delegation is useful when work can
run independently, noisy output should stay out of the main thread, or you
explicitly ask for parallel agents.

Official Codex reference: [Subagents](https://developers.openai.com/codex/subagents)

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
| `QA Lead`, `QA Coordinator`, `Assurance Lead` | `qa_coordinator` |
| `UI Lead`, `UI Coordinator`, `UX Evidence Lead` | `ui_coordinator` |
| `Marketing Lead`, `Marketing Coordinator`, `Growth Lead` | `marketing_coordinator` |

The main session remains the decision and permission boundary. A coordinator
correlates evidence; it does not silently publish, deploy, broaden permissions,
or take over unrelated work. In the CLI, use `/agent` to inspect or switch to an
agent thread. In the app or IDE, use the subagent activity panel when available;
you can also ask Codex to steer, stop, or close an agent.

The routing path is:

`task -> routing profile -> primary coordinator -> selected specialists + narrow skills/MCPs`

Cross-domain work returns a compact handoff to the main session, which decides
whether another coordinator is needed.

The bundled `agent-brief` skill (`$agentchef:agent-brief` in Codex,
`/agentchef:agent-brief` in Claude Code) fixes that exchange: the brief a
worker receives and the handoff it returns (Outcome, Evidence, Changed scope,
Risk, Open questions, Next verification).

The detailed coordination-board contract is in
[Skills, Plugins, And Specialist Agents](skills-and-agents.md): work begins
only with an explicit user-created board task; pane selection, role selection,
and routing matches never auto-start it. Coordinators select only their
cataloged workers, workers return structured evidence handoffs, the main session
relays cross-domain questions, and evidence must be attached and reviewed before
the task becomes done.

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
| [`code_reviewer`](../templates/codex/agents/code_reviewer.toml) | A fresh reviewer should look for correctness risks, regressions, and missing tests. |
| [`google_seo_auditor`](../templates/codex/agents/google_seo_auditor.toml) | Public pages need crawlability, metadata, structured data, Core Web Vitals, and Search Console readiness. |

## 🛡️ Protect The Boundary

| Agent | Bring it in when... |
| --- | --- |
| [`security_auditor`](../templates/codex/agents/security_auditor.toml) | Auth, secrets, permissions, APIs, data access, or abuse paths need a read-only security pass. |
| [`release_verifier`](../templates/codex/agents/release_verifier.toml) | A real release needs Git hygiene, artifact checks, a secret scan, and publish gates. |
| [`codex_doctor`](../templates/codex/agents/codex_doctor.toml) | The starter, catalog, install plan, docs, or installed runtime may have drifted. |

## How Selection Works

1. Codex matches the task shape to the narrowest useful role.
2. A match does **not** force a subagent. The main session can use the role's
   guidance directly.
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

### The same roles in Claude Code

The Claude Code target ships the same 28 roles as plugin subagents named
`agentchef:<role>` (for example `agentchef:code-mapper`). They are generated
from the catalog by `npm run render:targets`: read-only Codex roles become
subagents with `Read`, `Grep`, and `Glob` tools and `Write`, `Edit`,
`Bash` disallowed; workspace-write roles keep edit tools; coordinators may
only spawn their catalog-bound workers through `Agent(agentchef:<worker>)`.
AgentChef never writes `~/.claude/agents/` and never emits
`bypassPermissions`.

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
`model` keeps the effort already resolved for the spawn. Claude Code's
frontmatter carries no effort field from AgentChef either.

Which value wins when several are set:

- Codex: a `model` in the custom agent file takes precedence
  ([Codex subagents](https://developers.openai.com/codex/subagents), checked
  2026-10-04).
- Claude Code: a `model` passed on the individual `Agent` call comes first,
  then the agent's `model:` frontmatter, then the
  `CLAUDE_CODE_SUBAGENT_MODEL` variable, then the main conversation's model
  ([Claude Code subagents](https://code.claude.com/docs/en/sub-agents), checked
  2026-10-04). The environment variable therefore does not override
  AgentChef's `sonnet`; a per-call `model` does.

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

- The depth stops at two levels (`max_depth = 2` in the Codex config). A
  coordinator selects at most four of its own cataloged workers, and workers
  never spawn agents. In Claude Code only coordinator files grant the `Agent`
  tool, and only for their own workers.
- An agent receives one brief and returns one handoff. Agents do not message
  each other while they work; cross-domain questions go back to the main
  session, which decides the next step.
- The orchestrator writes the brief with the `agent-brief` skill. For a vague
  or multi-step request, the skill says to plan first with `prompt-architect`
  in plan-only mode. This is a rule the orchestrator follows, not an automatic
  step: nothing forces a plan before a brief.

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
\`catalog/agents.json\` records the complete 7-to-21 ownership map. A coordinator may select only its cataloged
worker group (at most four workers), and workers do not delegate further.

Starting with 1.3.0, upgrading from a 1.2 install retires the five removed
coordinator role files (`data_coordinator`, `frontend_coordinator`,
`design_coordinator`, `security_coordinator`, and `support_coordinator`); the
installer migration handles this, so no manual cleanup is needed.

Cross-domain coordination is a concise, parent-routed handoff rather than direct
peer spawning: the primary coordinator returns its question, evidence, conflict,
decision, and open verification need to the main session, which decides whether a
peer coordinator is needed. This keeps the runtime at two delegation levels and
prevents recursive agent trees. A routing result exposes each selected worker's
owner and a \`knowledgeRef\` equal to the specialist name. That reference resolves
only to reviewed metadata in \`catalog/agent-research-corpus.json\`; routing never
injects AgentSpace memory, auth, session, or other machine-local content.

Every installed coordinator and worker TOML applies \`approval_policy = "on-request"\`.
An AgentSpace worker session has a separate runtime profile:
\`sandbox_mode = "workspace-write"\`, \`approval_policy = "on-request"\`, and
\`approvals_reviewer = "auto_review"\`. Routing reports this effective session
profile and the specialist's narrower \`roleSandboxMode\` separately. Because
AgentSpace account profiles use an isolated \`CODEX_HOME\`, those root keys must
exist in that profile; another Codex home's defaults are not inherited.
The official [Codex Configuration Reference](https://developers.openai.com/codex/config-reference#configtoml)
defines `approvals_reviewer = "auto_review"` as the reviewer-subagent mode and
states that it does not change sandboxing.
Coordinators remain read-only, and specialist role files retain their catalog
sandbox (\`read-only\` or \`workspace-write\`). The reviewed
\`rules/default.rules\` surface can allow narrow safe inspection commands while
destructive, credentialed, publishing, deployment, broad-shell, and other risky
classes remain prompt-gated. Workers never use \`danger-full-access\` or a global
\`approval_policy = "never"\` default.

To see the reviewed metadata behind this page, open
[`catalog/agents.json`](../catalog/agents.json). Routing profiles live in
[`catalog/routing-profiles.json`](../catalog/routing-profiles.json).

Return to [the README](../README.md) or continue with
[skills](skills.md) and [MCPs](mcp-catalog.md).
