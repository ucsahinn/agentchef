# Codex Chef

<p align="center">
  <img src="assets/banner.svg" alt="Codex Chef: a safer, clearer setup for Codex with agents, skills, MCPs, approvals, and verification" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/ucsahinn/codex-chef/actions/workflows/validate.yml"><img alt="Validation workflow" src="https://github.com/ucsahinn/codex-chef/actions/workflows/validate.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/ucsahinn/codex-chef?color=0f766e" /></a>
  <a href="README.md"><img alt="Six README languages" src="https://img.shields.io/badge/readme-6%20languages-0f766e" /></a>
  <img alt="Windows, macOS, Linux, and WSL" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-164e63" />
</p>

<p align="center">
  <strong>Read in:</strong>
  <a href="README.md">English</a> ·
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.de.md">Deutsch</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="README.fr.md">Français</a> ·
  <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

Getting Codex running is the easy part. Turning it into a setup that stays
clear, useful, and safe after the first week takes much more work.

I built **Codex Chef** because I kept solving the same setup problems: which
agent should handle a task, which skill should guide it, which MCP is safe to
use, what needs approval, and how to prove the result instead of trusting a
confident answer.

Codex Chef is an unofficial community starter built around
[official Codex documentation](https://developers.openai.com/codex). It gives
you a reviewed, open-source starting point without copying somebody else's
private machine, credentials, sessions, or local memory.

> **Built for Codex.** The ideas are portable to other terminal agents, but
> this repository does not claim drop-in Claude or multi-client compatibility.

## 👋 Start With What You Need

| Explore | What you will find |
| --- | --- |
| [🤖 See all 21 agents](docs/agents.md) | The specialist roles, what each one owns, and when delegation is actually useful. |
| [🧩 Browse the skill catalog](docs/skills.md) | Eleven bundled workflows, fifteen reviewed full-install skills, and the optional references that stay out of the default path. |
| [🔌 Open the MCP catalog](docs/mcp-catalog.md) | The balanced three-server default, optional local capabilities, eight gated connectors, and their process/access boundaries. |
| [📜 Read the installed working agreement](templates/codex/AGENTS.md) | The user-wide defaults installed as `~/.codex/AGENTS.md`; a repository-local `AGENTS.md` still has precedence. |
| [🛡️ Read the security model](docs/security-model.md) | Preview-first changes, backups, approval gates, secret handling, and the actions Codex Chef deliberately leaves to you. |

## 🍳 What Codex Chef Adds

### Agents: the right specialist, only when it helps

The starter includes roles such as `code_mapper`, `root_cause_debugger`,
`security_auditor`, `docs_author`, and `test_verifier`. They are not permanent
background services. A matching role is guidance; Codex spawns a subagent only
when the work can be split safely or you ask for delegation.

[Meet every agent and see its real role file →](docs/agents.md)

### Global `AGENTS.md`: durable defaults that stay reviewable

Codex Chef installs this [global working agreement](templates/codex/AGENTS.md)
as `~/.codex/AGENTS.md`. It makes the operating, safety, routing, design, and
verification defaults visible before you install them. A repository-local
`AGENTS.md` remains more specific and takes precedence, so project conventions
continue to win where they should.

[See where global guidance fits with config, skills, MCPs, and rules →](docs/codex-surfaces.md)

### Skills: a reliable way to repeat a workflow

Skills teach Codex how to handle a focused job. Codex sees a short description
first and loads the full instructions only when the task matches. Codex Chef
ships eleven local plugin workflows and offers fifteen reviewed skills through the
full install profile. Every local workflow is synchronized as a managed direct
skill, so calls such as `$adaptive-agent-routing`, `$context-budget-planner`,
`$fetch`, `$seo`, and `$evidence-research` work without a separate plugin
installation. The equivalent plugin namespace becomes available only after the
marketplace plugin is installed and a new Codex session is started.

[See what is bundled, installed, and optional →](docs/skills.md)

### MCPs: tools and live context with visible boundaries

MCP connects Codex to documentation, browsers, semantic code navigation,
memory, and codebase graph reads. The balanced base enables the remote
`openaiDeveloperDocs` server plus local `context7` and `serena`; the other five
local stdio servers (`sequential-thinking`, `playwright`, `chrome-devtools`,
`memory`, and `codebase-memory`) stay configured but off so every concurrent
Codex window does not eagerly duplicate their Node/Python helper trees. Use the `full`
profile for one capability-heavy primary session and `multi-session` for
low-process secondary sessions. Account, database, production, and
broad-filesystem connectors remain off until you deliberately enable them.

[See every MCP, prerequisite, and access boundary →](docs/mcp-catalog.md)

## 🧭 How The Pieces Fit Together

<p align="center">
  <img src="assets/workflow-overview.svg" alt="A task moves through routing to an agent, skill, or MCP, asks for approval when needed, and ends with verification" width="100%" />
</p>

You describe the task. Routing chooses the narrowest useful surface. Risky
actions pause for approval. Verification checks what actually happened.

## 🚀 Preview First, Install Second

You need Git, Node.js 18 or newer, npm/npx, and Codex. If one is missing, use
the [installation guide](docs/install.md) instead of guessing.

```powershell
git clone https://github.com/ucsahinn/codex-chef.git
cd codex-chef
npm run chef -- --install
```

The first command is a preview. It shows what Codex Chef would manage without
writing to your Codex home.

When the preview looks right:

```powershell
npm run chef -- --install --apply
```

The same commands work on macOS, Linux, and WSL. The installer backs up managed
targets before replacement and does not prune user-owned skills, MCPs, profiles,
or unrelated plugin files.

### Four commands worth remembering

| Need | Command |
| --- | --- |
| Preview the install | `npm run chef -- --install` |
| Check repo health | `npm run chef -- --status --repo-only --no-log` |
| See the routing contract | `npm run chef -- --routing --profile starter-health` |
| Audit Codex/MCP process ownership | `npm run chef -- --processes --no-log` |

Repair, diagnostics, updates, process checks, expected output, and direct
installer commands live in the [operator documentation](docs/README.md).

## 🛡️ Safe Defaults, Not Hidden Access

- Destructive actions, credential access, database work, publishing, releases,
  deployments, and broad filesystem access stay behind explicit approval.
- Authenticated connectors such as GitHub, Figma, Linear, Notion, Sentry,
  Vercel, and Supabase are not enabled just because they exist in the catalog.
- Codex Chef does not import browser sessions, copy private memory, store
  secrets, send maintainer telemetry, or silently commit and push your work.

Want to verify the repository yourself?

```bash
npm run check
```

The check covers docs, installers, agents, skills, MCPs, routing, package
contents, supply-chain indicators, and security boundaries.

## 📚 Go Deeper Without Digging Around

- [Documentation map](docs/README.md)
- [Installation and safe preview](docs/install.md)
- [Agents](docs/agents.md)
- [Skills and plugins](docs/skills.md)
- [Local Markdown Brain workflow](docs/brain/README.md)
- [MCP catalog](docs/mcp-catalog.md)
- [Knowledge base](kb/README.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Contributing](CONTRIBUTING.md), [support](SUPPORT.md), and
  [private security reporting](SECURITY.md)
- [Short index for agents](llms.txt)

English and Turkish deep docs contain the complete operator guidance. The other
four README entry points are concise, human-written routes into those guides.

## 🤝 Feedback Is Welcome

Codex Chef grew out of real setup friction, and I am still improving it. If a
section is unclear, a catalog entry feels wrong, or the first run makes you
hesitate, please open an issue and tell me where.

If the project saves you time, a GitHub star helps more people find it. ⭐

MIT licensed. Community maintained. Not an OpenAI product.
