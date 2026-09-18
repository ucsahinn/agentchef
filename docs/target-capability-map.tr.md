# Hedef yetenek haritası

[English](target-capability-map.md) | [Türkçe](target-capability-map.tr.md)

AgentChef tek bir katalog tutar ve onu iki terminal ajanı için render eder. İki
harness aynı düğmeleri sunmaz; bu sayfa yüzey yüzey neyin temiz eşlendiğini,
neyin yalnızca kısmen eşlendiğini ve neyin karşılığı olmadığını belirtir.
**Eşlenmiyor** olarak listelenen her şey belgelenmiş davranıştır; installer'ın
üstünü örttüğü bir boşluk değildir.

Kontrol tarihi: 2026-09-18 (Codex CLI 0.154, Claude Code 2.1.276).

## Kurulum yüzeyleri

| Yüzey | OpenAI Codex CLI | Anthropic Claude Code | Durum |
| --- | --- | --- | --- |
| Global çalışma sözleşmesi | `~/.codex/AGENTS.md` (yedekle, sonra mevcut değilse değiştir) | `~/.claude/rules/agentchef-working-agreement.md` (kullanıcı seviyesi kural; kullanıcının kendi `~/.claude/CLAUDE.md` dosyası asla düzenlenmez) | eşleniyor, aynı kaynak metin |
| Repo-yerel öncelik | repo `AGENTS.md` global olanı ezer | proje `CLAUDE.md` ve `.claude/rules/` kullanıcı kurallarından sonra yüklenir | eşleniyor |
| Ayarlar | `~/.codex/config.toml` (eksik yönetilen tabloları birleştir) | `~/.claude/settings.json` (`permissions` ve istek üzerine `hooks` için toplamsal birleştirme; yan receipt'e kaydedilir) | kısmi: farklı sahiplik modeli |
| MCP sunucuları | `config.toml` içindeki `[mcp_servers.*]` tabloları | `.claude.json` içindeki user-scope `mcpServers` (toplamsal birleştirme, receipt) | `context7` ve Serena bridge için eşleniyor; diğer katalog sunucuları `claude mcp add` komutlarıyla belgelenir |
| Runtime MCP profilleri (`full`, `multi-session`, `offline`, `token-safe`, ...) | üretilen `*.config.toml` profilleri | profil kavramı yok | **eşlenmiyor** |
| Uzman ajanlar | `~/.codex/agents/*.toml` (32 rol dosyası) | `plugins/codex-chef-workflows/agents/*.md` altında `agentchef:<role>` plugin subagent'ları; `~/.claude/agents/` dokunulmaz | eşleniyor, ad-alanlı |
| Koordinatörden worker'a zorlama | rol config'inde kataloğa bağlı worker listeleri | koordinatör subagent'ları `Agent(agentchef:<worker>, ...)` araç allowlist'i bildirir; zorlama katalogla değil araç izniyle olur | kısmi |
| Bundled workflow skill'leri | `~/.agents/skills/<name>` altında doğrudan kopyalar artı plugin | `~/.claude/skills/<name>` dizin bağlantıları aynı yönetilen `~/.agents/skills/<name>` ağacına işaret eder, artı plugin | eşleniyor, tek yönetilen kopya |
| Küratörlü commit-pinned skill'ler | provenance marker'lı `~/.agents/skills/<name>` | aynı ağaç, aynı dizin bağlantılarıyla Claude'a açılır | eşleniyor |
| Plugin dağıtımı | `~/.codex/plugins/codex-chef-workflows` kopyası artı AgentChef'in yazdığı `~/.agents/plugins/marketplace.json` | AgentChef'in yazdığı `~/.agents/plugins/.claude-plugin/marketplace.json`; kurulum yalnız `claude plugin marketplace add` ve `claude plugin install` ile; Claude'un kendi plugin cache'i asla elle yazılmaz | kısmi: farklı sahiplik modeli |
| Onay kuralları | `~/.codex/rules/default.rules` prefix kuralları (`allow` / `prompt`) | aynı dosyadan üretilen `permissions.allow` ve `permissions.ask` kuralları (`Bash(...)`, `PowerShell(...)`); hiçbir şey `deny` olarak üretilmez | eşleniyor (allow, prompt); taşınmayanlar için aşağıya bakın |
| Oturum sonu süreç hijyeni hook'u | Codex'in güvendiği plugin hook'u `hooks/process-hygiene.json` | plugin hook'u `hooks/hooks.json`, `settings.json` içinde varsayılan kapalı; `--install-process-hygiene` ile açılır | kısmi |
| Global Git guard'ları | paylaşımlı `~/.githooks/pre-commit`, `~/.gitignore_global`, `core.hooksPath`, `core.excludesfile` | aynı dosyalar; iki hedef için bir kez sahiplenilen tek global slot | eşleniyor, paylaşımlı |
| Yedekler, journal, kilit | journal ve kilit dizinleriyle `~/.codex/backups/<prefix>-*` | aynı journal biçimiyle `~/.claude/agentchef/backups/agentchef-*`; kilit `~/.claude` ve `~/.agents` üzerinde | eşleniyor |
| Runtime doğrulama | `codex doctor`, `codex mcp list`, kurulu dosya drift'i | `claude --version`, `claude plugin validate`, `claude mcp list`, receipt doğrulaması, bağlantı doğrulaması | eşleniyor |

## İzin ve sandbox semantiği

| Codex ayarı | Claude Code karşılığı | Durum |
| --- | --- | --- |
| `approval_policy = "on-request"` | `permissions.defaultMode = "default"` artı üretilen `ask` kuralları | kısmi |
| `approval_policy = "never"`, `"on-failure"`, `"untrusted"` | eşdeğer eksen yok; AgentChef `bypassPermissions` asla yazmaz | **eşlenmiyor** |
| `approvals_reviewer = "auto_review"` | `auto` izin modu kullanıcı tercihidir, asla kurulmaz | **eşlenmiyor** |
| Bir rolde `sandbox_mode = "read-only"` | subagent `tools: Read, Grep, Glob` ve `disallowedTools: Write, Edit, NotebookEdit, Bash` | kısmi: OS sandbox'ı değil, araç izni |
| `sandbox_mode = "workspace-write"` | subagent araçlarına `Edit`, `Write`, `Bash` dahildir; workspace sınırlaması Claude'un çalışma dizini kurallarından ve isteğe bağlı sandboxing'den gelir | kısmi |
| `sandbox_workspace_write.network_access` | AgentChef'in yönettiği ayarlarda karşılığı yok | **eşlenmiyor** |
| `[projects."path"].trust_level` | klasör güven istemi ve `.claude/settings.local.json` | installer tarafından **eşlenmiyor** |
| `[features]`, `[memories]`, `[apps]` | karşılığı yok | **eşlenmiyor** |
| `[mcp_servers.X.tools.Y]` onay tabloları | `permissions` içindeki `mcp__X__Y` kuralları | sunucunun kurulu olduğu yerde eşleniyor |
| Hook güveni: Codex hook'u etkinleştirmeden önce tam kaynağını inceler | Claude, plugin etkinleştirilir etkinleştirilmez plugin hook'larını, birleştirilen `settings.json` hook'larını ise hemen çalıştırır | **güvenlik farkı**: AgentChef Claude hook'unu varsayılan olarak kapalı tutar |

## Sahiplik modeli farkları

- Codex: yönetilen her dosya bir marker ya da yönetilen tablo banner'ı taşır;
  drift ve repair dosyanın kendisinden hesaplanır.
- Claude Code: `settings.json` ve `.claude.json`, Claude'un yeniden yazdığı,
  vendor'a ait JSON dosyalarıdır. AgentChef eklediklerini
  `~/.claude/agentchef/receipts/` altındaki yan receipt'lere kaydeder (JSON
  pointer artı değer hash'i). Repair, status ve kaldırma yalnızca güncel değeri
  receipt ile hâlâ eşleşen girdiler üzerinde işlem yapar.
- Claude'da plugin kaydı `claude plugin` CLI'ına devredilir. CLI yoksa
  installer tam komutları basar ve devam eder.

## AgentChef'in iki hedefte de yapmayı reddettikleri

- `bypassPermissions`, `dontAsk`, geniş `allow` joker karakterleri, HTTP
  hook'ları veya `disableAllHooks` yazmak.
- `~/.claude/skills/` altındaki yabancı bir gerçek dizini bağlantıyla
  değiştirmek; yalnızca AgentChef marker'lı kopyalar benimsenir, o da yalnız
  `--adopt-skill-links` ile.
- `~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth durumu, proje geçmişi veya
  `.claude.json` içinde `mcpServers` dışındaki herhangi bir anahtarı
  düzenlemek.
