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
[`plugins/agentchef-workflows/skills`](../plugins/agentchef-workflows/skills).
The public catalog also lists optional skills; being listed does not mean every
skill is installed automatically.

## Plugins

The local plugin packages AgentChef's own workflows so they can be installed
and updated together:

- [Plugin manifest](../plugins/agentchef-workflows/.codex-plugin/plugin.json)
- [Marketplace entry](../.agents/plugins/marketplace.json)
- [Bundled workflow sources](../plugins/agentchef-workflows/skills)

Restart Codex after installing the plugin, then use `/plugins` to inspect it.

## Specialist Agents

Agents are focused roles for work that benefits from a separate reviewer,
researcher, mapper, or verifier. A matching role is a recommendation, not a
reason to open a subagent for every small task.

- [See the 11 coordinators and all 21 specialist workers](agents.md)
- [Open the machine-readable agent catalog](../catalog/agents.json)
- [Read the official Codex subagents guide](https://developers.openai.com/codex/subagents)

Subagents inherit the current approval and sandbox boundaries. They do not get
extra authority just because the work was delegated.

## Explicit Coordination Board Workflow

Creating a task explicitly is the only coordination-state trigger. Opening a
pane, selecting an agent, or matching a routing profile does not start work.
The coordinator may select only its cataloged workers; each worker returns a
structured evidence handoff with its outcome, evidence, risks, open questions,
and next verification need. The parent/main session relays cross-domain
handoffs. Evidence must be attached and reviewed before the task becomes done;
there is no auto-start or auto-complete behavior.

Use a user-chosen, repository-local state path. Initializing or creating a task
records coordination state only; it does not start a coordinator or worker.

```bash
npm run coordination:board -- init --state .coordination-board.json
npm run coordination:board -- create --state .coordination-board.json --id TASK-001 --title "Investigate API timeout" --owner-coordinator backend_coordinator
```

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
chooses a provider, opens a browser, or uploads source files.
