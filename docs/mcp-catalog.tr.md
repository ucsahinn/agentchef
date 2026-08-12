# MCP Kataloğu

[English](mcp-catalog.md) | [Türkçe](mcp-catalog.tr.md)

MCP'ler Codex'e ek araç veya canlı bağlam verir: güncel dokümantasyon, browser
kanıtı, semantic code navigation, özel hesap verileri ya da veritabanı erişimi
gibi. Bu yüzden çok kullanışlılar ama her birinin sınırı açık olmalı.

Codex Chef toplam 16 MCP tanıyor. Dengeli starter iki sunucuyu açar: uzak
`openaiDeveloperDocs` ile lokal lazy `serena` bridge. Context7 dahil altı ek lokal stdio
yardımcısı tanımlı ama kapalı kalır; yetenek kaybolmaz, her eşzamanlı oturumda
Node/Python ağaçları gereksiz yere başlamaz. Hesap, veritabanı veya geniş dosya
sistemi erişimi isteyen diğer sekiz connector ise gerçekten ihtiyacın olana
kadar kapalı kalır.

> **Config'de görünmesi çalıştığı anlamına gelmez.** Bir MCP template'te yer
> aldığı hâlde launcher, ilk açılışta paket indirme, browser, hesap onayı veya
> Codex restart'ı bekliyor olabilir. `codex mcp list --json` yalnız config
> discovery'yi doğrular; canlı server/tool durumu için Codex'i yeniden başlatıp
> `/mcp` kullan.

[Resmî Codex MCP rehberi](https://developers.openai.com/codex/mcp) ·
[MCP spesifikasyonu](https://modelcontextprotocol.io/specification) ·
[Makine tarafından okunan katalog](../catalog/mcp-servers.json)

## Dengeli Lokal Varsayılanlar

| MCP | Ana config | Ne için kullanıyorum? | Neye ihtiyaç duyuyor? |
| --- | --- | --- | --- |
| [`openaiDeveloperDocs`](https://developers.openai.com/mcp) | Açık | Güncel OpenAI geliştirici dokümantasyonu | Ek bir şeye ihtiyaç duymaz |
| [`context7`](https://github.com/upstash/context7) | Kapalı | İsteğe bağlı güncel kütüphane ve framework dokümantasyonu | Node/npx ve ilk açılışta internet |
| [`serena`](https://github.com/oraios/serena) | Açık | Bilmediğin repoda sembol seviyesinde kod gezintisi | `uvx` ve sabitlenmiş Serena kaynağı |
| [`sequential-thinking`](https://github.com/modelcontextprotocol/servers) | Kapalı | Karmaşık işi anlaşılır adımlara ayırmak | Node/npx ve ilk açılışta internet |
| [`playwright`](https://github.com/microsoft/playwright-mcp) | Kapalı | İzole, kalıcı olmayan profilde browser snapshot, screenshot, console ve prompt-gated network kanıtı | Node/npx ve yerel browser kontrolü |
| [`chrome-devtools`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Kapalı | Chrome incelemesi ve UI teşhisi | Node/npx ve izole Chrome köprüsü |
| [`memory`](https://github.com/modelcontextprotocol/servers) | Kapalı | Küçük ve gizli olmayan yerel hafıza grafiği | Node/npx; secret saklama |
| [`codebase-memory`](https://github.com/DeusData/codebase-memory-mcp) | Kapalı | Mimari, graph search, akış ve değişiklik etkisi | Node/npx; index ve admin araçları kontrollü kalır |

Tüm bundled lokal MCP'lere ihtiyaç duyan tek ana oturumda
`codex --profile full` kullan. Eşzamanlı ikincil pencereleri
`codex --profile multi-session` ile başlat; bu profil lazy Serena bridge'ini
açık tutup diğer altı lokal stdio sunucuyu kapatır; agent, skill, uzak OpenAI docs, built-in memory, hook ve
app yüzeylerini korur. Profil ana config üzerine katmanlandığı için kapatmak
sunucu tanımını silmez.

Bir MCP'nin açık olması browser etkileşimi, memory write, indexleme veya sembol
düzenleme gibi bütün araçlarının sessizce onaylandığı anlamına gelmez.
Template'ler incelenmiş okuma araçlarını sınırlar; daha geniş işlemleri onaya
bırakır veya kapalı tutar.

Makinede `uvx` yoksa Serena açılmaz. Bu yerel bir ön koşuldur; kurulumun geri
kalanını gevşetmek yerine ihtiyacın olduğunda ön koşulu ayrıca kurabilir ya da
Serena'yı o zamana kadar kapatabilirsin.

## İhtiyacın Olana Kadar Kapalı Kalanlar

| MCP | Neye erişebilir? | Neden kapalı başlıyor? |
| --- | --- | --- |
| [`filesystem`](https://github.com/modelcontextprotocol/servers) | Yerel bir klasör ağacı | İzin verilen kökü bilinçli seçmek gerekir |
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

Filesystem için erişilecek yeri mümkün olan en dar workspace olarak belirle:

```toml
[mcp_servers.filesystem]
enabled = true
args = ["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem@2026.1.14", "<DAR_MUTLAK_PATH>"]
default_tools_approval_mode = "prompt"
```

Connector'ı açmadan önce `<DAR_MUTLAK_PATH>` değerini değiştir. `.` işaretini
kopyala-yapıştır varsayılanı olarak kullanma; Codex işleminin tüm çalışma
klasörünü erişime açar.

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

## Koruduğum Sınır

- Uzak dokümantasyon ile bir kütüphane-doc ve bir semantic-code yardımcısı
  dengeli varsayılanı oluşturur; örtüşen lokal yardımcılar bir profil uzağındadır.
- Browser etkileşimi, memory write, kod düzenleme ve graph indexleme onaylı ya
  da dar allowlist'li kalır.
- Hesap, veritabanı, production ve geniş dosya sistemi erişimi; görev gerçekten
  isteyip kullanıcı onay verene kadar kapalıdır.
- Credential'lar commit edilen config'e değil, environment variable'a veya
  connector'ın kendi OAuth akışına gider.
- Config değişince önce `codex mcp list --json` ile discovery'yi kontrol et;
  ardından Codex'i yeniden başlatıp `/mcp` ile canlı server/tool durumuna bak.

Büyük resmi görmek için [agent kataloğuna](agents.tr.md), [skill
kataloğuna](skills.tr.md) ve [workflow yüzey
haritasına](workflow-surface-map.tr.md) geçebilirsin.
