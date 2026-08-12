# TASK-MSPLX7BZUJZB7 — Hedef ajan/knowledge yönlendirme mimarisi

## 1. Ne yapıldı

Codex Chef'in ajan, knowledge, routing, installer, validator, güvenlik ve rollback yüzeyleri salt okunur incelendi. Ürün dosyalarına dokunulmadan aşağıdaki hedef mimari tasarlandı.

### Karar

Mevcut sistemi yeniden yazmayın. Üç otoriteyi açık tutup validator ile bağlayın:

1. `catalog/agents.json`: ajan kimliği, rol özeti, runtime yetki zarfı, `configFile` ve risk sınıfının tek otoritesi.
2. `catalog/agent-research-corpus.json`: kaynak otoritesi, freshness/refresh tetikleri, expertise sinyalleri ve handoff bilgisinin tek otoritesi. Runtime prompt'u veya kullanıcı hafızası değildir.
3. `catalog/routing-profiles.json`: görev sinyallerinden ajan/skill/MCP/flag seçimine giden politikanın ve kanıt kapılarının tek otoritesi.

Runtime kurulumu yalnız resmi Codex yüzeylerine derlenmiş çıktıları taşımalıdır: `config.toml` içindeki `[agents.<name>]` kayıtları ile `agents/<name>.toml` rol katmanları. Resmi config referansı `agents.<name>.config_file` yolunun tanımı yapan config dosyasına göre çözüldüğünü, `description` alanının seçim/spawn rehberi olduğunu doğruluyor: <https://learn.chatgpt.com/docs/config-file/config-reference>.

```text
task text
  -> catalog/routing-profiles.json (deterministik öneri)
       -> catalog/agents.json (kimlik + yetki zarfı)
            <-> templates/codex/agents/*.toml (runtime rolü)
       -> catalog/agent-research-corpus.json (kaynak/freshness kanıtı)

install boundary:
templates/codex/config.{windows,unix}.toml + templates/codex/agents/*.toml
  -> ${CODEX_HOME}/config.toml + ${CODEX_HOME}/agents/*.toml

repo-only boundary:
catalog/*.json + validators + docs (kurulmaz; prompt'a otomatik eklenmez)
```

### Minimal dosya seti

| Dosya | En küçük gerekli uygulama değişikliği |
| --- | --- |
| `catalog/agents.json` | Her ajan için kararlı `knowledgeRef` (ajan adıyla aynı kimlik); mevcut rol/yetki alanları korunur. |
| `catalog/agent-research-corpus.json` | Mevcut `agents[]` kayıtları `name` üzerinden knowledge otoritesi olur; kopya rol/prompt metni eklenmez. |
| `catalog/routing-profiles.json` | Normal durumda seçili ajanların `knowledgeRef` değerleri türetilir. Yalnız ajan-dışı ortak knowledge için gerekirse açık `knowledgeRefs[]` eklenir. |
| `scripts/validate-agent-config.mjs` | Agent adı, config, TOML ve corpus için 1:1 bütünlük; duplicate, eksik ve orphan kayıtlar reddedilir. |
| `scripts/validate-agent-research-corpus.mjs` | `name` benzersizliği, allowlist'li referanslar, freshness alanları ve katalogda bulunan handoff hedefleri doğrulanır. |
| `scripts/validate-routing-profiles.mjs` | Agent/skill/MCP/flag dizi tipleri ve duplicate'ları; varsa knowledge referansları doğrulanır. |
| `scripts/codex-routing-board.mjs`, `scripts/lib/routing-recommendation.mjs` | Çıktıya yalnız seçilmiş knowledge kimliği ve gerekçesi eklenir; içerik prompt'a enjekte edilmez. |
| `docs/agents.md`, `docs/agents.tr.md` | Otorite zinciri, repo-only knowledge sınırı, seçim ve rollback belgelenir. |

İlk sürüm için yeni schema, installer operation, runtime daemon/MCP, hafıza dizini, vector DB veya ajan başına knowledge Markdown ağacı gerekmez. Mevcut corpus ihtiyacı karşılar. Yapısal JSON Schema ancak katalog dış tüketiciye açılırsa ayrı bir sonraki adım olabilir.

### Installer etkisi

