# PowerShell Policy And Windows Launch

Use this article when PowerShell blocks `install.ps1` or when the terminal
renders output incorrectly.

## Safe Launch Command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

The `Bypass` policy applies only to this process. It does not change the
machine-wide execution policy.

## When To Use Plain Output

Use plain output when older consoles render Unicode or emoji poorly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf -PlainOutput
```

## Stop Conditions

- Do not relax machine-wide execution policy for this repo.
- Do not paste commands that download and run scripts from an unverified URL.
- Do not continue if the preview writes outside the managed targets described
  by `manifests/install-plan.json`.

## Verification

```bash
npm run validate:installer
npm run validate:installer-smoke
```
