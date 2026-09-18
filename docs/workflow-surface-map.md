# Workflow Surface Map

Workflow names from ECC, GStack, and similar projects do not map one-to-one to
Codex. The useful question is where each behavior belongs. Reusable procedures
usually become skills, bounded specialist work may go to subagents, live
external context belongs in MCP/connectors, and publish or deploy actions stay
behind explicit approval.

Date checked: 2026-07-29

References:

- Official Codex customization: https://developers.openai.com/codex/concepts/customization
- Official Codex skills: https://developers.openai.com/codex/skills
- Official Codex subagents: https://developers.openai.com/codex/subagents
- Official Codex plugins: https://developers.openai.com/codex/plugins/build
- Official Codex CLI slash commands: https://developers.openai.com/codex/cli/slash-commands
- ECC source pattern: https://github.com/affaan-m/ECC
- GStack source pattern: https://github.com/garrytan/gstack

## Surface Rule

| Pattern | Codex surface | Starter decision |
| --- | --- | --- |
| One-off task instruction | Prompt/thread context | Keep in the current prompt. |
| Durable working agreement | `AGENTS.md` | Install reviewed global guidance; repo-local files still win. |
| Reusable slash-like workflow | Skill | Prefer `SKILL.md`; package in a plugin when distributing the bundle. |
| Specialist critique or evidence work | Subagent | Use explicit delegation, then summarize the result before relying on it. |
| Live docs, browser, code navigation, or private service access | MCP/connectors | Keep authenticated or broad connectors disabled until a task needs them. |
| Command approval exception | Rule | Keep narrow; never auto-allow destructive, credential, publish, or release actions. |
| Lifecycle automation | Hook | Use only for reviewed guardrails, not as the primary security boundary. |
| Push, release, deploy, external upload | Approval gate | `release_verifier` can verify readiness; the action still needs explicit approval. |

Subagent matching is advisory. Spawn only for independent parallel work, to
isolate noisy logs or research, or because the user explicitly requested an
agent. Keep the normal fan-out at one to four even though `max_threads = 10`
preserves headroom for several Codex windows. Report routing once with
`Routing plan:` and once with `Routing result:`; do not emit separate
agent/skill/MCP lifecycle chatter.

Decision rationale: [ADR-001](decisions/001-adaptive-routing-and-user-owned-config-overlay.md).

## GStack-Style Workflow Mapping

| Workflow | Good Codex mapping | Bundled starter support | Safety boundary |
| --- | --- | --- | --- |
| `/office-hours` | Skill or `product_strategist` subagent | `product_strategist` | No file edits; challenge scope before implementation. |
| `/plan-ceo-review` | Skill or `product_strategist` subagent | `product_strategist` | Avoid hype; return scope tradeoffs and smallest useful version. |
| `/plan-eng-review` | `engineering_planner` subagent | `engineering_planner` | Read code before architecture claims. |
| `/plan-design-review` | `design_reviewer` subagent, then `frontend_verifier` when UI exists | `design_reviewer`, `frontend_verifier` | Browser evidence is still required for rendered UI. |
| `/plan-devex-review` | `devex_auditor` subagent | `devex_auditor` | Use safe local smoke tests; no global setup writes. |
| `/autoplan` | Chain of `product_strategist`, `design_reviewer`, and `engineering_planner` | All three agents | The main thread decides; no hidden automatic orchestration. |
| `/spec` | `spec_author` subagent or spec skill | `spec_author` | Spec only unless implementation is separately requested. |
| Context-heavy repo or research task | `context-budget-planner` skill | `context-budget-planner` | Plan source loading, token budget, and compaction handoff before broad work. |
| `/review` | `code_reviewer` subagent | `code_reviewer` | Lead with bugs, regressions, security, and missing tests. |
| `/investigate` | `root_cause_debugger` subagent | `root_cause_debugger` | Reproduce and test hypotheses before fixes. |
| `/qa` | `qa_lead` plus `test_verifier` | `qa_lead`, `test_verifier` | Distinguish report-only from auto-fix scope. |
| `/qa-only` | `qa_lead` report-only | `qa_lead` | No edits unless the user asks. |
| `/cso` | `security_auditor` subagent | `security_auditor` | Never print secrets or use credentials. |
| `/benchmark` | `performance_auditor` subagent | `performance_auditor` | Measure first; no production load without approval. |
| `/canary` | Release/performance monitoring workflow | `release_verifier`, `performance_auditor` | Production monitoring and external account access require approval. |
| `/document-release` | `docs_author` subagent | `docs_author` | Do not claim remote release state without verification. |
| `/document-generate` | `docs_author` subagent or docs skill | `docs_author` | Match docs to code and commands. |
| `/codex` / cross-model review | Explicit review workflow | `code_reviewer`, manual Codex CLI use | Do not auto-invoke another agent or CLI; the user must ask for the cross-model check. |
| `/browse` | Browser MCP plus `frontend_verifier` | `frontend_verifier`, Playwright/Chrome MCP entries | Browser tools are prompt-gated. |
| `$fetch <url>` | Explicit authorized site reconstruction skill | `fetch`, browser MCP, optional bounded specialists | Public capture is passive; auth, private routes, protected assets, installs, and external writes stay gated. |
| `$seo <target>` | Evidence-backed audit, implementation, and verification skill | `seo`, `google_seo_auditor`, browser MCP, optional performance verification | Local, rendered, deployed, and account evidence stay distinct; rankings, indexing, account writes, publication, and deploy are never inferred. |
| `$evidence-research <question>` | Source-traceable deep research skill | `evidence-research`, official-source search, optional domain reviewer | Facts, inferences, and recommendations stay distinct; private data, paid APIs, participants, and publication require approval. |
| `/setup-browser-cookies` | Auth/session connector workflow | Not enabled by default | Cookie/session import is sensitive and explicit only. |
| `/pair-agent` | External-agent collaboration service | Not imported | Tunnels, scoped tokens, and external agents need a separate reviewed design. |
| `/ship` | Release verification workflow | `release_verifier` | Commit, push, PR, tag, release, and deploy still need explicit approval. |
| `/land-and-deploy` | Release/deploy workflow | `release_verifier` | Merge, deploy, and production verification are never automatic defaults. |
| `/learn` | Memory workflow | Memory MCP is available when enabled | Never store secrets, sessions, cookies, or private auth material. |
| `/make-pdf` | Future offline document-export skill | Not implemented by default | Avoid large implicit dependency installs; offline diagram assets are already produced by `offline-diagram-triplet`. |
| `/diagram` | Offline diagram skill | `offline-diagram-triplet` | Zero network; generated artifacts are not committed unless requested. |

