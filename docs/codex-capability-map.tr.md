# Codex Kapasite Haritasi

Kurulum rehberi dosyaların nereye gittiğini anlatır; bu harita ise her yüzeyin
neden var olduğunu gösterir. Codex yüzeylerini sahiplenmeleri gereken işle,
onları sınırlayan güvenlik kuralıyla ve tasarımın bozulmadığını kanıtlayan lokal
kontrolle eşleştirir.

Resmi kaynaklar:

- Codex customization sirasi: https://developers.openai.com/codex/concepts/customization
- Subagents: https://developers.openai.com/codex/subagents
- Skills: https://developers.openai.com/codex/skills
- Plugins: https://developers.openai.com/codex/plugins/build
- MCP ve connectors: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- MCP specification: https://modelcontextprotocol.io/specification

## Kapasite Katmanlari

| Katman | Ne icin kullanilir | Starter varsayilani | Dogrulama |
| --- | --- | --- | --- |
| Prompt/thread context | Tek seferlik gorev kisitlari | Aktif kullanici prompt'u en oncelikli sinyal kalir | Insan incelemesi |
| `AGENTS.md` | Kalici repo/global calisma anlasmalari | Repo-local onceligi koruyan incelenmis global rehber | `npm run validate` |
| `config.toml` | Model, sandbox, approval, MCP, feature ve profile ayarlari | Workspace-write sandbox ve on-request approval | `npm run validate:mcp` |
| Rules | Dar komut approval varsayilanlari | Sadece dogrulama komutlari; destructive/publish aksiyonlari gated | `npm run validate:content` |
| Skills | Progressive disclosure ile yeniden kullanilabilir workflow'lar | Commit-pinned curated kurulumlar ve GPT Pro context/handoff, yetkili reconstruction, kanıta dayalı SEO, izlenebilir deep research dahil on bir yerel plugin skill'i | `npm run verify:skills` |
| Plugins | Paylasilabilir skill ve incelenmis lifecycle yuzeyi | On bir skill ve tam hedefli, trust-gated tek SessionEnd süreç hook'u olan lokal plugin; bundled MCP/app yok | `npm run validate` |
| MCP/connectors | Canli docs, browser, code navigation ve dis sistemler | Dengeli iki varsayılan; Context7, diğer lokal stdio yardımcıları ve auth isteyen connector'lar ihtiyaç olana kadar kapalı | `npm run validate:mcp` |
| Subagents | Evidence-heavy uzman delegasyonu | Sandbox'li role dosyalariyla 21 incelenmis uzman ajan | `npm run validate:agents` |
| Doctor/status | No-write saglik ve drift ozeti | Default repo-only; opsiyonel global varlik kontrolu | `npm run codex:doctor` |

## Uzman Ajan Seti

Starter artik 21 uzman ajan tasir:

- `code_mapper`: buyuk degisikliklerden once read-only repo haritalama.
- `docs_researcher`: resmi/guncel dokuman ve version-sensitive bilgi.
- `context_architect`: prompt, AGENTS.md, skill, plugin, MCP, hook, memory,
  rule ve config bilgisinin nereye ait oldugunu belirleme.
- `prompt_architect`: guvenilir brief, basari kriteri, instruction contract ve
  yeniden kullanilabilir prompt sistemleri.
- `mcp_integrator`: least-privilege MCP ve connector planlama.
- `product_strategist`: urun framing'i, forcing question'lar, scope kararlari
  ve en kucuk faydali surum alternatifleri.
- `engineering_planner`: mimari, data flow, edge case, diagram ve test
  stratejisini kod oncesi netlestirme.
- `design_reviewer`: UX kalitesi, accessibility, design-system uyumu ve
  AI-slop tespiti.
- `devex_auditor`: onboarding friction, docs netligi, first-run flow ve
  time-to-hello-world kontrolu.
- `root_cause_debugger`: fix oncesi reproduce, data-flow tracing ve hypothesis
  testing.
- `qa_lead`: end-to-end workflow testleri, regression coverage ve
  re-verification planlari.
- `performance_auditor`: page speed, Core Web Vitals, resource budget, trace ve
  degisiklik sonrasi regression kaniti.
- `google_seo_auditor`: Google Search Central destekli crawlability, indexing,
  metadata, structured data, Core Web Vitals ve Search Console'a hazir
  kontroller.
- `docs_author`: Diataxis coverage, stale-doc tespiti, release docs ve eksik
  rehber uretimi.
- `spec_author`: non-goal, evidence, edge case ve quality gate iceren scoped
  executable spec.
