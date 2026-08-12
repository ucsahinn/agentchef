# TASK-MSPLX78NW7TCP — AgentSpace ajan/KB envanteri ve 21 uzman eşleme matrisi

## Ne yapıldı

AgentSpace'in yerel, kalıcı ajan kimlik/hafıza yüzeyi ile Codex Chef'in dağıtılabilir ajan kataloğu, rol TOML'ları, platform config bildirimleri, routing profilleri, install planı ve iki dilli knowledge base'i salt okunur incelendi. Ürün dosyaları değiştirilmedi. Özel hafıza içeriği rapora taşınmadı; yalnız kimlik/rol metadatası ve yapısal sayımlar kullanıldı.

### Envanter

| Yüzey | Kanonik kaynak | Gözlenen durum | Sınır |
| --- | --- | --- | --- |
| AgentSpace ajan kimlikleri | `.agentspace/memory/agents/<ajan>/` | 8 ajan: `data`, `ekip-lideri-d00406`, `fevs`, `front`, `geli-tirici-d00406`, `pm-d00406`, `sss`, `tasar-mc-d00406` | Makine/çalışma alanına özel; install ve package dışı |
| Seçilmiş özel hafıza | Ajan başına `MEMORY.md` + bağlı Markdown kaydı | 8 indeks, 9 indeks-dışı kayıt; `shared` altında dosya yok | İçerik private; kimlik ve geçmiş kararlar public yüzeye taşınmaz |
| Uzman ajan kataloğu | `catalog/agents.json` | 21 uzman; 11 `read-only`, 10 `workspace-write`; 11 web-enabled | İncelenebilir ürün kaynağı |
| Uzman rol dosyaları | `templates/codex/agents/*.toml` | 21 TOML, katalogla 21/21 parity | `${CODEX_HOME}/agents` altına kurulabilir |
| Platform ajan bildirimleri | `templates/codex/config.windows.toml`, `templates/codex/config.unix.toml` | Her iki config'te aynı 21 ajan bildirimi | `${CODEX_HOME}/config.toml` merge/install yüzeyi |
| Routing profilleri | `catalog/routing-profiles.json` | 16 profil, 19 benzersiz uzman referansı | Seçilmiş çağrı/routing yüzeyi; `qa_lead` ve `spec_author` profillerde referanssız |
| Kamu knowledge base'i | `kb/` | 10 İngilizce + 10 Türkçe konu; iki dilde README | Repo/package yüzeyi; global install planında ayrı KB kopyası yok |

AgentSpace'in sekiz kalıcı ofis rolü şöyledir: data engineer, takım lideri/orchestrator, DevOps mühendisi, frontend mühendisi, backend mühendisi, PM, QA/test mühendisi ve tasarımcı. Bu roller insan/ajan sahipliği ve kalıcı çalışma bağlamıdır. Codex Chef'in 21 uzmanı ise görev başına çağrılan dar yeteneklerdir; 8→21 eşleme kimlik dönüşümü veya otomatik delegasyon değildir.

### AgentSpace ↔ Codex Chef 21 uzman rol eşleme matrisi

