# AgentChef Knowledge Base

The knowledge base is for short, task-shaped answers that users need after the
README. Use the docs for full reference, and use these articles when you need a
clear operating decision.

Language entry points:

- [English](README.md)
- [Turkish](README.tr.md)

## Start Here

| Question | Article |
| --- | --- |
| How do I preview an install without touching global Codex state? | [Install preview safety](install-preview.md) |
| How do I prove an installed setup is healthy? | [Runtime verification](runtime-verification.md) |
| When should agents, skills, and MCPs be used? | [Agent and MCP routing](agent-mcp-routing.md) |
| What should be checked before a public release? | [Public release hygiene](public-release-hygiene.md) |
| PowerShell blocks the installer. What is safe? | [PowerShell policy and Windows launch](powershell-policy.md) |
| Optional skill installation or cache resolution fails. | [Skills CLI and npm cache](skills-cli-cache.md) |
| `CODEX_HOME` or `AGENTS_HOME` makes results inconsistent. | [Custom Codex home and ambient drift](codex-home-drift.md) |
| An MCP connector is listed but shows no tools. | [MCP connector shows no tools](mcp-no-tools.md) |
| Managed files are missing or stale. | [Managed file drift](managed-file-drift.md) |
| Should screenshots or visuals be committed? | [Public visual assets](public-visual-assets.md) |

## Operating Rules

- Prefer preview commands before installer writes.
- Keep account, database, production, and broad filesystem connectors disabled
  until a task explicitly needs them.
- Treat screenshots, logs, traces, and diagnostics as private until reviewed.
- Use `npm run check` and `gitleaks detect --redact --no-banner --no-git
  --verbose` before public handoff.
- Do not publish, push, tag, release, deploy, or change GitHub settings from an
  installer or unattended workflow.

## Related Docs

- [Install guide](../docs/install.md)
- [Security model](../docs/security-model.md)
- [Verification guide](../docs/verification.md)
- [Agent catalog](../docs/agents.md)
- [Skill catalog](../docs/skills.md)
- [MCP catalog](../docs/mcp-catalog.md)
- [Public readiness](../docs/public-readiness.md)
- [Troubleshooting](../docs/troubleshooting.md)
