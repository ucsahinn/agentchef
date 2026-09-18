# Research Notes

Date checked: 2026-06-14. Updated for Codex config, skill catalog, SEO
specialist, GStack/ECC workflow, research-synthesis decisions,
specialist source-freshness cadence decisions, per-agent expertise-signal
coverage, and supplemental research-reference validation on 2026-06-15.
Updated for PowerShell execution policy, Git config, GitHub supply-chain,
SLSA, npm provenance, npm trusted publishing, and Sigstore source coverage on
2026-06-16.
High-risk supplemental sources were refreshed on 2026-07-20: ECC and GStack
repository activity, the four documented Skills CLI public-index searches, and
openai/codex issue signals. The refresh did not change their supplemental-only
status, authority boundaries, or adopted runtime guardrails.

Facts below come from official docs, standards, mature public repos, research
papers, and practitioner issue signals. Practitioner feedback is used only as a
risk pattern, not as the source of truth.

## Sources

| Title | URL | Type | Confidence | Supports | Outdated risk |
| --- | --- | --- | --- | --- | --- |
| Codex Manual | https://developers.openai.com/codex/codex-manual.md | Official OpenAI docs | High | surfaces, config, AGENTS.md, skills, plugins, MCP, hooks, rules, approvals, sandboxing, auth, Windows, noninteractive use, subagents | Medium |
| Codex Config Reference | https://developers.openai.com/codex/config-reference#configtoml | Official OpenAI docs | High | `agents.<name>.description`, `agents.<name>.config_file`, agent thread/depth/runtime defaults, and config safety boundaries | Medium |
| Enterprise Context Core (ECC) | https://github.com/affaan-m/ecc | Public starter/toolkit repo | Medium/High | broad cross-harness operating-system surface, manifest-driven install planning, target adapters, install-state preview, schema validation, MCP drift checks, security-scan pattern signal | High |
| GStack | https://github.com/garrytan/gstack | Public agent-workflow repo | Medium/High | named workflow/skill taxonomy, product/design/eng/QA/release roles, browser workflows, `/diagram`, `/make-pdf`, safety guardrail, and deploy automation pattern signal | High |
| Agent Skills - Codex | https://developers.openai.com/codex/skills | Official OpenAI docs | High | skill discovery, progressive disclosure, skill locations, plugin distribution | Medium |
| Agent Skills Specification | https://agentskills.io/specification | Open specification | High | `SKILL.md` fields, optional directories, metadata, validation | Medium |
| openai/skills | https://github.com/openai/skills | Official public repo | High | curated skill examples and installation expectations | Medium |
| Plugins - Codex | https://developers.openai.com/codex/plugins | Official OpenAI docs | High | plugin distribution for skills, apps, and MCP metadata | Medium |
| Mermaid Flowcharts | https://mermaid.js.org/syntax/flowchart.html | Official project docs | High | stable flowchart syntax, node forms, and edge labels for offline diagram source authoring | Medium |
| Excalidraw JSON schema | https://docs.excalidraw.com/docs/codebase/json-schema | Official project docs | High | editable `.excalidraw` scene shape, top-level fields, elements, appState, and files | Medium |
| Google SEO Starter Guide | https://developers.google.com/search/docs/fundamentals/seo-starter-guide | Official Google docs | High | crawlability, indexing, useful content, links, images, and realistic SEO expectations | Medium |
| Google Search structured data intro | https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data | Official Google docs | High | structured data eligibility and validation boundaries | Medium |
| Lighthouse docs | https://developer.chrome.com/docs/lighthouse/overview | Official Chrome docs | High | performance, accessibility, best-practices, SEO, and web quality audit categories | Medium |
| addyosmani/web-quality-skills | https://github.com/addyosmani/web-quality-skills | Mature public skill repo | Medium/High | web-quality, SEO, accessibility, performance-oriented skill examples | Medium/High |
| anthropics/skills | https://github.com/anthropics/skills | Mature public skill repo | Medium/High | webapp testing and MCP builder skill examples; high community signal but repo license is source-specific | Medium/High |
| obra/superpowers | https://github.com/obra/superpowers | Mature public skill repo | Medium/High | test-driven development and focused workflow examples | Medium/High |
| mattpocock/skills | https://github.com/mattpocock/skills | Mature public skill repo | Medium/High | small-step refactor planning examples with high community signal | Medium/High |
| addyosmani/agent-skills | https://github.com/addyosmani/agent-skills | Mature public skill repo | Medium/High | documentation, ADR, review, and engineering workflow examples | Medium/High |
| ucsahinn/ai-project-starter | https://github.com/ucsahinn/ai-project-starter | First-party public skill repo | High | project context foundations, starter docs, agent instruction files, enterprise starter docs, and vibe-coding guardrails | Medium |
| ucsahinn/prompt-architect | https://github.com/ucsahinn/prompt-architect | First-party public skill repo | High | plan-first, approval-gated, security-aware Codex prompt packages, prompt audits, and packaged Prompt Lab KB workflows | Medium |
| ucsahinn/ai-skill-create | https://github.com/ucsahinn/ai-skill-create | First-party public skill/plugin repo | High | creating, improving, validating, forward-testing, and packaging Codex skills and plugins | Medium |
| Skills CLI public index searches | `npx skills find token`, `npx skills find context`, `npx skills find prompt-engineering`, `npx skills find memory` | Public package/search index via Skills CLI | Medium | context, prompt, memory, and token-related candidate discovery; confirms token hits skew toward auth/deployment/crypto rather than LLM context budgeting | High |
| Ajv JSON Schema Validator | https://ajv.js.org/ | Official project docs | Medium/High | JSON Schema validation tradeoffs and why this starter keeps install-plan checks dependency-free before npm install | Medium |
| MCP Security Best Practices | https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices | Official MCP guidance | High | user consent, token/audience validation, SSRF, connector risk | Medium |
| GitHub Secret Scanning | https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning | Official GitHub docs | High | current-tree and history secret scanning | Low/Medium |
| GitHub Actions Secure Use | https://docs.github.com/en/actions/reference/security/secure-use | Official GitHub docs | High | least-privilege workflow tokens and secret handling | Low/Medium |
| GitHub README guidance | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes | Official GitHub docs | High | README content, help links, contribution expectations, relative links | Low |
| PowerShell ShouldProcess | https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess | Official Microsoft Learn | High | `-WhatIf`, `-Confirm`, safer mutating scripts | Low/Medium |
| PowerShell execution policies | https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies | Official Microsoft Learn | High | process-scoped execution-policy guidance, `Unblock-File`, Windows-only policy behavior | Medium |
| Git config | https://git-scm.com/docs/git-config | Official Git project docs | High | `core.excludesfile`, `core.hooksPath`, `safe.directory`, protected config semantics | Medium |
| GitHub supply chain security | https://docs.github.com/en/code-security/concepts/supply-chain-security/about-supply-chain-security | Official GitHub docs | High | dependency graph, dependency review, Dependabot, immutable releases, artifact attestations | Medium |
| GitHub dependency review | https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review | Official GitHub docs | High | pull-request dependency diffs, lockfile review, vulnerable dependency prevention | Medium |
| OpenSSF Scorecard | https://github.com/ossf/scorecard | Mature public security project | Medium/High | public repo security-health gate ideas | Medium |
| SLSA v1.2 | https://slsa.dev/spec/v1.2/ | Open specification | High | source/build provenance, attestation, artifact verification, supply-chain integrity | Medium |
| npm provenance | https://docs.npmjs.com/generating-provenance-statements/ | Official npm docs | High | provenance attestations, Sigstore-backed publish evidence, provenance limitations | Medium |
| npm trusted publishing | https://docs.npmjs.com/trusted-publishers/ | Official npm docs | High | OIDC trusted publishing, tokenless npm publish, automatic provenance generation | Medium |
| Sigstore docs | https://docs.sigstore.dev/ | Official project docs | High | keyless signing, identity binding, transparency-log verification, artifact signing | Medium |
| ReAct | https://arxiv.org/abs/2210.03629 | Research paper | Medium/High | interleaved reasoning and tool use | Low/Medium |
| Reflexion | https://arxiv.org/abs/2303.11366 | Research paper | Medium/High | feedback, retry, and reflection loops | Medium |
| Lost in the Middle | https://arxiv.org/abs/2307.03172 | Research paper | Medium/High | progressive disclosure and context placement discipline | Medium |
| SWE-agent | https://arxiv.org/abs/2405.15793 | Research paper | Medium/High | agent-oriented repository navigation, edit, and test interfaces | Medium |
| openai/codex issues | https://github.com/openai/codex/issues | Practitioner issue tracker | Medium | Windows sandbox, PowerShell, MCP config, and AGENTS.md failure patterns | High |

