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

## 🍱 Ten Bundled Workflows

These live in the AgentChef plugin and travel with the repository. The
installer synchronizes all ten from that same canonical source to
`AGENTS_HOME/skills/<name>`, so every workflow can be called directly. Examples
include `$adaptive-agent-routing`, `$context-budget-planner`, `$fetch <url>`,
`$seo <target>`, and `$evidence-research <question>`. Fetch remains
explicit-only; SEO and Evidence Research can also activate when the request
unambiguously matches their descriptions.

The personal marketplace entry makes the plugin discoverable; it does not
install or enable it. To use namespaced calls such as
`$agentchef-workflows:fetch`, install `agentchef-workflows@agentchef` from
`/plugins` or with `codex plugin add`, then start a new Codex session.

| Skill | Use it for |
| --- | --- |
| [`agentchef-operator`](../plugins/agentchef-workflows/skills/agentchef-operator/SKILL.md) | Keep this starter aligned without weakening installer or security boundaries. |
| [`context-budget-planner`](../plugins/agentchef-workflows/skills/context-budget-planner/SKILL.md) | Plan sources, token use, compaction handoff, and verification for broad work. |
| [`adaptive-agent-routing`](../plugins/agentchef-workflows/skills/adaptive-agent-routing/SKILL.md) | Select the narrowest useful agent, skill, MCP, and wait policy without spawning by default. |
| [`external-review-workflow`](../plugins/agentchef-workflows/skills/external-review-workflow/SKILL.md) | Prepare a secret-safe, hash-pinned manual review handoff without uploading anything automatically. |
| [`gptpro`](../plugins/agentchef-workflows/skills/gptpro/SKILL.md) | Export a fresh external-review snapshot as architecture-aware GPT Pro Project text context without uploading it. |
| [`gptpro-handoff`](../plugins/agentchef-workflows/skills/gptpro-handoff/SKILL.md) | Write a review-ID-bound GPT Pro prompt and verify its returned report before implementation. |
| [`fetch`](../plugins/agentchef-workflows/skills/fetch/SKILL.md) | Reconstruct an authorized reference site from browser evidence, verify responsive interactions, and report every fidelity gap without copying credentials or server internals. |
| [`seo`](../plugins/agentchef-workflows/skills/seo/SKILL.md) | Audit, implement, and verify technical, rendering, structured-data, content-intent, international, local, performance, and measurement work without inventing rankings or indexing evidence. |
| [`evidence-research`](../plugins/agentchef-workflows/skills/evidence-research/SKILL.md) | Frame decision questions, search and appraise current sources, trace claims, explain disagreement and uncertainty, and package reproducible research. |
| [`offline-diagram-triplet`](../plugins/agentchef-workflows/skills/offline-diagram-triplet/SKILL.md) | Turn Mermaid source into editable Excalidraw, SVG, PNG, and Markdown assets without network access. |

## ✅ Fifteen Reviewed Full-Install Skills

These entries have `install: true` in the catalog. They are eligible for the
full install profile; the catalog pins the package/skill pair and the online
verification checks that the pair still resolves.

| Skill | What it adds | Source |
| --- | --- | --- |
| `dependency-upgrade` | Staged dependency upgrades with compatibility checks. | [wshobson/agents](https://github.com/wshobson/agents) |
| `gh-fix-ci` | Official OpenAI workflow for investigating failed GitHub Actions checks. | [openai/skills](https://github.com/openai/skills) |
| `systematic-debugging` | Root-cause investigation before changing code. | [obra/superpowers](https://github.com/obra/superpowers) |
| `request-refactor-plan` | Small, working steps for broad refactors. | [mattpocock/skills](https://github.com/mattpocock/skills) |
| `security-best-practices` | Official OpenAI secure-default guidance for supported stacks. | [openai/skills](https://github.com/openai/skills) |
| `frontend-skill` | A broad frontend production workflow. | [nexu-io/open-design](https://github.com/nexu-io/open-design) |
| `webapp-testing` | Browser evidence, screenshots, and logs for local web apps. | [anthropics/skills](https://github.com/anthropics/skills) |
| `web-quality-audit` | Performance, accessibility, SEO, and best-practice checks. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) |
| `accessibility` | Keyboard, focus, forms, ARIA, semantics, and WCAG-oriented review. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) |
| `test-driven-development` | Focused behavior tests before implementation. | [obra/superpowers](https://github.com/obra/superpowers) |
| `documentation-and-adrs` | README, ADR, and durable project documentation work. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |
| `mcp-builder` | MCP tool, schema, transport, and evaluation design. | [anthropics/skills](https://github.com/anthropics/skills) |
| `ai-project-starter` | AI-coding-ready project context, starter docs, and guardrails. | [ucsahinn/ai-project-starter](https://github.com/ucsahinn/ai-project-starter) |
| `prompt-architect` | Plan-first, approval-aware Codex prompts and prompt audits. | [ucsahinn/prompt-architect](https://github.com/ucsahinn/prompt-architect) |
| `ai-skill-create` | Create, validate, forward-test, and package Codex skills and plugins. | [ucsahinn/ai-skill-create](https://github.com/ucsahinn/ai-skill-create) |

## 🧰 Other Cataloged Workflows

The following names remain discoverable, but AgentChef does not automatically
install them. Some are local compatibility names; others are specialized
upstream options intentionally kept out of the default skill list.

<details>
<summary><strong>Debugging, implementation, review, and release</strong></summary>

- `investigate`, `incident-triage`, `new-feature`, `refactor-plan`,
  `test-backfill`, `performance-audit`, `db-migration-review`,
  `release-verify`, `code-review`, `sentry-code-review`, `codex-pr-body`,
  `babysit-pr`, and `open-pr`
- `git-hygiene`, `security-check`, and `security-threat-model`

</details>

<details>
<summary><strong>Frontend, browser, and hosting references</strong></summary>

- `impeccable`, `design-taste-frontend`, `image-to-code`,
  `high-end-visual-design`, and `web-design-guidelines`
- `vercel-react-best-practices`, `vercel-optimize`,
  `vercel-cli-with-tokens`, and `playwright`

</details>

<details>
<summary><strong>Context, prompts, memory, and MCP setup</strong></summary>

- `mcp-connectors`, `context-map`, `what-context-needed`,
  `prompt-engineering-patterns`, `ai-prompt-engineering-safety-review`, and
  `memory-safety-patterns`

</details>

## What “Cataloged” Does And Does Not Mean

- A catalog entry is reviewed metadata, not proof that the skill is installed.
- A bundled skill lives in this repository's plugin. All ten bundled
  workflows are also synchronized as managed direct skills without creating a
  second canonical source in the repository.
- An `install: true` entry is eligible for the full install profile.
- A manual reference may overlap with a default skill or require credentials,
  vendor setup, or a more specialized task.
- Skills do not execute by themselves. Codex selects one when the task matches
  or when you explicitly invoke it.
- Claude Code sees the same managed tree through directory links
  (`~/.claude/skills/<name>` into `~/.agents/skills/<name>`) and through the
  plugin, so there is still one canonical copy per skill. Invoke a skill there
  with `/<name>`. See [Claude skill links](../kb/claude-skill-links.md).

The machine-readable source is
[`catalog/skills.json`](../catalog/skills.json). Reviewed install targets are
mirrored in [`catalog/skills-lock.json`](../catalog/skills-lock.json), including
full upstream commit SHAs plus dated Skills CLI compatibility/discovery
metadata. Installation itself uses a verified native-copy path.

Return to [the README](../README.md) or continue with
[agents](agents.md) and [MCPs](mcp-catalog.md).