- `manifests/install-plan.json` değişmez. Mevcut `codex-config` ve `codex-agents` operasyonları runtime yüzeyini kapsıyor.
- `scripts/install.ps1` ve `scripts/install.sh` değişmez. Ajan TOML'leri mevcut `copy-glob`, config kayıtları mevcut merge/sync yolundan akar.
- Knowledge katalogları global home'a kurulmadığı için yeni destination, collision policy, ownership marker veya backup türü oluşmaz.
- Kullanıcının model/profile/approval/sandbox ve ilgisiz config değerlerini koruyan overlay sözleşmesi sürer.
- Dry-run yeni mutasyon göstermez; knowledge/routing repo doğrulaması ve routing-board kanıtı olarak kalır.

### Validator ve kabul kapıları

1. Agent adları benzersiz; her `configFile` güvenli/göreli ve tek bir mevcut TOML'a çözülür.
2. Her ajan tam bir corpus kaydına sahip; orphan corpus kaydı yoktur.
3. Routing agent/skill/MCP/knowledge referansları var olan benzersiz, boş olmayan stringlerdir ve alanlar gerçek dizidir.
4. Knowledge kaydı secret, auth yolu, mutlak/makine-özel yol, kullanıcı hafızası veya çalıştırılabilir komut taşımaz.
5. Windows/Unix config ajan tabloları katalogla aynı ad/açıklama/config_file setini taşır.
6. Kapılar: `npm run validate:agents`, `npm run validate:agent-corpus`, `npm run validate:routing`, `npm run validate:install-plan`, ardından `npm run validate`.

### Güvenlik etkisi

- Varsayılan yetki artışı yok: knowledge seçimi sandbox, approval, web search, MCP enablement veya model/reasoning seçimini değiştirmez.
- Knowledge metadata'sı talimat olarak çalıştırılmaz; kaynak içerikleri güvenilmez girdi kabul edilir.
- Authenticated MCP'ler kapalı kalır; routing önerisi connector etkinleştiremez.
- Token/cookie/session/auth dosyaları, mutlak yerel yollar, ham sohbetler ve kullanıcı hafızası kataloglara girmez.
- Route eşleşmesi delegasyonu zorlamaz; mevcut koşullu delegasyon ve kullanıcı isteği sınırı korunur.
- Ajan TOML'lerine model/reasoning pin'i eklenmez; aktif kullanıcı profili otoriter kalır.

### Rollback etkisi

1. İlgili routing/knowledge referansı scoped Git revert ile geri alınır.
2. Ajan kaldırılıyorsa katalog kaydı, iki config tablosu, tek TOML ve corpus kaydı atomik ele alınır.
3. Dar validator'lar ve `npm run validate` yeniden çalıştırılır.
4. Kurulu eski ajan dosyaları otomatik silinmez/prune edilmez. Ayrı, açık onaylı restore/cleanup akışı gerekir.
5. Mevcut installer backup manifest/operation journal sözleşmesi kullanılmaya devam eder; yeni backup formatı gerekmez.

### Uygulama sırası ve DoD

1. Duplicate agent, eksik TOML, orphan corpus, bilinmeyen handoff/knowledge ref ve bozuk routing dizi tipi için olumsuz fixture'lar.
2. Katalog bağı ile üç validator'ın küçük değişikliği.
3. Routing-board çıktısında knowledge kimliği + gerekçe; içerik enjeksiyonu yok.
4. EN/TR ajan belgelerinin hizalanması.
5. Installer planının değişmediğinin dry-run ve installer alignment/smoke ile kanıtı.

DoD: 21 ajan/21 TOML/21 corpus eşleşmesi korunur; 16 routing profili geçer; negatif fixture'lar açık hatayla reddedilir; install planında yeni operation/destination yoktur; config overlay kullanıcı ayarlarını korur; `npm run validate` temizdir; gerçek `codex:routing` CLI çıktısı ajan ve knowledge kimliğini gösterir.

## 2. Kanıt

İncelenen ana yüzeyler:

```text
catalog/agents.json
catalog/agent-research-corpus.json
catalog/routing-profiles.json
templates/codex/config.windows.toml
templates/codex/config.unix.toml
templates/codex/agents/*.toml
manifests/install-plan.json
scripts/validate-agent-config.mjs
scripts/validate-agent-research-corpus.mjs
scripts/validate-routing-profiles.mjs
scripts/lib/install-contract.mjs
scripts/lib/installer-safety-preflight.mjs
scripts/install.ps1
scripts/install.sh
scripts/repair-install.mjs
scripts/verify-install-runtime.mjs
```

