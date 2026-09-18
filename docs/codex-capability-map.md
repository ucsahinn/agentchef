# Codex Capability Map

Installation tells you where files go; this map tells you why each surface
exists. It connects every Codex surface to the job it should own, the guardrail
that contains it, and the local check that proves the setup still follows that
design.

Official references:

- Codex customization order: https://developers.openai.com/codex/concepts/customization
- Subagents: https://developers.openai.com/codex/subagents
- Skills: https://developers.openai.com/codex/skills
- Plugins: https://developers.openai.com/codex/plugins/build
- MCP and connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- MCP specification: https://modelcontextprotocol.io/specification

## Capability Layers

| Layer | What it is for | Starter default | Verification |
| --- | --- | --- | --- |
| Prompt/thread context | One-off task constraints | User prompt stays highest-signal for current task | Human review |
| `AGENTS.md` | Durable repo/global working agreements | Installed as reviewed global guidance with repo-local precedence | `npm run validate` |
| `config.toml` | Models, sandbox, approvals, MCP, features, profiles | Conservative workspace-write sandbox and on-request approvals | `npm run validate:mcp` |
| Rules | Narrow command approval defaults | Verification commands only; destructive/publish actions stay gated | `npm run validate:content` |
| Skills | Reusable workflows with progressive disclosure | Commit-pinned curated installs plus ten local plugin skills, including GPT Pro context/handoff, authorized reconstruction, evidence-backed SEO, and traceable deep research | `npm run verify:skills` |
| Plugins | Shareable packages for skills and reviewed lifecycle surfaces | One local plugin with ten skills and one exact, trust-gated SessionEnd process hook; no bundled MCP/apps | `npm run validate` |
| MCP/connectors | Live docs, browser, code navigation, external systems | Two balanced defaults; Context7, other local stdio helpers, and authenticated connectors disabled until needed | `npm run validate:mcp` |
| Subagents | Delegated evidence-heavy specialist work | Twenty-one reviewed specialist agents with sandboxed role files | `npm run validate:agents` |
| Doctor/status | No-write health and drift summary | Repo-only by default; optional global existence checks | `npm run codex:doctor` |

## Specialist Agent Set

The starter now ships twenty-one specialist agents:

- `code_mapper`: read-only repository mapping before broad changes.
- `docs_researcher`: official/current documentation and version-sensitive facts.
- `context_architect`: placement of prompt, AGENTS.md, skill, plugin, MCP, hook,
  memory, rule, and config guidance.
- `prompt_architect`: reliable briefs, success criteria, instruction contracts,
  and reusable prompt systems.
- `mcp_integrator`: least-privilege MCP and connector planning.
- `product_strategist`: product framing, forcing questions, scope decisions,
  and smallest-useful-version alternatives.
- `engineering_planner`: architecture, data flow, edge cases, diagrams, and
  test strategy before broad changes.
- `design_reviewer`: UX quality, accessibility, design-system fit, and
  AI-slop detection.
- `devex_auditor`: onboarding friction, docs clarity, first-run flows, and
  time-to-hello-world checks.
- `root_cause_debugger`: reproduction, data-flow tracing, and hypothesis
  testing before fixes.
- `qa_lead`: end-to-end workflow testing, regression coverage, and
  re-verification plans.
- `performance_auditor`: page speed, Core Web Vitals, resource budgets, traces,
  and post-change regression evidence.
- `google_seo_auditor`: Google Search Central-backed crawlability, indexing,
  metadata, structured data, Core Web Vitals, and Search Console-ready checks.
- `docs_author`: Diataxis coverage, stale-doc detection, release docs, and
  missing-guide generation.
- `spec_author`: scoped executable specs with non-goals, evidence, edge cases,
  and quality gates.
- `code_reviewer`: fresh-context correctness, regression, security, and test review.
- `frontend_verifier`: browser, screenshot, responsive layout, and console evidence.
- `security_auditor`: read-only auth, secrets, permissions, data, and abuse-path review.
- `test_verifier`: lint, typecheck, test, build, smoke, and CI evidence.
- `release_verifier`: git hygiene, artifacts, secret scans, changelog/version, and publish gates.
- `codex_doctor`: starter health, catalog drift, install-plan, docs, and MCP checks.

Every role file also carries seven guardrail blocks:

- Source refresh rules: each role re-checks local files, current docs, runtime
  evidence, and verification output when the task depends on current state.
- Cross-repo transfer rules: a similar repo can suggest patterns, but the
  current repo's executable paths, install surface, auth boundary, and tests
  decide what actually changes.
- Research synthesis rules: source material must be compressed into action
  contracts, maps, verification plans, or risk decisions instead of copied as
  long background prose.
- Adversarial validation rules: each role must challenge its own conclusion
  with counterexamples, missing evidence, unsafe assumptions, or stronger local
  tests before handing work back to the main thread.
- Source currency rules: each role treats version-sensitive docs, local repo
  evidence, test output, rendered artifacts, and release/security facts as
  stale when the underlying source changed or was not checked for the current
  task.
- Corpus expansion rules: each role knows how to widen its own knowledge base
  across local repos, official docs, standards, vendor guides, and specialist
  handoffs, then compress that material into short operating rules instead of
  hidden prompt bulk.
- Expert calibration rules: each role checks its output against role-specific
  senior-quality gates before handing work back, including evidence strength,
  missing-risk disclosure, and the exact next proof needed.

