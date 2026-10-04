# Güvenlik Modeli

Bu setup, Codex'i güçlendirirken temel Codex güvenlik modelini zayıflatmamak
için tasarlandı.

## Varsayılanlar

- `sandbox_mode = "workspace-write"` yazma erişimini varsayılan olarak workspace
  içinde tutar.
- `approval_policy = "on-request"` yetki yükseltmelerini interaktif bırakır.
- `approvals_reviewer = "auto_review"` uygun onay isteklerini otomatik inceleyebilir;
  workspace sandbox'ını genişletmez veya komut kurallarını geçersiz kılmaz.
  Riskli ve eşleşmeyen işlemler prompt-gated kalır.
- Workspace-write sandbox içinde network erişimi kapalı kalır.
- `shell_environment_policy`, `inherit = "core"` kullanır ve default secret
  exclusion'ları açık tutar. Böylece subprocess'ler geniş lokal token
  environment'ını varsayılan olarak devralmaz.
- Auth isteyen remote connector'lar disabled örnekler olarak bulunur.
- App/connector default'lari, review edilmis app-specific override yoksa
  destructive ve open-world tool'lari kapali tutar.
- Global command rule'ları dar kapsamlıdır ve read-only discovery ile lokal
  verification komutlarına ağırlık verir.
- Alışıldık build, test, check, validate, dev ve status adları dahil, repo
  tarafından kontrol edilen her `npm run ...` komutu onay ister; çünkü arkasında
  çalışacak shell kodunu repo belirler. Tam olarak tanımlanmış read-only npm
  incelemeleri (`ls`, `outdated`, `view`) ile script çalıştırmayan, incelenmiş
  paket dry-run komutu izinli kalır.

AgentSpace hesap profilleri izole bir `CODEX_HOME` çözümler. Bu nedenle worker
oturumu güvenli varsayılanları ancak kendi kök `config.toml` dosyası aynı
workspace-write, on-request ve auto-review üçlüsünü taşıyorsa alır. Başka bir
Codex home'u değiştirmek çalışan worker'ı güncellemez; profil değiştikten sonra
yeni bir pane başlat.
- Fetch, branch/tag/remote değişiklikleri, config yazma, stage, commit, push,
  reset, checkout ve restore gibi Git mutasyonları onay ister. Status/diff/log/show,
  `branch --show-current`/`--list`, `remote get-url`, `tag --list` ve izin
  listesindeki config anahtarı okumaları gibi tam read-only incelemeler izinli
  kalır.
- `token-safe.config.toml` skill, agent, MCP server, memory, hook veya app
  kapatmadan verbosity, default reasoning, compaction threshold ve tool-output
  boyutunu dusurur.
- Delete, cleanup, prune, uninstall, overwrite, database drop/truncate ve benzer
  destructive işlemler açık kullanıcı onayı ister.

## MCP Sınırları

MCP server'ları shell sandbox dışında tool sağlayabilir. Bu yüzden onları zararsız
dokümantasyon helper'ı gibi değil, güçlü connector boundary'leri gibi ele al.

Bu starter'ın kuralları:

- Codex ana config'inde OpenAI Docs ve lazy Serena semantic bridge varsayılan
  olarak açıktır. Playwright ve Chrome DevTools iki CLI'da da varsayılan olarak
  kapalıdır: Codex `full` profili onları açar, `multi-session` ve `offline`
  kapalı tutar; Claude Code'da bir görev browser kanıtı gerektirdiğinde proje
  onları ekler (katalogda `scope: "project"`). Context7, Codex'te ek bir Node süreci
  başlatabildiği ve ilk çalışmada network gerektirebildiği için opt-in bir
  kütüphane dokümantasyonu yardımcısıdır.
- Eski `memory` ve `filesystem` sunucuları artık katalogda yok. Codex
  `-Update`, bunların config tablolarını yalnızca AgentChef'in yazdığıyla bayt
  bayt aynıysa kaldırır (`templates/codex/retired-tables.json`); düzenlenmiş bir
  tablo kalır ve raporlanır.
- Serena köprüsü yöneticisini ve pinli Serena alt süreçlerini `127.0.0.1`'e
  bağlar ve ajana yalnızca incelenmiş okuma/gezinme araçlarını açar. Alt süreç
  kendi loopback portunda pool token'ı olmadan dinlediği için, AgentChef onu
  yazma araçlarının (kod düzenleme, sembol yeniden adlandırma/silme, hafıza
  yazma) ve `switch_modes`'un hiç etkin olmadığı salt-okunur bir modla başlatır;
  doğrudan porta bağlanan yerel bir süreç de yalnızca okuyabilir. Yabancı bir
  `Origin` ile gelen istek Serena tarafından reddedilir.
- Playwright ve Chrome DevTools lokal browser verification icindir; varsayilan
  olarak yalniz evidence/navigation tool'lari allowlist edilir. Interaction,
  evaluation, upload ve request-detail tool'lari prompt-gated veya disabled
  kalir.
- Codebase Memory lokal code-intelligence connector olarak paketlenir. Graph
  read/query tool'lari allowlist edilir; indexing ve destructive/admin graph
  tool'lari lokal graph state yazdigi icin prompt-gated veya disabled kalir.
