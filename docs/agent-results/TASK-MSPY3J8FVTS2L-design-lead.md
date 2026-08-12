# TASK-MSPY3J8FVTS2L — Onboarding mental model design

## Ne yapıldı

Codex Chef'in mevcut ilk-kullanım yüzeyini tek bir mental model altında
toparladım. Tasarım kararı: kullanıcı ürünü bir "agent/MCP katalogu" olarak
değil, güvenli biçimde tamamlanan bir iş akışı olarak anlamalıdır:

```text
İhtiyacını söyle → Önce etkisini gör → Bilinçli uygula → İlk işi kanıtla
```

Bu model, mevcut yüzeylere doğrudan karşılık gelir:

| Kullanıcı sorusu | Birincil yüzey | Beklenen anlayış |
| --- | --- | --- |
| "Bu benim için ne yapar?" | README'deki görev odaklı giriş | Codex Chef, her şeyi açan bir paket değil; ihtiyaca göre dar yüzey seçer. |
| "Makinemde ne değişecek?" | Preview-first install | İlk komut yazmaz; planı gösterir. |
| "Uygularsam kontrol bende mi?" | `--apply`, yedek ve onay sınırları | Uygulama bilinçli ikinci adımdır; kullanıcı ayarları ve riskli erişimler korunur. |
| "Sonra nasıl başlarım?" | Capability board ve ilk görev örneği | Bir isteği anlatmak yeterlidir; routing öneridir, otomatik yetki/delegasyon değildir. |
| "Çalıştığını nasıl anlarım?" | Status/doctor/routing komutları | Sağlık, görünür komut çıktısı ve doğrulamayla değerlendirilir. |

Önerilen anlatı sırası: README'nin mevcut "Start With What You Need" bölümü
kullanıcıyı görevine göre bir yüzeye götürür; "Preview First, Install Second"
bu keşfi geri alınabilir makine etkisine bağlar; kurulum çıktısındaki capability
board hangi özelliklerin hazır, kapalı veya opt-in olduğunu gösterir; ardından
kullanıcı ilk gerçek görevini ana oturuma verir. Böylece katalog ayrıntıları,
başlangıç kararı için bir engel değil, gerektiğinde açılan destekleyici bilgi
olur.

### Davranış ilkeleri

1. **Görev önce, mekanizma sonra.** İlk ekranda kullanıcıdan agent, skill veya
   MCP seçmesi beklenmez; bunlar ihtiyaçtan sonra görünür olur.
2. **Önizleme güven sözleşmesidir.** Dry-run bir "kurulum başarısız" durumu
   değil, kullanıcının ilk başarılı kontrol noktasıdır.
3. **Yönlendirme yetki değildir.** Bir rol eşleşmesi öneridir; ana oturum karar,
   izin ve dış-etki sınırı olmaya devam eder.
4. **Hazır / opt-in / onay gerekli ayrımı görünür kalır.** Kullanıcı, bir
   yeteneğin katalogda listelenmesini etkin veya yetkili sanmamalıdır.
5. **Kanıtla kapanış.** İlk değer anı, "kuruldu" metni değil, gerçek bir
   durum/routing/doğrulama komutunun anlaşılır sonucudur.

### Definition of Done

- [x] İlk kullanım için tek cümlelik, sıralı bir mental model tanımlandı.
- [x] Model mevcut README, installer ve routing yüzeylerine eşlendi.
- [x] Delegasyon, onay ve yerel persona sınırlarıyla çelişmediği kontrol edildi.
- [x] UI olmayan bu repo için doğrulama, gerçek CLI/validator kanıtıyla yapıldı;
  var olmayan bir interaktif ekran için sentetik E2E iddiası yapılmadı.

## Kanıt

İncelenen kaynaklar:

- `README.md` — görev odaklı giriş, preview/apply ayrımı, capability board ve
  dört ilk komut.
- `docs/agents.md` — ana oturumun karar/izin sınırı olması ve routing'in
  öneri niteliği.
- `docs/workflow-surface-map.md` — surface seçimi ve koşullu delegasyon.
- `docs/expected-output.md` — preview, capability board ve status çıktısı
  sözleşmesi.
- `templates/codex/AGENTS.md` — onay, güvenlik, routing ve doğrulama
  guardrail'leri.

Gerçek doğrulama çıktısı:

```text
> npm.cmd run validate:agents
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.

> node scripts/codex-routing-board.mjs --profile starter-health
Policy: route matches are recommendations; delegation is conditional and inherits the active user profile.
Boundary: routing profiles make specialists visible, not hidden permission to spawn agents or enable risky tools.
Delegation mode: conditional
Privilege delta: read-only diagnostics first; repair writes only after explicit apply.
```

Bu kanıt, tasarımın iki kritik vaadini destekler: roller görünür ama zorunlu
değildir; sağlık/onarım önce read-only teşhisle başlar.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPY3J8FVTS2L-design-lead.md` — bu tasarım raporu.
- `.agentspace/memory/agents/secv/onboarding-mental-model.md` — gelecekteki
  onboarding kararları için yerel, kalıcı tasarım notu.
- `.agentspace/memory/agents/secv/MEMORY.md` — seçilmiş hafıza işaretçisi.
- `docs/agent-results/INDEX.md` — sonuç indeksi, proje komutuyla yenilenecek.

## Riskler

- Capability board ilk karar noktasından önce gösterilirse kullanıcı agent,
  skill ve MCP ayrıntıları arasında seçim yapmak zorunda hissedebilir.
- Preview, "kurulumun kendisi" gibi anlatılırsa kullanıcı kontrol adımını atlayıp
  doğrudan `--apply` kullanabilir.
- `Lead`/coordinator etiketleri açık sınır olmadan sunulursa otomatik uygulama
  veya geniş yetki beklentisi yaratabilir.
- AgentSpace personasını installable onboarding anlatısına taşımak, yerel
  kimlik/hafıza ile paketlenebilir rol yüzeyini yanlış biçimde birleştirir.

## Açık sorular

1. README'nin üst kısmına bu dört-adımlı model için kısa bir "First successful
   run" şeridi eklenmesi isteniyor mu?
2. Gelecekte bir app/IDE onboarding yüzeyi eklenirse, beş yeni kullanıcıyla şu
   görev testi yapılmalı: kullanıcı preview'ın yazmadığını, `--apply`ın bilinçli
   onay olduğunu ve ilk görevin agent seçmeden verilebildiğini doğru açıklıyor
   mu?

## Sonraki adım

Uygulama onayı verilirse en küçük değişiklik, README ve README.tr'ye aynı
dört-adımlı metinsel onboarding şeridini eklemek; ardından iki dil doğrulaması
ve gerçek install preview çıktısıyla test etmektir. Yeni bir UI ancak bu metin
akışı kullanıcı testinde yetersiz kalırsa değerlendirilmelidir.
