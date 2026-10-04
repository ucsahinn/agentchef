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
| Ayarlar | `~/.codex/config.toml` (eksik yönetilen tabloları birleştir) | `~/.claude/settings.json` (`permissions` için toplamsal birleştirme, yan receipt'e kaydedilir; `hooks` ve `env` alanlarına asla dokunulmaz, mevcut `deny` kuralları asla kaldırılmaz) | kısmi: farklı sahiplik modeli |
| Uzman içindeki MCP araçları | tanımlı her sunucu, rolün onay kurallarına tabi | subagent `tools:` listesi bir izin listesidir; rol yalnızca kendi bildirdiği MCP girdilerine erişir. Her rol kendi talimatlarının kullandığı sunucuları bildirir: doküman okuyan roller Context7'yi, `code-mapper` Serena köprüsünü, `frontend-verifier` ise bir projenin katalogdan ekleyebileceği Playwright ile Chrome DevTools'u bildirir; plugin'in getirdiği bir sunucu için yetki hem `mcp__plugin_agentchef_<sunucu>` hem de düz `mcp__<sunucu>` biçimini taşır, böylece kendi girdin plugin'i gölgelerken de rol çalışmaya devam eder; başka hiçbir şey verilmez | eşleşti, Claude'da bilinçli olarak daha dar |
| MCP sunucuları | `config.toml` içindeki `[mcp_servers.*]` tabloları | `agentchef` plugin'i getirir (`plugins/agentchef/mcp/claude.mcp.json`); 1.0–1.2 kurulumunun `.claude.json` içine yazdığı girdiler receipt hash'iyle kaldırılır | `context7` ve Serena bridge için eşleniyor; `.claude.json` içinde aynı adlı kendi girdin korunur, plugin'inkinin önüne geçer ve kurucu ile doğrulayıcı bunu bildirir (`-AdoptMcp` / `--adopt-mcp` onu yedekleyip kaldırır). Claude Code tek bir plugin sunucusunu kapatamadığı için `playwright` ve `chrome-devtools` plugin'de yoktur: bir görev browser kanıtı gerektirdiğinde onları `claude mcp add --scope project` ile projeye ekle (Codex `full` profili onları açar). Diğer katalog sunucularını `catalog/mcp-servers.json` içindeki komut ve argümanlarla `claude mcp add --scope user` kullanarak kendin ekle |
| Runtime MCP profilleri (`full`, `multi-session`, `offline`, `token-safe`, ...) | üretilen `*.config.toml` profilleri | profil kavramı yok | **eşlenmiyor** |
| Uzman ajanlar | `~/.codex/agents/*.toml` (28 rol dosyası) | `plugins/agentchef/agents/*.md` altında `agentchef:<role>` plugin subagent'ları; `~/.claude/agents/` dokunulmaz | eşleniyor, ad-alanlı |
| Koordinatörden worker'a zorlama | rol config'inde kataloğa bağlı worker listeleri | koordinatör subagent'ları `Agent(agentchef:<worker>, ...)` araç allowlist'i bildirir; zorlama katalogla değil araç izniyle olur | kısmi |
| Bundled workflow skill'leri | `~/.agents/plugins/sources/agentchef/skills/<name>` kaynağından `$agentchef:<skill>` plugin skill'leri; `~/.agents/skills` altında doğrudan kopya yok | aynı plugin kaynağından `/agentchef:<skill>` plugin skill'leri; `~/.claude/skills` altına hiçbir şey bağlanmaz | eşleniyor, tek kaynak plugin |
| Küratörlü commit-pinned skill'ler | provenance kaydıyla `~/.agents/plugins/sources/agentchef/skills/<name>` altına yazılır | aynı plugin kaynağı; Claude'a da plugin üzerinden ulaşır | eşleniyor |
| Plugin dağıtımı | `~/.codex/plugins/agentchef` kopyası artı AgentChef'in yazdığı `~/.agents/plugins/marketplace.json` | AgentChef'in yazdığı `~/.agents/plugins/.claude-plugin/marketplace.json`; kurulum yalnız `claude plugin marketplace add` ve `claude plugin install --scope user` ile (cache'teki kopya kaynaktan farklıysa yeniden kurulur); Claude'un kendi plugin cache'i asla elle yazılmaz | kısmi: farklı sahiplik modeli |
| Onay kuralları | `~/.codex/rules/default.rules` prefix kuralları (`allow` / `prompt`) | aynı dosyadan üretilen `permissions.allow` ve `permissions.ask` kuralları (`Bash(...)`, `PowerShell(...)`); shell kuralları asla `deny` olarak üretilmez | eşleniyor (allow, prompt); taşınmayanlar için aşağıya bakın |
| Oturum sonu süreç hijyeni hook'u | Codex'in güvendiği plugin hook'u `hooks/process-hygiene.json` | `plugins/agentchef/.claude-plugin/plugin.json` içinde satır içi tanımlı, aynı betiği `--runtime claude` ile çalıştıran `SessionEnd` hook'u (exec biçimi, 15 sn timeout); iki CLI de diğerinin hook'unu yüklemez | eşleniyor |
| Global Git guard'ları | paylaşımlı `~/.githooks/pre-commit`, `~/.gitignore_global`, `core.hooksPath`, `core.excludesfile` | aynı dosyalar; iki hedef için bir kez sahiplenilen tek global slot | eşleniyor, paylaşımlı |
| Yedekler, journal, kilit | journal ve kilit dizinleriyle `~/.codex/backups/<prefix>-*` | aynı journal biçimiyle `~/.claude/agentchef/backups/agentchef-*`; kilit `~/.claude` ve `~/.agents` üzerinde | eşleniyor |
| Runtime doğrulama | `codex doctor`, `codex mcp list`, kurulu dosya drift'i | `claude --version`, `claude plugin validate`, `claude mcp list`, receipt doğrulaması, plugin kaynağındaki skill doğrulaması | eşleniyor |

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
| `[mcp_servers.X.tools.Y]` onay tabloları ve `disabled_tools` | `catalog/mcp-servers.json` kaynağından üretilir: `approve` → `allow`, `prompt` → `ask`, codebase-memory'nin yönetim araçları ile Playwright'ın `browser_run_code_unsafe`, `browser_evaluate`, `browser_file_upload` araçları → `deny` | izin kuralı olarak eşleniyor; Claude Code'da sunucu başına araç izin listesi yok, kuralı olmayan araç yine sorar |
| Bir `allow` önek kuralı Codex OS sandbox'ı içinde çalışır | Claude Code'da varsayılan OS sandbox'ı yoktur; açık bir `allow` kuralı ayrıca kendi salt-okunur bayrak analizini de atlar | **daraltıldı**: yalnızca Claude'a özel `ask` kuralları komutun herhangi bir yerindeki `rg --pre`, `git diff/log/show --output` ve `--ext-diff`, `gitleaks --report-path` biçimlerini korur (Codex `rg --pre` ve `rg --pre-glob` için yalnızca ilk argümanken sorar, çünkü önek kuralı sonrasını görmez); `node --check` ve `git ls-remote` iki hedefte de onay ister |
| Hook güveni: Codex hook'u etkinleştirmeden önce tam kaynağını inceler | Claude, plugin etkinleştirilir etkinleştirilmez plugin hook'larını çalıştırır | **güvenlik farkı**: AgentChef'in Claude Code'a yayınladığı tek hook (süreç hijyeni `SessionEnd` hook'u) hash incelemesi olmadan çalışır; `/hooks` ile incele, üretilen manifest saparsa `npm run check` başarısız olur |

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
- `~/.claude/skills/` ya da `~/.agents/skills/` altında sana ait bir şeyi
  yazmak, bağlamak veya kaldırmak; yalnızca AgentChef'in 1.0–1.2'de
  oluşturduğunu kanıtlayabildiği bağlantı ve kopyalar emekli edilir (bkz.
  [Claude skill bağlantıları](../kb/claude-skill-links.tr.md)).
- `~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth durumu, proje geçmişi veya
  `.claude.json` içinde `mcpServers` dışındaki herhangi bir anahtarı
  düzenlemek.
