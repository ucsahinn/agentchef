# Sürüm Notları

## v1.8.5 - 2026-10-20

AgentChef 1.8.5 tamamlanan salt-okur koşunun `partial` işaretinin anlamını düzeltir.

### Neler Değişti

- **`completion.partial` işi yansıtır.** Bir işçi bitmediğinde ya da kararı partial, fail veya blocked olduğunda tamamlanan salt-okur koşu yarım sayılır.

## v1.8.4 - 2026-10-20

AgentChef 1.8.4 salt-okur takım koşularını kapatır ve ikinci bakış gerektiren raporları işaretler.

### Neler Değişti

- **Salt-okur koşular tamamlanır.** Tüm işçileri salt-okur olan bir koşu, raporları toplandığında hiç gelmeyecek bir bütünleştirmeyi sonsuza dek beklemek yerine `completed` olarak biter.
- **Toplama uyarıları.** `rg`'ye tırnak geçiren ya da `node -e` kullanan, veya raporu bulguların listelendiğini söyleyip tek bir satır göstermeyen işçiye koşu kaydında ve raporunda uyarı eklenir.

## v1.8.3 - 2026-10-19

AgentChef 1.8.3 Windows takım koşusu işçilerinin yeniden metin çıkarabilmesini sağlar.

### Neler Değişti

- **Tırnaksız okuma.** Windows PowerShell 5.1 yerel program argümanlarındaki çift tırnakları sildiği için tırnaklı arama kalıpları hiçbir şey bulmuyordu. İşçiler artık düz bir kelimeyi `rg -n -F` ile (bağlam satırlarıyla) arar ya da `git show` ile okur; `node -e` kullanmaz.

## v1.8.2 - 2026-10-19

AgentChef 1.8.2 bir 1.8.1 gerilemesini düzeltir ve sıfır kapasite durumunu açık hale getirir.

### Neler Değişti

- **Windows işçileri dosyaları yeniden okuyabiliyor.** Codex sandbox'ında PowerShell ConstrainedLanguage modunda çalışır ve 1.8.1'in UTF-8 öneki orada başarısız oluyordu. İşçiler artık dosya metnini Türkçe karakterleri bozmayan yerel programlarla (`rg -F`, `git show`, `node`) okur.
- **Kapasite 0 koşuyu durdurur.** Öneri 0 iken `plan` ölçülen gerekçeyle reddedilir; `--max-workers 1` bilerek tek işçi çalıştırır ve kayda yazılır.
- **Başlatırken yeniden ölçüm.** `start` işçi tavanını o anki öneriye indirebilir, asla yükseltmez; onay olmadan öneri 0 ise başlatmayı reddeder.

## v1.8.1 - 2026-10-19

AgentChef 1.8.1, ilk gerçek 1.8.0 takım koşusunda bulunan iki Windows sorununu düzeltir.

### Neler Değişti

- **Windows işçilerinden sahte bozuk karakter yok.** İşçilere ve doğrulayıcıya Windows PowerShell 5.1'de dosyaları UTF-8 okumaları ve bozuk karakter bildirmeden önce baytları kontrol etmeleri söylenir.
- **`merge --as-patch` satır sonlarını korur.** `core.autocrlf=true` altında LF dosya LF, CRLF dosya CRLF kalır; yalnız değişen satırlar değişir.

## v1.8.0 - 2026-10-19

AgentChef 1.8.0 takım koşularının commit'lenmemiş işle birlikte çalışmasını ve makineye göre boyutlanmasını sağlar.

### Neler Değişti

- **`plan --snapshot`.** Commit'lenmemiş değişiklikleri olan bir depoda takım koşusu çalışabilir. Çalışma ağacı özel bir anlık commit'e (`refs/agentchef/snapshots/<runId>`) alınır; dalın, indeksin ve dosyaların değişmez. `cleanup` anlık ref'i siler.
- **`merge --as-patch`.** Doğrulanmış sonucu çalışma ağacına unstaged değişiklik olarak uygular ve commit oluşturmaz. Plandan sonra dosyalar çakışacak şekilde değiştiyse hiçbir şeye dokunmadan reddeder.
- **İşçi sayısı canlı kapasiteyi izler.** Sabit dört sınırı kalktı. Tavan `beyin kapasite` (ya da boş RAM) önerisini izler, sert tavan 8'dir; önerinin üstündeki `--max-workers` ölçülen gerekçeyle reddedilir.
- **"Takım koşusu" `beyin takim` demektir.** Kurallar ve skill'ler bunu söyler; bir doğrulayıcı eski sabit-dört ifadesinin geri gelmesini engeller.

