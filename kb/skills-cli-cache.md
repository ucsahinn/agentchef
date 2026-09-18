# Skills CLI And Npm Cache

Use this article when optional skill installation is slow, prompts unexpectedly,
or fails while resolving public skill sources.

## What AgentChef Controls

- `catalog/skills.json` lists reviewed installable skills.
- `catalog/skills-lock.json` records reviewed source metadata.
- `npm run verify:skills` checks the local allowlist offline.
- `npm run verify:skills:online` asks the Skills CLI to resolve public sources.

## Recommended Checks

```bash
npm run verify:skills
npm run verify:skills:online
npm run validate:plugin-skills
```

`verify:skills:online` can use network and package caches. Treat failures as a
release blocker until the source is reachable or the catalog is intentionally
updated.

## Cache Guidance

- Do not commit npm cache, downloaded packages, or temporary Skills CLI output.
- Do not delete cache directories during a support pass without explicit user
  approval.
- If a cache looks stale, rerun the online verification before changing the
  catalog.

## Related Docs

- [Skill catalog](../docs/skills.md)
- [Agent catalog](../docs/agents.md)
- [Advisory sources](../docs/advisory-sources.md)
