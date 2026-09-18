# Windows Notları

Resmi kaynak:

https://developers.openai.com/codex/windows

## Önerilen Duruş

- Windows repo'larında çalışırken native Windows sandbox'ı tercih et.
- Yönetici onaylı kurulum yapılabiliyorsa `elevated` sandbox en iyi yoldur.
- Toolchain Linux-native ise veya native Windows sandbox kurum politikasıyla
  engelleniyorsa WSL2 kullan.
- Repoları kullandığın ortamın native dosya sistemi altında tut. WSL için daha
  iyi I/O amacıyla repolar Linux home dizini altında olmalıdır.

## Starter Varsayılanları

Windows template şunu ayarlar:

```toml
[windows]
sandbox = "elevated"
sandbox_private_desktop = true
```

Makinen `elevated` sandbox kullanamıyorsa şuna düşebilirsin:

```toml
[windows]
sandbox = "unelevated"
```

Rutin çözüm olarak unrestricted erişime geçme. Sandbox'ı düzelt veya daha dar
bir profil kullan.

## Kullanışlı Kontroller

```powershell
codex doctor --summary
codex exec --strict-config "Summarize the active setup."
```

Repo script'lerinde, ozellikle otomasyon veya ajan process'lerinden
calistirirken PowerShell'de Windows command shim'lerini acikca kullan:

```powershell
npm.cmd run check
npm.cmd run token:audit
npm.cmd run verify:install:runtime -- --no-mcp-probe
npx.cmd --version
codex.cmd --version
npm.cmd run chef -- --processes --no-log
```

AgentChef'in programatik command resolver'i Windows'ta `npm.cmd`, `npx.cmd`
ve `codex.cmd`; Unix'te uzantisiz komutlari secer. Boylece interaktif shell'de
calisip ajan veya child process'te PowerShell script-policy ya da executable
resolution farki nedeniyle bozulan komutlar onlenir.

Windows MCP launcher'ları çoğu zaman katmanlı `cmd.exe`, `node.exe`, `uvx.exe`
ve `python.exe` ağaçları olarak görünür. Executable adına göre temizlik yapma.
Süreç denetimi `Win32_Process` parent/child ve oluşturulma zamanı metadata
bilgisini okur; bu bilgi yoksa fail-closed kalır ve temizlik adayı üretmez.
İkincil eşzamanlı pencerelerde `codex --profile multi-session` kullan ve
[çoklu oturum süreç hijyenine](process-hygiene.tr.md) bak.

Bir oturum içinde geçici ek okuma izni gerekiyorsa:

```text
/sandbox-add-read-dir C:\absolute\directory\path
```
