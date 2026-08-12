# TASK-MSPTVP797WM6J — Koordinatör adları, persona ayrımı ve kullanıcı mental modeli

## Ne yapıldı

On bir koordinatörün katalog tanımlarını, kullanıcıya görünen üçer `nickname_candidates` değerini ve kurulum dokümantasyonundaki rol anlatımını karşılaştırdım. Mevcut tasarım, iki ayrı kavramı doğru biçimde ayırıyor:

- Makine kararlı teknik kimlik: `*_coordinator` adları katalog, yapılandırma ve sahiplik eşlemesinin kanonik anahtarıdır.
- İnsan-dostu işlev etiketi: her koordinatör için ilk takma ad (`Backend Lead`, `Design Lead` vb.) hızlı seçimde uygun kullanıcı mental modelini sağlar.
- Kalıcı AgentSpace personası: yerel kimlik ve hafıza düzlemidir; installable koordinatör rolüyle birleştirilmez veya runtime promptuna enjekte edilmez.

Bu ayrım korunmalı. Kullanıcının beklediği akış “işimi alan liderine veriyorum; lider yalnız ilgili dar uzmanların kanıtını birleştiriyor; asıl karar/yetki ana oturumda” olmalıdır. `Lead` etiketi doğrudan uygulama sahibi ya da sınırsız yönetici çağrışımı yapabileceğinden, seçim yüzeyinde bunu bir satırla netleştirmek yararlıdır: “Koordinatör kanıtı birleştirir; işi otomatik devralmaz veya dış etkili işlem yapmaz.”

### Adlandırma değerlendirmesi

| Katman | Mevcut ad | Mental-model etkisi | Karar |
| --- | --- | --- | --- |
| Kararlı kimlik | `design_coordinator`, `backend_coordinator` vb. | Teknik, eşsiz ve otomasyon için açık | Korunmalı |
| Birincil görünen ad | `Design Lead`, `Backend Lead` vb. | Kullanıcının alan bazlı yönlendirme beklentisini karşılar | Korunmalı |
| İkincil görünen ad | `Design Coordinator`, `Backend Coordinator` vb. | Orkestrasyon sınırını açıklar | Yardım metninde/ayrıntıda gösterilmeli |
| Üçüncül takma ad | `UX Review Lead`, `Integration Lead` vb. | Spesifik göreve göre arama/öneri için yararlı; tek başına rol adı olarak kullanılırsa kapsamı daraltabilir | Sadece aday/arama etiketi kalmalı |
| AgentSpace personası | ör. `bob` ve yerel hafıza | Süreklilik ve ofis sorumluluğu sağlar; kurulum rolü değildir | Installable katalogdan ayrı kalmalı |

İsimler arasında doğrudan çakışma yoktur. Ancak “Coordinator” ile “Lead” aynı listede eşdeğer adlar gibi görünürse kullanıcı hangi kelimenin yetkiyi, hangisinin açıklamayı ifade ettiğini anlayamayabilir. Bu yüzden teknik anahtarın saklanması, birincil görünen etiketin `… Lead` olması ve ayrıntıda `… Coordinator — evidence synthesis` açıklamasının verilmesi en küçük, tutarlı iyileştirmedir.

## Kanıt

İncelenen kaynaklar ve gerçek gözlemler:

```text
templates/codex/agents/*_coordinator.toml: 11 dosya
catalog/agents.json: 11 coordinator, her biri roleId + açıklama + sınırlı worker listesi içeriyor
docs/agents.md ve docs/agents.tr.md: 11→21 sahiplik tablosu ve “ana oturum yönlendirir” açıklaması içeriyor
```

Koordinatör takma adlarının PowerShell ile alınan gerçek çıktısı:

```text
backend_coordinator.toml | ["Backend Lead", "Backend Coordinator", "Integration Lead"]
design_coordinator.toml | ["Design Lead", "Design Coordinator", "UX Review Lead"]
leadership_coordinator.toml | ["Engineering Lead", "Leadership Coordinator", "Delivery Lead"]
product_coordinator.toml | ["Product Lead", "Product Coordinator", "Scope Lead"]
qa_coordinator.toml | ["QA Lead", "QA Coordinator", "Assurance Lead"]
```

Diğer altı koordinatör de aynı kalıbı izler: alan `Lead`, teknik `Coordinator`, göreve özgü üçüncül etiket. `templates/codex/AGENTS.md` ayrıca koordinatörün yalnız katalogdaki worker’ları seçebileceğini, coordinator-to-coordinator iletişiminin parent-routed olduğunu ve özel AgentSpace hafızasının istenemeyeceğini belirtir. Bu, yukarıdaki persona ayrımını destekler.

Doğrulama ölçütü (DoD): 11 koordinatörün tamamı eşsiz teknik ada, alan odaklı birincil etikete ve sınır açıklamasına sahip; AgentSpace kimliği katalogdaki bir rol anahtarı değildir. Kaynak incelemesinde bu ölçüt sağlandı.

Repo doğrulaması:

```powershell
npm run validate
```

Gerçek çıktı:

```text
Validation passed. Checked 378 files.
```

Zorunlu sonuç indeksi komutu da denendi ancak bu worktree’nin `package.json` dosyasında bulunmuyor:

```text
npm error Missing script: "results:index"
```

Bu nedenle indeks, mevcut dosya-adı sıralama biçimi korunarak bu raporun bağlantısı eklenerek güncellendi; komutun başarılı olduğu iddia edilmiyor.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPTVP797WM6J-design-lead.md` — bu tasarım değerlendirme raporu.
- `.agentspace/memory/agents/bob/coordinator-persona-mental-model.md` — gelecekteki rol/UX kararları için kalıcı sınır notu.
- `.agentspace/memory/agents/bob/MEMORY.md` — seçilmiş hafıza indeksi işaretçisi.
- `.agentspace/memory/shared/MEMORY.md` — takım geneli sınır kararına işaretçi.

Ürün, katalog, template ve kurulum dokümanları değiştirilmedi.

## Riskler

- `Lead` kelimesi, açıkça sınırlandırılmazsa kullanıcıda uygulama sahipliği veya geniş delegasyon yetkisi beklentisi yaratabilir.
- AgentSpace persona/hafızasını installable rol yüzeyine taşımak, yerel bağlam ve gizlilik sınırını ihlal eder.
- Üçüncül görev-odaklı takma adlar ana rol adı yapılırsa koordinatörün gerçek kanıt-birleştirme kapsamı yanlış daraltılabilir.

## Açık sorular

1. Koordinatör seçildiğinde gösterilen gerçek UI/CLI yüzeyinde birincil ad mı, teknik ad mı, yoksa ikisi birlikte mi gösteriliyor? Bu repo incelemesi tanım/dokümantasyon yüzeyiyle sınırlıydı.
2. Kullanıcı testinde `Lead` yerine “Workstream Lead” gibi daha açık bir etiketin anlaşılabilirlik kazancı ölçülmek isteniyor mu?

## Sonraki adım

Koordinatör seçimi için bir UI/CLI yüzeyi olduğunda, beş kullanıcıyla görev eşleştirme testi yapın: kullanıcı doğru alan liderini seçebilmeli ve koordinatörün kanıt birleştirdiğini, otomatik uygulama/yetki sahibi olmadığını doğru açıklayabilmelidir.
