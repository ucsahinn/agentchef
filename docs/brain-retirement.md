# Brain retirement

[English](brain-retirement.md) | [Türkçe](brain-retirement.tr.md)

AgentChef 0.6.0 removes the built-in Markdown Brain workflow. Durable,
cross-session memory for Codex and Claude Code is the job of the separate
[`dual-agent-brain`](https://github.com/ucsahinn/dual-agent-brain) engine, which
both agents already share through their session hooks. Keeping a second vault
implementation inside the setup kit would have meant two brains that drift
apart.

## What was removed

- the `codex-chef-brain` bundled skill and its direct-install step
  (`${AGENTS_HOME}/skills/codex-chef-brain`);
- `scripts/brain-cli.mjs`, the vault template under `templates/brain/`, the
  `brain-*.schema.json` files, `manifests/brain-vault.json`, and the Brain
  validators and tests;
- the `--continuity` / `--control-brain` operator screen and the
  `CODEX_CHEF_BRAIN_HOME` environment variable, which is no longer read.

The installer never created a vault; it only copied the skill. Nothing under
your documents folder is touched by this change.

## What this means for an existing vault

A vault that was initialized by the old skill still carries a
`.codex-chef-brain.json` marker. That marker is user data. AgentChef does not
delete, rewrite, or "reconcile" it, and no repair or doctor command will ever
suggest doing so. If the vault is now managed by `dual-agent-brain`, leave the
file where it is; the engine ignores it.

If `CODEX_CHEF_BRAIN_HOME` is still set in your environment, remove it
yourself; nothing reads it any more.

## `dual-agent-brain` backup dependency

The engine's `beyin yedek` command and its scheduled weekly backup task locate
`brain-cli.mjs` on disk. After this release the CLI no longer exists in this
repository. Until the engine ships a native backup, point it at a frozen copy
of the last checkout that still contained the CLI:

```powershell
setx BEYIN_BRAIN_CLI "<path-to-a-v0.5.74-checkout>\scripts\brain-cli.mjs"
```

Open a new terminal, then confirm with `beyin yedek` and `beyin durum`. The
engine degrades gracefully when the CLI is missing: the doctor marks the
"vault schema" check as skipped and the backup task is not registered.

## Status visibility

AgentChef does not read the vault. A later release may show a single
read-only line in `npm run codex:status` (for example `Beyin: temiz (N kontrol)`)
by calling the engine's own `beyin durum` command; it will never write to the
vault or the engine's settings.

## Related

- [ADR-006: continue as an independent, dual-target product](decisions/006-agentchef-independent-dual-target-product.md)
- [Security model](security-model.md)
