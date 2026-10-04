# MCP Kataloğu

[English](mcp-catalog.md) | [Türkçe](mcp-catalog.tr.md)

MCP'ler Codex'e ek araç veya canlı bağlam verir: güncel dokümantasyon, browser
kanıtı, semantic code navigation, özel hesap verileri ya da veritabanı erişimi
gibi. Bu yüzden çok kullanışlılar ama her birinin sınırı açık olmalı.

AgentChef toplam 14 MCP tanıyor. Dengeli Codex starter'ı iki sunucuyu açar:
uzak `openaiDeveloperDocs` ve lokal lazy `serena` bridge. Context7 ile
`playwright` ve `chrome-devtools` browser sunucuları dahil beş ek lokal stdio
yardımcısı tanımlı ama kapalı kalır; yetenek kaybolmaz, her eşzamanlı oturumda Node/Python ağaçları gereksiz
yere başlamaz. Hesap veya veritabanı erişimi isteyen yedi connector ise
gerçekten ihtiyacın olana kadar kapalı kalır. Eski `memory` ve `filesystem`
girdileri 1.3.0'da kaldırıldı; mevcut bir config'in nasıl temizlendiği için
[Yükseltme](upgrade.tr.md) sayfasına bak.

Claude Code hedefinde `context7` ve `serena` sunucularını
`agentchef` plugin'i kendisi getirir
([plugins/agentchef/mcp/claude.mcp.json](../plugins/agentchef/mcp/claude.mcp.json),
plugin manifest'indeki `mcpServers` alanından bağlanır). npx sunucuları
`plugins/agentchef/scripts/mcp-launch.mjs` üzerinden başlar; bu başlatıcı
yalnızca tam sabitlenmiş sürüm kabul eder ve npx onu bir kez indirdikten
sonra sunucuyu kendi node sürecinde çalıştırır (Windows'ta sunucu başına 6
yerine 2 süreç). Serena, paylaşılan havuz
bridge'inin plugin içindeki kopyasıyla `--project-root ${CLAUDE_PROJECT_DIR}`
argümanıyla çalışır. Araç adları `mcp__plugin_agentchef_<server>__<tool>`
biçimindedir. Kurucu bu sunucuları artık `.claude.json` içine yazmaz:
AgentChef 1.0–1.2'nin oraya yazdığı girdi kaldırılır, çünkü kullanıcı
kapsamlı bir girdi plugin sunucusunun önüne geçer. Aynı adla kendi eklediğin
girdi korunur ve plugin'i gölgelediği bildirilir; `-AdoptMcp` /
`--adopt-mcp` için [Kurulum](install.tr.md) sayfasına bak. Codex'e özgü `openaiDeveloperDocs` girdisi oraya eklenmez. Kataloğun diğer sunucularını
[catalog/mcp-servers.json](../catalog/mcp-servers.json) içindeki komut ve
argümanlarla `claude mcp add --scope user` kullanarak kendin ekle. GitHub'ın
uzak MCP ucu OAuth dinamik istemci kaydını desteklemez; bu yüzden onun için
`claude mcp add`, `/mcp` girişi yerine kişisel erişim token'ı başlığı ister
(ölçüldü: "Incompatible auth server").

### Browser sunucuları proje başına eklenir

`playwright` ve `chrome-devtools` iki CLI'da da varsayılan olarak kapalıdır
(katalogda `scope: "project"`). Bir makinede ölçüldüğünde her Claude Code
oturumu yapılandırılmış her MCP sunucusunu başlatıyordu: 11 oturum, her
birinde yaklaşık 41 alt süreç. Yalnızca bazı görevlerin ihtiyaç duyduğu bir
browser sunucusu her oturumda başlamamalı; Claude Code da tek bir plugin MCP
sunucusunu ayrı kapatamadığı için (yalnızca `--strict-mcp-config` tüm
sunucuları kapatır) browser sunucuları plugin'de yer almaz.

Codex'te `codex --profile full` ikisini de açar. Claude Code'da onları browser
kanıtı gereken projeye ekle:

```bash
claude mcp add --scope project playwright -- npx -y @playwright/mcp@0.0.83 --isolated --block-service-workers
claude mcp add --scope project chrome-devtools -- npx -y chrome-devtools-mcp@1.10.1
```

Windows'ta `npx` önüne `cmd /c` ekle:

```bash
claude mcp add --scope project playwright -- cmd /c npx -y @playwright/mcp@0.0.83 --isolated --block-service-workers
claude mcp add --scope project chrome-devtools -- cmd /c npx -y chrome-devtools-mcp@1.10.1
```

İki komut da projenin `.mcp.json` dosyasına yazar; dosyayı elle de
yazabilirsin:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.83", "--isolated", "--block-service-workers"]
    }
  }
}
```

Settings fragment'i Playwright kurallarını zaten düz `mcp__playwright__<tool>`
adlarıyla taşır; bu yüzden bir proje sunucuyu eklediği anda kurallar geçerli
olur ve `frontend-verifier` `mcp__playwright` ile `mcp__chrome-devtools`
yetkilerini korur.

> **Config'de görünmesi çalıştığı anlamına gelmez.** Bir MCP template'te yer
> aldığı hâlde launcher, ilk açılışta paket indirme, browser, hesap onayı veya
> Codex restart'ı bekliyor olabilir. `codex mcp list --json` yalnız config
> discovery'yi doğrular; canlı server/tool durumu için Codex'i yeniden başlatıp
> `/mcp` kullan.

[Resmî Codex MCP rehberi](https://developers.openai.com/codex/mcp) ·
[MCP spesifikasyonu](https://modelcontextprotocol.io/specification) ·
[Makine tarafından okunan katalog](../catalog/mcp-servers.json)

## Dengeli Lokal Varsayılanlar

| MCP | Codex ana config | Claude plugin | Ne için kullanıyorum? | Neye ihtiyaç duyuyor? |
| --- | --- | --- | --- | --- |
| [`openaiDeveloperDocs`](https://developers.openai.com/mcp) | Açık | Hayır | Güncel OpenAI geliştirici dokümantasyonu | Ek bir şeye ihtiyaç duymaz |
| [`context7`](https://github.com/upstash/context7) | Kapalı | Evet | İsteğe bağlı güncel kütüphane ve framework dokümantasyonu | Node/npx ve ilk açılışta internet |
| [`serena`](https://github.com/oraios/serena) | Açık | Evet | Bilmediğin repoda sembol seviyesinde kod gezintisi | `uvx` ve sabitlenmiş Serena kaynağı |
| [`sequential-thinking`](https://github.com/modelcontextprotocol/servers) | Kapalı | Hayır | Karmaşık işi anlaşılır adımlara ayırmak | Node/npx ve ilk açılışta internet |
| [`playwright`](https://github.com/microsoft/playwright-mcp) | Kapalı (`full` açar) | Hayır (projeye eklenir) | İzole, kalıcı olmayan profilde browser snapshot, screenshot, console ve prompt-gated network kanıtı | Node/npx ve yerel browser kontrolü |
| [`chrome-devtools`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Kapalı (`full` açar) | Hayır (projeye eklenir) | Chrome incelemesi ve UI teşhisi | Node/npx ve izole Chrome köprüsü |
| [`codebase-memory`](https://github.com/DeusData/codebase-memory-mcp) | Kapalı | Hayır | Mimari, graph search, akış ve değişiklik etkisi | Node/npx; index ve admin araçları kontrollü kalır |

Tüm bundled lokal MCP'lere ihtiyaç duyan tek ana oturumda
`codex --profile full` kullan. Eşzamanlı ikincil pencereleri
`codex --profile multi-session` ile başlat; bu profil lazy Serena bridge'ini
açık tutup browser sunucuları dahil diğer beş lokal stdio sunucuyu kapalı tutar; agent, skill, uzak OpenAI docs, built-in memory, hook ve
app yüzeylerini korur. Profil ana config üzerine katmanlandığı için kapatmak
sunucu tanımını silmez.

`codex --profile offline` profilini yalnızca Chef'in yönettiği tüm MCP
taşıyıcılarını bilerek kapatmak istediğinde kullan. Bu, azaltılmış bir
varsayılan değil, isteğe bağlı bir yedek profildir: ajanları, skill'leri, shell
izinlerini, browser izinlerini veya web arama ağını değiştirmez.

Bir MCP'nin açık olması browser etkileşimi, indexleme veya sembol
düzenleme gibi bütün araçlarının sessizce onaylandığı anlamına gelmez.
Template'ler incelenmiş okuma araçlarını sınırlar; daha geniş işlemleri onaya
bırakır veya kapalı tutar. Claude Code aynı kararları katalogdan üretilen
izin kuralları olarak alır: Codex'in onayladığı araç `allow`, onaya bağlı araç
`ask`; codebase-memory'nin dört yönetim aracı ile Playwright'ın
`browser_run_code_unsafe`, `browser_evaluate` ve `browser_file_upload`
araçları `deny` olur.

Makinede `uvx` yoksa köprü yine başlar ve yalnızca ilk Serena aracı çağrısını
kullanılamaz olarak bildirir. Bu yerel bir ön koşuldur; kurulumun geri kalanını
gevşetmek yerine ihtiyacın olduğunda ön koşulu ayrıca kurabilir ya da
Serena'yı o zamana kadar kapatabilirsin.

## İhtiyacın Olana Kadar Kapalı Kalanlar

| MCP | Neye erişebilir? | Neden kapalı başlıyor? |
| --- | --- | --- |
| [`github`](https://docs.github.com/en/copilot) | Repo, issue ve PR bağlamı | GitHub/Copilot hesap onayı gerekir |
| [`figma`](https://help.figma.com) | Özel tasarım dosyaları ve workspace bağlamı | Figma hesap onayı gerekir |
| [`linear`](https://linear.app/docs) | Özel issue ve projeler | Linear workspace onayı gerekir |
| [`notion`](https://developers.notion.com) | Özel doküman ve veritabanları | Notion workspace onayı gerekir |
| [`sentry`](https://docs.sentry.io) | Production hata ve telemetri verileri | Sentry organizasyon onayı gerekir |
| [`vercel`](https://vercel.com/docs) | Proje ve deployment verileri | Vercel hesap veya takım onayı gerekir |
| [`supabase`](https://github.com/supabase/mcp) | Kimlik doğrulamalı Supabase proje verisi | Proje kapsamı, read-only mod, OAuth ve açık onay gerekir |

Sadece işin gerçekten istediği connector'ı aç. Örneğin:

```toml
[mcp_servers.github]
enabled = true
default_tools_approval_mode = "prompt"
```

Supabase resmi hosted OAuth server'ını kullanır. Etkinleştirmeden önce exact
proje referansını ekle, read-only modu koru ve yalnız görevin ihtiyaç duyduğu
feature group'larını bırak:

```toml
[mcp_servers.supabase]
enabled = true
url = "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&read_only=true&features=database,docs"
default_tools_approval_mode = "prompt"
```

`<PROJECT_REF>` değerini etkinleştirmeden önce değiştir. Kimlik doğrulama
connector'ın OAuth akışına aittir; database URL'si, access token veya parola
repoya yazılmaz.

## Neden bir sunucu eski pinde kalıyor?

Diğer sunucular güncel sürüme taşınırken `codebase-memory` `0.8.1` pininde
kalıyor. `0.11.0`, kullanıcı cache dizini başka bir yerel hesaba yazma hakkı
veriyorsa çalışmayı reddeden bir çalıştırılabilir kimlik kontrolü ekliyor;
ayrıca yükseltme her proje grafiği için tek seferlik tam yeniden indeksleme
gerektiriyor. İkisi de o projenin makul tercihleri ama sürüm yükseltmesini bir
ortam ön koşuluna çeviriyor; bu yüzden pin ancak yeni sürüm incelenmiş bir
makinede başarıyla başlatıldıktan sonra ilerler.

Bu katalogdaki diğer bütün pinler, sunucu stdio üzerinden başlatılıp MCP
el sıkışması tamamlanarak ve sunucunun bildirdiği araç adları buradaki izin
listesiyle karşılaştırılarak doğrulandı.

## Bilinen Sınır: Codex Her Thread'in MCP Sunucularını Açık Tutar

Codex her thread için etkin MCP sunucularının tam bir setini başlatır ve
önceki bir thread'in setini uygulama kapanana kadar
durdurmaz. Bu yüzden çok thread açılan uzun oturumlarda MCP süreçleri birikir.
Bu bir upstream Codex sorunudur:
[openai/codex#30408](https://github.com/openai/codex/issues/30408)
(2026-10-04'te kontrol edildiğinde açıktı). Codex'te bunu sınırlayan bir config
anahtarı yoktur: bir MCP tablosu yalnızca `enabled`, `required`,
`startup_timeout_sec`, `tool_timeout_sec` ve `enabled_tools`/`disabled_tools`
sunar.

Upstream'de düzelene kadar:

- Az sunucu açık tut. Codex ana config'i yalnızca `openaiDeveloperDocs` ve
  `serena` sunucularını açar; diğerlerini onlara ihtiyaç duyan görev için aç.
- Çok thread açacak oturumları `codex --profile multi-session` ile başlat; bu
  profil lokal stdio sunucularından yalnızca Serena bridge'ini açık bırakır.
- Codex uygulamasını ara sıra yeniden başlat; uygulamadan çıkmak biriken
  setleri kapatır.
- `npm run chef -- --processes --no-log` neyin çalıştığını gösterir; bkz.
  [çoklu oturum süreç hijyeni](process-hygiene.tr.md).

## Koruduğum Sınır

- Uzak dokümantasyon, browser kanıtı ve bir semantic-code yardımcısı dengeli
  Codex varsayılanını oluşturur; örtüşen lokal yardımcılar bir profil uzağındadır.
- Browser etkileşimi, kod düzenleme ve graph indexleme onaylı ya
  da dar allowlist'li kalır.
- Hesap, veritabanı ve production erişimi; görev gerçekten
  isteyip kullanıcı onay verene kadar kapalıdır.
- Credential'lar commit edilen config'e değil, environment variable'a veya
  connector'ın kendi OAuth akışına gider.
- Config değişince önce `codex mcp list --json` ile discovery'yi kontrol et;
  ardından Codex'i yeniden başlatıp `/mcp` ile canlı server/tool durumuna bak.

Büyük resmi görmek için [agent kataloğuna](agents.tr.md), [skill
kataloğuna](skills.tr.md) ve [workflow yüzey
haritasına](workflow-surface-map.tr.md) geçebilirsin.
