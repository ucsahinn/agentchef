# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) ve [CHANGELOG-0.5.md](../CHANGELOG-0.5.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

## v1.3.4 - 2026-10-06

AgentChef 1.3.4 bir skill'i ya da rolü istek gerektirdiğinde kullanır: tahminle
değil, kuralla ve tek satırlık bir yönlendirme ipucuyla. Güncellemek için
`npm run chef -- --update --apply`; sonra Codex'te `/hooks` içinde
`hooks/routing-hint.json` dosyasına güven ver ve Claude Code'da yeni oturum aç.

### Neler Değişti

- **Yönlendirme kataloğu.** 19 profilin her biri (yeni: `code-review`)
  doğrulayıcısını, dosya değişiminden sonra zorunlu olup olmadığını (güvenlik,
  yayın, MCP, arayüz, veri) ve önce yüklenecek skill'i adlandırır; yalnız açıkça
  istenen skill'ler yüklenmez, önerilir. Görev başına sen adlandırmadan en çok
  iki ajan açılır. Türkçe istekler yönlendirilir: puanlayıcı noktasız ı'yı katlar.
- **Yönlendirme ipucu.** Her prompt'ta plugin isteğini bellekte katalogla
  karşılaştırır ve yüksek güvenle eşleşince modele yalnız katalog
  kimliklerinden oluşan tek satır ekler. Prompt metnini saklamaz, prompt'u asla
  engellemez, `AGENTCHEF_ROUTING_HINT=off` ile kapatılır. Bkz.
  [güvenlik modeli](security-model.tr.md) ve [PRIVACY](../PRIVACY.md).
