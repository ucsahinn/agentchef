# Harness Haritası

[English](harness-map.md) | [Türkçe](harness-map.tr.md)

Harness, AgentChef'in bir ajanın çalışması için kurduğu her şeydir: skill'ler,
agent rolleri ve MCP sunucuları. Bu sayfa onları sayar, her birinin her hedefte
nereden geldiğini söyler ve `npm run chef -- --inventory` komutunun makinendeki
durumlarını nasıl raporladığını anlatır.

## Harness Nedir

AgentChef tek bir plugin getirir: `agentchef`. Skill'leri, agent rollerini ve
Claude Code'un plugin'den yüklediği MCP sunucularını bu plugin taşır. Codex CLI
skill'leri aynı plugin'den okur; agent rolleri ve MCP sunucuları ise Codex
home'unda durur: rol dosyaları `agents/` altında, `[mcp_servers.*]` tabloları
`config.toml` içinde.

Makinedeki diğer her şey (kendi skill'lerin, rollerin ve MCP sunucuların)
harness'in parçası değildir. Envanter bunları harness'in yanında neler olduğunu
görebilmen için listeler, ama hiçbirini değiştirmez.

## Sayılar

Sayılar katalogdan gelir; envanter de aynı toplamları aynı dosyalardan
hesapladığı için ikisi birbirinden farklı çıkamaz.

| Bileşen | Sayı | Katalog kaynağı |
| --- | --- | --- |
| Bundled skill'ler | 11 | `catalog/skills.json`, `directInstall: true` |
| Sabitlenmiş (pinned) upstream skill'ler | 18 | `catalog/skills.json`, `install: true` |
| Toplam harness skill'i | 29 | bundled + pinned |
| Uzman roller | 21 | `catalog/agents.json`, `agents` |
| Koordinatör roller | 7 | `catalog/agents.json`, `coordinators` |
| Toplam agent rolü | 28 | uzmanlar + koordinatörler |
| MCP sunucuları | 14 | `catalog/mcp-servers.json` |
| Codex'te varsayılan açık MCP sunucuları | 2 | `defaultEnabled: true` (`openaiDeveloperDocs`, `serena`) |
| Claude Code plugin'inin getirdiği MCP sunucuları | 2 | `claudeSource: "plugin"` (`context7`, `serena`); Playwright ve Chrome DevTools proje başına eklenir |

## Her Bileşen Nereden Gelir

Home dizinleri `CODEX_HOME`, `AGENTS_HOME` ve `CLAUDE_CONFIG_DIR` değerlerinden
çözülür; varsayılanlar `~/.codex`, `~/.agents` ve `~/.claude`'dur.

| Bileşen | Codex CLI | Claude Code |
| --- | --- | --- |
| Skill'ler | plugin kaynağı, `~/.agents/plugins/sources/agentchef/skills/<name>` | aynı plugin kaynağı, Claude Code'un plugin cache'inden yüklenir |
| Agent rolleri | `~/.codex/agents/<name>.toml` | plugin'in `agents/<name>.md` dosyaları |
| MCP sunucuları | `~/.codex/config.toml` içinde `[mcp_servers.<name>]`; ikisi açık, diğerleri mevcut ama kapalı | plugin'in `mcp/claude.mcp.json` dosyası ikisini getirir; diğer katalog sunucuları yalnız sen `~/.claude.json` içine eklersen yapılandırılmış olur |

1.3.2 ile her agent rol dosyası modelini de belirtir:
katalogdaki `workerModels` (Codex rol dosyalarında `gpt-6-luna`, Claude agent
dosyalarında `sonnet`). Açtığın oturum harness'in parçası değildir ve kendi
modelini korur; bkz. [Model Katmanları](agents.tr.md#model-katmanları).

Envanter ayrıca bir kopyanın plugin'in önüne geçebileceği yerleri de tarar:
`~/.agents/skills`, `~/.codex/skills`, `~/.claude/skills`, `~/.claude/agents`
ve `~/.claude.json` içindeki `mcpServers` nesnesi.

## Durum Sözlüğü

- `installed`: harness skill'i veya rolü o hedefte yerinde.
- `missing`: harness skill'i veya rolü plugin'de yok (Codex rolü için: `~/.codex/agents` içinde yok).
- `shadowed`: aynı adlı kendi skill'in, rolün veya kullanıcı kapsamlı MCP girdin harness'tekinin önüne geçiyor.
- `migration-pending`: 1.0-1.2 kurulumunun bıraktığı bir kopya veya link hâlâ yerinde.
- `broken-link`: bir skill linki artık var olmayan bir hedefi gösteriyor.
- `drifted`: plugin cache'i kaynağından farklı; satır durumu olarak değil, hedef satırında ve `Issues` içinde gösterilir.
- `user`: senin eklediğin skill, rol veya MCP sunucusu; harness'in parçası değil.
- `optional`: varsayılan kurulumun içermediği kataloglu bir skill.
- `retired`: katalogun emekliye ayırdığı bir ad.
- `legacy-name`: bir uyumluluk takma adı veya AgentChef'in eski bir adı.
- `plugin`: Claude Code plugin'inin sağladığı MCP sunucusu.
- `enabled` / `disabled`: bir Codex MCP tablosu ve onun `enabled` değeri.
- `not-configured`: o hedefte girdisi olmayan bir katalog MCP sunucusu.
- `user-added`: `~/.claude.json` içine kendin eklediğin bir katalog MCP sunucusu.
- `legacy-plugin-name`: plugin hâlâ 1.3.0 öncesi adıyla kurulu.
- `-`: o hedefte bu adda bir şey yok.

## Envanteri Çalıştırmak

Envanter yalnız okur: home dizinlerini okur, hiçbir şey yazmaz.

```bash
npm run chef -- --inventory
npm run chef -- --inventory --target codex
npm run chef -- --inventory --target claude --details
npm run chef -- --inventory --json
```

`--target`, `codex`, `claude` veya `both` (varsayılan) seçer. `--details`,
zaten beklenen durumda olan harness satırlarını da listeler. `--json`, her
kopyanın nerede bulunduğuna dair satır notları dahil raporun tamamını basar.
AgentChef kuruluyken seçili bir hedefte harness skill'i veya rolü eksikse komut
1 ile çıkar; bu yüzden betiklerde kontrol olarak da kullanılabilir.

## Çıktıyı Okumak

Kurgusal bir örnek:

```text
COMPONENT         KIND   SOURCE               CODEX              CLAUDE
frontend-design   skill  plugin (pinned)      missing            missing
gptpro            skill  plugin (bundled)     migration-pending  installed
old-team-notes    skill  user                 broken-link        -
release-verify    skill  legacy-name          legacy-name        -
team-style-guide  skill  user                 user               user
code_reviewer     agent  plugin (specialist)  installed          shadowed
github            mcp    catalog              disabled           user-added
local-notes       mcp    user                 user (enabled)     -
serena            mcp    catalog + plugin     enabled            shadowed

Harness: 29 skills (11 bundled + 18 pinned) · 28 agent roles (21 specialists + 7 coordinators) · 14 MCP servers (Codex default 3, Claude plugin 3)
codex: 28/29 skills · 28/28 roles · 14/14 MCP configured
claude: 28/29 skills · 28/28 roles · 4/14 MCP configured · cache differs from source in 2 file(s)
Issues: missing 2, shadowed 2, migration-pending 1, broken-link 1, drifted 2
```

- `SOURCE` satırın nereden geldiğini söyler: `plugin (bundled)`,
  `plugin (pinned)`, `plugin (specialist)`, `plugin (coordinator)`, `catalog`,
  `catalog + plugin` ya da `user` gibi harness dışı bir sınıflandırma.
- `--details` olmadan beklenen durumdaki harness satırları gizlenir; harness
  dışı satırlar her zaman listelenir.
- `Harness:` satırı katalog toplamıdır. Her hedef satırı, o hedefte bulunanları
  bu toplama karşı sayar.
- `Issues`, seçili hedeflerdeki sorunlu durumları toplar. `none`, düzeltilecek
  bir şey olmadığı anlamına gelir.

## Her Sorunu Düzeltmek

| Durum | Ne yapılır |
| --- | --- |
| `missing` | Yenilemeyi önizlemek için `npm run chef -- --update` çalıştır, sonra `--apply` ekle. |
| `shadowed` | Skill'in veya rolün kendi kopyasını kaldır ya da yeniden adlandır. MCP sunucusu için girdini `~/.claude.json` içinden sil veya kurucuyu `-AdoptMcp` / `--adopt-mcp` ile yeniden çalıştırarak girdiyi yedekli biçimde kaldır. |
| `migration-pending` | Önizleme için `npm run chef -- --migrate-identity --target both` çalıştır, sonra `--apply` ekle. |
| `legacy-plugin-name` | `migration-pending` ile aynı: `npm run chef -- --migrate-identity --target both`. |
| `broken-link` | Boşta kalan linki kaldır; artık hiçbir şeyi göstermiyor. |
| `drifted` | Cache yeniden kaynakla eşleşsin diye kurulum güncellemesini tekrar çalıştır (`npm run chef -- --update --apply`). |

`user`, `optional`, `retired` ve `legacy-name` satırları bilgi amaçlıdır.
AgentChef onlara dokunmaz; yalnız artık istemediğin bir tanesini kaldır.
