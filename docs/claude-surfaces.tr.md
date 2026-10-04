# Claude Code yüzeyleri

[English](claude-surfaces.md) | [Türkçe](claude-surfaces.tr.md)

Bu sayfa AgentChef'in dokunduğu her Claude Code yüzeyini, diskte nerede
yaşadığını, nasıl sahiplenildiğini ve nasıl doğrulanacağını listeler. Codex CLI
eşdeğeri [Codex yüzeyleri](codex-surfaces.tr.md) sayfasında; ikisi arasındaki
eşleme [hedef yetenek haritasında](target-capability-map.tr.md).

Kontrol tarihi: 2026-09-18 (Claude Code 2.1.276).

## Home dizinleri

| Kök | Varsayılan | Geçersiz kılma | Notlar |
| --- | --- | --- | --- |
| Claude config dizini | `~/.claude` | `CLAUDE_CONFIG_DIR` | `.claude.json` dosyasını da taşır; bu yüzden bir scratch dizini her şeyi izole eder. |
| User-scope MCP ve hesap durumu | `~/.claude.json` (home dizininde, `~/.claude` klasörünün yanında) | `CLAUDE_CONFIG_DIR` ayarlıysa `$CLAUDE_CONFIG_DIR/.claude.json`, ya da `--claude-json` | AgentChef yalnızca `mcpServers` anahtarını okur ve yazar; 1.3.0'dan beri yalnızca girdi kaldırmak için yazar (aşağıdaki MCP sunucuları satırına bak). |
| Paylaşımlı plugin kaynağı ve marketplace | `~/.agents` | `AGENTS_HOME` | Codex hedefiyle paylaşılır; AgentChef'in tüm skill'leri tek plugin kaynağında, `plugins/sources/agentchef/skills` altında durur. |

Geliştirme ve testler üçünü de bir scratch köküne yönlendirmelidir;
`npm run dev:assert-scratch` canlı home dizinlerini reddeder.

## Yönetilen yüzeyler

| Yüzey | Yol | Sahiplik | Çakışma politikası |
| --- | --- | --- | --- |
| Çalışma sözleşmesi | `~/.claude/rules/agentchef-working-agreement.md` | AgentChef dosyası, içerik hash'i | yedekle, sonra render edilen kaynak değiştiyse yenile |
| Serena bridge | `~/.claude/agentchef/serena-pool.mjs` | AgentChef dosyası | yedekle, sonra yenile; durum `CODEX_HOME/serena-pool` altında yaşar, böylece iki ajan tek tembel backend'i paylaşır |
| İzinler | `~/.claude/settings.json` → `permissions.allow`, `permissions.ask`, `permissions.deny` | yan receipt `~/.claude/agentchef/receipts/claude-settings-merge-receipt.json` | yalnızca toplamsal; mevcut kurallar, `env` ve hook'lar asla kaldırılmaz ya da yeniden sıralanmaz. Fragment, `default.rules` kaynaklı shell kurallarını ve `catalog/mcp-servers.json` kaynaklı MCP araç kurallarını taşır (Codex `approve` → `allow`, `prompt` → `ask`; codebase-memory'nin dört yönetim aracı ile Playwright'ın `browser_run_code_unsafe`, `browser_evaluate`, `browser_file_upload` araçları → `deny`). Bir `deny` kuralı yalnızca eklenir, asla geri alınmaz |
| Süreç hijyeni hook'u | `agentchef` plugin'i: `plugins/agentchef/.claude-plugin/plugin.json` içinde satır içi tanımlı bir `SessionEnd` hook'u (`node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude`, exec biçimi, 15 sn timeout, matcher yok) | plugin | `settings.json` içine hiçbir şey yazılmaz. Claude'un kendiliğinden yükleyeceği `hooks/hooks.json` içinde değildir; Codex kendi manifestinden `hooks/process-hygiene.json` dosyasını kullanır, böylece iki CLI de diğerinin hook'unu yüklemez. Claude süreci kapandıktan sonra ayrık tarama yalnızca o oturumun başlattığı MCP ağaçlarını, Codex tarafıyla aynı kimlik doğrulamalarıyla durdurur; bkz. [süreç hijyeni](process-hygiene.tr.md#claude-code-oturum-sonu) |
| MCP sunucuları | `agentchef` plugin'i: `plugins/agentchef/mcp/claude.mcp.json` `context7` ve `serena` sunucularını getirir; araç adları `mcp__plugin_agentchef_<server>__<tool>` biçimindedir | plugin; önceki sürümlerin yazdıkları için receipt `claude-mcp-merge-receipt.json` | 1.3.0'dan beri `~/.claude.json` içine hiçbir şey yazılmaz. 1.0–1.2 kurulumunun oraya yazdığı girdi, değeri makbuzdaki hash ile hâlâ eşleşiyorsa kaldırılır; çünkü kullanıcı kapsamlı girdi plugin sunucusunun önüne geçer. Bu adlardan biriyle kendi eklediğin girdi korunur ve plugin'i gölgelediği bildirilir; `-AdoptMcp` / `--adopt-mcp` onu yedekledikten sonra kaldırır. `playwright` ve `chrome-devtools` plugin'de yoktur, çünkü Claude Code tek bir plugin sunucusunu ayrı kapatamaz (yalnızca `--strict-mcp-config` tüm sunucuları kapatır); onları browser kanıtı gereken projeye ekle (`claude mcp add --scope project`, bkz. [MCP Kataloğu](mcp-catalog.tr.md)) |
| Skill'ler | `~/.agents/plugins/sources/agentchef/skills/<name>`; Claude Code bunları kendi plugin cache'inden yükler | `agentchef` plugin'i | 1.3.0'dan beri `~/.claude/skills` altına hiçbir bağlantı kurulmaz; 1.0–1.2 kurulumunun receipt'e yazdığı bağlantılar ancak plugin başarıyla kaydedildikten sonra emekli edilir, yabancı bağlantı ve dizinlere asla dokunulmaz; `--adopt-skill-links` etkisizdir |
| Plugin marketplace | `~/.agents/plugins/.claude-plugin/marketplace.json` | AgentChef dosyası | yedekle, sonra yenile |
| Plugin kurulumu | Claude'un plugin cache'i | Claude Code (`claude plugin`) | AgentChef `claude plugin marketplace add` ve `claude plugin install agentchef@agentchef --scope user` çalıştırır; cache'teki kopya kaynaktan farklıysa (örneğin pinned skill'ler yeni yazıldığında) plugin'i yeniden kurar (önce uninstall, sonra install); cache'i asla doğrudan yazmaz |
| Kurulum receipt'i | `~/.claude/agentchef/install-receipt.json` | AgentChef dosyası | status, repair ve kaldırma için kurulan dosyaları, bağlantıları, receipt'leri ve komutları listeler |
| Yedekler, journal, kilit | `~/.claude/agentchef/backups/agentchef-*`, `.agentchef-operation-journal.json`, `.agentchef-operation.lock` | AgentChef | Codex hedefiyle aynı transaction makinesi |

