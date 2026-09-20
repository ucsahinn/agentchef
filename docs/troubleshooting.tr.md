# Troubleshooting

Setup veya doğrulama hata verdiğinde daha geniş permission ile her şeyi yeniden
çalıştırmak yerine önce hatanın hangi katmanda olduğunu bul. Installer veya auth
isteyen connector'ı bilinçli seçene kadar tanı komutlarını read-only tut.

## Windows Installer

Önce ön izleme al:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

Temel kontroller:

```powershell
Get-Command codex
Get-Command git
Get-Command node
Get-Command npx
```

PowerShell script çalıştırmayı engellerse process-local policy kullan:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
```

Bu komut makine veya kullanıcı execution policy'sini kalıcı değiştirmez.

## Bash, WSL Veya Git Bash

Bash installer gerçek Bash ortamı ister:

```bash
bash -n scripts/install.sh
./scripts/install.sh --all --dry-run
```

Windows'ta `bash` yoksa PowerShell kullan veya Bash yolunu WSL/Git Bash içinde
çalıştır.

## Skills CLI

Windows-safe install pattern:

```powershell
npx.cmd --yes skills@1.5.20 list --global --json
node scripts/install-pinned-skill.mjs --package <owner/repo> --commit <40-char-sha> --skill <skill> --cli-version 1.5.20
```

Exact skill adı zaten kullanıcıya aitse helper hedefi korur ve
`Skipped existing user-owned skill` yazar. Önce hedefi ve backup etkisini
incele; yalnızca bundan sonra o tek komutu `--adopt-existing` ile tekrar
çalıştır. Bu flag'i katalog döngüsüne veya geniş installer'a ekleme.

Bu repo installable kaynakları default olarak offline doğrular:

```bash
npm run verify:skills
```

Online kontrol network ve Skills CLI resolution kullanır:

```bash
npm run verify:skills:online
```

Bu kontrol yalnizca yok sayilan `tmp/npm-cache` calisma alani cache'ine yazar.
Online dogrulama `%LOCALAPPDATA%` altindaki npm cache izinleri yuzunden
basarisiz olursa repo guncel halindeyken tekrar calistirin.

Git for Windows `SEC_E_NO_CREDENTIALS` döndürürse sadece ilgili network
doğrulamasını process-local OpenSSL override ile tekrar dene. Global credential
veya TLS workaround'larını repoya commit etme.

## MCP Connector'ları

Auth isteyen MCP connector'ları varsayılan olarak disabled kalır. Sadece görev
ihtiyaç duyuyorsa aç, Codex'i yeniden başlat ve `/mcp` ile aktif server'ları
kontrol et.

Önce Codex'in installer'ın yazdığı aynı home'u okuduğunu doğrula:

```bash
npm run codex:status
npm run verify:install:runtime
```

`npm run codex:status` skills context attention raporlarsa bu install hatasi
degil, kapasite warning'idir. Cok skill kuruluyken Codex ilk listedeki skill
description'larini kisaltabilir; secilen skill yine de tam `SKILL.md`
talimatlarini yukler. Implicit skill secimi gurultulu hale gelirse kullanmadigin
skill veya plugin'leri kapat.

Verifier ambient `CODEX_HOME` warning'i raporlarsa kurulu config yine doğru
olabilir; mevcut shell sandbox, offline veya alternatif bir home okuyor olabilir.
Verifier MCP durumuna karar vermeden önce Codex CLI kontrollerini `CODEX_HOME`
açıkça kurulu hedefe ayarlanmış şekilde tekrar çalıştırır.

Managed file drift raporlanırsa agent ve MCP sayıları doğru görünse bile kurulu
kopya eskidir. Önce repair çalıştır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -Repair -WhatIf
.\scripts\install.ps1 -Repair
```

Repair modu AgentChef'in yönettiği drift'i backup alıp düzeltir; başka
marketplace plugin'lerini ve user skill'lerini silmez. Force replacement'i
sadece repair planını inceledikten ve tam managed-target replacement istediğine
karar verdikten sonra kullan.