## v1.7.10 - 2026-10-16

AgentChef 1.7.10, team-run çıktısını düz terminalde okunur yapar.

### Neler Değişti

- **Okunur `team-run` çıktısı.** `--json` olmadan her komut `[object Object]` basıyordu. Artık kısa bir özet basar: koşu, işçi başına bir satır, gözetmen durumu, kapsam uyarıları ve kontroller. `--json` çıktısı değişmedi.

## v1.7.9 - 2026-10-15

AgentChef 1.7.9, bir işçi değişiklik üretmeden bittiğinde takım koşusunun toparlanmasını sağlar.

### Neler Değişti

- **`integrate --recheck --covers TASK-x`.** Şef başarısız işçinin kapsamını bütünleştirme dalında tamamlar, commitler ve kaydeder. Motor onarımın o işçinin yazma kapsamında ve plan içinde kaldığını denetler; doğrulama ve birleştirme onayı aynen geçerlidir.

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) ve [CHANGELOG-0.5.md](../CHANGELOG-0.5.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

## v1.7.8 - 2026-10-14

AgentChef 1.7.8 takım koşusunun onarım döngüsünü kapatır ve ilk canlı koşunun ürettiği regresyon testlerini ekler.

### Neler Değişti

- **`integrate --recheck`.** Şef düşen bir bütünleştirmeyi onarıp commitledikten sonra kontroller yeniden çalışır ve koşu doğrulamaya geçebilir.
- **Regresyon testleri.** Gözetmen düzeyinde bellek koruması ve kota ayrıştırıcısı uç durumları; R20261014-d760 koşusunda iki Codex işçisi yazdı.

## v1.7.7 - 2026-10-14

AgentChef 1.7.7 takım koşusunun kota sınırını kendi başına beklemesini sağlar ve işçilerin makineyi boğmasını önler.

### Neler Değişti

- **`resume --wait`.** Sınır mesajından sıfırlanma saatini okur, bekler (saat yoksa 30 dakika, en çok 12 saat) ve sürdürür. `status` beklenen saati `resumeAt` olarak gösterir.
- **Bellek koruması.** Boş RAM azken sıradaki işçiler bekler; bir işçi her zaman çalışır. `AGENTCHEF_TEAM_MIN_FREE_MB` ile ayarlanır, `AGENTCHEF_TEAM_MEMORY_GUARD=off` ile kapanır.

## v1.7.6 - 2026-10-14

AgentChef 1.7.6 uzun takım koşularını makineye karşı dayanıklı yapar. Windows uykuya geçer, terminal çöker ya da bilgisayar yeniden başlarsa koşu eskiden kimse çalıştırmadan `running` kalırdı. Artık `resume --run <runId>` onu kurtarır.

### Neler Değişti

- **Çökme sonrası kurtarma.** Canlı gözetmen yoksa ve nabız bir dakikadan eskiyse sahipsiz işçiler aynı worktree'de kayıtlı Codex oturumuyla sürer. Canlı bir işçi süreci kurtarmayı engeller; onaylı plan özeti yine denetlenir.

## v1.7.5 - 2026-10-14

AgentChef 1.7.5 takım gözetmeninin bölme kararını öngörülebilir yapar: her bağımsız yazma kapsamına bir işçi, paralel işçi yalnız ayrı ve bağımsız kapsamlar için, bağımlı iş sonraki koşuda, en fazla dört.

### Neler Değişti

- **Dağıtım kuralı.** Gözetmen skill'ine ve skill rehberine yazıldı; aynı istek her seferinde aynı biçimde bölünür.

## v1.7.4 - 2026-10-14

AgentChef 1.7.4 takım koşularının bağımsız doğrulamasını güvenilir yapar. Salt okunur doğrulayıcı sandbox'ında geçici klasör açamadığından artık diff ile birlikte host'taki bütünleştirme sonuçlarını alır ve test süitlerini yeniden koşmaya çalışmak yerine bunlara göre karar verir.

### Neler Değişti

- **Doğrulayıcı promptu.** Host bütünleştirme sonuçları (kontrol başına geçti ya da düştü, düşenler için kısa ve temizlenmiş çıktı) doğrulama brifinin parçasıdır; yazan test süitlerini yeniden koşmama kuralı açıkça yazılıdır.

## v1.7.3 - 2026-10-14

AgentChef 1.7.3 bir takım koşusunun Codex kullanım sınırından sonra sürmesini sağlar. Sınır sıfırlanınca `resume`, duraklayan işçileri aynı worktree'lerde kayıtlı Codex oturumlarından sürdürür; plan özeti denetlendiği için onaylanan plan değiştirilemez.

### Neler Değişti

- **Resume.** `team-run resume --run <runId>` (ya da `beyin takim resume --run <runId>`) yalnız kullanım sınırının durdurduğu işçileri yeniden sıraya alır ve her birini kayıtlı oturumunda sürdürür.
- **Belgeler.** Gözetmen skill'i ve operatör rehberleri ne zaman sürdürülüp ne zaman toplanacağını anlatır.

## v1.7.2 - 2026-10-14

AgentChef 1.7.2 takım modunun bağımsız güvenlik denetimi ve kod incelemesi bulgularını kapatır. İşçiler artık şefin sırlarını görmez, devir metinleri onay satırı enjekte edemez, onay verdiğiniz plan sonradan değiştirilemez ve toplama atlatılamaz ya da kilitlenemez.

### Neler Değişti

- **İşçi yalıtımı.** Sır adlı ortam değişkenleri şefte kalır; devir metni temizlenir ve sınırlanır.
- **Plan bütünlüğü.** `start`, `plan`'dan sonra değişen brief'leri reddeder; brief dosyaları plan klasöründe olmalıdır.
- **Toplama ve gözetim.** İşçi commit'leri ve kirli dosyalar birlikte kapsam ve sır denetiminden geçer; takılan iptal, pano reddi ya da yeniden çalıştırma koşuyu kilitlemez.
- **Pano.** İnceleme kapısı yalnız baştaki Verdict ve Mutation check'i okur; Mutation check neden ya da yol ister; glob çakışmaları ve rapor yolları sıkılaştı.

## v1.7.1 - 2026-10-14

AgentChef 1.7.1, AgentChef'i ve dual-agent-brain'i kendi makinesine sıfırdan kuran biri için ilk takım koşusunu çalışır hale getirir. Temiz profil provası yeni kullanıcının doctor'ının daha ilk koşudan önce kırmızı olduğunu, başlatma ve birleştirme onaylarının dual-agent-brain'den geldiğini hiçbir yerin söylemediğini ve skill `beyin takim` dışında çalışınca onay kancasının hiç görmediği bir pano kullanıldığını buldu.

### Neler Değişti

- **Doctor.** `last-run` bilgi amaçlıdır, `codex.login` çözümü söyler; yeni `board` ve `approval-writer` kontrolleri hangi panonun kullanıldığını ve sohbet onaylarının ona ulaşıp ulaşamayacağını gösterir.
- **Gözetmen skill'i.** dual-agent-brain kuruluysa her komutu `beyin takim` üzerinden çalıştırır; onay yazıcısı yoksa durur ve nedenini söyler.
- **Belgeler.** Kurulum rehberi, README ve skill rehberi iki projeyi birlikte kurmayı ve Beyin'in AgentChef checkout'unu nasıl bulduğunu anlatır.

## v1.7.0 - 2026-10-14

AgentChef 1.7.0 koordinasyon panosunun zayıf kanıtla kapanmasını zorlaştırır ve geniş süreç öldürme komutlarını önce sordurur. Sürüm üç işçili bir takım koşusuyla yapıldı, şef tamamladı.

### Neler Değişti

- **Pano kanıtı.** Raporlar gerçek, boş olmayan ve sır taramasından geçmiş bir dosyadan iliştirilir; açık görevler eksik kanıtı gösterir; görev yalnız son kanıtı `Verdict` ve `Mutation check` içeriyorsa `review`'a geçer.
- **Yazma kapsamı çakışmaları.** Çakışmalar her görevi ve yolu sayar, glob kapsamları temkinli karşılaştırılır, `create` uyarır (`--strict-scope` ile reddeder), engellenen görev kirasını bırakır.
- **Devir sözleşmesi.** agent-brief skill'i ve ayrıştırıcısı `Verdict`, `Mutation check`, ortam tuzakları ve izolasyonu, katı modu ve çakışma bildirimi, QA denemesi ve eskalasyon şablonlarını destekler.
- **Süreç öldürme onayları.** `taskkill`, `tskill`, `kill`, `pkill`, `killall` ve `wmic process` Codex'te ve Claude'da onay ister.
- **Windows güvenilirliği.** Pano ve koşu kaydı yazımları kısa bir paylaşım ihlalinde yeniden dener; tek bir gözetmen tick hatası artık çalışan bir takımı düşürmez.

## v1.6.0 - 2026-10-14

AgentChef 1.6.0 takım modunu her kurulumda açar. İki sürüm ve altı çok rollü canlı koşudan sonra gözetmen ve sınırlı Codex işçileri artık bir opt-in bayrağı istemez. Başlatma ve birleştirme yine kullanıcının yazılı onayını ister, işçiler yine yalıtılmış worktree'lerde ve sınırlı sandbox'ta çalışır, yürütücü yine push veya yayın yapmaz.

### Neler Değişti

- **Herkese açık.** Takım sözleşmesi `execution.enabled` değerini true, `stability` değerini stable yapar. `AGENTCHEF_TEAM_MODE` artık kapatma anahtarıdır: `off`, `0`, `false` veya `disabled` bir süreçte takım yürütmesini kapatır; `experimental` kabul edilir ve etkisizdir.
- **Doktor ve durum.** Doktor `opt-in` yerine `execution` kontrolü verir ve Windows Terminal'i algılamak için wt.exe'yi artık çalıştırmaz; Windows Terminal 1.24 bilinmeyen bayrağa kipli bir Yardım kutusuyla yanıt veriyordu. `codex status` anahtar kapalı değilse takım modunu açık (stable) raporlar.
- **Belgeler.** Ajanlar, skill'ler ve güvenlik modeli rehberleri ile team-conductor skill'i her zaman açık modu İngilizce ve Türkçe anlatır.

## v1.5.1 - 2026-10-13

AgentChef 1.5.1, ilk çok rollü canlı koşulardan sonra deneysel takım yürütücüsünü sağlamlaştırır. Toplama yalnız eklenen diff satırlarını tarar, güvensiz işçi içeriğini tüm koşuyu durdurmak yerine işçi başına reddeder, uzun işçi kanıtında çökmez ve var olan teslim commit'ini yeniden kullanır. İşçi promptları yapılandırılabilir bir dil ve Windows test rehberi taşır. Yürütme isteğe bağlı ve varsayılan olarak kapalı kalır; başlatma ve birleştirme yine ayrı insan onayı ister.

### Neler Değişti

- **Toplama.** Sır benzeri içerik için yalnız eklenen diff satırları taranır; tanı dosya ve satır verir, değeri asla vermez. Reddedilen işçi `rejected_content` olarak işaretlenir ve kirasını bırakır; diğer işçiler toplanmaya devam eder. Rapor ve pano kanıtı teslim commit'inden önce doğrulanır, pano kanıtı pano sınırına kırpılır, temiz worktree'deki var olan teslim commit'i yeniden kullanılır ve izlenmeyen dosyalar yazma kapsamı denetimi için tek tek listelenir.
- **İşçi promptları.** Takım sözleşmesindeki `workers.language` işçi ilerleme mesajlarının ve handoff'un dilini belirler; kod, yol ve komutlar olduğu gibi kalır. Windows'ta işçilere Node testlerini `--test-isolation=none` ile koşmaları söylenir, çünkü Codex sandbox'ı alt süreçleri engeller.
- **Belgeler.** Operatör rehberleri onay kapılarını, kurtarma ve geri almayı, işçi kira sonuçlarını, kısıtlı Codex resume davranışını ve platform süreç yönetimini anlatır. Türkçe 1.5.0 sürüm notları yeniden kodlandı.

## v1.5.0 - 2026-10-12

AgentChef 1.5.0 deneysel, isteğe bağlı bir takım yürütücüsü ekler. Claude gözetmeni, yalıtılmış Codex işçi görevlerini planlar; ardından değişiklikleri toplar ve bağımsız doğrulama için bütünleştirir. Yürütme `AGENTCHEF_TEAM_MODE=experimental` ayarlanmadıkça kapalıdır; başlatma ve birleştirme ayrı insan onayı ister. Yürütücü push veya yayın yapmaz.

### Neler Değişti

- **Takım koşuları.** Gözetmen skill'i ve `team:run` CLI; planlama, gözetimli Codex işçileri, durum, toplama, bütünleştirme, bağımsız doğrulama ve onaylı birleştirmeyi destekler. Her işçi kendi Git worktree'sinde ve sınırlı sandbox'ta çalışır; yürütme varsayılan olarak kapalı ve isteğe bağlıdır.
- **Güvenlik ve görünürlük.** Takım sözleşmesi doğrulayıcısı rol ve sandbox sınırlarını denetler. Koşu kayıtları, işçi olayları ve kullanım bilgisi incelenebilir. Windows Codex yapılandırma argümanları .cmd shim'in koruyamadığı TOML tırnakları olmadan aktarılır.

## v1.3.5 - 2026-10-12

AgentChef 1.3.5 Serena havuzunu port aralığı rezerve edilmiş bir makinede de
başlatır, Claude Code'da yalnız geri alınamayan işler için sorar ve Codex'i
`gpt-6-luna` ile çalıştırır. Güncellemek için `npm run chef -- --update
--apply`; sonra iki CLI'da da yeni oturum aç.

### Neler Değişti

- **Serena havuzu.** Windows hiçbir listede görünmeyen port aralıkları rezerve
  eder; bir makinede türetilen aralığın tamamı bağlanamadı ve her oturum
  `serena CONNECTION_CLOSED` bildirdi. Tercih edilen port bağlanamayınca
  yönetici artık sabit bir yedek port dizisini yürür, ilk boş portu bağlar ve
  onu `~/.codex/serena-pool/port` altına yazar; köprüler önce bu kaydı okur,
  aynı anda başlayan iki yönetici tek portta buluşur.
  `AGENTCHEF_SERENA_POOL_PORT` hâlâ tercih edilen porttur. `codex-status`
  tercih edilen portu, bu makinenin onu bağlayıp bağlayamadığını ve yanıt
  veren yöneticiyi gösteren bir `Serena havuzu:` satırı basar.
- **Claude ask kuralları.** Claude Code her `permissions.ask` kuralında, her
  izin modunda (`bypassPermissions` dahil) sorar; parçanın taşıdığı 186 ask
  kuralı 186 soruydu. Artık 56 kural taşır: force, delete ve mirror push;
  dal, etiket, depo ve release silme; `gh auth` ve token komutları; yayınlama;
  `Stop-Process`; deploy, destroy, migrate, seed, prune, release, reset ve
  repair betikleri. Diğer her prompt ve soru soran tarayıcı araçları ne izinli
  ne sorulu; seçtiğin izin modu karar verir. Güncelleme düşürülen kuralları
  `settings.json` içinden alışıldık yedekle emekliye ayırır; senin zaten
  sildiğin bir kural geri eklenmek ya da eksik sayılmak yerine serbest
  bırakılır.
- **Codex modeli.** `config.toml` `model` ve `review_model` için `gpt-6-luna`
  yazar; rol dosyaları işçilerini zaten onunla çalıştırıyordu.
- **Yönlendirme ipucu.** Başka bir Claude oturumundan iletilen mesaj artık
  yönlendirme ipucu üretmez.

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
