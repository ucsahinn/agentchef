# Taşınabilirlik ve runtime sözleşmesi

[English](portability-contract.md) | [Türkçe](portability-contract.tr.md)

## Durum, kapsam ve yetki

Bu sözleşme, AgentChef'in hiçbir makinenin özel durumunu dağıtılabilir ürün
verisi saymadan başka bir PC'ye nasıl kurulup doğrulanabileceğini tanımlar.
AgentChef ile ayrı kurulmuş herhangi bir araç arasında paylaşımlı runtime,
credential, arka plan servisi veya yetki eklemez.

AgentChef yalnızca kendi versiyonlu dağıtım varlıkları, yönlendirmesi ve
güvenli yerel çalışma sözleşmesi için yetkilidir. Hedef PC ve operatörü; home
dizinleri, oturum açma, erişim onayları, depolar ve hafıza motoru, control
plane veya workspace kabuğu gibi ayrı kurulmuş yardımcı servisler için yetkili
kalır.

## PC'den bağımsız keşif

İzlenen hiçbir yapılandırma, rapor, fixture veya komut örneği belirli bir
kullanıcı adı, sürücü harfi, home dizini veya checkout konumu gerektiremez.
Çalışma anında AgentChef aşağıdaki kökleri şu sırayla çözer:

| Konu | Runtime kaynağı | Varsayılan | Sözleşme |
| --- | --- | --- | --- |
| Codex yönetilen dosyalar | `CODEX_HOME` | platform kullanıcısının `.codex` dizini | Seçilen home install/verify çıktısında açıktır; başka bir PC'nin yolundan asla çıkarsanmaz. |
| Global skill'ler ve plugin marketplace | `AGENTS_HOME` | platform kullanıcısının `.agents` dizini | Seçilen kök yönetilen yazmadan önce incelenir; yabancı içerik açıkça benimsenmedikçe korunur. |
| Depo varlıkları | çalışan betiğe göre çözülen mevcut checkout | mevcut checkout | Checkout taşınabilir; üretilen raporlar redakte edilmiş veya depoya göreli yollar kullanmalıdır. |
| Geçici doğrulama durumu | koşu için seçilen sınırlı geçici kök | yok | Yalnızca preview/smoke kontrolleri için uygundur; kurulum hedefi veya taşınabilir durum deposu değildir. |

Ortam değişkeni geçersiz kılmaları bir hedef seçer; kaynak makineye erişim
kopyalamaz, birleştirmez veya vermez. Doğrulayıcı, ortamdaki bir Codex sürecinin
veya farklı bir hesap profilinin aynı home'u kullandığını varsaymak yerine
seçilen `CODEX_HOME`'u test etmelidir. Profil/yapılandırma değişikliği yalnızca
yeni başlatılan oturumda etkili olur.

Taşıma veya onarım öncesinde redakte edilmiş, salt-okunur keşfi kullanın:

```powershell
npm run plan:install -- --all --summary --redact-paths
npm run verify:install:runtime -- --redact-paths
npm run codex:status -- --redact-paths
```

İlk komut bir plandır, kurulum değildir. Runtime doğrulayıcı canlı Codex
probe'ları kullanılamadığında çevrimdışı çalıştırılabilir; kullanılamayan canlı
probe, operatör açıkça canlı runtime kanıtı istemedikçe bir uyarıdır.

## Yerel durum sınırı

Taşınabilir birim, AgentChef kaynağı ile review edilmiş, kurulabilir
varlıklarıdır. Makineye ve kimliğe bağlı durumu dışarıda bırakır:

- kimlik doğrulama dosyaları, token'lar, API anahtarları, çerezler,
  tarayıcı/oturum depolaması, credential helper'lar ve OAuth callback verisi;
- konuşma, terminal, görev panosu, özel hafıza, cache, log, telemetri, kilit,
  süreç ve kod indeksi durumu;
- başka bir ürünün worktree, run, onay, not, veritabanı veya projeksiyon
  durumu;
- review edilmemiş global yapılandırma, kullanıcıya ait skill'ler ve yabancı
  plugin içeriği.

Installer yalnızca belgelenmiş yönetilen hedeflerini oluşturabilir veya
güncelleyebilir. Yabancı bir hedefi benimseyemez, aktif bir oturumu yeniden
yaratamaz veya kopyalanmış bir yerel durum dosyasını geçerli hedef runtime
kanıtı olarak kullanamaz. Opak tanımlayıcılar kullanıcı adı, yol, token, prompt
veya onay izni değildir.

## Yedekleme ve geri yükleme sözleşmesi

