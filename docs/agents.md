# Codex Chef Agents

[English](agents.md) | [Türkçe](agents.tr.md)

An agent is the **who** in a Codex workflow: a focused role with a clear job,
boundaries, and evidence to return.

Codex Chef includes 21 custom roles. They are not background services and they
do not all run on every task. A role can guide the main session without being
spawned. Delegation is useful when work can run independently, noisy output
should stay out of the main thread, or you explicitly ask for parallel agents.

Official Codex reference: [Subagents](https://developers.openai.com/codex/subagents)

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
5. The active user profile remains authoritative; Codex Chef role files do not
   pin every agent to one model.

## AgentSpace Ownership, Knowledge, And Worker Safety

The eight AgentSpace office roles own work; the 21 Codex Chef specialists remain
narrow task workers. \`catalog/agents.json\` records the complete 8-to-21 ownership
map. A routing result exposes each selected worker's owner and a \`knowledgeRef\`
equal to the specialist name. That reference resolves only to reviewed metadata
in \`catalog/agent-research-corpus.json\`; routing never injects AgentSpace memory,
auth, session, or other machine-local content.

Every installed worker TOML applies \`approval_policy = "on-request"\` and its
catalog sandbox (\`read-only\` or \`workspace-write\`). The reviewed
\`rules/default.rules\` surface can allow narrow safe inspection commands while
destructive, credentialed, publishing, deployment, broad-shell, and other risky
classes remain prompt-gated. Workers never use \`danger-full-access\` or a global
\`approval_policy = "never"\` default.

To see the reviewed metadata behind this page, open
[`catalog/agents.json`](../catalog/agents.json). Routing profiles live in
[`catalog/routing-profiles.json`](../catalog/routing-profiles.json).

Return to [the README](../README.md) or continue with
[skills](skills.md) and [MCPs](mcp-catalog.md).
