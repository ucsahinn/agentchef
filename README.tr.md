# AgentChef

<p align="center">
  <img src="assets/banner.svg" alt="Agent, skill, MCP, onay ve doğrulama katmanlarını bir araya getiren AgentChef" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/ucsahinn/agentchef/actions/workflows/validate.yml"><img alt="Doğrulama workflow'u" src="https://github.com/ucsahinn/agentchef/actions/workflows/validate.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT lisansı" src="https://img.shields.io/github/license/ucsahinn/agentchef?color=0f766e" /></a>
  <a href="README.md"><img alt="İki README dili" src="https://img.shields.io/badge/readme-2%20languages-0f766e" /></a>
  <img alt="Windows, macOS, Linux ve WSL" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-164e63" />
</p>
<p align="center"><a href="docs/release-notes.tr.md">Sürüm notları</a> · <a href="docs/decisions/006-agentchef-independent-dual-target-product.md">Yol haritası kararı (ADR-006)</a></p>

<p align="center">
  <strong>Dil:</strong>
  <a href="README.tr.md">Türkçe</a> ·
  <a href="README.md">English</a>
</p>

Bir terminal kodlama ajanını çalıştırmaya başlamak kolay. Onu bir hafta sonra
da düzenli, faydalı ve güvenli kalan bir çalışma ortamına dönüştürmek ise
gereğinden fazla uğraştırıyor.

Ben **AgentChef**'i (eski adıyla Codex Chef) bu yüzden geliştirdim. Kendi
kullanımımda sürekli aynı sorulara dönüyordum: Bu işi hangi agent üstlenmeli,
hangi skill yol göstermeli, hangi MCP güvenli, nerede onay istenmeli ve ortaya
çıkan sonucu gerçekten nasıl doğrulayacağım?

