# TASK-MSPTVPF7UC10U — Marketing rolü keşfedilebilirliği ve EN/TR mesajı

## Ne yapıldı

Marketing rolü, adlandırma, README girişleri ve İngilizce/Türkçe agent dokümantasyonu katalog/config/routing kaynaklarıyla karşılaştırıldı.

- Canonical isimlendirme tutarlı: katalogda `marketing_coordinator` / role ID `marketing`; rol TOML nickname adayları `Marketing Lead`, `Marketing Coordinator`, `Growth Lead`; sahip olduğu dar worker kümesi `google_seo_auditor`, `docs_author`.
- README ve README.tr ana girişleri aynı 11 coordinator + 21 specialist iddiasını, doğru `docs/agents` dil bağlantısını ve “delegation yalnız gerçekten faydalı olduğunda” mesajını veriyor.
- EN ve TR agent rehberleri 21 specialist çağrı-anı satırında eş; SEO/discoverability ile docs/content uzmanlarının kullanıcıya dönük çağrı koşulları açıkça anlatılıyor.
- Keşfedilebilirlik açığı: `marketing_coordinator`, iki dilde yalnız AgentSpace ownership tablosunda bulunuyor. README’de örnek roller arasında ve “Bring it in when…” specialist rehberinde pazarlama/growth için coordinator giriş noktası yok. CLI `seo-web-quality` ise marketing coordinator’ı yalnız peer handoff olarak gösteriyor; doğrudan owner olarak `google_seo_auditor` seçiyor.

## Kanıt

Odaklı doğrulamalar:

```text
> npm run validate:agents
Agent config validation passed. Checked 11 coordinators and 21 specialist workers across 2 configs.

> npm run validate:locales
README locale validation passed. Checked 6 honest public entry points.

> npm run validate:doc-locales
Doc locale validation passed for complete English and Turkish operator docs.
```

Gerçek CLI routing görünürlüğü:

```text
Coordinator: devops_coordinator owns: performance_auditor
Peer handoff: frontend_coordinator via parent-routed-handoff: frontend_verifier
Peer handoff: marketing_coordinator via parent-routed-handoff: google_seo_auditor

Owner: google_seo_auditor with performance_auditor and frontend_verifier
Boundary: Do not promise rankings, automate backlinks, or use credentialed Search Console access without explicit approval.
```

Statik EN/TR korelasyonu:

```text
README.md:      “See 11 coordinators + 21 specialists” -> docs/agents.md
README.tr.md:   “11 koordinatör + 21 uzmanı gör” -> docs/agents.tr.md
docs/agents.md:    21 specialist “Bring it in when…” rows; marketing_coordinator -> google_seo_auditor, docs_author
docs/agents.tr.md: 21 specialist çağrı-anı satırı; marketing_coordinator -> google_seo_auditor, docs_author
```

Bu görev için Gitleaks çağrısı da denendi ancak denetim shell'i `gitleaks` executable'ını bulamadı; bu nedenle secret-scan kanıtı mevcut değildir. Rapor yalnız public role/dokümantasyon adlarını içerir.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPTVPF7UC10U-marketing-lead.md` — bu denetim raporu.
- `docs/agent-results/INDEX.md` — rapor bağlantısı mevcut alfabetik biçim korunarak eklendi.
- `.agentspace/memory/agents/pm-d00406/marketing-role-discoverability.md` ve `MEMORY.md` — yalnız yerel PM hafızasında kalıcı keşfedilebilirlik notu/pointer'ı; install veya Git yüzeyi değildir.

## Riskler

- “Marketing Lead” kullanıcı dostu nickname olarak role TOML’unda var fakat README ve agent seçme rehberi bunu giriş noktası olarak kullanmıyor. Growth/content talebi kullanıcı tarafından yalnız `docs_author` ya da `google_seo_auditor` olarak algılanabilir.
- `seo-web-quality` profili SEO/Web Quality odağındadır; content/discoverability stratejisinin tamamını pazarlama coordinator’ına yönlendiren ayrı bir profil değildir.
- Bu analiz canlı Search Console, sıralama veya publish kontrolü değildir; static docs, validator ve yazmayan CLI routing kanıtına dayanır.

## Açık sorular

- README “Agents” örnek cümlesine `google_seo_auditor` veya “marketing/discoverability” kavramı eklenmeli mi; yoksa kısa giriş yüzeyi bilinçli olarak genel mi kalmalı?
- `marketing-discoverability` adlı küçük bir routing profili, `marketing_coordinator` ile `google_seo_auditor`/`docs_author` seçimini doğrudan görünür kılmalı mı?
- Türkçe rehberde uzman isimleri korunurken kullanıcı dilindeki “Pazarlama / keşfedilebilirlik” giriş etiketi eklenmeli mi?

## Sonraki adım

Keşfedilebilirlik iyileştirmesi istenirse en küçük doğru değişiklik: README/README.tr’de aynı kavramsal giriş, docs/agents EN/TR’de “Marketing / Pazarlama ve keşfedilebilirlik” coordinator çağrı cümlesi ve opsiyonel dar routing profili. Katalog, config, role TOML, iki dil ve `validate:agents`/`validate:routing` birlikte güncellenmeli; SEO ranking vaadi, credentialed Search Console veya otomatik publish kapsam dışı kalmalıdır.
