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
| User-scope MCP ve hesap durumu | `~/.claude.json` (home dizininde, `~/.claude` klasörünün yanında) | `CLAUDE_CONFIG_DIR` ayarlıysa `$CLAUDE_CONFIG_DIR/.claude.json`, ya da `--claude-json` | AgentChef yalnızca `mcpServers` anahtarını okur ve yazar. |
| Paylaşımlı skill'ler ve plugin marketplace | `~/.agents` | `AGENTS_HOME` | Codex hedefiyle paylaşılır; tek yönetilen ağaç. |

Geliştirme ve testler üçünü de bir scratch köküne yönlendirmelidir;
`npm run dev:assert-scratch` canlı home dizinlerini reddeder.

## Yönetilen yüzeyler

| Yüzey | Yol | Sahiplik | Çakışma politikası |
| --- | --- | --- | --- |
| Çalışma sözleşmesi | `~/.claude/rules/agentchef-working-agreement.md` | AgentChef dosyası, içerik hash'i | yedekle, sonra render edilen kaynak değiştiyse yenile |
| Serena bridge | `~/.claude/agentchef/serena-pool.mjs` | AgentChef dosyası | yedekle, sonra yenile; durum `CODEX_HOME/serena-pool` altında yaşar, böylece iki ajan tek tembel backend'i paylaşır |
| İzinler | `~/.claude/settings.json` → `permissions.allow`, `permissions.ask` | yan receipt `~/.claude/agentchef/receipts/claude-settings-merge-receipt.json` | yalnızca toplamsal; mevcut kurallar, `deny` listeleri, `env` ve hook'lar asla kaldırılmaz ya da yeniden sıralanmaz |
| Süreç hijyeni hook'u | bu sürümde yayınlanmaz | yalnızca Codex plugin'i | Claude Code oturum sonunda kendi MCP alt süreçlerini durdurur; Claude dalı sonraki bir sürüm için planlıdır |
| MCP sunucuları | `~/.claude.json` → `mcpServers.context7`, `mcpServers.serena` | receipt `claude-mcp-merge-receipt.json` | aynı ada sahip bir sunucuya dokunulmaz; tek istisna, güncellemenin sahipliği kanıtlayabildiği durumdur: değer makbuzdaki hash ile eşleşiyorsa girdi yenilenir, böylece katalogdaki sürüm yükseltmesi kurulu home'a ulaşır |
| Skill bağlantıları | `~/.claude/skills/<name>` → `~/.agents/skills/<name>` | dizin bağlantısı (Windows'ta junction) | yabancı gerçek dizinler atlanır; AgentChef marker'lı kopyalar yalnız `--adopt-skill-links` ile benimsenir; katalogdan çıkmış yönetilen dizinler `retired` olarak raporlanır ve dokunulmaz |
| Plugin marketplace | `~/.agents/plugins/.claude-plugin/marketplace.json` | AgentChef dosyası | yedekle, sonra yenile |
| Plugin kurulumu | Claude'un plugin cache'i | Claude Code (`claude plugin`) | AgentChef `claude plugin marketplace add` ve `claude plugin install agentchef-workflows@agentchef` çalıştırır; cache'i asla doğrudan yazmaz |
| Kurulum receipt'i | `~/.claude/agentchef/install-receipt.json` | AgentChef dosyası | status, repair ve kaldırma için kurulan dosyaları, bağlantıları, receipt'leri ve komutları listeler |
| Yedekler, journal, kilit | `~/.claude/agentchef/backups/agentchef-*`, `.agentchef-operation-journal.json`, `.agentchef-operation.lock` | AgentChef | Codex hedefiyle aynı transaction makinesi |

## Komutlar

```powershell
node scripts/install-claude-target.mjs                 # yalnız plan
node scripts/install-claude-target.mjs --apply         # kurulum
node scripts/install-claude-target.mjs --json --redact-paths
.\scripts\install.ps1 -Target both -WhatIf              # iki hedef, ön izleme
./scripts/install.sh --target claude --dry-run          # yalnız Claude, ön izleme
```

İnteraktif kurulumlar `PATH` üzerinde `codex` ve `claude` komutlarını algılar
ve hangi hedeflerin yönetileceğini sorar. İnteraktif olmayan kurulumlar,
`--target claude` veya `--target both` verilmedikçe Codex hedefini yönetir;
Claude hedefi asla örtük olarak seçilmez.

## Doğrulama

```powershell
npm run verify:install:runtime -- --target claude
claude --version
claude plugin validate "$env:AGENTS_HOME\plugins\sources\agentchef-workflows"
claude mcp list
```

Bir Claude Code oturumunda `/context`, yüklenen kural dosyasını **Memory
files** altında listeler; `/plugin` marketplace'i ve kurulu plugin'i, `/skills`
ise bağlantılı skill'leri gösterir.

## Kaldırma

```powershell
node scripts/install-claude-target.mjs --remove           # ön izleme
node scripts/install-claude-target.mjs --remove --apply
```

Kaldırma yalnızca kurulum receipt'inde listelenen ve hash'i hâlâ eşleşen
dosyaları siler, yalnızca AgentChef'in oluşturduğu bağlantıları kaldırır ve
yalnızca güncel değeri değişmemiş receipt girdilerini geri alır. `CLAUDE.md`,
`~/.claude/agents/`, yabancı skill'ler veya `.claude.json` içindeki diğer
anahtarlara asla dokunmaz.
