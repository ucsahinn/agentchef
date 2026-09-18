# Managed File Drift

Validator veya runtime check, AgentChef-managed dosyaların eksik, stale ya da
repo template'lerinden farklı olduğunu söylüyorsa bu makaleyi kullan.

## Managed Yüzeyler

Yetkili write planı `manifests/install-plan.json` dosyasıdır. Tipik managed
hedefler şunlardır:

- `~/.codex/AGENTS.md`
- `~/.codex/config.toml`
- `~/.codex/*.config.toml`
- `~/.codex/agents/*.toml`
- `~/.codex/rules/default.rules`
- `~/.codex/plugins/agentchef-workflows`
- `~/.agents/plugins/marketplace.json`

## Tahmin Etmeden Repair

Önce preview al:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

Planı inceledikten sonra uygula:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair
```

## Repair Neyi Korumalı?

- User skill'leri silinmez.
- İlgisiz marketplace plugin kayıtları korunur.
- Managed dosyalar repair öncesi yedeklenir.
- 1.0.0 öncesi yazılan sahiplik işaretçileri (`.codex-chef-managed.json`,
  `.codex-chef-source.json`) hâlâ tanınır; `agentchef` adlarına çevirmek için
  `npm run chef -- --migrate-identity` çalıştır.
- Auth dosyaları, session'lar, memory, log ve local cache source control içine
  alınmaz.

## Doğrulama

```bash
npm run validate:repair
npm run verify:install:runtime -- --expect-skills --expect-git-guards
```