- **Roller.** Her rolün tetikleyici biçiminde tek açıklaması var ("Use
  proactively when ...") ve işinin gerektirdiği skill'i baştan yükler.
  `npm run chef -- --routing --task "<istek>"` eşleşen profili ve ipucu
  satırını gösterir.

## v1.3.3 - 2026-10-05

AgentChef 1.3.3 ajanları tek bir ekip gibi çalıştırır: tek protokol, işi geri
gönderebilen bir pano ve Claude Code'da gerçekten uygulanan bir spawn kuralı.
Güncellemek için `npm run chef -- --update --apply`; mevcut panolar okunmaya
devam eder.

### Neler Değişti

- **Pano.** Görevler gerekçeyle yeniden çalışmaya gönderilebilir, bırakılabilir,
  bloke edilebilir veya iptal edilebilir. Başlamak bir sahip (yeni `assign`),
  incelemeye geçmek kanıt, kapatmak ise rapor, cevaplanmış açık kararlar ve işi
  yapmamış bir doğrulayıcı ister. İki görev aynı dosyaları kiralayamaz; her
  değişiklik görev geçmişinde tutulur ve `show` bekleyen işi işaretler. Çöken
  bir işlemin bıraktığı kilit panoyu artık kilitlemez.
- **Spawn koruması.** Claude Code, koordinatör subagent olarak çalışırken onun
  worker listesini yok sayar. Yeni bir plugin hook'u her AgentChef
  koordinatörünü kendi worker'larıyla sınırlar ve worker'ların ajan açmasını
  engeller.
- **Tek protokol.** Her yerde aynı yedi alanlı brief ve altı alanlı handoff;
  `brief-check` ve yeni `handoff-check` ile denetlenir. İki delegasyon rotası;
  görev başına en çok dört worker.
- **Roller.** Koordinatörler için daha net spawn, birleştirme ve üst kademeye
  taşıma kuralları; worker'lar ihtiyaç duydukları rolü açmak yerine adını
  bildirir; birkaç rol düzeltmesi.

## v1.3.2 - 2026-10-04

AgentChef 1.3.2 her agent rolünü daha düşük maliyetli bir worker modelinde
çalıştırır; açtığın oturum seçtiğin modeli korur. Güncellemek için
`npm run chef -- --update --apply`; migration adımı gerekmez.

### Neler Değişti

- **Worker modelleri.** 28 rolün hepsi katalogdaki `workerModels` ile
  çalışır: Codex `gpt-6-luna`, Claude Code `sonnet`. Reasoning effort
  pinlenmez, devralınır. Değiştirmek için bkz.
  [Model Katmanları](agents.tr.md#model-katmanları).
- **Güvenlik ve inceleme rolleri** de worker katmanında çalışır; yüksek riskli
  bir inceleme için onu kendi oturumunda çalıştır ya da Claude Code'da o tek
  `Agent` çağrısına daha güçlü bir `model` ver.
- **Belgeler.** Agent'ların birbiriyle nasıl konuştuğu, iki pinli skill
  sınırı ve Codex'in her thread'in MCP sunucularını uygulama kapanana kadar
  açık tutması (openai/codex#30408) ile bunun hafifletmeleri.

## v1.3.1 - 2026-10-04

AgentChef 1.3.1, 1.3.0'a ilk canlı yükseltmede görülen üç yanlış alarmı
düzeltir. Kurulu bir ev dizininde hiçbir şey değişmez; `verify-install-runtime`
artık gerçek durumu raporlar. `npm run chef -- --update --apply` ile güncelle.

### Neler Değişti?

- Doğrulayıcı, altında yalnızca AgentChef'in birleştirme başlığı bulunan bir
  tablo için artık yönetilen config sapması raporlamaz.
- Plugin kaynağındaki sabitlenmiş skill'ler artık fazla dosya olarak
  listelenmez.
- Kendi kurduğun bir skill kopyası, göçün kaldıracağı bir şey olarak değil,
  senin kopyan olarak raporlanır.

## v1.3.0 - 2026-10-04

AgentChef 1.3.0 harness'ın tamamını tek bir plugin yapar; her yerde aynı
biçimde sayılır ve çalıştırması daha hafiftir. `npm run chef -- --update --apply`
ile güncelle, ardından 1.0–1.2 kurulumunu
`npm run chef -- --migrate-identity --target both --apply` ile taşı (önce
`--apply` olmadan ön izle); bkz. [Yükseltme](upgrade.tr.md).

### Neler Değişti?

- **Tek plugin, tek ad.** Plugin artık `agentchef` (eskiden
  `agentchef-workflows`). Her skill iki CLI'ya yalnızca onun üzerinden ulaşır:
  Codex'te `$agentchef:<skill>`, Claude Code'da `/agentchef:<skill>`.
  `~/.agents/skills` altında kopya, `~/.claude/skills` altında bağlantı
  yoktur; göç, önceki sürümün bıraktıklarını yedekledikten sonra kaldırır.
- **28 ajan rolü.** On bir koordinatör yediye indi (yeni `ui_coordinator`);
  kaldırılan beş rol dosyası ve config tablosu yalnızca AgentChef'in
  yazdığıyla birebir aynıysa kaldırılır.
- **Skill'ler.** 11 paketli + 18 commit'e sabitlenmiş upstream skill. Yeni:
  `agent-brief` (ajanlar arası brief ve handoff sözleşmesi),
  `security-threat-model`, `shipping-and-launch`, `git-workflow-and-versioning`;
  `frontend-design` ve `improve-codebase-architecture` iki eski pinin yerini
  alır. İsteğe bağlı mükerrerler alias ya da emekli girdi oldu.
- **MCP sunucuları.** `memory` ve `filesystem` kalktı (14 sunucu). Claude Code
  `context7` ve `serena`'yı plugin'den alır; Playwright ve Chrome DevTools
  varsayılan kapalıdır ve proje başına eklenir, çünkü her oturum tanımlı tüm
  sunucuları başlatıyordu. Plugin'in başlattığı bir npx sunucusu dört
  süreçlik zincir yerine tek node sürecinde çalışır. Önceki kurulumun
  `~/.claude.json` içine yazdığı girdiler kaldırılır; seninkiler raporlanır ya
  da yedeklendikten sonra `-AdoptMcp` ile kaldırılır.
- **Onaylar ve hook'lar.** Bir ajan sabitlenmiş bir npx paketini, `git
  ls-remote` ya da `node --check` çalıştıracaksa önce sorulur; `rg --pre`
  korunur. Claude Code da artık oturum sonu süreç hijyeni hook'unu alır.
- **Tek harita.** `npm run chef -- --inventory`, her skill'i, rolü ve MCP
  sunucusunu kaynağı ve her hedefteki durumuyla (gölgelenmiş, göç bekliyor,
  kırık bağlantı, sapmış) listeler; toplamlar katalogdan gelir. Bkz.
  [Harness haritası](harness-map.tr.md).
- **Koordinasyon panosu v3.** Görevler sahip, kiralı yazma kapsamı, brief ve
  kanıt taşır; iş yalnızca eksiksiz bir brief ile başlar.
- **Düzeltmeler.** Kurulum, göç, durum, süreç hijyeni ve Serena havuzu
  üzerinde yapılan iki hata avından yaklaşık otuz hata, her biri bir testle.

Her değişiklik, nedeniyle birlikte [CHANGELOG](../CHANGELOG.md) içinde listelenir.

## v1.2.2 - 2026-10-02

AgentChef 1.2.2, 32 AgentChef ajanının her biri bir kez çalıştırılarak bulunan
düzeltmeleri toplar. `npm run chef -- --update --apply` ile güncelle; göç adımı
gerekmez.

### Neler Değişti?

- Kabuğu olmayan Claude uzmanlarına, ortak talimatların `rg` dediği yerde
  Grep ve Glob araçlarıyla aramaları söylenir.
- Ajan derlemesi, Serena havuzunun okuma aracı listesini kaynağını
  ayrıştırmak yerine içe aktarır. Bu sayede o listedeki zararsız bir
  düzenleme derlemeyi bozamaz.
- `llms.txt`, banner'ın erişilebilir açıklaması, kök `AGENTS.md` ve README
  hızlı başlangıcı artık yayınlananla uyumludur.

Her düzeltme, nedeniyle birlikte [CHANGELOG](../CHANGELOG.md) içinde listelenir.

## v1.2.1 - 2026-10-02

AgentChef 1.2.1 bir düzeltme sürümüdür. `npm run chef -- --update --apply`
ile güncelle; göç adımı gerekmez.

### Neler Değişti?

- Güvenlik: Claude uzmanları Serena'yı araç adıyla, yalnızca okuma araçlarıyla
  alır. Önceki izin (`mcp__serena`), kullanıcının kendi Serena girdisinin
  düzenleme ve hafıza yazma araçlarına da ulaşıyordu. Bu, ajanlar
  çalıştırılırken bulundu.
- Durum ve kontroller:
  - Boş bir `codex doctor` raporu artık sağlıklı görünmez.
  - Başarısız bir `claude --version` artık eksik CLI diye raporlanmaz.
  - `--cleanup-stale --apply`, temizlik planı çıkarılamadığında başarısız
    olur.
- MCP: Doğrulayıcı, `project_ref` veya `read_only=true` olmadan açılmış bir
  Supabase bağlayıcısını başarısız sayar.
- Kurucu ve belgeler:
  - Yetenek panosu, yalnızca Claude kurulumunda doğru MCP satırlarını
    gösterir.
  - Yükseltme rehberi sürüm sırasındadır.
  - Belgeler, PowerShell'de `npm`'in neden engellenebileceğini ve
    `npm.cmd`'nin çalıştığını açıklar.

Her düzeltme, nedeniyle birlikte [CHANGELOG](../CHANGELOG.md) içinde listelenir.

## v1.2.0 - 2026-10-01

AgentChef 1.2.0, kurulum, durum, kaldırma ve MCP yüzeylerinin dört ajanlı
denetimini kapatır. Her bulgu düzeltilmeden önce ölçüldü ya da kodda kontrol
edildi. Güncellemek için `npm run chef -- --update --apply` kullan; artık kurulu
her hedefi yeniler.

### Neler Değişti?

- Güvenlik: Serena, GHSA-pp25-4cg4-qcr9 için v1.7.0'a pinlendi; bu açık proje
  etkinleştirilirken kod çalıştıran bir şablon enjeksiyonuydu. Windows'ta
  Serena havuzu, pre-commit hook'u ve pinli skill kurucusu artık proje
  klasörüne commit edilmiş bir çalıştırılabilir dosyayı gerçeğinin yerine
  çalıştırmaz. Claude izinleri her `npx` başlatmasından önce sorar. Serena
  köprüsü artık `activate_project` sunmaz. `--no-backup` yalnızca eksik
  dosyaları oluşturur.
- Serena köprüsü: her araç çağrısı istemcinin kendi id'siyle yanıtlanır.
  Önceden ilkinden sonraki her çağrı 180 sn'lik zaman aşımını bekleyebiliyordu.
  Codex ve Claude'daki farklı havuz kopyaları artık birbirinin backend'lerini
  durdurmaz.
- Durum ve kontroller:
  - `--status`, `--doctor` ve `--apply` sonrası kontrol artık 180 sn'de
    kesilmez ve kurulan hedefi doğrular.
  - "strict config ok" artık `config.toml`'u gerçekten yükler.
  - Boş bir home "kurulu değil" görünür.
  - Bozuk bir Claude hedefi çalışmayı başarısız yapar.
  - `--redact-paths` hata mesajlarındaki yolları da kapsar.
  - JSON raporları Linux pipe'larında artık yarıda kesilmez.
- Claude Code: `--update` ve `--status`, `--target` alır ve `--update` kurulu
  olanı yeniler. Yükseltme, Claude Code'u yeni plugin sürümüne taşır.
  `code-mapper` Serena'yı, `frontend-verifier` ise senin eklediğin tarayıcı
  sunucularını alır.
- Windows: boşluklu bir klasöre kurulmuş CLI bulunur ve yerel `codex.exe`
  status'ta çalışır.
- Kaldırma, kalan bir `config.toml`'un hâlâ işaret ettiği Serena köprüsünü ve
  rol dosyalarını korur; böylece Codex temiz açılmaya devam eder.

Her düzeltme, nedeniyle birlikte [CHANGELOG](../CHANGELOG.md) içinde listelenir.

### Ürün Sınırı

Değişmedi: AgentChef yalnızca sahipliğini kanıtlayabildiği şeyi değiştirir.
`-Update` yönetilen `config.toml` tablolarını yedek alarak şablona geri yazar;
böylece güvenlik onayları sana ulaşır. Yönetilen bir girdiyi gölgeleyen
kullanıcı girdileri raporlanır, değiştirilmez.

## v1.1.0 - 2026-10-01

AgentChef 1.1.0, gerçek bir kuruluma karşı yürütülen öz-denetim turunu
toplar. Her CLI komutu, MCP sunucusu ve paketli skill canlı bir makinede
çalıştırıldı. Ardından gerçek `codex` ve `claude` CLI'larıyla scratch
home'larda tam bir kur, göç ve kaldır döngüsü koşuldu. Bulgular doğrulanıp
düzeltildi, sonra bağımsız kod inceleme ve güvenlik ajanlarınca yeniden
incelendi. Yeni bir göç adımı yok; `-Update` hepsini alır.

### Neler Değişti?

- Kaldırma: `--remove` her iki kaldırma planı yeniden çalıştırılarak
  doğrulanır. AgentChef'in pinli skill indirme önbelleğini ve boş
  marketplace iskeletini de kaldırır. Bağlantılı bir alt klasör üzerinden
  ulaşılan dosyayı asla silmez; her yol silmeden hemen önce yeniden
  denetlenir.
- Claude Code: izin kuralları artık kod çalıştırabilen veya dosya yazabilen
  komutlara otomatik izin vermez. Güncelleme, daha önce yazdığı bir kuralı
  emekliye ayırabilir veya bir MCP girdisini yenileyebilir; bunu aynı makbuz
  kanıtıyla yapar. Uzman ajanlar kendi talimatlarının kullandığı MCP
  sunucularına erişir. Doğrulayıcı önbellekteki plugin kopyasını (roller ve
  skill'ler) kaynakla karşılaştırır. Kendi `serena` veya `context7`
  girdiniz AgentChef'inkini gölgeliyorsa uyarır.
- Serena havuzu: ortak yönetici kodu değişince değiştirilir, salt-okunur
  kalır, bağlantısı kopan köprünün oturumlarını bırakır ve artık yetim
  sayılmaz.
- Güvenlik: Node yazma akışları hata olunca gerçekten geri alınır. Pinli
  üçüncü taraf skill'ler üç ek bütünlük açığına karşı denetlenir. Claude
  Code'un yerel durumu inceleme anlık görüntülerine girmez.
  `--update --apply`, `main` dışındaki bir klonu reddeder.
  `validate-content-safety` ham kontrol karakterlerini reddeder.
- Windows: yedekler Node ile kopyalanır; böylece uzun bir `CODEX_HOME`,
  PowerShell 5.1 altında `-Update`'i artık bozmaz. npm ile kurulmuş `codex`
  veya `claude` da bulunur.
- Tanı: `codex doctor` beş dakikaya kadar süre alır ve doğrulayıcı zaman
  aşımını adıyla söyler. `--backups` çok daha hızlıdır. Süreç hijyeni canlı
  Claude Code oturumlarını MCP sahibi olarak tanır.
- Kataloglar: MCP pinleri, her sunucunun araç listesi yoklandıktan sonra
  yenilendi. `codebase-memory` bilerek 0.8.1'de kalır.

Her düzeltme, nedeniyle birlikte [CHANGELOG](../CHANGELOG.md) içinde listelenir.

### Ürün Sınırı

Değişmedi: AgentChef yalnızca sahipliğini kanıtlayabildiği şeyi siler veya
yeniden yazar. Yönetilen bir girdiyi gölgeleyen kullanıcı girdileri
raporlanır, değiştirilmez. Üretilen MCP profilleri ve ortak Serena havuz
token'ı kaldırmadan sonra kalır.

## v1.0.0 - 2026-09-18

AgentChef 1.0.0 yeniden adlandırmayı tamamlar: installer'ın yazdığı her şey
artık `agentchef` yazımını taşır ve mevcut bir home tek bir açık komutla göç
eder. Onu çalıştırana kadar her okuyucu 1.0.0 öncesi `codex-chef` adlarını
kabul etmeye devam eder; güncelleme günü hiçbir şey bozulmaz.

### Neler Değişti?

- İşaretçiler, günlük, kilit, yedek önekleri, şema stringleri, plugin klasörü,
  operator skill'i, marketplace adı, plugin id'si, hook banner'ı ve ortam
  değişkenleri yeniden adlandırıldı; bkz. [güncelleme rehberi](upgrade.tr.md).
- `npm run chef -- --migrate-identity --target both` dönüşümü ön izler;
  `--apply` ile `CODEX_HOME/backups/agentchef-migrate-*` altına yedek alarak
  çalıştırır.
- Claude hedefi MCP girdilerini artık Claude Code'un okuduğu dosyaya
  birleştirir: `~/.claude.json`, ya da yalnızca değişken ayarlıysa
  `$CLAUDE_CONFIG_DIR/.claude.json`. 0.9.0 bunun yerine
  `~/.claude/.claude.json` yazıyordu; bu dosya makinende varsa
  [güncelleme rehberine](upgrade.tr.md) bak.
- Skill bağlantıları yalnızca hâlâ katalogda olan skill'leri kapsar;
  katalogdan çıkmış yönetilen bir dizin (örneğin emekli `codex-chef-brain`)
  `retired` olarak raporlanır ve dokunulmaz.
- İnceleme takipleri: kaldırma, kısmen göç etmiş bir skill klasöründeki her iki
  işaretçi yazımını da siler; redakte edilmiş planlar `.claude.json` yolunun
  gerçek biçimini korur; kurulum sözleşmesi `CLAUDE_CONFIG_DIR` değişkenini
  kendisi dikkate alır.
- Global Git ignore şablonunun başlığı AgentChef için yenilendi; önceki bir
  sürümden kurulmuş kopya hâlâ AgentChef'e ait olarak tanınır.

### Ürün Sınırı

Göç yalnızca bilinen bir eski yazım taşıyan dosyalara dokunur. Kullanıcı
içeriği, yabancı skill'ler, eski yedek klasörleri, `config.toml` blokları ve
Beyin verisi asla yeniden yazılmaz; eski ortam değişkenleri raporlanır,
değiştirilmez.

## v0.9.0 - 2026-09-18

AgentChef 0.9.0, OpenAI Codex CLI'nin yanına ikinci kurulum hedefi olarak
Claude Code'u ekler. Mevcut Codex kurulumları varsayılan olarak etkilenmez:
Codex hedefi varsayılan kalır; Claude Code hedefi yalnızca açık bir
`--target claude` ya da `--target both` veya etkileşimli onayın ardından
yönetilir.

### Neler Değişti?

- Tek katalog, iki hedef. Her kurulum işlemi hedefini adlandırır (`codex`,
  `claude` veya `shared`); yönetilen skill ağacı, plugin kaynak ağacı, Git
  guard'ları ve curated skill'ler gibi paylaşılan işlemler bir kez koşar.
- Claude Code yüzeyi tek bir transaction yardımcısıyla kurulur: `AGENTS.md`
  ile aynı çalışma sözleşmesinden üretilen kullanıcı seviyesi kural dosyası,
  yan makbuzlarla kaydedilen eklemeli `settings.json` izin kuralları ve
  `.claude.json` MCP girdileri, yönetilen `~/.agents/skills` ağacına skill
  bağlantıları, Claude plugin marketplace'i, ad-alanlı 32 `agentchef:<rol>`
  subagent'ı ve `claude plugin` CLI üzerinden plugin kaydı. Bkz.
  [Claude Code yüzeyleri](claude-surfaces.tr.md) ve
  [hedef yetenek haritası](target-capability-map.tr.md).
- `npm run chef -- --remove --target <t>`, iki hedefte de yalnızca AgentChef'e
  ait dosyaları, bağlantıları, marketplace girdilerini ve makbuza kayıtlı
  ayarları kaldırır.
- `verify-install-runtime`, `codex:status` ve `codex:doctor` Claude hedefini
  doğrular (`--target claude|both`); durum ekranı, ayrı hafıza motoru
  kuruluysa salt-okunur Beyin özet satırını da aktarır.
- Oturum sonu süreç hijyeni hook'u bu sürümde yalnızca Codex'te kalır.

### Ürün Sınırı

Diskteki kimlik hâlâ `codex-chef` önekidir (plugin id'si, sahiplik
işaretçileri, marketplace kökü, yedek klasörleri, şema stringleri, ortam
değişkenleri); önce-ön-izle kimlik göçü 1.0.0 ile gelir. AgentChef
`~/.claude/CLAUDE.md`, `~/.claude/agents/`, OAuth durumu veya `.claude.json`
içinde `mcpServers` dışındaki hiçbir anahtarı düzenlemez ve Claude'un plugin
önbelleğini asla elle yazmaz. 0.6.0'dan 0.9.0'a notlar için
[güncelleme rehberine](upgrade.tr.md) bakın.

## v0.6.0 - 2026-09-18

AgentChef 0.6.0, yeni adla çıkan ilk sürümdür. Yerleşik Brain workflow'unu
emekli eder, Kitchen dönemi kalıntılarını kaldırır ve projenin görünür
kimliğini yeniden adlandırır; installer hâlâ yalnızca Codex CLI yüzeyini
yönetir.

### Neler Değişti?

- Yerleşik Markdown Brain workflow'u kaldırıldı. Kalıcı hafıza ayrı
  `dual-agent-brain` motorunun işidir; mevcut vault'lara asla dokunulmaz.
  Bkz. [Brain emekliliği](brain-retirement.tr.md).
- `packages/contracts`, Chef modül manifesti, `docs/enterprise-v3` ve izlenen
  agent-result raporları kaldırıldı; ADR-002, ADR-004 ve ADR-005'in yerini
  [ADR-006](decisions/006-agentchef-independent-dual-target-product.md) aldı.
- README ve dokümantasyon yalnızca İngilizce ve Türkçe; Almanca, İspanyolca,
  Fransızca ve Brezilya Portekizcesi özetleri kaldırıldı.
- Node.js 22.12 veya üzeri gerekir; CI taşınabilirlik matrisi Node 22 ve 24
  ile koşar.
- Gerçek kurulumlar daha hızlı: dizin senkronları her hedefi tek yardımcı
  süreçle doğrular; testlerdeki alt süreç zaman aşımları yavaş makinelerde
  `CODEX_CHEF_TEST_TIMEOUT_SCALE` ile ölçeklenebilir.

### Ürün Sınırı

Installer, Codex CLI yüzeyini (`~/.codex`, `~/.agents`) tam olarak 0.5.74'teki
gibi yönetir. Diskteki kimlik değişmedi: plugin id'si, sahiplik işaretçileri,
marketplace kökü, yedek klasörü adları, şema stringleri, ortam değişkenleri ve
Git hook banner'ı hâlâ `codex-chef` önekini kullanır; göç gerekmez. Claude
Code kurulum hedefi bir sonraki sürüm hattındadır (0.9.0); kimlik yeniden
adlandırması özel, önce-ön-izle bir göç komutuyla 1.0.0'da çıkar. 0.5.74'ten
0.6.0'a notlar için [güncelleme rehberine](upgrade.tr.md) bakın.

## v0.5.74 - 2026-08-14

Codex Chef 0.5.74, yalnızca Codex hedefleyen son bağımsız sürümdür. Bağımsız
kurulum sözleşmesini korurken, bu sözleşmeyi her desteklenen CI hostunda
kanıtlamak için gereken platformlar arası test fixture'larını düzeltir.

### Neler Değişti?

- Platformlar arası fixture'larda POSIX geçici home'lara Windows yol kuralları
  uygulamak yerine, çalışan hostun repair sözleşmesini kullanır.
- Tam yönetilen durum assertion'ından önce Unix Git-hook fixture'ını
  çalıştırılabilir yapar ve Windows ACL denetiminin desteklenmediği
  platformlardaki belgelenmiş unavailable Brain-health projeksiyonunu kabul
  eder.

### Ürün Sınırı

Bu sürüm bağımsız kurulabilir ve bu repoda belgelenen uyumluluk taahhütlerini
taşır. Kitchen'ı **kurmaz**; global Codex, Agents, Git, oturum, credential veya
cache durumunu hiçbir yere taşımaz.

Bu sürümden sonraki yön
[ADR-006](decisions/006-agentchef-independent-dual-target-product.md) içinde
kayıtlıdır: proje bağımsız bir ürün olarak devam eder, Kitchen'a katılmaz,
yerleşik Brain workflow'u ayrı `dual-agent-brain` motoru lehine emekli edilir
(bkz. [Brain emekliliği](brain-retirement.tr.md)) ve bir sonraki sürüm hattı
Claude Code'u ikinci kurulum hedefi olarak ekler. Aksini söyleyen bir sürüm
yayınlanana kadar installer yalnızca Codex'i hedefler.