`scripts/validate-agent-config.mjs` enforces that each role file carries exactly
one copy of every runtime contract and guardrail block, plus at least 100
source-backed instruction items. `scripts/validate-agent-research-corpus.mjs`
also enforces at least 20 distinct source markers per role. This keeps the
expanded research corpus from quietly shrinking into a same-source checklist
during future edits.

`catalog/agent-research-corpus.json` is the machine-readable index for each
agent's domain focus, primary source types, refresh triggers, specialist
handoff targets, and expertise signals. `scripts/validate-agent-research-corpus.mjs`
keeps that index aligned with `catalog/agents.json` and the role TOML files.

The same manifest also keeps a reviewed `authorityRefs` registry with URL,
source type, staleness risk, review cadence, and TOML source markers. Source
families such as Codex docs, Context7, OWASP, NIST, Google Search Central,
Playwright, WCAG, and GitHub guidance are referenced by stable keys rather than
being repeated differently in each role. The validator also requires each
per-agent authority key to appear in that agent's TOML source markers, enforces
cadence limits for each staleness-risk class, and fails when corpus
`dateChecked` is older than the strictest authority-source cadence.

The manifest separates non-authoritative but useful research into
`supplementalResearchRefs`: external repo patterns, skill examples, local
command snapshots, official project docs, and research papers. These sources
can inform heuristics and future validator design, but validation keeps them
agent-scoped, freshness-checked, linked back to reviewed authority refs, and
`runtimeAuthority: false` until a maintainer deliberately promotes them.

Each role file also includes `Authority metadata contract` and
`Expertise signal contract` near the top of `developer_instructions`, which
tells the invoked agent how to treat source markers and expertise signals as
runtime guidance instead of detached bibliography.

The corpus also carries per-agent `expertiseSignals` for decision heuristics,
failure modes, and verification signals. These compact lists make the research
operational: a future edit can prove that each specialist keeps role-specific
judgment, known traps, and evidence expectations rather than just a list of
links.

The agent catalog is intentionally smaller than broad public marketplaces. High
star repos such as ECC and wshobson/agents show that large agent/skill catalogs
work best when they are cataloged, isolated, and composable. This starter adopts
that catalog discipline, but keeps Codex-only defaults and does not import broad
cross-harness fleets, hidden hooks, automatic memory injection, or authenticated
connector defaults.

## Doctor Commands

Run a no-write local health summary:

```bash
npm run codex:doctor
```

Machine-readable output:

```bash
node scripts/codex-doctor.mjs --json --redact-paths
```

No-write existence checks for global targets:

```bash
node scripts/codex-doctor.mjs --include-global --redact-paths
```

The global check only reports whether expected files exist. It does not read
their contents, install skills, change Git config, or write to `~/.codex` or
`~/.agents`.

## MCP And Connector Policy

OpenAI's connector guidance and the MCP specification both treat MCP servers as
capability boundaries. This starter follows four rules:

- Prefer official or high-signal servers.
- Pin local package versions or git source refs.
- Keep account, filesystem, database, production, and billing-adjacent
  connectors disabled until a task needs them.
- Use prompt-based approval and narrow tool exposure for anything that can
  access private data or take action.

Use `mcp_integrator` when adding a new connector. It should return the proposed
server, risk, auth boundary, approval mode, tool allowlist, verification steps,
and rollback notes before any config change.

## Skill And Plugin Policy

Official plugin guidance says to start with local skills while iterating and use
plugins when sharing reusable workflows or bundling MCP, apps, hooks, or assets.
This repo follows that split:

- Curated public and first-party skills stay in `catalog/skills.json`.
- Installable skills must have reviewed `package`, `skill`, `sourceUrl`,
  `license`, `risk`, and `lastChecked` fields.
- The local plugin exposes ten workflows, including GPT Pro context and
  manifest-bound handoff, the enterprise operator, zero-network offline diagram
  triplet, explicit-only Fetch, evidence-backed `$seo`, traceable
  `$evidence-research`, and context budget planning.
- One exact `SessionEnd` process-hygiene hook is separately reviewed and
  trust-gated. Other plugin hooks, MCP servers, and apps remain absent.

Run the local diagram renderer directly when you need `/diagram`-style output:

```bash
npm run diagram:triplet -- --mermaid path/to/diagram.mmd --out-dir artifacts/diagrams --name diagram-name
```

It emits `.mmd`, `.excalidraw`, `.svg`, `.png`, and `.md` files without network
or package installation.

## What This Does Not Import

The starter deliberately avoids these patterns unless a future change reviews
and documents them:

- Cross-harness global config sync.
- Broad skill marketplace imports.
- Enabled-by-default authenticated connectors.
- Unreviewed or context-injecting plugin lifecycle hooks.
- Automatic memory/session injection.
- Hidden research-corpus injection into every turn.
- Broad or evidence-free cleanup, push, release, publish, or deploy automation.

The one cleanup exception is fail-closed and ownership-scoped: its SessionEnd
sweep can stop only exact local MCP descendants captured from the ended Codex
owner after a 45-second grace period. See
[multi-session process hygiene](process-hygiene.md).

## Verification

Use the focused gates first:

```bash
npm run validate:agents
npm run validate:mcp
npm run validate:doctor
npm run validate:diagram
npm run codex:doctor
```

Before public release:

```bash
npm run check
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Online skill-source verification remains separate:

```bash
npm run verify:skills:online
```