## Source-Backed Decisions

- Keep `workspace-write`, `on-request`, and network-off defaults.
- Keep authenticated account, database, and broad filesystem MCP connectors
  disabled by default.
- Add `shell_environment_policy` so subprocesses do not inherit broad secret
  environment variables by default.
- Add installer dry-run behavior through PowerShell `-WhatIf` and Bash
  `--dry-run`.
- Preserve Windows-safe Skills CLI calls using `--agent codex`.
- Keep the default installable skill set broad and non-overlapping:
  maintenance, CI repair, security, testing, frontend, SEO, accessibility, web
  quality, and documentation are useful across many repos, while narrow
  Vercel/React/design polish skills stay cataloged as manual opt-ins.
- Expand the default installable skill set only where it adds a distinct,
  high-utility workflow: systematic debugging, request-refactor planning,
  Playwright-based webapp testing, MCP server building, and the three
  first-party AgentChef ecosystem skills are materially different from the
  existing skill list and complement the bundled agents.
- Do not select a skill only because its install count is higher. SEO marketing,
  prompt-polish, release-only, and framework/vendor-specific skills can be
  useful, but they create more trigger overlap or risk than a Windows-first
  Codex setup starter should install by default.
- Keep `impeccable`, extra design-taste, Vercel, prompt, context, memory, and
  token-related skills as manual opt-in catalog references when they overlap
  with bundled agents or require authenticated/vendor-specific flows.
