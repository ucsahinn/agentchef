# Agent And MCP Routing

AgentChef installs routing guidance, agent role files, curated skills, and MCP
defaults. They are different surfaces and should not be collapsed into one
generic automation bucket.

## Use The Smallest Surface

| Need | Surface |
| --- | --- |
| One-off task constraint | Current prompt |
| Durable repo behavior | `AGENTS.md` |
| Reusable workflow | Skill |
| Installable workflow bundle | Plugin |
| Live external or private context | MCP or app connector |
| Bounded specialist evidence work | Subagent |
| Narrow command exception | Rule |
| Reviewed lifecycle enforcement | Hook |

## Default Agent Boundary

Subagents are role files for visible delegation. They are useful for mapping,
docs review, security review, release verification, QA, browser evidence, and
other bounded evidence tasks. They are not always-on services, and they should
not bypass approvals.

For large work, use a small set of focused agents and keep write scopes
separate. Report `Agent plan`, `Agent started`, and `Agent result` so the
delegation is auditable.

## Default MCP Boundary

AgentChef keeps read-heavy support surfaces useful by default: official docs,
Context7, reasoning, browser evidence, semantic code navigation, non-secret
memory reads, and local codebase graph reads. Interaction, symbol edits, graph
indexing, account access, database access, production telemetry, deployment
operations, and broad filesystem access stay prompt-gated or disabled.

## Related Docs

- [Codex capability map](../docs/codex-capability-map.md)
- [Agent catalog](../docs/agents.md)
- [Skill catalog](../docs/skills.md)
- [MCP catalog](../docs/mcp-catalog.md)
- [Workflow surface map](../docs/workflow-surface-map.md)
