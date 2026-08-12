# TASK-MSPTVPF7UC10U — Rol keşfedilebilirliği, adlandırma ve dokümantasyon mesajı incelemesi

## Ne yapıldı

Coordinator/uzman terminolojisi, README giriş yüzeyi, Agents dokümanları, marketing role template’i ve discoverability niyeti için gerçek routing CLI incelendi. Uygulama değişikliği yapılmadı.

### Definition of Done

- [x] Başlangıç yüzeyinden coordinator/worker mimarisine erişim doğrulandı.
- [x] Marketing rol adı, nickname adayları ve worker kapsamı incelendi.
- [x] SEO/dokümantasyon niyetinde gerçek routing seçimi alındı.
- [x] EN/TR mesajı ve karışabilecek noktalar belgelendi.

## Bulgular ve öneriler

1. README’nin ilk yönlendirme tablosu açık: “See 11 coordinators + 21 specialists” doğrudan `docs/agents.md`ye, Türkçe eşleniği `docs/agents.tr.md`ye gider.
2. Ownership tablosu bütün 11 coordinator, worker grupları ve delegasyon/güvenlik sınırlarını tek yüzeyde gösterir.
3. `marketing_coordinator` teknik adı net; nickname adayları “Marketing Lead”, “Marketing Coordinator”, “Growth Lead” farklı kullanıcı dillerine karşılık verir.
4. Marketing’in sınırı doğru: `google_seo_auditor` + `docs_author`ı koordine eder, yayın yapmaz; read-only/on-request kalır.
5. SEO + metadata + documentation + discoverability görevinde gerçek CLI `marketing_coordinator`ı primary seçti.

### Mesaj riski

`docs/agents.md` ilk paragrafı “Codex Chef includes 21 custom roles” der; aşağıda “eleven installed coordinators” ve “21 specialist workers” açıklanır. README 11+21 ayrımını doğru yaparken bu ilk cümle toplam rol sayısını belirsizleştirir.

Uygulanmamış minimal öneri:

```text
Codex Chef includes 11 coordination roles and 21 specialist worker roles.
They are not background services...
```

Türkçesi:

```text
Codex Chef, 11 koordinasyon rolü ve 21 uzman worker rolü içerir.
Bunlar arka planda sürekli çalışan servisler değildir...
```

Uzman odaklı bölüm listeleri coordinator’ları yalnız ownership tablosunda gösterir. Kullanıcıların doğrudan “Marketing Lead” araması hedefleniyorsa bu tablonun üstüne kısa bir coordinator-vs-specialist seçme notu eklenmeli; önce kullanıcı testi gerekir.

## Kanıt

```text
npm run validate:doc-locales
Doc locale validation passed for complete English and Turkish operator docs.

npm run validate:locales
README locale validation passed. Checked 6 honest public entry points.
```

```text
Real routing CLI task: SEO metadata documentation discoverability
primaryCoordinator: marketing_coordinator
primary workers: google_seo_auditor, docs_author
peer handoffs: data_coordinator(docs_researcher), devops_coordinator(performance_auditor), frontend_coordinator(frontend_verifier), support_coordinator(devex_auditor)
each handoff via: parent-routed-handoff
```

```text
templates/codex/agents/marketing_coordinator.toml
nickname_candidates = ["Marketing Lead", "Marketing Coordinator", "Growth Lead"]
approval_policy = "on-request"
sandbox_mode = "read-only"
Own discoverability and content task correlation, not publication.
```

İncelenen yüzeyler: `README.md`, `README.tr.md`, `docs/agents.md`, `docs/agents.tr.md`, `docs/skills-and-agents.md`, `docs/skills-and-agents.tr.md`, `catalog/agents.json`, `templates/codex/agents/marketing_coordinator.toml`, `scripts/codex-routing-board.mjs`.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPTVPF7UC10U-marketing-lead.md` — inceleme raporu.

## Riskler

- “Marketing Lead” nickname’i TOML’dedir; public docs’ta doğrudan aranabilir giriş yoktur.
- “21 custom roles” ile 11+21 mimarisi aynı yüzeyde farklı sayım modeli kullanır.
- Marketing coordinator’ın görevi discoverability/content correlation’dır; ranking garantisi veya yayın yetkisi olarak sunulmamalıdır.

## Açık sorular

- Kullanıcıların direct coordinator seçmesi mi, yoksa yalnız routing sonucunda görmesi mi hedef?
- Nickname adayları `/agent` veya başka bir kullanıcı yüzeyinde arama/eşleştirme için gerçekten kullanılıyor mu? Runtime nickname resolution kanıtı bu incelemede yok.

## Sonraki adım

Doküman sahibi, iki dilde ilk cümlede 11 coordinator + 21 specialist ayrımını eşitlemeli. Sonra `npm run validate:doc-locales`, `npm run validate:locales` ve discoverability routing acceptance testi yeniden çalıştırılmalı.