- `code_reviewer`: fresh-context correctness, regression, security ve test review.
- `frontend_verifier`: browser, screenshot, responsive layout ve console kaniti.
- `security_auditor`: read-only auth, secret, permission, data ve abuse-path review.
- `test_verifier`: lint, typecheck, test, build, smoke ve CI kaniti.
- `release_verifier`: git hygiene, artifact, secret scan, changelog/version ve publish gate.
- `codex_doctor`: starter sagligi, katalog drift'i, install-plan, docs ve MCP kontrolu.

Her rol dosyasi yedi ek guardrail blogu tasir:

- Source refresh kurallari: gorev mevcut state'e bagliyken her rol lokal
  dosyalari, guncel docs'u, runtime kanitini ve verification ciktisini yeniden
  kontrol eder.
- Cross-repo transfer kurallari: benzer bir repo fikir verebilir, ama asil
  degisikligi bu repodaki executable path'ler, install yuzeyi, auth siniri ve
  testler belirler.
- Research synthesis kurallari: kaynak materyal uzun arka plan metni olarak
  kopyalanmaz; uygulanabilir action contract, harita, verification plan veya
  risk karari haline getirilir.
- Adversarial validation kurallari: her rol ana thread'e donmeden once kendi
  sonucunu counterexample, eksik kanit, guvensiz varsayim veya daha guclu lokal
  test acisindan zorlar.
- Source currency kurallari: her rol version-sensitive docs, lokal repo kaniti,
  test ciktisi, rendered artifact ve release/security bilgisini; alttaki kaynak
  degistiyse veya mevcut gorev icin kontrol edilmediyse stale kabul eder.
- Corpus expansion kurallari: her rol kendi bilgi tabanini lokal repolar,
  resmi docs, standartlar, vendor guide'lar ve uzman handoff'lari uzerinden
  nasil genisletecegini bilir; sonra bu malzemeyi gizli prompt kalabaligi
  yerine kisa calisma kurallarina sikistirir.
- Expert calibration kurallari: her rol ana thread'e donmeden once ciktisini
  role ozel senior-quality gate'lere vurur; kanit gucu, eksik risk aciklamasi
  ve gereken sonraki net kanit bu kontrole dahildir.

`scripts/validate-agent-config.mjs`, her rol dosyasinda her runtime contract ve
guardrail blogundan tam bir tane bulunmasini, ayrica en az 100 source-backed
instruction item'i olmasini zorunlu tutar. `scripts/validate-agent-research-corpus.mjs`
rol basina en az 20 distinct source marker'i da zorunlu tutar. Boylece
genisletilmis research corpus sonraki edit'lerde ayni kaynak ailesine daralan
bir checklist'e donusmez.

`catalog/agent-research-corpus.json`, her ajanin domain focus, primary source
type, refresh trigger, specialist handoff hedefleri ve expertise signal'lari
icin machine-readable indextir. `scripts/validate-agent-research-corpus.mjs`
bu index'i `catalog/agents.json` ve role TOML dosyalariyla ayni hizada tutar.

Ayni manifest URL, source type, staleness risk, review cadence ve TOML source
marker tasiyan reviewed `authorityRefs` registry'si de tasir; Codex docs,
Context7, OWASP, NIST, Google Search Central, Playwright, WCAG ve GitHub
rehberleri her role dosyasinda farkli yazilmak yerine stable key'lerle
referanslanir. Validator her ajan icin authority key'in o ajanin TOML source
marker'larinda da gecmesini zorunlu tutar, her staleness-risk sinifi icin
cadence limitini uygular ve corpus `dateChecked` en siki authority-source
cadence'inden eskiyse fail eder.

Manifest non-authoritative ama yararli arastirmayi `supplementalResearchRefs`
altinda ayirir: dis repo pattern'leri, skill ornekleri, local command
snapshot'lari, resmi proje docs'lari ve research paper'lari. Bu kaynaklar
heuristic'leri ve future validator tasarimini besleyebilir, fakat validation
onlari agent-scoped, freshness-checked, reviewed authority ref'lere bagli ve
maintainer bilerek terfi ettirene kadar `runtimeAuthority: false` tutar.

Her rol dosyasi `developer_instructions` basina yakin `Authority metadata
contract` ve `Expertise signal contract` bloklari tasir; bu bloklar cagrilan
ajana source marker'larini ve expertise signal'larini kopuk bibliyografya
degil runtime guidance olarak kullanmasini soyler.

Corpus ayrica her ajan icin decision heuristic, failure mode ve verification
signal gruplarindan olusan `expertiseSignals` tasir. Bu kisa listeler
arastirmayi operasyonel hale getirir: sonraki edit'ler her uzmanda role ozel
karar kalitesi, bilinen tuzaklar ve kanit beklentisi kaldigini kanitlayabilir.

