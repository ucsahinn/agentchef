# Kurulum Ön İzleme Güvenliği

AgentChef'in `~/.codex`, `~/.agents` veya opsiyonel Git guard hedeflerine
yazmadan önce ne yapacağını görmek istiyorsan bu makaleyi kullan.

## Önerilen Akış

1. Repoyu clone et.
2. PowerShell veya Bash dry run çalıştır.
3. Manifest tabanlı install planını incele.
4. Plan yalnız beklediğin managed dosyaları kapsıyorsa kuruluma geç.

PowerShell preview:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
node scripts/plan-install.mjs --all --json --redact-paths
```

Bash veya WSL preview:

```bash
./scripts/install.sh --all --dry-run
node scripts/plan-install.mjs --all --json --redact-paths
```

## Temiz Ön İzleme Neyi Göstermeli?

- Managed write'lar `manifests/install-plan.json` icindeki Codex, Agents,
  plugin, profile, rule ve opsiyonel Git guard hedefleriyle sınırlı olmalı.
- Var olan managed dosyalar replace edilmeden önce backup planlanmalı.
- Account, database, production ve geniş filesystem connector'ları kullanıcı
  sonradan opt-in yapmadıkça disabled kalmalı.
- Local auth, session, memory, cache, screenshot ve log dosyaları install
  payload'ina girmemeli.

## Dur Ve İncele

Ön izleme şu sinyallerden birini gösterirse apply etme:

- Dokümante managed hedefler dışında bir write.
- Var olan managed dosya icin eksik backup.
- Varsayılan olarak hesap, database, production telemetry veya geniş filesystem
  acabilecek connector.
- Source yüzeyinde generated artifact, archive, auth dosyası, local cache veya
  makineye özel path.

## Sonraki Adım

Temiz ön izleme sonrasında kurulu state'i kontrol etmek için
[Runtime doğrulaması](runtime-verification.tr.md) makalesini kullan.