| # | Codex Chef uzmanı | Birincil AgentSpace sahibi | Destek/inceleme | Eşleme ve sınır |
| ---: | --- | --- | --- | --- |
| 1 | `code_mapper` | Backend/geliştirici | data, frontend, DevOps | Repo, veri akışı ve mevcut örüntü keşfi; salt okunur, implementasyon sahipliği vermez |
| 2 | `docs_researcher` | data | PM, ekip lideri | Güncel resmi kaynak/sürüm kanıtı; ürün kararı veya kod yazımı yapmaz |
| 3 | `context_architect` | ekip lideri | data, PM | Prompt/AGENTS/skill/plugin/MCP/hafıza/config yerleşimini seçer; özel içeriği geniş yüzeye kopyalamaz |
| 4 | `prompt_architect` | PM | ekip lideri, data | Brief, kabul kriteri ve talimat sözleşmesi; kalıcı kimlik yaratmaz |
| 5 | `mcp_integrator` | Backend/geliştirici | DevOps, ekip lideri | En az yetkili connector tasarımı; auth açma veya sır okuma yetkisi değildir |
| 6 | `product_strategist` | PM | ekip lideri | Problem/kapsam/en küçük yararlı sürüm; uygulama yapmaz |
| 7 | `engineering_planner` | ekip lideri | Backend, data, DevOps | Mimari, veri akışı, edge case ve test stratejisi; planlama yüzeyidir |
| 8 | `design_reviewer` | tasarımcı | frontend, PM | UX, erişilebilirlik, görsel sistem; gerçek render doğrulamasını ikame etmez |
| 9 | `devex_auditor` | DevOps | Backend, PM, QA | Onboarding/TTHW/hata toparlama; global kurulum veya dependency değişimi yapmaz |
| 10 | `root_cause_debugger` | Backend/geliştirici | data, DevOps, frontend, QA | Reprodüksiyon ve hipotez testi; atanmış yazma kapsamı olmadan ürün dosyasını değiştirmez |
| 11 | `qa_lead` | QA/SSS | PM, Backend | E2E senaryo, regresyon ve yeniden doğrulama; routing profillerinde bugün seçilmemiştir |
| 12 | `performance_auditor` | DevOps | frontend, Backend, data | Ölçümlü darboğaz/gerileme analizi; prod yükü veya deploy yetkisi yok |
| 13 | `google_seo_auditor` | data | frontend, PM | Crawl/index/metadata/CWV denetimi; ranking vaadi veya credentialed erişim yok |
| 14 | `docs_author` | data | PM, Backend | Repo kanıtından Diataxis dokümanı; yayınlama yetkisi yok |
| 15 | `spec_author` | PM | ekip lideri, data, Backend | Belirsiz isteği kapsam/DoD/test kapısına çevirir; routing profillerinde bugün seçilmemiştir |
| 16 | `code_reviewer` | ekip lideri | Backend, QA, data | Fresh-context doğruluk/güvenlik/regresyon incelemesi; kod sahipliği veya yeniden yazım değildir |
| 17 | `frontend_verifier` | frontend | tasarımcı, QA | Gerçek tarayıcı/responsive/etkileşim kanıtı; salt kod incelemesiyle ikame edilmez |
| 18 | `security_auditor` | QA/SSS | ekip lideri, Backend, DevOps | Auth/yetki/secret/abuse-path salt okunur denetimi; sırları rapora taşımaz |
| 19 | `test_verifier` | QA/SSS | Backend, frontend, DevOps, data | Test/lint/typecheck/build/smoke kanıtı; ürünü düzeltme yetkisi değildir |
| 20 | `release_verifier` | ekip lideri | QA, PM, DevOps | Git/artifact/version/secret-scan kapısı; push/publish/release yetkisi vermez |
| 21 | `codex_doctor` | DevOps | Backend, ekip lideri, data | Starter health, katalog/install-plan drift ve doğrulama açığı teşhisi |

### Eşleme sonucu

- Sekiz AgentSpace rolünün tamamı en az bir dar Codex Chef uzmanıyla desteklenebilir; hiçbir uzman AgentSpace kimliğinin yerine geçmez.
- Data rolünün doğal birincil yüzeyleri `docs_researcher`, `google_seo_auditor` ve `docs_author`; bağlama göre `code_mapper`, `context_architect`, `engineering_planner`, `root_cause_debugger`, `spec_author`, `code_reviewer`, `performance_auditor`, `test_verifier` ve `codex_doctor` destek yüzeyidir.
- `qa_lead` ve `spec_author` katalogda, rol şablonlarında ve platform config'lerinde mevcut olmasına rağmen 16 routing profilinin hiçbirinde referanslanmıyor. Bu bir parity hatası değil, seçilmiş routing kapsamı boşluğudur; hedef mimari bunu bilinçli opt-in veya yeni profil kararıyla açıklamalıdır.
- `workspace-write` sandbox etiketi özel AgentSpace hafızasına erişim, kimlik aktarımı, global state değişimi veya publish yetkisi anlamına gelmez.

### Özel hafıza / installable-surface sınırı