- GitHub, Figma, Linear, Notion, Sentry, Vercel ve Supabase kullanıcı bilinçli
  olarak açana kadar disabled kalır.
- Token değerleri repo dosyalarından değil environment variable'lardan gelmelidir.
- External write-capable tool'lar prompt approval kullanmalıdır.
- Incelenmis dokumantasyon ve reasoning MCP tool'lari
  `default_tools_approval_mode = "approve"` kullanabilir. Browser,
  semantic-code ve codebase-graph MCP server'lari
  `default_tools_approval_mode = "prompt"` ile calisir; evidence, navigation ve
  read-only graph query tool'lari `enabled_tools` allowlist'iyle acilir.
  Browser request/response detail, browser interaction, symbol edit, graph
  indexing, account, database, production, deploy, publish ve mutating
  tool'lar `"prompt"` kullanmali ya da disabled kalmalidir.
- Claude Code'da `context7` ve `serena` sunucularını `agentchef` plugin'i
  getirir (`plugins/agentchef/mcp/claude.mcp.json`). npx sunucuları
  `plugins/agentchef/scripts/mcp-launch.mjs` üzerinden başlar; bu başlatıcı tam
  bir `ad@x.y.z` pini dışındaki her şeyi (aralık ya da etiket, registry'nin o
  gün sunduğu sürümü başlatırdı) ve shell sözdizimi içeren her argümanı
  reddeder; Windows'ta `NoDefaultCurrentDirectoryInExePath=1` ile
  `cmd.exe /d /s /c npx.cmd` üzerinden çalışır. npx önbelleğinde tam o sürüm
  zaten varsa (kurulu `package.json` sürümü pine eşit ve bin paket klasörünün
  içinde kalıyorsa) başlatıcı npx'i yeniden başlatmak yerine o giriş noktasını
  kendi node sürecinde çalıştırır; çalışan kod npx'in çalıştıracağıyla aynıdır.
  Serena, paylaşılan havuz
  bridge'inin plugin içindeki kopyasıyla `--project-root ${CLAUDE_PROJECT_DIR}`
  argümanıyla çalışır; böylece iki CLI proje başına tek bir salt-okunur
  backend'i paylaşır.
- Kullanıcı kapsamlı bir `.claude.json` girdisi aynı adlı plugin sunucusunun
  önüne geçer. Bu yüzden kurucu, 1.0–1.2 kurulumunun oraya yazdığı `context7`
  ve `serena` girdilerini kaldırır; ama yalnızca değer MCP makbuzundaki hash ile
  hâlâ eşleşiyorsa. Aynı adlı başka her girdi kullanıcınındır: korunur ve
  plugin'i gölgelediği bildirilir; onu yalnızca `-AdoptMcp` / `--adopt-mcp`,
  `.claude.json` yedeklendikten sonra kaldırır.
- Claude Code'da sunucu başına araç izin listesi yoktur; bu yüzden Codex
  kararları katalogdan üretilen izin kurallarına dönüşür: `approve` → `allow`,
  `prompt` → `ask`; codebase-memory'nin `delete_project`, `index_repository`,
  `ingest_traces` ve `manage_adr` araçları ile Playwright'ın
  `browser_run_code_unsafe`, `browser_evaluate` ve `browser_file_upload`
  araçları için `deny`. Playwright kuralları düz `mcp__playwright__<tool>`
  adlarını kullanır; bir proje sunucuyu eklediği anda bu deny kuralları en
  riskli araçlarını kapalı tutar. Claude Code tek bir plugin MCP sunucusunu
  ayrı kapatamaz (yalnızca `--strict-mcp-config` tüm sunucuları kapatır);
  browser sunucularının plugin'de olmamasının nedeni budur.
- Browser network listing yerel QA için approved olabilir. Playwright
  `browser_network_request` ve Chrome DevTools `get_network_request` gibi
  request/response detail tool'ları prompt-gated veya disabled kalır; header,
  cookie ya da response body gösterebilirler.
- Yonetilen Playwright launcher'i `--isolated` ve
  `--block-service-workers` kullanir; varsayilan browser profili diske
  kalici yazilmaz ve service-worker kaydi gorevler arasi state biriktiremez.
- Windows npm-backed stdio launcher'lari `/d` ile `cmd.exe` AutoRun'i kapatir,
  `/s /c npx.cmd` kullanir ve
  `NoDefaultCurrentDirectoryInExePath=1` environment degerini aktarir. Boylece
  inner `npx.cmd` lookup workspace icindeki shadow command'i oncelemez. Outer
  `cmd.exe` path'i per-server environment olusmadan once Codex host tarafindan
  resolve edilir; path-independent statik template her Windows kurulumunda bu
  outer launcher provenance'ini kanitlayamaz. Codex'i untrusted working
  directory'den calistiran host'lar parent environment'ta da
  `NoDefaultCurrentDirectoryInExePath=1` ayarlamali veya o makine icin guvenilir
  absolute launcher path'lerini materialize etmelidir.
- Apps/connectors icin ayri bir `[apps._default]` kapisi vardir:
  `enabled = false`, `destructive_enabled = false` ve
  `open_world_enabled = false` incelenmis template'lerin parcasidir.
