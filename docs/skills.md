# AgentChef Skills

[English](skills.md) | [Türkçe](skills.tr.md)

A skill is the **how** in a Codex workflow. It packages focused instructions,
references, and optional scripts so Codex can repeat a job without rebuilding
the process from scratch.

Codex uses progressive disclosure: it starts with a skill's name and
description, then reads the full `SKILL.md` only when the task matches or you
invoke the skill directly. That is why this catalog distinguishes what is
bundled, what the full install profile can add, and what remains an optional
reference.

Official Codex reference: [Build skills](https://developers.openai.com/codex/skills)

## 🍱 Eleven Bundled Workflows

These live in the `agentchef` plugin and travel with the repository. The
installer places them in the plugin source
`AGENTS_HOME/plugins/sources/agentchef/skills/<name>`; since 1.3.0 it no longer
copies them into `AGENTS_HOME/skills`, so each skill is listed once per CLI.
The `$fetch`, `$seo`, and `$evidence-research` workflows, for example, are
called as `$agentchef:fetch <url>`, `$agentchef:seo <target>`, and
`$agentchef:evidence-research <question>` in Codex, and as
`/agentchef:<skill>` in Claude Code. Fetch remains explicit-only; SEO and
Evidence Research can also activate when the request unambiguously matches
their descriptions.

The personal marketplace entry makes the plugin discoverable; it does not
install or enable it. To use namespaced calls such as
`$agentchef:fetch`, install `agentchef@agentchef` from
`/plugins` or with `codex plugin add`, then start a new Codex session.

| Skill | Use it for |
| --- | --- |
| [`agentchef-operator`](../plugins/agentchef/skills/agentchef-operator/SKILL.md) | Keep this starter aligned without weakening installer or security boundaries. |
| [`context-budget-planner`](../plugins/agentchef/skills/context-budget-planner/SKILL.md) | Plan sources, token use, compaction handoff, and verification for broad work. |
| [`adaptive-agent-routing`](../plugins/agentchef/skills/adaptive-agent-routing/SKILL.md) | Select the narrowest useful agent, skill, MCP, and wait policy without spawning by default. |
| [`agent-brief`](../plugins/agentchef/skills/agent-brief/SKILL.md) | Write the fixed brief an orchestrator hands to another agent and check the handoff that comes back, with `coordination-board brief-check`. |
| [`external-review-workflow`](../plugins/agentchef/skills/external-review-workflow/SKILL.md) | Prepare a secret-safe, hash-pinned manual review handoff without uploading anything automatically. |
| [`gptpro`](../plugins/agentchef/skills/gptpro/SKILL.md) | Export a fresh external-review snapshot as architecture-aware GPT Pro Project text context without uploading it. |
| [`gptpro-handoff`](../plugins/agentchef/skills/gptpro-handoff/SKILL.md) | Write a review-ID-bound GPT Pro prompt and verify its returned report before implementation. |
| [`fetch`](../plugins/agentchef/skills/fetch/SKILL.md) | Reconstruct an authorized reference site from browser evidence, verify responsive interactions, and report every fidelity gap without copying credentials or server internals. |
| [`seo`](../plugins/agentchef/skills/seo/SKILL.md) | Audit, implement, and verify technical, rendering, structured-data, content-intent, international, local, performance, and measurement work without inventing rankings or indexing evidence. |
| [`evidence-research`](../plugins/agentchef/skills/evidence-research/SKILL.md) | Frame decision questions, search and appraise current sources, trace claims, explain disagreement and uncertainty, and package reproducible research. |
| [`offline-diagram-triplet`](../plugins/agentchef/skills/offline-diagram-triplet/SKILL.md) | Turn Mermaid source into editable Excalidraw, SVG, PNG, and Markdown assets without network access. |

## ✅ Eighteen Reviewed Full-Install Skills

These entries have `install: true` in the catalog. They are eligible for the
full install profile; the catalog pins the package/skill pair and the online
verification checks that the pair still resolves. The installer writes each
one into the same plugin source as the bundled skills, with its
`.agentchef-source.json` provenance record, so they appear under the plugin
too.

| Skill | What it adds | Source | License |
| --- | --- | --- | --- |
| `dependency-upgrade` | Staged dependency upgrades with compatibility checks. | [wshobson/agents](https://github.com/wshobson/agents) | MIT |
| `gh-fix-ci` | Official OpenAI workflow for investigating failed GitHub Actions checks. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `git-workflow-and-versioning` | Atomic commits, clean branches and pull requests, semantic versions, tags, and changelogs. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `shipping-and-launch` | Pre-launch checklist, monitoring, staged rollout, and rollback planning. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `systematic-debugging` | Root-cause investigation before changing code. | [obra/superpowers](https://github.com/obra/superpowers) | MIT |
| `improve-codebase-architecture` | Find architecture-deepening opportunities and plan the chosen refactor; invoked explicitly upstream. | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `security-best-practices` | Official OpenAI secure-default guidance for supported stacks. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `security-threat-model` | Official OpenAI repository-grounded threat model, only when explicitly requested. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `frontend-design` | Distinctive, intentional visual direction and typography for new or reshaped UI. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `webapp-testing` | Browser evidence, screenshots, and logs for local web apps. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `web-quality-audit` | Performance, accessibility, SEO, and best-practice checks. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | MIT |
| `accessibility` | Keyboard, focus, forms, ARIA, semantics, and WCAG-oriented review. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | MIT |
| `test-driven-development` | Focused behavior tests before implementation. | [obra/superpowers](https://github.com/obra/superpowers) | MIT |
| `documentation-and-adrs` | README, ADR, and durable project documentation work. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `mcp-builder` | MCP tool, schema, transport, and evaluation design. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `ai-project-starter` | AI-coding-ready project context, starter docs, and guardrails. | [ucsahinn/ai-project-starter](https://github.com/ucsahinn/ai-project-starter) | MIT |
| `prompt-architect` | Plan-first, approval-aware Codex prompts and prompt audits. | [ucsahinn/prompt-architect](https://github.com/ucsahinn/prompt-architect) | MIT |
| `ai-skill-create` | Create, validate, forward-test, and package Codex skills and plugins. | [ucsahinn/ai-skill-create](https://github.com/ucsahinn/ai-skill-create) | MIT |

The license column records the license measured in the upstream repository at
the pinned commit; the lock repeats it so a pin change cannot silently change
the license.

## 🧰 Other Cataloged Workflows

AgentChef does not install the following names automatically.

<details>
<summary><strong>Compatibility aliases</strong></summary>

An alias resolves an older or overlapping name to the installed skill that now
owns the job. Do not load an alias and its target in the same task.

| Alias | Use instead |
| --- | --- |
| `codex-chef-operator` | `agentchef-operator` |
| `context-engineering-project-starter` | `ai-project-starter` |
| `codex-skill-forge` | `ai-skill-create` |
| `codex-enterprise-prompt-architect` | `prompt-architect` |
| `investigate` | `systematic-debugging` |
| `incident-triage` | `systematic-debugging` |
| `new-feature` | `test-driven-development` |
| `test-backfill` | `test-driven-development` |
| `security-check` | `security-best-practices` |
| `context-map` | `context-budget-planner` |
| `what-context-needed` | `context-budget-planner` |
| `prompt-engineering-patterns` | `prompt-architect` |
| `playwright` | `webapp-testing` |
| `babysit-pr` | `gh-fix-ci` |
| `impeccable` | `frontend-design` |
| `design-taste-frontend` | `frontend-design` |
| `high-end-visual-design` | `frontend-design` |
| `image-to-code` | `frontend-design` |
| `frontend-skill` | `frontend-design` |
| `refactor-plan` | `improve-codebase-architecture` |
| `request-refactor-plan` | `improve-codebase-architecture` |
| `open-pr` | `git-workflow-and-versioning` |
| `codex-pr-body` | `git-workflow-and-versioning` |
| `git-hygiene` | `git-workflow-and-versioning` |
| `release-verify` | `shipping-and-launch` |

</details>

<details>
<summary><strong>Retired references</strong></summary>

These entries stay in the catalog with `retired: true` so older references keep
a pointer; the replacement is a harness skill, an agent role, or both.

| Retired name | Replaced by |
| --- | --- |
| `mcp-connectors` | `mcp_integrator` + `mcp-builder` |
| `performance-audit` | `performance_auditor` + `web-quality-audit` |
| `code-review` | `code_reviewer` |
| `sentry-code-review` | `code_reviewer` |
| `web-design-guidelines` | `web-quality-audit` + `accessibility` |
| `ai-prompt-engineering-safety-review` | `prompt-architect` + `security_auditor` |

</details>

<details>
<summary><strong>Optional manual references</strong></summary>

- `db-migration-review`, `vercel-react-best-practices`, `vercel-optimize`, `memory-safety-patterns`, and `vercel-cli-with-tokens` stay opt-in: they are framework- or
  vendor-specific, need credentials, or have no harness replacement yet.

</details>

## What “Cataloged” Does And Does Not Mean

- A catalog entry is reviewed metadata, not proof that the skill is installed.
- A bundled skill lives in this repository's plugin. It reaches Codex and
  Claude Code only through that plugin; there is no second direct copy.
- An `install: true` entry is eligible for the full install profile.
- A manual reference may overlap with a default skill or require credentials,
  vendor setup, or a more specialized task.
- Skills do not execute by themselves. Codex selects one when the task matches
  or when you explicitly invoke it.
- Claude Code loads the same plugin source through `claude plugin install`;
  nothing is linked into `~/.claude/skills`, so each skill is listed once.
  Invoke a skill there with `/agentchef:<name>`, or bare `/<name>` when no
  other command has that name. Links left by a 1.0–1.2 install are covered in
  [Claude skill links](../kb/claude-skill-links.md).

The machine-readable source is
[`catalog/skills.json`](../catalog/skills.json). Reviewed install targets are
mirrored in [`catalog/skills-lock.json`](../catalog/skills-lock.json), including
full upstream commit SHAs plus dated Skills CLI compatibility/discovery
metadata. Installation itself uses a verified native-copy path.

Return to [the README](../README.md) or continue with
[agents](agents.md) and [MCPs](mcp-catalog.md).