## Komutlar

```powershell
node scripts/install-claude-target.mjs                 # yalnız plan
node scripts/install-claude-target.mjs --apply         # kurulum
node scripts/install-claude-target.mjs --json --redact-paths
.\scripts\install.ps1 -Target both -WhatIf              # iki hedef, ön izleme
./scripts/install.sh --target=claude --dry-run          # yalnız Claude, ön izleme
```

İnteraktif kurulumlar `PATH` üzerinde `codex` ve `claude` komutlarını algılar
ve hangi hedeflerin yönetileceğini sorar. İnteraktif olmayan kurulumlar,
`--target claude` veya `--target both` verilmedikçe Codex hedefini yönetir;
Claude hedefi asla örtük olarak seçilmez.

### Güncelleme

`npm run chef -- --update --apply` kurulu hedefleri yeniler. Kurulum makbuzu
varsa Claude hedefini, yönetilen dosyaları varsa Codex hedefini yeniler. Açıkça
seçmek için `--target codex|claude|both` ver. Doğrudan biçimi
`.\scripts\install.ps1 -Update -Target both` (Windows) veya
`./scripts/install.sh --update --target=both` olur. Güncelleme Claude Code'u
yeni plugin sürümüne de taşır. 1.1.0'ın kendisinde `claude plugin install`
plugin'i eski sürümünde bırakıyordu; `claude plugin list` hâlâ önceki sürümü
gösteriyorsa bunu bir kez çalıştır:

```text
claude plugin marketplace update agentchef
claude plugin update agentchef@agentchef
```

## Doğrulama

```powershell
npm run verify:install:runtime -- --target claude
claude --version
claude plugin validate "$env:AGENTS_HOME\plugins\sources\agentchef"
claude mcp list
```

Bir Claude Code oturumunda `/context`, yüklenen kural dosyasını **Memory
files** altında listeler; `/plugin` marketplace'i ve kurulu plugin'i, `/skills`
ise plugin skill'lerini birer kez (`/agentchef:<skill>`) listeler.

## Kaldırma

```powershell
node scripts/install-claude-target.mjs --remove           # ön izleme
node scripts/install-claude-target.mjs --remove --apply
```

Kaldırma yalnızca kurulum receipt'inde listelenen ve hash'i hâlâ eşleşen
dosyaları siler, yalnızca eski bir kurulumun kaydettiği, AgentChef'in oluşturduğu bağlantıları kaldırır ve
yalnızca güncel değeri değişmemiş receipt girdilerini geri alır. `CLAUDE.md`,
`~/.claude/agents/`, yabancı skill'ler veya `.claude.json` içindeki diğer
anahtarlara asla dokunmaz.