- Yeni MCP server eklerken `enabled_tools`, `disabled_tools`,
  `startup_timeout_sec` ve `tool_timeout_sec` gibi dar config flag'leri prose-only
  talimatlara tercih edilmelidir.
- `.codebase-memory/` gibi generated code-intelligence graph state source
  control disinda kalir; ancak private workflow icin acik review edilirse
  kaynak materyal sayilabilir.
- `catalog/mcp-servers.json` her starter connector icin source URL, auth mode,
  setup kind, setup hint, risk, approval mode ve default-enable gerekcesi tutar.
  Installer ve `npm run codex:status` setup gereksinimlerini credential
  toplamadan gosterir.

Resmi kaynak: https://developers.openai.com/codex/mcp

## Yetkili Site Reconstruction

Repo ile gelen explicit-only `fetch` skill'i, gerçek browser kanıtından
client-visible site davranışını yeniden kurar. Yalnız URL ile yapılan çağrı
public, pasif, sınırlı ve lokal kalır: login yapılmaz, dış sistemde mutation
çalıştırılmaz, production endpoint replay edilmez; server source, database,
secret veya private authorization mantığı alınmış gibi gösterilmez.

Authenticated route'lar için açık ownership veya yetki, yalnız bu iş için
ayrılmış test account'u ve ephemeral browser içinde kullanıcının kendisinin
login olması gerekir. Skill credential, cookie, storage state, unsanitized HAR
veya private browser profile istemez ve saklamaz. Yeniden kurulan login,
registration, recovery, MFA ve payment formları default olarak inert veya lokal
mock'tur.

Uzak sayfa içeriği güvenilmeyen veridir. Network discovery exact origin ile
başlar, redirect'leri yeniden doğrular, private ve metadata hedeflerini
reddeder, public `GET`/`HEAD` için sınırlar uygular, geçerli robots
kısıtlamalarına uyar; CAPTCHA, paywall, rate limit, anti-bot veya access check
bypass etmez. Korumalı asset'ler ownership ya da reuse izni ister. Lokal çıktı
default olarak zero-egress'tir; commit, publish, deploy, account, database ve
diğer external write işlemleri ayrıca onaya bağlı kalır.

## SEO ve Evidence Research Bütünlüğü

Repo ile gelen `$seo` workflow'u local source, local rendered, deployed-public
ve yetkili account kanıtını birbirinden ayırır. Passing build, sitemap kaydı,
Lighthouse ölçümü veya structured-data validator sonucu; URL'nin indexlendiği,
ranking aldığı, field traffic ürettiği ya da görünür rich result'a uygun olduğu
iddiasına çevrilmez. Search Console, analytics, sitemap submission, DNS,
production redirect, yayın, listing, outreach ve deploy işlemleri kendi yetki
ve external-write kapılarında kalır.

Repo ile gelen `$evidence-research` workflow'u charter, iddia edilen rigor
düzeyine uygun yeniden üretilebilir search log, kontrol edilmiş source kaydı,
claim-level referans, confidence, disagreement, limitation ve fact/inference/
recommendation ayrımı ister. Kaynak, görüşme, istatistik, search count veya
systematic-review uyumu uydurmaz. Ücretli API, private dataset, katılımcıyla
iletişim, survey, lisanslı materyal ve publication açık onay gerektirir. İki
skill de machine-checkable raporlarında credential ve secret-benzeri içeriği
reddeder.

## Skill Kaynakları

Installable skill'ler hem `catalog/skills.json` hem de
`catalog/skills-lock.json` içinde temsil edilmelidir. Lock dosyası installer'ın
kullandığı package, tam upstream commit SHA, skill, exact Skills CLI sürümü,
registry integrity ve install command bilgisini kaydeder. Installer kilitli
commit'i izole geçici checkout'a fetch eder, `HEAD` ile seçilen skill'i doğrular
ve exact native copy'yi stage edip hash'ledikten sonra fetch edilen repo kodunu
veya kayıtlı registry paketini çalıştırmadan etkinleştirir. CLI metadatası
uyumluluk/keşif pini olarak kalır. Default gate bu sözleşmeyi offline kontrol
eder; `npm run verify:skills:online` her pinli checkout'u ve npm integrity
değerini doğrular.
Hedef yoksa doğrudan kurulur. Geçerli ve kendi içinde tutarlı AgentChef
provenance marker'ı, zorunlu full-tree backup ile managed upgrade'e izin verir.
Unmarked, foreign veya lokal olarak drift etmiş aynı adlı hedefler default
olarak korunur. Adoption bilinçli olarak skill bazındadır: operator exact hedefi
inceleyip yalnızca o helper komutunu `--adopt-existing` ile tekrar
çalıştırmalıdır; geniş installer adoption switch'i yoktur.

Default command approval rule'lari global skill kurulumunu auto-allow yapmaz.
Read-only Skills CLI discovery allowlist'e alinabilir, fakat `skills add` ve
genis Skills CLI cagrilari agent instruction supply chain'i degistirdigi icin
prompt ister.

## Uzman Ajan Sinirlari