Çalıştırılan salt-okunur dar doğrulamalar:

```text
Agent config validation passed. Checked 21 agents across 2 configs.
Agent research corpus validation passed.
Routing profile validation passed. Checked 16 profiles.
Install plan validation passed. Checked 29 operations.
COUNTS agents=21 toml=21 corpusAgents=21 routingProfiles=16 installOps=29
```

İnceleme kapsamındaki katalog/template/validator dosyaları için `git diff --check` sıfır çıkışla tamamlandı.

Sonuç indeksleme/doğrulama kanıtı:

```text
npm error Missing script: "results:index"
RESULTS_INDEX_EXIT=1
INDEX_LINKS=13
INDEX_MISSING=0
DIFF_CHECK_EXIT=0
```

Zorunlu komut aynen çalıştırıldı; mevcut `package.json` scripti tanımlamadığı için başarısız oldu. Ürün kapsamını genişletmeden `INDEX.md` dosyası alfabetik ve tüm bağlantıları mevcut olacak şekilde doğrudan güncellendi.

Zorunlu tam kapı ayrıca çalıştırıldı fakat bu görevin kapsamı dışındaki iki mevcut dosya nedeniyle başarısız oldu:

```text
> codex-chef@0.5.67 validate
> node scripts/validate-repo.mjs
Validation failed:
- Forbidden local state/path pattern in docs/.agent-notifications
- Forbidden local state/path pattern in docs/agent-results/TASK-MSPLX7EBX2YJF-sss.md
```

`npm run results:index` çağrısının gerçek sonucu `npm error Missing script: "results:index"` oldu. Mevcut `INDEX.md` bu raporun linkini içeriyor. Gitleaks ortamda yoktu (`GITLEAKS_UNAVAILABLE`).

Resmi sözleşmeler:

- Config ve ajan tabloları: <https://learn.chatgpt.com/docs/config-file/config-reference>
- AGENTS.md kapsamı: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>
- Subagent modeli: <https://learn.chatgpt.com/docs/agent-configuration/subagents>

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MSPLX7BZUJZB7-fevs.md`
- `docs/agent-results/INDEX.md`

Ürün dosyaları değiştirilmedi. `.agentspace` Git commit kapsamına alınmadı.

## 4. Riskler

- Task Board aracı başlık/statüyü döndürdü fakat zengin description gövdesini getiren ayrı bir okuma aracı sunmadı; kapsam kullanıcı mesajındaki minimal dosya seti ile installer/validator/security/rollback gereksinimlerine göre tamamlandı.
- Worktree başka görevlere ait geniş ürün değişiklikleri taşıyor; kapsamlı validate sonucu bu görevden izole olmayacağından dar ilgili validator'lar esas alındı.
- `npm run results:index` mevcut `package.json` içinde tanımlı değildir. Ürün dosyasına script eklemeden `INDEX.md` deterministik güncellendi; gerçek başarısızlık Kanıt bölümünde kayıtlıdır.
- `npm run validate` bu görevin dosyalarından değil, `docs/.agent-notifications` ve başka ajanın `TASK-MSPLX7EBX2YJF-sss.md` raporundaki private-path kalıntılarından bloklandı; açık izin olmadan bu dosyalar değiştirilmedi.
- Gitleaks binary'si mevcut değildi; secret scan çalıştırılamadı.
- Tasarım uygulanmadı; negatif fixture'lar ve gerçek routing CLI kanıtı uygulama görevinin kapısıdır.

## 5. Açık sorular

- Ajan-dışı ortak knowledge için ilk somut kullanım yoksa `knowledgeRefs[]` hiç eklenmemelidir.
- Ajan kaldırmada installed TOML prune edilmemesi kabul edilmelidir; aksi davranış ayrı açık onay ve backup gerektirir.
- Routing-board çıktısında freshness tarihinin gösterilmesi önerilir; stale kaynak kararını görünür kılar.

## 6. Sonraki adım

Önce validator negatif fixture'larını ekleyen küçük bir uygulama görevi açın. Katalog bağını ve routing-board gözlemlenebilirliğini tek inceleme kapsamına alın; installer manifestine yeni operation eklemeyin. Geçici HOME üzerinde gerçek dry-run/install-smoke ve gerçek `codex:routing` çağrısıyla DoD'u doğrulayın.