| Veri veya davranış | Doğru yüzey | Install/package kararı | Neden |
| --- | --- | --- | --- |
| Ajan kimliği, pane tercihi, kullanıcıya özgü karar/gotcha | AgentSpace özel seçilmiş hafıza | **Hariç** | Makine/kullanıcı/oturumlar arası özel bağlamdır |
| Takım geneli ama özel çalışma bilgisi | AgentSpace `shared` hafıza | **Hariç** | Yerel ortak bağlam; public ürün talimatı değildir |
| Genel, tekrar kullanılabilir uzman davranışı | `catalog/agents.json` + `templates/codex/agents/*.toml` | **Dahil** | Review/validation/install sözleşmesine sahip ürün yüzeyidir |
| Uzmanın Codex'e kaydı | platform config şablonları | **Dahil** | Config merge işlemi kullanıcı overlay'ini koruyarak yönetir |
| Genel kullanıcı sorusuna kısa operasyon cevabı | `kb/*.md` + `.tr.md` eşi | **Package dahil; global install hariç** | Public repo bilgi bankasıdır, runtime agent belleği değildir |
| Hafıza iş akışı/güvenlik protokolü | `codex-chef-brain` skill | **Dahil** | İş akışı kurulabilir; vault/capture içeriği kurulamaz |
| Brain vault, AgentSpace memory, MCP runtime state | Kullanıcıya ait yerel depolar | **Hariç** | İçerik mülkiyeti ve least-privilege sınırı korunmalıdır |

`manifests/install-plan.json` uzmanlar için üç açık yüzey tanımlar: global `AGENTS.md`, platform config'i ve `templates/codex/agents/*.toml` glob'u. `kb/` package doğrulama yüzeyinde yer alır fakat install planında `${CODEX_HOME}` altına kopyalayan ayrı bir operasyon yoktur. `.agentspace/` ne izlenen ürün kaynağı ne de install planı girdisidir.

En kritik operasyonel gotcha: `.agentspace/` Git tarafından izlenmiyor, ancak mevcut `.gitignore` tarafından da dışlanmıyor (`git check-ignore`: `NOT_IGNORED`). Bu görev ürün dosyasına dokunmayı yasakladığı için ignore kuralı eklenmedi. Özel hafızanın yanlışlıkla commit edilmemesi için geniş staging yerine yalnız açıkça izin verilen rapor ve indeks yolları stage edilmelidir.

## Kanıt

### Sayım ve parity

Çalıştırılan salt-okunur PowerShell/JSON envanteri gerçek çıktısı:

```text
CatalogAgents=21
ReadOnly=11
WorkspaceWrite=10
WebEnabled=11
AgentSpace identities=8
AgentSpace indexes=8
AgentSpace non-index records=9
KB topics=10 EN + 10 TR
KB README=2
Windows config agent declarations=21
Unix config agent declarations=21
```

Kaynak kanıtları:

```text
catalog/agents.json                 21 catalog record
templates/codex/agents/*.toml      21 role file
templates/codex/config.windows.toml 21 [agents.*] declaration
templates/codex/config.unix.toml    21 [agents.*] declaration
manifests/install-plan.json         codex-agents sourceGlob=templates/codex/agents/*.toml
kb/README.md                        10 English article entry
```

### Routing kapsamı

`catalog/agents.json` adları ile `catalog/routing-profiles.json` içindeki benzersiz ajan referansları karşılaştırıldı:

```text
Routing profiles: 16
Unique routed specialists: 19
Catalog-only (not routed): qa_lead, spec_author
```

### Git ve yüzey sınırı

Komutlar:

```powershell
git ls-files -- kb .agentspace templates/codex/agents catalog/agents.json catalog/routing-profiles.json manifests/install-plan.json
git check-ignore -v .agentspace\memory\agents\data\MEMORY.md
git status --short
```

Gerçek sonuç özeti:

```text
kb/**, catalog/agents.json, catalog/routing-profiles.json, manifests/install-plan.json
ve 21 agent TOML Git tarafından izleniyor.
.agentspace/** için tracked kayıt yok.
git check-ignore sonucu: NOT_IGNORED.
Başlangıç worktree'sinde görev öncesi çok sayıda ürün değişikliği ve untracked yerel yüzey vardı.
```