Agent katalogu bilerek devasa tutulmadi. ECC ve wshobson/agents gibi yuksek
sinyalli repolar buyuk agent/skill kataloglarinin kataloglu, izole ve
composable oldugunda iyi calistigini gosteriyor. Bu starter o katalog disiplinini
alir; ama Codex-only default'lari korur ve genis cross-harness filolari, gizli
hook'lar, otomatik memory injection veya auth connector default'lari import etmez.

## Doctor Komutlari

No-write lokal saglik ozeti:

```bash
npm run codex:doctor
```

Makine-okunur cikti:

```bash
node scripts/codex-doctor.mjs --json --redact-paths
```

Global hedefler icin no-write varlik kontrolu:

```bash
node scripts/codex-doctor.mjs --include-global --redact-paths
```

Global kontrol sadece beklenen dosyalar var mi yok mu raporlar. Icerik okumaz,
skill kurmaz, Git config degistirmez, `~/.codex` veya `~/.agents` icine yazmaz.

## MCP Ve Connector Politikasi

OpenAI connector rehberi ve MCP specification, MCP server'lari ayri birer
capability boundary olarak ele alir. Bu starter dort kural uygular:

- Resmi veya yuksek sinyalli server'lari tercih et.
- Lokal package version'larini veya git source ref'lerini pinle.
- Account, filesystem, database, production ve billing-adjacent connector'lari
  somut gorev gerekene kadar kapali tut.
- Private data okuyabilen veya aksiyon alabilen her sey icin prompt-based
  approval ve dar tool exposure kullan.

Yeni connector eklerken `mcp_integrator` kullan. Config degismeden once onerilen
server, risk, auth siniri, approval mode, tool allowlist, dogrulama adimlari ve
rollback notlari donmelidir.

## Skill Ve Plugin Politikasi

Resmi plugin rehberi, iterasyon sirasinda local skill ile baslamayi; workflow
paylasilacak veya MCP/app/hook/asset paketlenecekse plugin kullanmayi onerir.
Bu repo bu ayrimi korur:

- Curated public ve first-party skill'ler `catalog/skills.json` icinde kalir.
- Installable skill'ler reviewed `package`, `skill`, `sourceUrl`, `license`,
  `risk` ve `lastChecked` alanlarini tasimalidir.
- Local plugin on bir workflow sunar; GPT Pro context ve manifest-bound handoff,
  enterprise operator, zero-network offline diagram triplet, explicit-only Fetch,
  kanıta dayalı `$seo`, izlenebilir `$evidence-research` ve context budget
  planner bunların içindedir.
- Tam hedefli tek `SessionEnd` süreç hijyeni hook'u ayrıca incelenir ve
  trust-gated kalır. Başka plugin hook, MCP server ve app yüzeyleri manifest'te
  yer almaz.

`/diagram` benzeri cikti gerektiğinde local renderer'i dogrudan calistir:

```bash
npm run diagram:triplet -- --mermaid path/to/diagram.mmd --out-dir artifacts/diagrams --name diagram-name
```

Network veya package install kullanmadan `.mmd`, `.excalidraw`, `.svg`, `.png`
ve `.md` dosyalari uretir.

## Neleri Import Etmez

Bu starter gelecekte ayri review ve dokumantasyon olmadan sunlari import etmez:

- Cross-harness global config sync.
- Genis skill marketplace import'lari.
- Varsayilan acik authenticated connector'lar.
- İncelenmemiş veya context ekleyen plugin lifecycle hook'ları.
- Otomatik memory/session injection.
- Her turn'e gizli research corpus injection.
- Geniş veya kanıtsız cleanup, push, release, publish veya deploy otomasyonu.

Tek cleanup istisnası fail-closed ve sahiplik kapsamlıdır: SessionEnd taraması
yalnız biten Codex sahibinden yakalanmış tam lokal MCP alt süreçlerini 45
saniyelik beklemeden sonra durdurabilir. Ayrıntı için
[çoklu oturum süreç hijyenine](process-hygiene.tr.md) bak.

## Dogrulama

Once odakli gate'leri calistir:

```bash
npm run validate:agents
npm run validate:mcp
npm run validate:doctor
npm run validate:diagram
npm run codex:doctor
```

Public release oncesi:

```bash
npm run check
git diff --check
gitleaks detect --redact --no-banner --no-git --verbose
```

Online skill-source dogrulamasi ayri kalir:

```bash
npm run verify:skills:online
```