AgentChef, iki terminal ajanı için hazırladığım resmi olmayan, açık kaynak bir
kurulum ve çalışma kiti: **OpenAI Codex CLI** ve **Anthropic Claude Code**.
[Resmi Codex dokümantasyonu](https://developers.openai.com/codex) ve
[resmi Claude Code dokümantasyonu](https://code.claude.com/docs) üzerine
kurulur. Başkasının özel bilgisayarını, credential'larını, session'larını veya
lokal memory'sini kopyalamadan sağlam bir başlangıç düzeni kurar.

> **Bugün ne kuruluyor?** Bu sürüm iki hedefi de kurar: Codex CLI yüzeyi
> (`~/.codex`, `~/.agents`) ve Claude Code yüzeyi (`~/.claude`);
> `--target codex|claude|both` ile seçilir. Her hedefin ne aldığı
> [hedef yetenek haritasında](docs/target-capability-map.tr.md) listelidir;
> yayınlanan davranış ise her zaman
> [sürüm notlarında](docs/release-notes.tr.md) yazılıdır. Kalıcı, oturumlar
> arası hafıza bu kitin değil, ayrı
> [`dual-agent-brain`](https://github.com/ucsahinn/dual-agent-brain)
> motorunun işidir.

## 👋 Aradığın Yerden Başla

| İncele | Ne bulacaksın? |
| --- | --- |
| [🤖 7 koordinatör + 21 uzmanı gör](docs/agents.tr.md) | Koordinasyon rolleri, uzman worker'lar ve delegasyonun ne zaman gerçekten faydalı olduğunu. |
| [🧩 Skill kataloğunu aç](docs/skills.tr.md) | On bir bundled workflow'u, full install ile gelen on sekiz incelenmiş skill'i ve varsayılan yolu kalabalıklaştırmayan opsiyonları. |
| [🔌 MCP kataloğuna bak](docs/mcp-catalog.tr.md) | İki sunuculu Codex varsayılanını, Claude Code plugin'inin getirdiği iki sunucuyu, proje başına eklenen browser sunucularını, opsiyonel lokal yetenekleri, yedi kontrollü connector'ı ve süreç/erişim sınırlarını. |
| [📜 Kurulan çalışma sözleşmesini oku](templates/codex/AGENTS.md) | `~/.codex/AGENTS.md` olarak kurulan kullanıcı-geneli varsayılanlar; repo-içi `AGENTS.md` yine daha yüksek önceliklidir. |
| [🛡️ Güvenlik modelini oku](docs/security-model.tr.md) | Ön izleme, yedekleme, onay kapıları, secret sınırları ve AgentChef'in bilerek kendi başına yapmadığı işlemleri. |

## 🍳 AgentChef Neler Ekliyor?

### Agent'lar: yalnızca gerektiğinde doğru uzman

Kit; `code_mapper`, `root_cause_debugger`, `security_auditor`, `docs_author`
ve `test_verifier` gibi uzman roller içeriyor. Bunlar arka planda sürekli
çalışan servisler değil. Bir rolün görevle eşleşmesi yol gösterir. 1.3.4 ile
subagent yalnızca dört koşuldan biri geçerliyse başlar:
verifier gerektiren bir routing profili eşleşti ve dosyalar değişti, bağımsız
paralel iş var, gürültülü log veya araştırma ana thread'den ayrılmalı ya da sen
açıkça delegasyon istedin. Önemsiz, kesinlikle sıralı, sıkı bağlı ve tek
dosyalık işler ana oturumda kalır.

[Tüm agent'ları ve gerçek rol dosyalarını gör →](docs/agents.tr.md)

### Global çalışma sözleşmesi: görünür ve kalıcı varsayılanlar

AgentChef bu [global çalışma sözleşmesini](templates/codex/AGENTS.md)
`~/.codex/AGENTS.md` olarak kurar. Operating, güvenlik, routing, tasarım ve
doğrulama varsayılanlarını kurulumdan önce görünür kılar. Repo-içi
`AGENTS.md` daha spesifik kalır ve önceliklidir; proje sözleşmeleri gerektiği
yerde üstün gelmeye devam eder.

[Global rehberin config, skill, MCP ve rules ile yerini gör →](docs/codex-surfaces.tr.md)

### Skill'ler: aynı işi her seferinde düzgün yapabilmek için

Skill, ajana belirli bir işi hangi adımlarla yapacağını anlatır. Ajan önce
kısa açıklamayı görür; tam talimatı yalnızca görev eşleştiğinde yükler.
AgentChef on bir bundled workflow sunar ve full install profilinde on sekiz
incelenmiş skill'e yer verir. Hepsi iki CLI'ya da yalnızca `agentchef`
plugin'i üzerinden ulaşır; bu yüzden her skill CLI başına bir kez listelenir.
Örneğin `$seo` ve `$evidence-research` workflow'ları Codex'te
`$agentchef:seo` ve `$agentchef:evidence-research`, Claude Code'da
`/agentchef:seo` ve `/agentchef:evidence-research` diye çağrılır (başka bir
komut aynı adı taşımıyorsa Claude Code'da yalın `/seo` da çalışır).
Plugin skill'leri, installer plugin'i kaydettikten ve yeni bir oturum
açıldıktan sonra kullanılabilir.

[Hangisi bundled, hangisi kurulur, hangisi opsiyonel gör →](docs/skills.tr.md)

### MCP'ler: canlı araç ve context, fakat sınırları görünür

MCP; ajanı dokümantasyona, browser'a, semantic code navigation'a ve lokal
codebase graph okumalarına bağlar. AgentChef 14 sunucuyu kataloglar. Codex'te
dengeli ana config uzak `openaiDeveloperDocs` sunucusunu ve hafif bir Serena
köprüsünü açar. Köprü oturum açılışında Serena/LSP başlatmaz: aynı kanonik
proje tek bir tembel backend'i paylaşır, ayrı bir worktree ise yalnızca
semantic navigation gerçekten kullanıldığında kendi backend'ini alır. Diğer
beş lokal stdio sunucusu (`context7`, `sequential-thinking`, `playwright`,
`chrome-devtools` ve `codebase-memory`) tanımlı ama kapalı kalır. Böylece her
eşzamanlı oturum aynı Node/Python yardımcı ağaçlarını baştan kurmaz. Yetenek
ağırlıklı tek ana oturumda `full` (browser sunucularını açar), düşük süreç
maliyetli ikincil oturumlarda `multi-session` profilini kullanabilirsin.
Hesap, database ve production connector'ları sen bilerek açana kadar kapalı
kalır. Claude Code'da `context7` ve aynı Serena köprüsünü `agentchef`
plugin'i getirir. Browser sunucuları (`playwright`, `chrome-devtools`)
plugin'de yoktur: bir görev browser kanıtı gerektirdiğinde onları projeye
ekle; Playwright'ın en riskli araçlarını reddeden izin kuralları orada da
geçerlidir. `~/.claude.json` içinde bir plugin sunucusunun adıyla zaten bir
girdin varsa korunur ve plugin sunucusunu gölgelediği bildirilir.

[Tüm MCP'leri, önkoşulları ve erişim sınırlarını gör →](docs/mcp-catalog.tr.md)

## 🧭 Parçalar Birlikte Nasıl Çalışıyor?

<p align="center">
  <img src="assets/workflow-overview.tr.svg" alt="Bir görev routing ile agent, skill veya MCP'ye yönelir; gerektiğinde onay ister ve doğrulamayla tamamlanır" width="100%" />
</p>

Sen işi anlatırsın. Routing en dar ve faydalı yüzeyi seçer. Riskli işlemler
onay için durur. Doğrulama, gerçekte ne olduğunu kontrol eder.

## 🚀 Önce Gör, Sonra Kur

Git, Node.js 22.12 veya üzeri, npm/npx ve Codex CLI ve/veya Claude Code
gerekir. Bunlardan biri eksikse tahmin yürütmek yerine
[kurulum rehberine](docs/install.tr.md) bakabilirsin.

```powershell
git clone https://github.com/ucsahinn/agentchef.git
cd agentchef
npm run chef -- --install
```

Son komut yalnızca ön izleme yapar. Ajan home'una yazmadan önce AgentChef'in
hangi dosyaları yöneteceğini gösterir. PowerShell `npm.ps1 cannot be loaded`
derse `npm` yerine `npm.cmd` yaz ([ayrıntı](docs/troubleshooting.tr.md)).

Ön izleme doğruysa:

```powershell
npm run chef -- --install --apply
```

Aynı komutlar macOS, Linux ve WSL üzerinde de çalışır. Installer, yönettiği
hedefleri değiştirmeden önce yedek alır; sana ait skill, MCP, profil veya ilgisiz
plugin dosyalarını temizlemez.

Etkileşimli kurulum hangi CLI'ların kurulu olduğunu algılar ve Codex CLI
hedefini mi, Claude Code hedefini mi, yoksa ikisini birden mi yöneteceğini
sorar. Doğrudan çağrılarda `--target codex|claude|both` ile seçersin; Claude
Code hedefi asla örtük seçilmez. Hangi hedefin ne aldığı için
[hedef yetenek haritasına](docs/target-capability-map.tr.md) bak.

### Hatırlaman gereken dört komut

| İhtiyaç | Komut |
| --- | --- |
| Kurulumu ön izle | `npm run chef -- --install` |
| Repo sağlığını kontrol et | `npm run chef -- --status --repo-only --no-log` |
| Routing sözleşmesini gör | `npm run chef -- --routing --profile starter-health` |
| Ajan/MCP süreç sahipliğini denetle | `npm run chef -- --processes --no-log` |

Repair, diagnostics, update, process kontrolü, beklenen çıktılar ve doğrudan
installer komutları [operatör dokümantasyonunda](docs/README.tr.md) duruyor.

## 🛡️ Güvenli Varsayılanlar, Gizli Erişim Değil

- Silme, credential erişimi, database işlemleri, publish, release, deploy ve
  geniş filesystem erişimi açık onay sınırında kalır.
- GitHub, Figma, Linear, Notion, Sentry, Vercel ve Supabase gibi authenticated
  connector'lar katalogda yer alıyor diye kendiliğinden açılmaz.
- AgentChef browser session import etmez, private memory kopyalamaz, secret
  saklamaz, maintainer telemetry'si göndermez ve çalışmanı sessizce commit edip
  pushlamaz.

Repoyu kendin doğrulamak istersen:

```bash
npm run check
```

Bu kontrol docs, installer, agent, skill, MCP, routing, package içeriği,
supply-chain göstergeleri ve güvenlik sınırlarını birlikte denetler.

## 📚 Aradığını Dosyalar Arasında Kaybolmadan Bul

- [Türkçe dokümantasyon haritası](docs/README.tr.md)
- [Kurulum ve güvenli ön izleme](docs/install.tr.md)
- [Agent'lar](docs/agents.tr.md)
- [Skill ve plugin'ler](docs/skills.tr.md)
- [MCP kataloğu](docs/mcp-catalog.tr.md)
- [Harness haritası ve envanter](docs/harness-map.tr.md)
- [Harness uyumluluğu](docs/harness-compatibility.tr.md)
- [Bilgi bankası](kb/README.tr.md)
- [Sorun giderme](docs/troubleshooting.tr.md)
- [Katkı](CONTRIBUTING.md), [destek](SUPPORT.md) ve
  [private güvenlik bildirimi](SECURITY.md)
- [Agent'lar için kısa indeks](llms.txt)

İngilizce ve Türkçe dokümanlar tam paritede, eksiksiz operatör rehberi içerir.

## 🤝 Geri Bildirim Gerçekten Değerli

AgentChef gerçek kullanım sırasında yaşadığım sorunlardan çıktı ve hâlâ
geliştirmeye devam ediyorum. Bir bölüm net değilse, katalogda yanlış gördüğün
bir şey varsa veya ilk kurulumda tereddüt ettiğin bir nokta olursa issue açıp
yazabilirsin.

Proje işine yararsa GitHub'da bırakacağın bir yıldız daha fazla kişinin
bulmasına yardımcı olur. ⭐

MIT lisanslıdır. Topluluk tarafından geliştirilir. Resmi bir OpenAI veya
Anthropic ürünü değildir.