Bir server açılıyor ama tool göstermiyorsa:

1. `catalog/mcp-servers.json` içindeki package veya URL'yi kontrol et.
2. Sadece ihtiyacın olan connector için `enabled = true` olduğundan emin ol.
3. Codex'i yeniden başlat.
4. `/mcp` komutunu tekrar çalıştır.
5. İş bitince connector'ı yeniden disabled yap.

## Çok Fazla Node/Python/MCP Süreci

Executable adına göre süreç öldürme. Önce çalıştır:

```powershell
npm run chef -- --processes --no-log
```

Aktif MCP instance sayısı açık Codex pencereleriyle birlikte büyüyorsa dengeli
ana config'i kullan, `codex --profile full` profilini tek ana oturuma ayır ve
ikincil pencereleri `codex --profile multi-session` ile başlat. Açık temizlik
ön izlemesinde yalnız eski ve sahipsiz adaylar görünebilir. Ayrıntı için
[çoklu oturum süreç hijyenine](process-hygiene.tr.md) bak.

## Claude Code Hedefi

Kurulumdan sonra Claude Code AgentChef kuralını, plugin'ini, MCP sunucularını
veya skill'lerini göstermiyorsa:

```bash
npm run verify:install:runtime -- --target claude
claude plugin list
claude mcp list
```

Yeni bir oturum başlat; Claude Code kuralları, plugin'leri ve skill'leri
açılışta okur. `foreign` skill bağlantısı kararı, `~/.claude/skills/<ad>`
altında sana ait gerçek bir dizin olduğu anlamına gelir; AgentChef onu asla
değiştirmez. `user-changed` makbuz girdisi, AgentChef'in eklediği bir şeyi
düzenlediğini gösterir; senin içeriğin olarak korunur. Bkz.
[Claude skill bağlantıları](../kb/claude-skill-links.tr.md),
[Claude ayar birleştirme](../kb/claude-settings-merge.tr.md) ve
[Claude plugin önbelleği](../kb/claude-plugin-cache.tr.md).

## Onarım Yoğun Makinede Çalışmayı Reddediyor

Onarım, hiçbir şey yazmadan önce üç doğrulayıcı koşar ve biri çalışamazsa devam
etmeyi reddeder; bu yüzden onları başlatamayacak kadar yüklü bir makine, bozuk
bir kurulumla aynı görünür. Hata artık zaman aşımını ve ilgili ayarı söylüyor:

```text
Repair preflight approval-harmony timed out after 120000 ms. The machine may be
busy; retry, or raise AGENTCHEF_PREFLIGHT_TIMEOUT_MS (10000-1800000).
```

Önce makineyi yoran işi kapat, sonra yeniden dene. Makine yalnızca yavaşsa tek
bir koşu için bütçeyi yükselt:

```powershell
$env:AGENTCHEF_PREFLIGHT_TIMEOUT_MS = "300000"
npm run chef -- --repair
```

Yazmayı reddetmesi bilinçlidir: katalogları doğrulayamayan bir onarım, yönetilen
dosyaları yeniden yazmamalıdır.

## Windows Sandbox

Güncel Codex Windows modları native elevated sandbox, native unelevated sandbox
ve WSL2'dir. En güvenilir Windows yolu için güncel Windows üzerinde native
elevated sandbox kullan.

Sandbox setup hatası alırsan:

```powershell
codex doctor --summary
codex exec --strict-config "Summarize the active Codex setup."
```

Bir PATH binary'si sadece sandbox içinde kayboluyorsa config değiştirmeden önce
aynı shell içinde binary'yi doğrula ve farkı not et.

## Secret Scan Bulguları

Çalıştır:

```bash
gitleaks detect --redact --no-banner --no-git --verbose
```

Gerçek bir secret current tree veya history içinde görünüyorsa credential
compromised kabul edilir. Önce rotate veya revoke et, sonra cleanup planla.
