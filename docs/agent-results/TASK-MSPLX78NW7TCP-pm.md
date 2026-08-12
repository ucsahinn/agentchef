# TASK-MSPLX78NW7TCP — AgentSpace ajan/knowledge-base envanteri ve 21 uzman rol eşlemesi

## Ne yapıldı

Mevcut kirli worktree korunarak AgentSpace'in yerel ajan/hafıza yüzeyi ile Codex Chef'in dağıtılabilir ajan, knowledge-base ve kurulum yüzeyleri salt okunur incelendi. Ürün dosyaları değiştirilmedi. Özel hafızanın içeriği rapora taşınmadı; yalnız rol düzeyinde seçilmiş envanter ve sayımlar kullanıldı.

### Envanter özeti

| Yüzey | Kanonik kaynak | Gözlenen envanter | Dağıtım durumu |
| --- | --- | ---: | --- |
| AgentSpace sanal ofis rolleri | Yerel `.agentspace/memory/agents/` kimlik dizinleri | 8 rol: data, ekip lideri, FE/VS, frontend, geliştirici, PM, QA/SSS, tasarım | Özel ve makine-yerel; ürün paketi/installer kapsamı dışında |
| AgentSpace seçilmiş hafıza | Kimlik başına `MEMORY.md` ve seçilmiş bağlı notlar | 8 indeks, toplam 17 Markdown dosyası | Özel; rapora içerik veya mutlak yol alınmadı |
| Codex Chef uzman ajan kataloğu | `catalog/agents.json` | 21 uzman | Repo kaynak yüzeyi |
| Codex uzman rol tanımları | `templates/codex/agents/*.toml` | 21 TOML; katalogla birebir | `codex-agents` install operasyonuyla `${CODEX_HOME}/agents` altına kopyalanır |
| Codex config ajan bildirimleri | `templates/codex/config.windows.toml`, `templates/codex/config.unix.toml` | Her platformda 21 bildirim | Config install/merge yüzeyi |
| Kamuya açık knowledge base | `kb/` | 10 İngilizce + 10 Türkçe konu, ayrıca iki dilde README | `package.json` dağıtım listesinde; global Codex install planında ayrı bir `kb` kopyalama operasyonu yok |
| Brain çalışma yordamı | `codex-chef-brain` bundled/direct skill | 1 installable workflow | Skill install edilir; kullanıcı vault'u, AgentSpace hafızası ve otomatik capture install edilmez |

### AgentSpace ↔ Codex Chef 21 uzman rol eşleme matrisi

Bu matris bir kimlik dönüşümü değildir. AgentSpace tarafı kalıcı ofis sahipliği/iş rolünü, Codex Chef tarafı ise görev başına çağrılabilen dar uzmanlık yüzeyini temsil eder. Bir ofis rolü birden çok uzmanı kullanabilir; bir uzman da birden çok ofis rolüne hizmet edebilir.