Uzman ajanlar `catalog/agents.json` icinde izlenir ve hem Codex config
template'leriyle hem de `templates/codex/agents/` altindaki role TOML
dosyalariyla dogrulanir.

Agent template'leri `danger-full-access`, `approval_policy = "never"` veya
gomulu token environment variable adlari kullanmamalidir. Read-only uzmanlar
read-only kalir; verifier/release rolleri sadece smoke-test output gibi lokal
kanitlar icin `workspace-write` kullanabilir.
1.3.2 ile agent role template'leri yalnız katalogdaki
worker `model` değerini (`workerModels`) taşır, `model_reasoning_effort`
pinlemez; effort'u profil belirler, açtığın oturum seçtiğin modeli korur.
Model satırı hiçbir role boundary veya approval gate'i değiştirmez.

`max_threads = 10` concurrency kapasite tavanidir; her task'i fan-out etme izni
degildir. Kosullu routing normalde bir ile dort ajan kullanir ve yalniz
bagimsiz paralel is, gurultulu kaniti ayirma veya acik kullanici delegasyonu
durumunda spawn eder. Otomatik rol secimi aktif kullanici profilini override
etmez.

## Install Planlama ve Çakışma Politikası

`manifests/install-plan.json` installer'ın yönettiği her dosya, directory, Git
guard, profile ve skill operation'ını listeler. `npm run plan:install` bu
manifestten sadece okunabilir bir plan üretir; kullanıcı-global Codex, Agents
veya Git dosyalarına yazmaz.

Seçilen manifest profili operasyon seçimi ve sırası için normatiftir. Üretilen
profiller, sahiplik işareti yazımları, kurulu plugin cache yenilemesi ve Unix
hook izin adımı bu sözleşmede açık operasyonlardır. Planlayıcı, install/repair
preflight'ları, repair dosya yürütümü ve runtime drift kontrolleri resolved
action ledger'ı tüketir. Platform installer'ları açık PowerShell ve shell
yürütme kodunu korur; semantic parity validator ve davranışsal smoke testleri
bu yolları contract ile karşılaştırır, böylece manifest normative kalır.

Plan çıktısında her operation için target path, collision policy, backup
beklentisi, platform ve risk seviyesi görünür. High-risk operation'lar explicit
flag ister; örneğin Git guard'ları `--install-git-guards`, skill kurulumu
`--install-skills` olmadan gerçek kurulum kapsamına girmez.

Bu yaklaşım external starter'lardan gelen iyi manifest/plan fikirlerini alır,
ama geniş global sync, otomatik dependency install, auth connector enable etme
veya kullanıcı dosyalarını sessizce overwrite etme davranışlarını dışarıda
bırakır.

Canonical template ile kullaniciya ait overlay ayri trust domain'leridir.
Normal merge/repair model/profil secimini, approval ve sandbox ayarlarini,
project trust kayitlarini, ozel MCP'leri ve ilgisiz marketplace kayitlarini
korur. Chef-managed agent/MCP guvenlik tablolari dogrulanmaya devam eder;
tekil dosya değişimi açık force yolu ve backup gerektirir. Force ve update,
yönetilen dizinlerde kaynakta sahip olunan girdileri senkronlar ve ilgisiz ek
dosyaları korur; iki mod da dizini topluca silme yetkisi vermez.
Etkileşimli komuta merkezi tam kurulumdan önce bu durumu inceler. Zaten güncel
bir kurulumu sessizce yeniden kurmaz ve yönetilen drift'i temiz bir ilk kurulum
gibi göstermez; güncel kurulum işlem yapmadan sonlanır, drift ise açık ve yedekli
onarım sınırına yönlendirilir. Aynı durum incelemesi, kullanıcının eklediği
skill'leri ve MCP bağlayıcılarını silinecek hedefler olarak değil, korunacak
envanter olarak ele alır.
`scripts/validate-install-plan.mjs` hedefleri yalniz review edilmis Codex,
Agents ve opsiyonel Git-guard alanlarinda tutar; `.claude`, `.cursor`,
`.opencode`, `.zed` ve `.vscode` gibi komsu harness home path'leri install
yuzeyine sessizce giremez.

Diskteki kimlik 1.0.0'dan itibaren `agentchef` yazımıdır (işaretçiler,
günlük, kilit, yedek önekleri, şema stringleri, plugin klasörü, marketplace
adı, plugin id'si, hook banner'ı). Her okuyucu 1.0.0 öncesi `codex-chef`
yazımını da kabul eder; böylece drift tespiti, onarım, durum ve kaldırma göç
edilmemiş bir home'u yabancı değil yönetilen sayar. Dönüşüm yalnızca açık
`--migrate-identity` komutuyla olur; önce ön izler, diğer her yazma gibi
günlüklenir ve yedeklidir. Göç bir Git hook'unu yalnızca baytları gönderilen
bir şablonla eşleşiyorsa yeniden yazar; diğer her hook açık sahiplenme
gerektiren bir çakışma olarak kalır.

