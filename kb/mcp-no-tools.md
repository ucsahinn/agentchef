# MCP Connector Shows No Tools

Use this article when an MCP server is listed but Codex shows no useful tools
or the connector stays unavailable.

## Read The Boundary First

AgentChef defaults are conservative. Documentation, reasoning, browser
evidence, semantic code navigation, memory reads, and local graph reads are
narrowed for routine work. Account, database, production, broad filesystem, and
mutating connector tools stay disabled or prompt-gated.

## Local Checks

```bash
npm run validate:mcp
npm run codex:status -- --plain --no-log
```

Then inspect Codex:

```text
/mcp
```

## Common Causes

| Symptom | Likely Cause |
| --- | --- |
| Server listed, no tools | Tool allowlist is intentionally narrow. |
| Serena unavailable | `uvx` or the pinned launcher source is missing. |
| Account connector disabled | Connector requires explicit opt-in and auth. |
| Browser tool unavailable | Browser MCP is not started or tool is prompt-gated. |

## Do Not

- Do not enable account or database connectors just to make a status board look
  full.
- Do not broaden filesystem or graph-indexing tools without a concrete task.
- Do not paste tokens into config files; use the documented auth path.