## ECC Pattern Mapping

| ECC pattern | What this starter adopts | What this starter avoids |
| --- | --- | --- |
| Large skills and agents catalog | Reviewed `catalog/skills.json` and `catalog/agents.json` with validation gates. | Importing broad cross-harness catalogs wholesale. |
| Manifest-driven install | `manifests/install-plan.json` plus `scripts/plan-install.mjs`. | Hidden global writes or install behavior not shown in the plan preview. |
| Doctor/status commands | `npm run codex:doctor` and JSON output. | Reading user secrets or mutating global Codex state during diagnostics. |
| Plugin distribution | Local `codex-chef-workflows` plugin with one exact, trust-gated SessionEnd process hook. | Context-injecting hooks, broad MCP, or external auth. |
| Legacy command compatibility | Documentation that maps slash-like names to Codex surfaces. | 80+ command shims or deprecated prompt wrappers. |
| Security/runtime hardening | Gitleaks, workflow hardening, MCP least privilege, install backups, and owner-scoped stale-MCP cleanup after a grace period. | Broad cleanup, auto-publish, token scraping, or broad command allow rules. |

## Evidence-Based Exclusions

The public GStack repo demonstrates useful workflows such as browser pairing,
cookie import, deploy automation, continuous checkpoint commits, domain memory,
and raw CDP access. Those are intentionally not default AgentChef installs
because they introduce tokens, tunnels, persistent browser state, production
systems, or auto-commit behavior. AgentChef keeps the matching safe primitives:
browser MCP entries are prompt-gated, release verification is separate from
push/deploy, memory is secret-aware, and reusable workflows are packaged as
skills rather than broad command shims.

The public ECC repo demonstrates a much larger cross-harness operating-system
surface. AgentChef adopts manifest/state previews, catalogs, doctor checks,
plugin packaging, and validation gates, but blocks wholesale cross-harness
sync, hook prompt injection, enabled authenticated connectors, and unreviewed
large skill catalogs.

High star counts are treated as prioritization signals, not trust decisions.
The transfer rule is: inspect the pattern, map it to the smallest Codex-native
surface, document the safety boundary, and add validation when the behavior can
change a user's machine.

## Recommended Starter Chain

Use this sequence for serious work:

1. `product_strategist` or `spec_author` clarifies the target.
2. `context-budget-planner` budgets sources and handoff when the task is broad.
3. `$evidence-research` handles a decision-critical source study, or `$seo`
   handles search-specific evidence and implementation, when either is in scope.
4. `engineering_planner` maps architecture, data flow, and tests.
5. `code_mapper` gathers repo evidence before broad edits.
6. Main thread implements the scoped change.
7. `code_reviewer`, `security_auditor`, `qa_lead`, or `test_verifier` verifies the risky surface.
8. `release_verifier` checks publish readiness only when a push/release is requested.

The main thread remains responsible for synthesis, edits, user-visible
decisions, and final evidence. Subagents are not a way to bypass approvals,
sandboxing, credentials, or external-state controls.

The same chain applies in Claude Code with the `agentchef:<role>` subagents
and `/<skill>` invocations; see the
[target capability map](target-capability-map.md) for the surfaces that do not
carry over.