| # | Codex Chef uzmanı | Birincil AgentSpace sahibi | İkincil/inceleme sahibi | Eşleme gerekçesi ve sınır |
| ---: | --- | --- | --- | --- |
| 1 | `code_mapper` | geliştirici | data, FE/VS, frontend | Repo haritası ve akış keşfi; salt okunur keşif, uygulama sahipliği değil |
| 2 | `docs_researcher` | data | PM, ekip lideri | Güncel birincil kaynak ve sürüm doğrulaması; ürün kararı vermez |
| 3 | `context_architect` | ekip lideri | PM, geliştirici | Prompt/AGENTS/skill/plugin/MCP/hafıza/config yerleşim kararı; özel hafıza taşımaz |
| 4 | `prompt_architect` | PM | ekip lideri | Uygulanabilir brief, kabul kriteri ve talimat sözleşmesi üretir |
| 5 | `mcp_integrator` | geliştirici | ekip lideri, QA/SSS | En az yetkili connector planı; auth/connector etkinleştirme yetkisi vermez |
| 6 | `product_strategist` | PM | ekip lideri | Problem, kapsam ve en küçük yararlı sürüm; implementasyon yapmaz |
| 7 | `engineering_planner` | ekip lideri | geliştirici, FE/VS | Mimari, veri akışı, edge case ve test stratejisi; salt okunur planlama |
| 8 | `design_reviewer` | tasarım | frontend, PM | UX, erişilebilirlik ve tasarım sistemi eleştirisi; render doğrulamasının yerine geçmez |
| 9 | `devex_auditor` | geliştirici | PM, QA/SSS | Onboarding/TTHW ve hata toparlama; geçici kanıt yazabilir, global kurulum yapamaz |
| 10 | `root_cause_debugger` | geliştirici | FE/VS, frontend, QA/SSS | Reprodüksiyon ve hipotez testi; atanmış yazma kapsamı olmadan ürün kodunu değiştirmez |
| 11 | `qa_lead` | QA/SSS | PM, geliştirici | E2E senaryoları, regresyon ve yeniden doğrulama sahipliği |
| 12 | `performance_auditor` | FE/VS | frontend, geliştirici, QA/SSS | Ölçüme dayalı darboğaz/gerileme analizi; prod yükü/deploy yetkisi yok |
| 13 | `google_seo_auditor` | data | frontend, PM | Crawl/index/metadata/CWV denetimi; ranking vaadi veya credentialed erişim yok |
| 14 | `docs_author` | data | PM, geliştirici | Repo kanıtından Diataxis dokümanı; yayınlama yetkisi yok |
| 15 | `spec_author` | PM | ekip lideri, geliştirici | Belirsiz isteği ölçülebilir spec/DoD'a çevirir; implementasyonu ayrı tutar |
| 16 | `code_reviewer` | ekip lideri | geliştirici, QA/SSS | Fresh-context doğruluk/güvenlik/regresyon incelemesi; kodu yeniden yazmaz |
| 17 | `frontend_verifier` | frontend | tasarım, QA/SSS | Gerçek tarayıcı, responsive ve etkileşim kanıtı; kod incelemesiyle ikame edilmez |
| 18 | `security_auditor` | QA/SSS | ekip lideri, geliştirici | Auth, yetki, secret ve abuse-path salt okunur denetimi; sırları raporlamaz |
| 19 | `test_verifier` | QA/SSS | geliştirici, FE/VS, frontend | Test/lint/typecheck/build/smoke kanıtı; ürün kodunu düzeltmez |
| 20 | `release_verifier` | ekip lideri | QA/SSS, PM | Git hijyeni, artifact, sürüm ve secret scan kapıları; publish yetkisi yok |
| 21 | `codex_doctor` | geliştirici | ekip lideri, QA/SSS | Starter health, katalog/install-plan drift ve doğrulama açığı teşhisi |

### Kapsama değerlendirmesi

- Sekiz AgentSpace rolünün tamamı en az bir Codex Chef uzmanıyla kapsanıyor; birebir 8→21 dönüşüm beklenmemeli.
- En yoğun ortak uzmanlar `code_mapper`, `engineering_planner`, `root_cause_debugger`, `test_verifier` ve `release_verifier`; bunlar sahiplik değil görev-temelli destek sağlar.
- AgentSpace'teki FE/VS etiketi yerel isimlendirme olarak korunmuştur; rapor bu rolün açılımını tahmin etmez. Eşleme, frontend/geliştirme/performance görev kesişimine göre ihtiyatlıdır.
- Codex Chef'in `workspace-write` uzmanları bile mevcut onay/sandbox sınırlarını aşmaz. `workspace-write`, özel AgentSpace hafızasını installable yüzeye taşıma veya global state değiştirme yetkisi değildir.

### Özel hafıza / installable surface sınırı