Her manifest işlemi hedefini adlandırır (`codex`, `claude` veya `shared`).
Codex hedefi varsayılandır; Claude hedefi yalnızca açık bir `--target` ya da
etkileşimli onayla seçilir. Claude tarafındaki işlemler yalnızca `CLAUDE_HOME`
(`CLAUDE_CONFIG_DIR` veya `~/.claude`), kullanıcı kapsamlı `.claude.json`
(`~/.claude.json`; `CLAUDE_CONFIG_DIR` ayarlıysa onun içinde) ve
paylaşılan `AGENTS_HOME/plugins` ağacına yazabilir; `${HOME}/.claude` gibi
sabit bir hedef reddedilmeye devam eder. AgentChef'in sahibi olmadığı Claude
1.3.0'dan beri kurucu `.claude.json` içine MCP girdisi yazmaz; yalnızca önceki
bir sürümün yazdığı girdileri kaldırır, o da değer makbuzdaki hash ile
eşleşmeye devam ettiği sürece. Düzenlenmiş ya da AgentChef'in hiç yazmadığı bir
girdi raporlanır ve olduğu gibi bırakılır; `-AdoptMcp` / `--adopt-mcp`
verilirse dosya önce yedeklenip girdi kaldırılır. İzin kuralları varsayılan olarak
eklemelidir. Güncelleme, aynı sahiplik kanıtıyla, fragment artık istemediğinde daha
önce eklediği bir kuralı geri de alabilir; böylece taşınan bir paket pini eski
allow kuralını sonsuza kadar geride bırakmaz. `deny` kuralları (üretilen MCP
yasakları) yalnızca eklenir, asla geri alınmaz; mevcut olanlar hiç
değiştirilmez. AgentChef'in sahibi
olmadığı Claude dosyaları (`settings.json`, `.claude.json`) eklemeli birleştirilir ve eklenen
her girdi `~/.claude/agentchef/receipts/` altındaki yan makbuza yazılır;
onarım, durum ve kaldırma yalnızca güncel değeri makbuzla eşleşen girdilere
dokunur. Claude plugin önbelleği `claude plugin` CLI'sına aittir ve asla elle
yazılmaz. Süreç hijyeni hook'u Claude Code'a yalnızca plugin manifesti
üzerinden ulaşır; `settings.json` içine hook ile ilgili hiçbir şey yazılmaz.

Installer'lar yalniz `agentchef` marketplace kaydini upsert eder.
Tum marketplace dosyasini bastan yazmaz; mevcut marketplace dosyasi invalid,
okunamaz veya JSON object degilse fail-closed davranir.

Kaldırma (`--remove`) yalnızca AgentChef'in sahipliğini kanıtlayabildiği şeyleri
siler: şablonla bayt-bayt aynı dosyalar, sahiplik işaretçisi taşıyan dizinler,
makbuza kayıtlı girdiler ve marketplace girdisi; her birini önce yedekler.
Bağlantılı bir alt klasör üzerinden ulaşılan dosya asla silinmez; her yol silmeden
hemen önce yeniden denetlenir. Pinli skill indirme önbelleği
(`CODEX_HOME/cache/pinned-skill-sources`) yedeksiz silinir, çünkü yeniden kurulum
onu tekrar indirir; yalnızca kendi makbuzundan türetilen anahtarla adlandırılmış
dizinler silinir ve araya sokulmuş bir bağlantıya karşı hemen önce yeniden
denetlenir. Marketplace dosyası yalnızca geriye AgentChef'in boş iskeleti
kaldığında silinir.

Windows'ta bir proje klasöründen yalın bir komut adı (`uvx`, `git`,
`gitleaks`) çalıştıran süreç, PATH'teki yerine o klasöre commit edilmiş bir
çalıştırılabilir dosyayı bulabilir. Bu aramayı yalnızca başlatan sürecin kendi
ortamı kapatır. Serena havuzu, global pre-commit hook'u ve pinli skill
kurucusu `NoDefaultCurrentDirectoryInExePath` değişkenini kendileri için
ayarlar. Kurucu, devralınan Git konum değişkenlerini (`GIT_DIR`,
`GIT_WORK_TREE`, …) de atar. `--no-backup` yalnızca eksik dosyaları
oluşturur. Geri alma, yedeği olmayan ve üzerine yazılmış bir dosyayı asla
silmez.