- Map first-party ecosystem skills into the reviewed `-All` / `-InstallSkills`
  set:
  `ai-project-starter`, `prompt-architect`,
  and `ai-skill-create`. They preserve capability under first-party
  ownership while external overlapping design, Vercel, memory, token, prompt,
  and context references remain manual.
- Keep global Git guard changes outside `-All`; global `core.excludesfile` and
  `core.hooksPath` changes require explicit opt-in because they affect every
  repository for the current user.
- Add a bundled local `context-budget-planner` skill because public `token`
  skill search results mostly indicate auth/deployment/crypto-token workflows,
  not LLM token and context budgeting.
- Keep bundled local skills reference-backed: concise `SKILL.md` entry points,
  detailed `references/` files, and `agents/openai.yaml` UI metadata. This
  follows Codex progressive disclosure and prevents every workflow detail from
  crowding the initial context.
- Add `npm run validate:plugin-skills` so local plugin skills cannot silently
  lose `SKILL.md`, references, UI metadata, or catalog entries.
- Keep the offline diagram skill on a constrained Mermaid flowchart subset and
  editable Excalidraw JSON output instead of implying full Mermaid renderer
  coverage.
- Add a read-only Google SEO specialist agent because search visibility work is
  useful but should remain evidence-based, Search Central/Lighthouse-backed, and
  free of ranking guarantees or credentialed Search Console access by default.
- Keep online skill validation separate from offline validation because it uses
  network and external package resolution.
- Add `catalog/skills-lock.json` and richer catalog metadata so third-party
  skill sources are reviewable.
