# How To Run The Setup

This starter is designed for a Codex user who wants a ready operating model,
not just a copied config file. After installation, Codex should have durable
instructions, safe MCP defaults, verified public/first-party skills, specialist
agents, profiles, rules, a local plugin, and repo-only doctor diagnostics. Git
hygiene guardrails are available as a separate opt-in because they change
global Git behavior.

## Preview-First Setup

PowerShell:

```powershell
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -Interactive
```

Bash or WSL:

```bash
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
chmod +x scripts/install.sh
./scripts/install.sh --all --dry-run
node scripts/plan-install.mjs --all --json --redact-paths
./scripts/install.sh --all --interactive
```

Use plain noninteractive `-All` or `--all` only in reviewed automation where the
install plan is already known and the target Codex/Agents homes are controlled.

Use the narrower flags only when you intentionally want a partial setup:

- `-InstallSkills` / `--install-skills`
- `-InstallGitGuards` / `--install-git-guards`

Skill installation uses the verified `package` and `skill` values in
`catalog/skills.json` and passes `--skill`, `--yes`, and `--global` to the
Skills CLI. Catalog entries without both fields are skipped, not cloned by name.

## First Verification

Restart Codex after installing, then run:

```bash
npm run codex:doctor
codex doctor --summary
codex exec --strict-config "Summarize the active Codex setup."
```

Inside Codex, inspect:

```text
/mcp
/skills
/plugins
/hooks
```

## Operating Model

Use the setup as a specialist team:

1. Start with `code_mapper` for unfamiliar repositories, large changes, or
   architecture questions.
2. Use `context_architect` when deciding whether behavior belongs in a prompt,
   `AGENTS.md`, skill, plugin, MCP, hook, memory, rule, or config profile.
3. Use `docs_researcher` for current Codex, API, library, framework, or cloud
   behavior.
4. Use `prompt_architect` for reusable prompts, success criteria, skill briefs,
   and instruction systems.
5. Use `mcp_integrator` before enabling, disabling, or troubleshooting MCP
   servers, app connectors, or tool allowlists.
6. Keep implementation in the main thread so decisions and edits stay coherent.
7. Use `test_verifier` for lint, typecheck, test, build, smoke, or failing CI.
8. Use `frontend_verifier` for real-browser UI checks, screenshots, responsive
   layout, console errors, and interaction states.
9. Use `security_auditor` for auth, secrets, permissions, data access, API
   routes, cryptography, or abuse paths.
10. Use `codex_doctor` for starter health, catalog drift, install-plan, docs,
    MCP, and safe no-write diagnostics.
11. Use `release_verifier` before push, tag, release, package, deploy, or public
   publication.

Official Codex docs describe subagents as explicitly triggered parallel
workflows. This starter gives you the agent files and routing language for that
workflow, but it keeps approvals, sandboxing, and connector auth intact.

## MCP Defaults

Enabled by default:

- OpenAI Docs MCP for official OpenAI documentation.
- Context7 for current library and framework docs.
- Serena for semantic code navigation.

Configured but disabled in the balanced base:

- Sequential Thinking for structured decomposition.
- Playwright and Chrome DevTools for browser verification.
- Memory for local non-secret recall.
- Codebase Memory for graph-backed repository intelligence.

Account or broad-access connectors disabled until needed:

- GitHub
- Figma
- Linear
- Notion
- Sentry
- Vercel
- Supabase
- Filesystem

Enable authenticated or data-bearing connectors only for a concrete task and
only after approving the account scope. Use `mcp_integrator` first when the
connector can access private data or take action.

## Profiles

The installer copies profile configs into `~/.codex`:

- `development.config.toml`: normal implementation profile.
- `review.config.toml`: read-only, high-reasoning review profile.
- `ci.config.toml`: read-only verification profile with hooks disabled.
- `token-safe.config.toml`: lower verbosity, lower default reasoning,
  compaction, and tool-output limits for broad or long-running work without
  disabling skills, agents, MCPs, memory, hooks, or apps.
- `full.config.toml`: enables every bundled local stdio MCP for one primary
  capability-heavy session.
- `multi-session.config.toml`: disables local stdio MCPs for secondary
  concurrent sessions without disabling agents, skills, remote OpenAI docs,
  built-in memories, hooks, or apps.

Use profiles when a task needs a different safety posture without rewriting the
main config. Specialist role files leave per-agent model/reasoning unpinned, so
the active profile and Codex runtime can choose the right balance for the task.
For the ownership-aware audit and exact stale cleanup boundary, see
[multi-session process hygiene](process-hygiene.md).

## Common Prompts

Repository audit:

```text
Use code_mapper, context_architect, and test_verifier. Map this repository,
identify which Codex surface each improvement belongs in, run the narrowest
meaningful checks, and report blockers with file references before editing.
```

Codex setup diagnosis:

```text
Use codex_doctor. Run the repo-only doctor and relevant validators, summarize
agent/MCP/docs/install-plan drift, and do not inspect or mutate user-global
Codex, Agents, or Git state unless I explicitly approve.
```

UI/UX polish without adding content:

```text
Act as a senior UX/UI specialist. Do not add new marketing sections or unrelated
copy. Improve the existing interface so users can understand the offer faster,
contact the business with fewer steps, and use the site comfortably on mobile.
Keep the existing content and brand intent, but make hierarchy, spacing,
responsive behavior, performance, accessibility, and visual polish feel
professional. Verify mobile width, text overflow, focus states, loading/error
states, and the primary contact flow before calling it done.
```

Release readiness:

```text
Use release_verifier and git-hygiene. Inspect git status, validate docs/scripts,
run secret scanning when available, check public-readiness files, and summarize
whether this is safe to push or publish. Do not push unless I explicitly approve.
```

## Safety Rules

- Do not store tokens, auth files, sessions, memories, cookies, private keys, or
  machine-specific state in the repository.
- Keep sandboxing enabled.
- Keep approval prompts interactive.
- Keep authenticated remote connectors disabled by default.
- Treat Gitleaks findings as real until reviewed.
- Commit, push, publish, deploy, rotate secrets, and destructive file operations
  still need explicit user approval.
