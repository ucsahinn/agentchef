# Custom Codex Home Ve Ambient Drift

`CODEX_HOME`, `AGENTS_HOME` veya özel test klasörü installed-runtime kontrollerini
tutarsız gösteriyorsa bu makaleyi kullan.

## İlk Soru

Komutun hangi home değerlerini kullandığını doğrula:

```bash
node scripts/plan-install.mjs --all --json --redact-paths
npm run codex:status -- --plain --no-log
```

Bir komut geçici `CODEX_HOME` veya `AGENTS_HOME` ile çalıştıysa o sonucu
kullanıcının gerçek global setup kanıtı sayma.

## Temiz Karar Akışı

1. Repo state'ini `npm run validate` ile doğrula.
2. Planı redacted path'lerle ön izle.
3. Log yazmadan incelemek istiyorsan status komutunda `--no-log` kullan.
4. Global managed hedeflere repair uygulamadan önce repair preview çalıştır.

Repair preview:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
```

## Durma Koşulları

- Custom home klasörleri arasında elle dosya kopyalama.
- Açık onay olmadan eski home, cache veya backup silme.
- Geçici smoke-test home sonucunu production operator setup kanıtı sayma.