- Add `catalog/agents.json` so bundled specialist-agent config is reviewable
  and can be checked against Windows/Unix templates.
- Treat MCP configuration as a trust boundary with explicit source, risk, auth,
  and approval metadata.
- Adapt ECC's manifest/plan/state pattern, but do not import its broad global
  sync behavior, implicit dependency installation, or enabled-by-default
  connector scope.
- Keep install-plan validation dependency-free so a fresh clone can run
  `npm run check` without first running `npm install`.
- Add MCP catalog/config drift checks so the documented connector inventory and
  the actual Codex templates cannot silently diverge.
- Add a bounded supply-chain IOC scan for remote shell pipes, download-execute
  patterns, unsafe destructive shell snippets, floating active package specs,
  and implicit installer dependency installs.
- Keep README concise and move deep troubleshooting, upgrade, and expected
  output details into focused docs.
- Use public issue tracker signals to improve troubleshooting, not to override
  official Codex documentation.
- Adopt GStack's useful role taxonomy as Codex-native agents/skills, not as
  default slash-command shims. Browser pairing, cookie import, deploy, raw CDP,
  and continuous checkpoint behaviors remain excluded from default install
  because they touch tokens, tunnels, browser state, production systems, or
  auto-commit behavior.
- Treat star count as a discovery signal only. ECC and GStack justify a deeper
  audit, but every adopted behavior still needs a Codex-native surface, a safe
  default, a documented exclusion boundary, and a validator or release gate when
  it affects installable behavior.
- Add research-synthesis and adversarial-validation guidance to all twenty-one
  specialist agent role files so external sources become compact action maps,
  constraints, verification plans, or risk decisions instead of hidden prompt
  bloat.
- Add source-refresh, source-currency, corpus-expansion, and
  expert-calibration guidance to all twenty-one specialist agent role files so
  stale evidence is refreshed, broader evidence becomes compact operating
  rules, and low-confidence output is challenged before handoff.
- Add expert-calibration guidance to all twenty-one specialist agent role files
  so each role checks its own output against role-specific senior-quality gates
  before returning work to the main thread.
- Enforce the expanded agent corpus with validation: each role file must keep
  one copy of every required guardrail block, at least 100 source-backed
  instruction items, and at least 20 distinct source markers.
- Add a machine-readable agent research corpus manifest so the reviewed source
  domains, source types, refresh triggers, and handoff targets are visible
  outside long role prompts.
- Add reviewed authority-reference metadata to the corpus so agent source
  families, URLs, source types, staleness risks, and source markers can be
  checked and updated from one place, then validate those keys against source
  markers in the matching agent TOML prompts.
- Add review cadence metadata to every reviewed authority reference so
  fast-moving official docs and tool sources are refreshed at least every 45
  days, slower standards and mature engineering guides are refreshed within 180
  days, and stale corpus `dateChecked` values fail validation before release.
- Add per-agent expertise signals to the research corpus so each specialist's
  reviewed knowledge includes decision heuristics, common failure modes, and
  verification signals that can be validated as structured data.
- Add `supplementalResearchRefs` to the research corpus for repo patterns, skill
  examples, local command snapshots, official project docs, and research papers
  that should inform heuristics but not become default runtime authority until
  promoted into agent `authorityRefs`.
- Promote official PowerShell execution-policy and Git config docs into
  authority references for DevEx and doctor checks so Windows setup and
  optional global Git guards stay process-scoped, explicit, and reversible.
- Promote GitHub supply-chain/dependency-review, SLSA, npm provenance, npm
  trusted publishing, and Sigstore docs into authority references for security,
  release, and review agents so dependency, package, provenance, and artifact
  claims are checked against current primary sources.
- Add explicit `apps._default.enabled = false`,
  `apps._default.destructive_enabled = false`, and
  `apps._default.open_world_enabled = false` to the Codex templates because the
  current OpenAI config reference exposes those app/connector gates separately
  from MCP server approval settings.
