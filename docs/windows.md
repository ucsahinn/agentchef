# Windows Notes

Official reference:

https://developers.openai.com/codex/windows

## Recommended Posture

- Prefer native Windows sandboxing when working in Windows repositories.
- Use the elevated sandbox when administrator-approved setup is available.
- Use WSL2 when your toolchain is Linux-native or native Windows sandbox setup
  is blocked by policy.
- Keep repositories under the native filesystem for the environment you are
  using. For WSL, keep repos under the Linux home directory for better I/O.

## Starter Defaults

The Windows template sets:

```toml
[windows]
sandbox = "elevated"
```

If your machine cannot use elevated sandboxing, change to:

```toml
[windows]
sandbox = "unelevated"
```

Do not switch to unrestricted access as a routine workaround. Fix the sandbox
or use a narrower profile instead.

## Useful Checks

```powershell
codex doctor --summary
codex exec --strict-config "Summarize the active setup."
```

For repository scripts, use the Windows command shims explicitly in
PowerShell, especially from automation or agent-run processes:

```powershell
npm.cmd run check
npm.cmd run token:audit
npm.cmd run verify:install:runtime -- --no-mcp-probe
npx.cmd --version
codex.cmd --version
npm.cmd run chef -- --processes --no-log
claude.cmd --version
npm.cmd run verify:install:runtime -- --target claude
```

AgentChef's programmatic command resolver selects `npm.cmd`, `npx.cmd`,
`codex.cmd`, and `claude.cmd` on Windows and the un-suffixed commands on Unix. This avoids the
PowerShell script-policy and executable-resolution differences that can make a
command work interactively but fail in an agent or child process.

Windows MCP launchers often appear as layered `cmd.exe`, `node.exe`, `uvx.exe`,
and `python.exe` trees. Do not use executable-name cleanup. The process audit
reads `Win32_Process` parent/child and creation-time metadata; if that metadata
is unavailable it fails closed and produces no cleanup candidates. Use
`codex --profile multi-session` for secondary concurrent windows and see
[multi-session process hygiene](process-hygiene.md).

Claude Code skill links are directory junctions (`~/.claude/skills/<name>`
into `~/.agents/skills/<name>`). Junctions need no administrator rights or
Developer Mode. `CLAUDE_CONFIG_DIR` relocates the whole Claude home,
including `.claude.json` (which otherwise lives at `~/.claude.json`, not inside
`~/.claude`); that is how the scratch-home tests stay isolated.

For additional temporary read access inside a session:

```text
/sandbox-add-read-dir C:\absolute\directory\path
```
