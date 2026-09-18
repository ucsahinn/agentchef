# AgentChef Maintenance Reference

Use this reference for broad AgentChef maintenance. Keep it aligned with the
repo's `AGENTS.md`, installer behavior, catalogs, and public documentation.

## Source Priority

1. Current repository files and command output.
2. `AGENTS.md`, package scripts, manifests, schemas, catalogs, and templates.
3. Official Codex/OpenAI docs for current Codex behavior.
4. Reviewed external skill or MCP source metadata in `catalog/`.
5. Memory or old notes only as hints, then verify against current files.

## Invariants

- Preserve idempotent setup.
- Preserve dry-run and install-plan preview behavior.
- Preserve backups before replacing user-global Codex, Agents, or Git files.
- Preserve fail-closed install behavior.
- Keep success output quiet and readable on Windows.
- Keep failure output actionable.
- Keep authenticated MCP connectors disabled by default.
- Keep global Git guards optional and explicitly flagged.
- Never store secrets, auth files, sessions, cookies, private paths, or machine
  local state in source.
- Do not run real global install flows while validating repo-only changes.

## Alignment Matrix

When a behavior changes, update the matching surfaces:

| Behavior | Files to check |
| --- | --- |
| Install operation | `manifests/install-plan.json`, `scripts/install.ps1`, `scripts/install.sh`, `scripts/plan-install.mjs`, `docs/install.md`, `docs/security-model.md` |
| Codex config | `templates/codex/config.windows.toml`, `templates/codex/config.unix.toml`, `docs/codex-flags.md`, `docs/workflow-surface-map.md` |
| Global guidance | `AGENTS.md`, `templates/codex/AGENTS.md`, `docs/best-practices.md` |
| Agents | `catalog/agents.json`, `templates/codex/agents/*.toml`, `scripts/validate-agent-config.mjs`, README agent list |
| Skills | `catalog/skills.json`, `catalog/skills-lock.json`, `plugins/agentchef-workflows/skills/*`, `scripts/validate-plugin-skills.mjs`, `docs/skills-and-agents.md` |
| MCPs | `catalog/mcp-servers.json`, config templates, `docs/mcp-catalog.md`, `scripts/validate-mcp-config.mjs` |
| Public docs | `README.md`, localized READMEs, `docs/*.md`, localized doc pairs |
| Security gates | `.gitleaks.toml`, `scripts/security-audit.mjs`, `scripts/validate-workflow-security.mjs`, `SECURITY.md` |

## Verification Ladder

Use the narrowest check first, then broaden:

1. Syntax checks for changed scripts.
2. Focused validators, for example `npm run validate:plugin-skills`.
3. `npm run validate`.
4. `npm run check`.
5. `npm run verify:skills:online` when skill source metadata changes.
6. Gitleaks or equivalent secret scanning before public handoff.
7. `git diff --check` and `git status --short` before commit or push.
8. Temporary-home install smoke tests when installer behavior changes.
9. Real global setup verification only after explicit user approval.

## Local Skill Harmony

- Use `context-budget-planner` before large repo, research, or multi-agent work.
- Use `offline-diagram-triplet` for local diagrams and docs diagrams that need
  editable Excalidraw plus SVG/PNG output.
- Keep optional external skills in the catalog without removing them unless a
  source is unsafe, unavailable, or deliberately replaced.
- Prefer one broad default skill per capability area; keep overlapping skills
  as manual opt-ins so trigger noise does not hide useful skills from the
  initial skill list.

## Release Boundaries

Commit, push, tag, release, package upload, external connector enabling, real
global setup writes, dependency installs, destructive cleanup, and credential or
auth checks beyond safe read-only status require explicit user approval.