1.3.0'dan beri AgentChef'in her skill'i iki CLI'ya da yalnızca plugin
üzerinden ulaşır. On bir bundled skill
`AGENTS_HOME/plugins/sources/agentchef/skills/<ad>` plugin kaynağında gelir;
pinned skill'ler de `.agentchef-source.json` provenance kayıtlarıyla aynı
klasöre yazılır. Installer `AGENTS_HOME/skills` altına hiçbir şey yazmaz ve
`~/.claude/skills` altında bağlantı kurmaz; bu yüzden oradaki kullanıcı
skill'leri hiçbir zaman çakışma hedefi olmaz. `-Adopt*Skill` ve
`--adopt-skill-links` bayrakları etkisizdir. 1.0–1.2 kurulumundan kalan
doğrudan kopyalar yalnızca açık `--migrate-identity` komutuyla emekli edilir
(önce yedek alınır; yalnızca marker'ı ya da provenance kaydı AgentChef'e ait
olduğunu kanıtlayan ve skill'i plugin kaynağında zaten bulunan kopyalar için);
yabancı dizin ve bağlantılara asla dokunulmaz. Claude installer'ı, önceki
makbuzunun kaydettiği bağlantıları yalnızca plugin başarıyla kaydedildikten
sonra emekli eder. Fetch
`allow_implicit_invocation: false` kalır; SEO ile Evidence Research yalnız
açıklamaları açıkça eşleştiğinde implicit seçilebilir.

Marketplace kaydi, current Codex schema'nin istedigi marketplace root'u icinde
kalan `AGENTS_HOME/plugins/sources/agentchef` yonetilen aynasini
kullanir. Bu kayıt plugin'i keşfedilebilir yapar; kurmaz veya etkinleştirmez.
Namespace'li plugin kullanımı explicit plugin kurulumu ve yeni oturum gerektirir.
Marketplace JSON, platform launcher'ı, `serena-pool.mjs`, kopyalanan/üretilen
profiller, seçilen bütün kaynaklar ve mevcut hedef yol
bileşenlerinin tamamı herhangi bir managed write öncesinde preflight edilir.
Configured home dışına kaçan symlink veya junction descendant'ları fail-closed
davranır.

## Repair Modu

`scripts/repair-install.mjs`, zaten global Codex setup'i olan kullanicilar icin
repair/reconcile yoludur. `--apply` olmadan read-only calisir ve managed drift,
eksik config bloklari, marketplace drift'i, managed plugin icindeki ekstra
dosyalar, curated olmayan skill'ler ve duplicate skill adlarini raporlar.
`--apply` ile Serena köprüsü dahil yalnızca AgentChef'in yönettiği dosyaları
backup alıp onarır, eksik config bloklarini merge eder ve baska marketplace plugin'lerini koruyarak AgentChef
marketplace kaydini yeniler.

`--no-backup` yalnızca çözümlenen operasyonun bütünü yeni dosya oluşturuyorsa ve
seçilen hedeflerin tamamı yoksa kabul edilir. Mevcut bir hedef, birleştirme,
değiştirme, silme, budama, sahiplenme, cache yenileme veya global mutasyon varsa
ön kontrol ilk yazmadan önce akışı reddeder.

Acik apply yetkisi verildiginde CLI managed bir hedefi backup alip replace
edebilir; preview bunu asla yapmaz.

Repair modu user skill'lerini silmez. Ekstra global skill'ler ve duplicate skill
adlari cleanup adayi olarak raporlanir; cunku Codex'in initial skill-list
butcesini sisirebilirler ama kullanici tarafindan bilerek kurulmus olabilirler.
Managed AgentChef plugin dizini icindeki ekstra dosyalari silmek icin ayrica
`--prune-managed-plugin-extras` flag'i gerekir; bu islem de backup sonrasi
yalnizca tek managed plugin hedefiyle sinirli kalir. Plugin kaynağındaki,
provenance kaydını taşıyan pinned skill'ler bu flag verilse bile ekstra dosya
sayılmaz. Repair artık doğrudan skill kopyalarını uzlaştırmaz.

## Update Modu

`npm run chef -- --update` managed/global dosyalari degistirmez; `--no-log`
yoksa normal repo-local CLI loglari yine yazilir. Managed-file install plan ve
installer dry-run yolunu kullanir; curated global skill kurulumlarini ve
opsiyonel global Git guard'lari disarida birakir. Apply
modu `main` dalinda olmayan bir kopyayi reddeder (aksi halde feature dali ya da
detached HEAD kaydirilirdi), tracked veya staged degisiklikleri durdurur, ilgisiz untracked dosyalari
korur ve sonra `git pull --ff-only` calistirir. Yeni commit cekilirse güncel
ağaçtan installer dry-run çalıştırıp fresh preview basar; aynı onaylı oturumda lokal
validation, managed yenileme ve kurulu runtime doğrulamasıyla devam eder. İkinci
çalıştırma gerekmez. Repo zaten guncelse managed refresh oncesi lokal validation
calistirir, sonra scoped managed AgentChef dosyalarini backup alan installer
uzerinden yeniler. Bu refresh kaynakta
sahip olunan dosyaları senkronlar, ilgisiz dizin eklerini korur ve daha önce
kurulmuş eski plugin cache'ini yerinde yeniler. Publish, unscoped cleanup, curated global skill kurma, opsiyonel
global Git guard kurma, user skill silme, credential rotate veya
account/database/broad-filesystem connector enable etmez.

## Backup Inventory Ve Restore

## Taşınabilir Workspace OS Sınırı

AgentChef taşınabilirdir, çünkü installer `CODEX_HOME` ve `AGENTS_HOME`
yollarını makine yoluna gömmek yerine çalışma anında çözer. Önizleme ve izole
smoke testi için depoya göreli geçici bir kök uygundur; gerçek bir home ise
açık bir kullanıcı tercihi olarak kalır ve her managed değiştirme yine
backup'la korunur.

Paket sınırı bilinçlidir: Chef yalnız Codex yeteneklerini ve dağıtım
varlıklarını kurar. Memory engine veya control plane gibi yardımcı araçları
kurmaz ya da yönetmez, verilerini okumaz veya yazmaz, mevcut terminal
oturumlarını sahiplenmez ve `auth.json`, oturum, credential ya da makine
durumunu bilgisayarlar arasında taşımaz. Bu araçlar ayrı sürümlenen, en az
yetkili sözleşmeleri üzerinden entegre olabilir; asla bir installer yan etkisi
olarak değil.

`npm run chef -- --backups`, aktif Codex home altindaki backup archive'larini
global/user state degistirmeden listeler. `npm run chef -- --backups --backup
<id>` backup archive metadata'sini inceler: path, size, hash, manifest durumu,
issue ve restorable target bilgisi. File content basmaz.

Kesilen bir install veya repair arsivi, ancak kayitli her path, size ve SHA-256
degeri archive ile hala eslesiyorsa atomik operation journal'i recovery manifest
olarak kullanabilir. Bu durum restore allowlist'i genisletmez ve kayitsiz
dosyalara izin vermez.

Installer mutation oncesinde atomik operation journal'i olusturur; canonical
managed home'lar farkliysa ikisi altinda da ayri sahipli kilit alir. Her
mutation once journal'a prepare edilir, ancak tamamlaninca applied olarak
isaretlenir. Unix'te eksik managed home atomik kilit oncesinde olusturulur.
Kilit cakismasi fail-closed olur; cleanup yalniz kayitli sahip kimligi mevcut
installer ile eslesen kilitleri serbest birakir. Basarili, basarisiz ve
kesintili yollar ayni sahiplik kontrolunu kullanir; yabanci eszamanli kilitler
asla kaldirilmaz. Basarisiz install, journal recovery'den once tamamlanmis
commit-pinned skill kurulumlarini compensation receipt'leriyle geri alir.

Restore backup archive'larini untrusted input kabul eder. `npm run chef --
--backups --backup <id> --restore` preview'dir. Apply path'i `--apply` ister,
exact source byte'larini okuyup dogrular, mevcut target'larin fresh rollback
backup'ini olusturur, unsafe archive path'lerini ve symlink'leri reddeder,
yalniz aktif Codex veya Agents home altindaki bilinen AgentChef managed
dosyalarini restore eder. Sonraki bir write fail olursa daha once yazilan
target'lar fresh rollback backup'tan geri alinir. Commit-pinned skill
archive'lari catalog'daki tek bir skill ID ile sinirlanir ve handled failure
sirasinda exact-tree semantigini koruyacak sekilde o skill tree'sini degistirir.
Valid `agentchef.backup.v1` manifest archive path, size ve SHA-256 setini
birebir dogrulamalidir; legacy, missing, extra, degistirilmis veya unsupported
control-plane dosyalari fail-closed olur. Inventory ancak bu kontroller ve
target allowlist gectikten sonra bir backup'i restorable diye etiketler. Backup
archive cleanup ve delete otomatik degildir; manuel ve review edilmis operator
aksiyonu olarak kalir.

## Rules

`templates/codex/rules/default.rules` hizli read-only discovery ve
project-native verification komutlarina izin verir. Reviewed allowlist granular
validator'lari, release-note check'lerini, skill/runtime verification'i, package
dry-run'lari, read-only Codex diagnostics'i, CI run watch'i ve read-only git
object inspection'i kapsar. Sunlari prompt'a baglar:
- destructive file operations
- deletion, cleanup, pruning, overwrite ve uninstall
- broad shell wrapper'ları
- dependency installation
- global skill installation
- package publishing
- GitHub API operations; credential material basabilen auth status/token komutlari dahil
- repo tarafından kontrol edilen bütün `npm run ...` script çalıştırmaları
- broad `git config` value-dump komutlari ve raw, unredacted `gitleaks dir`
- git commit, push, reset, checkout ve restore
- repair apply ve managed plugin pruning
- exact allowlist dışındaki ad-hoc `npx` package execution
- bir ajanın pinned bir npx MCP paketini elle başlatması (`npx -y <pkg@ver>`,
  `npx.cmd` veya `cmd.exe /c npx ...`); Codex etkin MCP sunucularını bu
  kuralların dışında kendisi başlatır
- uzak bir depoya bağlanan ve transport ya da credential helper çalıştırabilen
  `git ls-remote`
- `--require` / `--import` modüllerini yine de yükleyen `node --check`
- ilk argüman olarak `rg --pre` ve `rg --pre-glob` (önek kuralı sonrasını
  görmez; Claude Code kuralları `--pre` için her konumda sorar)

Resmi kaynak: https://developers.openai.com/codex/rules

## Hooks

Hooks lifecycle kontrolü için faydalıdır ama primary security boundary değildir.
Codex, plugin hook'u çalışmadan önce tam kaynak hash'iyle incelenmesini ve
güvenilir olarak işaretlenmesini ister. Claude Code'da böyle bir adım yoktur:
plugin etkinleştirildiğinde hook'larını çalıştırır.

Lokal plugin süreç hijyeni için her CLI'a bir tane olmak üzere dar kapsamlı tek
bir `SessionEnd` hook'u tanımlar. Codex onu kendi manifesti üzerinden
`hooks/process-hygiene.json` dosyasından okur. Claude Code onu
`plugins/agentchef/.claude-plugin/plugin.json` içinde satır içi alır (exec
biçimi,
`node ${CLAUDE_PLUGIN_ROOT}/scripts/codex-process-hygiene.mjs --session-end --runtime claude`,
15 sn timeout, matcher yok); Claude'un kendiliğinden yükleyeceği
`hooks/hooks.json` kullanılmaz ve iki CLI de diğerinin hook'unu yüklemez.
Claude manifesti `scripts/render-target-artifacts.mjs` ile üretilir; commit
edilen kopya saparsa `npm run check` başarısız olur. Hook prompt veya
transcript metni okumaz ve context eklemez. Normal oturum sonunda yalnız tam
Codex ya da Claude Code sahibinin lokal MCP alt süreçlerini yakalar, detached
taramada 45 saniye bekler ve sahip zinciri gittikten sonra yalnız PID ile
oluşturulma zamanı hâlâ eşleşen yakalanmış süreçleri durdurur. Subagent lifecycle
olayları `SessionEnd` hook'unu çağırmaz. Eksik süreç metadata bilgisi, canlı
sahip, yeni süreç ağacı veya PID yeniden kullanımı güvenli biçimde işlemi
durdurur.

Starter; otomatik `SessionStart` context injection'ını,
`hookSpecificOutput.additionalContext` desenlerini, ilgisiz hook runtime'larını,
plugin-bundled MCP/app yüzeylerini ve `Write` capability'sini reddetmeye devam
eder. `scripts/security-audit.mjs` yalnız tam process-hygiene hook path ve
komutunu allowlist'e alır; root hook klasörleri, başka nested `hooks/` path'leri,
`scripts/hooks`, `.cursor/hooks`, `.kiro/hooks`, `.opencode` hook plugin'leri,
template veya plugin bundle'ları açık review olmadan yeni hook eklerse fail
eder. Hook dosya silmez, credential okumaz ve ilgisiz Node/Python süreçlerini
temizlik adayı saymaz.

Resmi kaynaklar: https://developers.openai.com/codex/hooks ve
https://code.claude.com/docs/en/hooks

Operasyon sözleşmesi:
[çoklu oturum süreç hijyeni](process-hygiene.tr.md).

## Git Hijyeni

Global Git guard'ları opsiyoneldir çünkü kullanıcının global Git default'larını
değiştirir. İnceleme, yazmadan mevcut ve önerilen durumu gösterir. İki yönetilen
dosyadan ya da iki Git config anahtarından birinde yabancı durum varsa apply
güvenli biçimde durur. Operatör yalnızca tam çakışmayı `AdoptGitIgnore`,
`AdoptGitHook`, `AdoptGitExcludesFile` veya `AdoptGitHooksPath` ile inceleyip
sahiplenmelidir; Bash installer aynı adların kebab-case biçimini kullanır. Bir
sahiplenme diğerini kapsamaz.

Apply, ilk Git-guard değişikliğinden önce iki dosya ile iki anahtarın önceki
durumunu `agentchef.global-git-guards-receipt@1` tipli makbuzuna aynen yazar.
Makbuz; bulunmayan dosya ve anahtarları ayırt eder, dosya byte'larını ve modlarını
korur, birden çok anahtar değerini sırasıyla saklar ve apply sonrası beklenen
dosya hash'lerini, Unix modlarını ve anahtar değerlerini bağlar. İşlenen bir hata
tüm işlemi geri alır. Restore önce şemayı, kayıtlı home'u, tam izin listesini,
boyutu, yolları ve bağlantı güvenliğini doğrular. Mevcut durum apply sonrası
bağla eşleşmiyorsa hiçbir şey yazmaz; yalnızca eşleşiyorsa her yüzeyi aynen
geri yükler veya kaldırır. Installer makbuz yoluyla tam `manage-global-git-guards.mjs
restore` komutunu yazdırır. Bu makbuz bilinçli olarak
`agentchef.backup.v1` arşivlerinden ayrıdır.

Kurulursa:

- bariz local secret ve build-output path'lerini ignore eder
- Gitleaks varsa çalıştırır
- `.env`, `.pem`, `.key`, `.pfx` gibi staged secret dosyalarını engeller

Repo `.gitleaks.toml` dosyası default Gitleaks kurallarını extend eder ve
yalnızca `tmp/`, `node_modules/`, `dist/`, `.next/` gibi local scratch,
dependency, build ve cache dizinlerini dışarıda bırakır.

Hook konservatiftir ve dosya silmez.

Security validation, ignored scratch, dependency, build, coverage veya release
output dizinleri altinda tracked source dosyasi gorurse fail eder.

## Asla Eklenmemesi Gerekenler

- Codex sessions veya memories
- `.env` dosyaları
- private key veya signing material
- auth files, cookies, token caches
- local database dump'ları
- installers ve release archive'ları
- generated screenshots, logs, reports ve build output

## External Account Actions

Repo GitHub, Supabase, Vercel veya Sentry için güvenli setup dokümante edebilir,
ama account-level aksiyonları otomatik yapmamalıdır. Repository protection açmak,
key rotate etmek, billing değiştirmek, deploy etmek veya publish yapmak ayrı
kullanıcı onayı ve account context'i gerektirir.