| Veri/sözleşme | Doğru yüzey | Install/publish kararı | Gerekçe |
| --- | --- | --- | --- |
| Ajan kimliği, pane tercihi, geçmiş karar/gotcha | AgentSpace özel seçilmiş hafıza | **Hariç** | Kullanıcıya/makineye özgü; repo ve global starter kaynağı değildir |
| Takım geneli fakat özel çalışma bilgisi | AgentSpace `shared` hafıza | **Hariç** | Yerel ortak bağlamdır; public docs değildir |
| Genel ve tekrar kullanılabilir rol davranışı | `catalog/agents.json` + `templates/codex/agents/*.toml` | **Dahil** | İncelenebilir, doğrulanabilir ve install planıyla yönetilen uzman yüzeyidir |
| Genel kullanıcı sorusuna kısa çözüm | `kb/*.md` + dil eşi | **Paket dahil, global install hariç** | Repo/package bilgi bankasıdır; `${CODEX_HOME}` runtime dosyası değildir |
| Hafıza iş akışı ve güvenlik protokolü | `codex-chef-brain` skill | **Dahil** | İş akışı dağıtılır; vault içeriği dağıtılmaz |
| Brain vault / capture içeriği | Kullanıcının açıkça seçtiği yerel vault | **Hariç** | Preview/apply ve kullanıcı mülkiyeti sınırı; otomatik capture kapalı |
| MCP `memory` / `codebase-memory` runtime state | İlgili yerel connector state'i | **Hariç ve varsayılan kapalı** | AgentSpace hafızası veya public KB ile aynı veri düzlemi değildir |

En kritik pratik sınır: `.agentspace/` install planında ve `package.json#files` listesinde yoktur; buna rağmen mevcut `.gitignore` da bu dizini yakalamamaktadır (`git check-ignore` sonucu: `NOT_IGNORED`). Bu görevde ürün dosyasına dokunma yasağı nedeniyle ignore kuralı eklenmedi. Commit güvenliği açık path staging ile sağlanmalıdır; uzun vadede ayrı bir güvenlik işi olarak `.agentspace/` ignore koruması değerlendirilmelidir.

## Kanıt

### Sayım ve parity kontrolü

Komut özeti:

```powershell
$a = Get-Content -Raw catalog/agents.json | ConvertFrom-Json
# catalog, TOML, iki config, özel rol/not ve iki dilli KB sayımları
```

Gerçek çıktı:

```text
COUNTS agents=21 templates=21 configWindows=21 configUnix=21 privateIdentities=8 privateNoteFiles=17 kbEnglishTopics=10 kbTurkishTopics=10
```

Kaynak satırları:

```text
catalog/agents.json:12:"agents": [
manifests/install-plan.json:122:"id": "codex-agents",
manifests/install-plan.json:125:"sourceGlob": "templates/codex/agents/*.toml",
manifests/install-plan.json:215:"id": "codex-chef-brain-direct-skill",
package.json:30:"kb/",
kb/README.md:12:## Start Here
```

### Özel yüzeyin Git koruması

Komut:

```powershell
git check-ignore -v '.agentspace/memory/agents/pm-d00406/MEMORY.md'
```

Gerçek sonuç:

```text
CHECK_IGNORE:NOT_IGNORED
```

`git ls-files '.agentspace/**'` kayıt döndürmedi; özel yüzey tracked değildir. Public-readiness sözleşmesi ayrıca `docs/public-readiness.md:17` üzerinde source tree'nin memory/private path içermemesini şart koşar.

### Board ve çalışma ağacı

Board aracı `TASK-MSPLX78NW7TCP` kaydını `in_progress`, sprinti `SPRINT-CODEX-CHEF-AGENT-MIMARISI-2026-08`, projesi `codex-chef-agent-mimarisi` olarak döndürdü. Başlangıç `git status --short` çıktısı ürün dosyalarında çok sayıda mevcut değişiklik ve `.agentspace/` dahil untracked yerel yüzey gösterdi; bu dosyalar okunmuş fakat değiştirilmemiş, stage edilmemiş ve temizlenmemiştir.

### Sonuç indeksi kapısı