Mevcut bir Chef-yönetimli hedefi değiştirmeden önce install, update veya repair
akışı bir yedek oluşturur; yalnızca tüm işlem sadece yeni hedefler oluşturuyorsa
ve operatör belgelenmiş uyumluluk istisnasını seçtiyse yedek atlanır. Yedek,
seçilen hedef için bir geri alma varlığıdır; farklı bir PC için taşıma arşivi
veya özel yerel durum taşıyıcısı değildir.

```powershell
npm run chef -- --backups
npm run chef -- --backups --backup <id> --restore
npm run chef -- --backups --backup <id> --restore --apply
```

Listeleme ve inceleme yalnızca metadata okur. Geri yükleme önce ön izlemedir;
`--apply` açık yazma sınırıdır. Her geri yükleme öncesinde AgentChef yedek
manifestini, hedef allowlist'ini, yolları, bağlantı güvenliğini, boyutları ve
SHA-256 envanterini doğrular; bozuk, değiştirilmiş, fazla veya desteklenmeyen
control-plane içeriği fail-closed davranır. Geçerli bir arşivi uygulamak önce
mevcut hedeflerin taze bir geri alma yedeğini oluşturur ve sonraki bir yazma
başarısız olursa yazılmış hedefleri geri alır. Yedek silme ayrı, elle yapılan,
review edilmiş bir eylemdir.

## Sırlar, redaksiyon ve kanıt

Taşınabilir dokümantasyon ve kanıt, home/depo yollarını redakte etmeli; ham
sır, authorization header, API anahtarı, çerez, oturum verisi, özel prompt,
terminal transkripti veya özel hafıza içermemelidir. Taşınabilirlik testleri
için sentetik fixture'lar kullanın; bir redaktörü sınamak için gerçek bir mutlak
kullanıcı yolunu asla depoya eklemeyin.

Paylaşılabilir tanılar için `--redact-paths`, sürüm-hassas bir teslim
öncesinde `gitleaks detect --redact --no-banner --no-git --verbose` kullanın.
Redakte edilmiş rapor incelenen yüzeyin kanıtıdır; kullanıcının redakte
edilmemiş durumunu okuma izni değildir. Sır işleme ve onay davranışı güncel
[OpenAI Codex yönlendirmesine](https://developers.openai.com/) tabidir.

## Yardımcı servisler ve gerileme davranışı

Yardımcı servisler bir AgentChef kurulumu için isteğe bağlıdır. Örnekler: ayrı
kurulmuş bir hafıza motoru, yerel bir control plane veya bir workspace kabuğu.
Bir yardımcı servis yoksa, erişilemiyorsa, bayatsa, kimliği doğrulanmamışsa,
uyumsuzsa veya bilerek bağlantısı kesilmişse:

| Yüzey | Zorunlu davranış | Yasak davranış |
| --- | --- | --- |
| AgentChef | Yerel önce-ön-izle akışını, yönlendirmeyi, incelemeyi ve onaylı yerel komutları sürdürür. | Yardımcının run, onay veya durum kayıtlarını uydurmak, yapılandırmasını değiştirmek veya onun adına bağlantı kurmak. |
| Yardımcıya bağlı durum | Güvenli bir neden ve varsa son gözlem zamanıyla `unavailable`, `unknown` veya `stale` gösterir. | Önbelleklenmiş durumu güncel gibi sunmak veya bir gözlemi onay saymak. |
| Kurtarma | Operatör ayrı sahipli yardımcıyı geri getirdikten sonra bilinçli bir yerel yeniden deneme ister. | Yardımcıyı otomatik başlatmak, credential aktarmak veya izinleri sessizce genişletmek. |

Bağlantı, ayrıştırma, şema ve izin hataları AgentChef tarafından sınırlanır.
Onay kapılarını zayıflatmaz ve bağımsız yerel akışı engellemez. Bağlantısız
durum bir güvenlik duruşudur, başarısız kurulum kanıtı değildir.

## Doğrulama ve bitti tanımı

- [ ] Bir hedef, kaynak makine yolu olmadan kendi home'larını çözebilir.
- [ ] Paylaşılabilir tanılar yolları redakte eder ve credential veya oturum durumunu açığa çıkarmaz.
- [ ] Yedek incelemesi değişiklik yapmaz; geri yükleme manifestini doğrular ve açık apply ister.
- [ ] Her yardımcı servisin bağlantısı kesikken AgentChef kullanılabilir kalır; yardımcıdan türeyen tüm durum açıkça unavailable, unknown veya stale'dir.
- [ ] Hiçbir adım ürünler arası yetki vermez veya yıkıcı bir kurtarmayı otomatik yapmaz.

## İlgili materyal

- [Güvenlik modeli: taşınabilir workspace sınırı ve yedekten geri yükleme](security-model.tr.md)
- [Kurulum rehberi: runtime doğrulama ve yedek komutları](install.tr.md)
- [Doğrulama](verification.tr.md)
