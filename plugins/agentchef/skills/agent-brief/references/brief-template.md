# Brief Template

Copy, fill every field, and run `brief-check` before sending. Labels may be
English, Turkish, or both ("Goal / Hedef").

```markdown
## Goal
Make new Claude sessions start fewer MCP processes.

## Evidence
- `claude mcp list` peak: 35 processes, 1919 MB commit (measured 2026-10-04).
- `~/.claude.json` user scope starts playwright and chrome-devtools in every session.

## Write scope
Repository agentchef: `catalog/mcp-servers.json`, `templates/codex/config.*.toml`, `docs/mcp-catalog*.md`.

## Boundaries
- Do not edit `~/.claude.json` or any live config; that is a later approved step.
- Do not touch the Beyin vault.

## Done when
- `npm run validate` passes.
- The plugin's `mcp/claude.mcp.json` lists only context7 and serena.

## Return format
Outcome, Evidence, Changed scope, Risks, Open questions, Next verification.

## User's words
"pc çok yavaşladı ... canlı ve kullanılan hiçbirşeye dokunmadan hızlandır"
```

## Handoff Template

```markdown
Outcome: the plugin ships context7 and serena only.
Evidence: `node --test scripts/tests/mcp-launch.test.mjs` 4/4; fast 34/34.
Changed scope: catalog/mcp-servers.json, templates/codex/config.unix.toml, ...
Risks: a project that relied on the global Playwright must add it per project.
Open questions: none.
Next verification: open a new Claude session and run `claude mcp list`.
```