### Board

Board sorgusu görevi `TASK-MSPLX78NW7TCP`, durum `in_progress`, atanan `data`, sprint `SPRINT-CODEX-CHEF-AGENT-MIMARISI-2026-08`, proje `codex-chef-agent-mimarisi` olarak doğruladı.

### Doğrulama kapıları

Komutlar ve gerçek çıktılar:

```text
npm run validate:agents
Agent config validation passed. Checked 21 agents across 2 configs.

npm run validate:routing
Routing profile validation passed. Checked 16 profiles.

npm run validate:kb-locales
KB locale validation passed.

EXIT agents=0 routing=0 kb=0
```

Zorunlu sonuç indeksleme komutu mevcut repo durumunda çalıştırıldı, fakat tanımlı değildir:

```text
npm error Missing script: "results:index"
```

`docs/agent-results/INDEX.md` yine de bu raporun bağlantısını içeriyor. Script eksikliği bu görevde ürün dosyasına dokunma yasağı nedeniyle giderilmedi.

Kök doğrulama da çalıştırıldı ve bu rapordan önce var olan scope-dışı yerel dosyalar nedeniyle başarısız oldu:

```text
npm run validate
Validation failed:
- Forbidden local state/path pattern in docs/.agent-notifications
- Forbidden local state/path pattern in docs/agent-results/TASK-MSPLX78NW7TCP-pm.md
```

`gitleaks` PATH üzerinde bulunmadı (`GITLEAKS_NOT_AVAILABLE`). Dar ve bu görevin kaynak yüzeylerine doğrudan bağlı üç doğrulama temizdir; repo push-ready olarak raporlanmamaktadır.

## Değişen dosyalar

- `docs/agent-results/TASK-MSPLX78NW7TCP-data.md` — bu rapor.
- `docs/agent-results/INDEX.md` — sonuç indeksleme adımında güncellenecek.
- Ürün, katalog, template, config, installer, KB ve AgentSpace özel hafıza dosyaları değiştirilmedi.

## Riskler

- `.agentspace/` ignore edilmediği için `git add .` veya benzeri geniş staging özel hafıza sızıntısı yaratabilir.
- 8 ofis rolü ile 21 görev uzmanını birebir kimlik kabul etmek sahiplik, yetki ve kalıcı bağlam sınırlarını bozar.
- `qa_lead` ve `spec_author` installable olsa da seçilmiş routing profillerinde görünmez; kullanıcı onları doğrudan çağırmadıkça veya profil eklenmedikçe keşfedilebilirlikleri düşüktür.
- Kirli worktree nedeniyle repo-geneli validator sonucu bu rapordan bağımsız mevcut değişikliklerden etkilenebilir; push-ready iddiası yapılmamalıdır.
- Görev süreci `npm run results:index` bekliyor fakat mevcut `package.json` bu scripti tanımlamıyor; indeks otomasyon sözleşmesi drift durumundadır.

## Açık sorular

1. `.agentspace/` için repo-local ignore ve secret/content-safety koruması ayrı, onaylı bir güvenlik işi olarak eklenmeli mi?
2. `qa_lead` ve `spec_author` bilinçli manual opt-in mı kalacak, yoksa hedef mimaride mevcut/yeni routing profillerine bağlanacak mı?
3. Public `kb/` içeriğinin kurulum sonrası offline global erişimi ürün hedefiyse, package dokümanı olarak kalması mı yoksa açık bir install operasyonu mu isteniyor?

## Sonraki adım

Ekip lideri bu matrisi hedef ajan mimarisi ve kabul/güvenlik kapılarıyla birleştirerek (a) kalıcı AgentSpace sahibi, (b) varsayılan Codex uzmanı, (c) yalnız opt-in uzman ve (d) private/public/installable veri yüzeylerini tek kanonik mimari kararına dönüştürmelidir. `.agentspace/` ignore koruması ve routing'deki iki uzman boşluğu ürün dosyası değişikliği gerektirdiğinden ayrı onaylı görevlerde ele alınmalıdır.
