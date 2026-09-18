# Codex CLI Flagleri

Güncel kaynak:

https://developers.openai.com/codex/cli/reference

## Önemli Global Flagler

| Flag | Kullanım |
| --- | --- |
| `--cd`, `-C` | Codex'i belirli çalışma klasöründe başlatır. |
| `--model`, `-m` | Tek çalıştırma için modeli override eder. |
| `--ask-for-approval`, `-a` | Onay davranışını seçer: örnek `on-request`, `never`. |
| `--sandbox`, `-s` | `read-only`, `workspace-write`, `danger-full-access` seçer. |
| `--config`, `-c` | Tek invocation için config key override eder. |
| `--profile`, `-p` | `~/.codex/<profile>.config.toml` dosyasını base config üstüne bindirir. |
| `--add-dir` | Ek klasöre workspace yanında yazma erişimi verir. |
| `--image`, `-i` | İlk prompt'a görsel ekler. |
| `--search` | Live web search açar. |
| `--strict-config` | Bilinmeyen config alanında hata verir; template değişince iyi kontroldür. |
| `--enable` / `--disable` | Feature flag'i tek run için açar/kapatır. |
| `--oss` | Konfigüre edilmiş local open-source model provider'ı kullanır. |
| `--remote` | TUI'yi app-server endpoint'e bağlar. |
| `--remote-auth-token-env` | Remote bearer token'ı env var üzerinden okur. |
| `--dangerously-bypass-approvals-and-sandbox` | Normal lokal geliştirme için kullanma. |
| `--dangerously-bypass-hook-trust` | Sadece hook source dışarıda ayrıca doğrulanıyorsa. |

AgentChef uc istege bagli MCP maliyet profili kurar. Acikca secilmedikce dengeli varsayilani degistirmezler:

```bash
codex --profile full
codex --profile multi-session
codex --profile offline
```

`offline`, istege bagli izole oturum profilidir: Chef-managed tum MCP aktarimlarini kapatir; varsayilan ajan, skill, shell/browser veya web-search ag izinlerini degistirmez.

Agent veya MCP etkinlestirmeden deterministik route onerisi icin:

```bash
npm run codex:routing -- --task "offline MCP profile"
```

Sonuc sadece oneridir ve en fazla uc catalog route dondurur. Agirlikli katalog
ifadeleri ve tum-kelime terimleri kullanir, Turkce karakterleri normalize eder,
eslesen sinyalleri ve guven seviyesini gosterir. Esitlikte belgelenmis profil
onceligi, sonra catalog sirasi kullanilir. Deterministiktir; gizli model cagrisi,
agent baslatma, MCP acma veya onay ayari degisikligi yapmaz.

`full`, tek ana oturumda bütün bundled lokal stdio MCP'leri açar.
`multi-session`, ikincil eşzamanlı oturumlarda lokal stdio MCP'leri kapatır;
agent, skill, uzak OpenAI docs, built-in memory, hook ve app yüzeylerini korur.

Sahiplik farkındalıklı AgentChef süreç komutları:

```bash
npm run chef -- --processes --no-log
npm run chef -- --processes --cleanup-stale --no-log
npm run chef -- --processes --cleanup-stale --apply --no-log
```

İlk iki komut yazmasızdır. Son komut ayrıca onaylı tam hedefli temizlik yoludur;
ayrıntı için [çoklu oturum süreç hijyenine](process-hygiene.tr.md) bak.

## Runtime Dogrulama Davranisi

`npm run verify:install:runtime` once managed dosya esligini, sonra kurulu Codex
home, MCP envanteri ve plugin durumunu kontrol eder. Buyuk yerel rollout gecmisi
`codex doctor --json` komutunu yavaslatabilir; hedef MCP ve plugin problari
tamamlaniyorsa sinirli doctor timeout'u yanlis bir kurulum hatasi degil
`attention` uyarisi olur. Farkli bir ambient `CODEX_HOME` karsilastirmasi ancak
ozellikle gerekiyorsa `--ambient-doctor` kullanin.

## Güvenli Başlangıçlar

İnteraktif çalışma:

```bash
codex --sandbox workspace-write --ask-for-approval on-request
```

Sadece review:

```bash
codex --sandbox read-only --ask-for-approval never
```

Config kontrolü:

```bash
codex exec --strict-config "Summarize the active setup."
```

`danger-full-access` ve bypass flagleri standart çözüm değildir. Sadece dışarıdan
izole edilmiş, atılabilir ortamda kullan.

## MCP Config Alanlari

MCP davranisi genelde tek seferlik CLI flaglerinden degil `config.toml`
alanlarindan yonetilir.
Gorev bu alanlardan birine denk geliyorsa alan bilerek kullanilir. Approval
policy, tool exposure, timeout veya auth source sadece prose'a birakilmaz.

| Alan | Kullanim |
| --- | --- |
| `enabled` | Server block'unu silmeden ac/kapat. |
| `default_tools_approval_mode` | Server geneli tool onayi: `approve`, `prompt` veya `auto`. |
| `enabled_tools` / `disabled_tools` | Belirli server icin allow-list veya deny-list. |
| `startup_timeout_sec` | Server baslama suresini sinirlar. |
| `tool_timeout_sec` | Tek tool cagrisinin suresini sinirlar. |
| `required` | Enabled server baslamazsa Codex startup'i fail eder; opsiyonel lokal tool'larda dikkatli kullan. |
| `bearer_token_env_var`, `env_vars`, `env_http_headers` | Secret'lari dosyadan degil environment variable'dan okur. |
| `mcp_oauth_callback_port`, `mcp_oauth_callback_url` | OAuth provider sabit callback istediginde kullan. |

## App Ve Connector Default'lari

ChatGPT Apps/connectors kendi `apps.*` config yuzeyini kullanir. Bunu MCP
server ayarlarindan ayri tut; boylece connector tool exposure review edilebilir
kalir.

| Alan | Starter default'u | Kullanim |
| --- | --- | --- |
| `apps._default.enabled` | `false` | Belirli connector incelenip acilmadan app/connector yuzeyini park halinde tutar. |
| `apps._default.destructive_enabled` | `false` | Destructive davranis bildiren tool'lari default olarak kapatir. |
| `apps._default.open_world_enabled` | `false` | Genis open-world davranis bildiren tool'lari default olarak kapatir. |
| `apps.<id>.tools.<tool>.approval_mode` | unset | Sadece belirli bir connector tool'u review edildiyse kullan. |

## Acik Tutulmasi Gereken Gelismis Ozellikler

- `approval_policy = { granular = { ... } }` ileri operatorler icin faydalidir;
  bu starter daha kolay aciklanir ve audit edilir oldugu icin `on-request`
  kullanir.
- `default_permissions` ve `[permissions.*]` beta permission-profile yuzeyidir.
  Ayni starter template'inde `sandbox_mode` ve `[sandbox_workspace_write]` ile
  karistirma.
- `[features].network_proxy` scoped sandbox networking saglayabilir; default
  yine network-off kalir. Allowlisted domain'leri sadece review edilmis profile
  icin ekle.
- `[features].undo` opt-in kolayliktir; backup, dry-run ve Git review yerine
  gecmez.