Zorunlu komut gerçek olarak çalıştırıldı:

```powershell
npm run results:index
```

Gerçek çıktı:

```text
npm error Missing script: "results:index"
```

Mevcut `package.json` bu script'i tanımlamadığı ve görev ürün dosyalarına dokunmayı yasakladığı için script eklenmedi. Mevcut `docs/agent-results/INDEX.md` biçimi korunarak bu raporun alfabetik bağlantısı yalnız indeks dosyasına eklendi. Bu, komut kapısının geçtiği iddiası değildir; eksik script repo/tooling açığı olarak kaydedilmiştir.

### Yapısal ve repo doğrulaması

Rapor/indeks kapsam kontrolünün gerçek çıktısı:

```text
## Ne yapıldı=True
## Kanıt=True
## Değişen dosyalar=True
## Riskler=True
## Açık sorular=True
## Sonraki adım=True
MATRIX_ROWS=21
INDEX_LINK=True
git diff --check: exit 0
```

Repo doğrulaması:

```powershell
npm run validate
```

Gerçek sonuç `exit 1` oldu; yalnız görev dışı dosyalar raporlandı:

```text
Validation failed:
- Forbidden local state/path pattern in docs/.agent-notifications
- Forbidden local state/path pattern in docs/agent-results/TASK-MSPLX7EBX2YJF-sss.md
```

Bu görev raporu validator hata listesinde değildir. Kapsam dışı dosyalar değiştirilmedi. Gitleaks PATH üzerinde bulunmadığından çalıştırılamadı (`GITLEAKS_UNAVAILABLE`).

## Değişen dosyalar

- `docs/agent-results/TASK-MSPLX78NW7TCP-pm.md` — bu salt-okunur analiz raporu.
- `docs/agent-results/INDEX.md` — eksik `results:index` script'i nedeniyle mevcut alfabetik biçim korunarak elle güncellenen sonuç indeksi.
- Ürün, katalog, template, installer ve KB dosyaları değiştirilmedi.

## Riskler

- `.agentspace/` mevcut `.gitignore` tarafından dışlanmadığı için geniş `git add` kullanımı özel hafıza sızıntısı yaratabilir; yalnız açık dosya staging zorunludur.
- AgentSpace rol adları ile Codex uzmanları farklı soyutlama katmanlarıdır; matris otomatik delegasyon veya yeni yetki üretmez.
- Yerel FE/VS rolünün açılımı kanonik kaynakta doğrulanmadı; bu eşleme ihtiyatlı ve görev-kesişimi temellidir.
- Kirli worktree nedeniyle repo geneli doğrulama hataları bu rapordan bağımsız olabilir; push-ready iddiası yapılmamalıdır.
- Zorunlu `npm run results:index` script'i mevcut değildir; indeks bu görevde mevcut deterministik formatla elle güncellenmiştir.

## Açık sorular

1. `.agentspace/` için repo-local `.gitignore` koruması ayrı ve onaylı bir güvenlik görevi olarak eklenmeli mi?
2. AgentSpace'in FE/VS rolü için kanonik rol açılımı ve sorumluluk sözleşmesi ayrıca yayımlanacak mı?
3. Public `kb/` içeriğinin global kurulum sonrasında offline erişimi isteniyorsa, bunun docs/package yüzeyi olarak mı kalacağı yoksa ayrı, açık bir install operasyonu mu olacağı ürün kararı gerektirir.
4. Board/ajan sonuç sözleşmesinin zorunlu kıldığı `results:index` script'i repo `package.json` dosyasına ayrı görevle eklenmeli mi?

## Sonraki adım

Önce `.agentspace/` için ignore/secret-scan güvenlik kapısını ayrı kapsamda kararlaştırın. Ardından ekip lideri, bu 8→21 matrisi hedef ajan mimarisi ve kabul/güvenlik kapılarıyla birleştirerek hangi uzmanların varsayılan, hangilerinin yalnız isteğe bağlı çağrılacağını tekilleştirsin.
