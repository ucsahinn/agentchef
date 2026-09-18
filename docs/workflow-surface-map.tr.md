# Workflow Yuzey Haritasi

ECC, GStack ve benzeri projelerdeki workflow adları Codex'e birebir taşınmaz.
Doğru soru, her davranışın hangi yüzeye ait olduğudur. Tekrar kullanılabilir
prosedürler genellikle skill olur, sınırlı uzman işi subagent'a verilebilir,
canlı dış bağlam MCP/connector'a gider; push, release ve deploy ise açık onay
kapısında kalır.

Kontrol tarihi: 2026-07-29

Kaynaklar:

- Resmi Codex customization: https://developers.openai.com/codex/concepts/customization
- Resmi Codex skills: https://developers.openai.com/codex/skills
- Resmi Codex subagents: https://developers.openai.com/codex/subagents
- Resmi Codex plugins: https://developers.openai.com/codex/plugins/build
- Resmi Codex CLI slash commands: https://developers.openai.com/codex/cli/slash-commands
- ECC source pattern: https://github.com/affaan-m/ECC
- GStack source pattern: https://github.com/garrytan/gstack

## Yuzey Kurali

| Pattern | Codex yuzeyi | Starter karari |
| --- | --- | --- |
| Tek seferlik gorev talimati | Prompt/thread context | Aktif prompt icinde kalir. |
| Kalici calisma anlasmasi | `AGENTS.md` | Incelenmis global rehber kurulur; repo-local dosyalar yine onceliklidir. |
| Tekrar kullanilabilir slash-like workflow | Skill | `SKILL.md` tercih edilir; bundle dagitilacaksa plugin'e konur. |
| Uzman kritik veya kanit isi | Subagent | Bilerek delege edilir, sonucu kullanmadan once ozetlenir. |
| Canli docs, browser, code navigation veya private servis | MCP/connectors | Auth isteyen veya genis connector'lar gorev gerekene kadar kapali kalir. |
| Komut approval istisnasi | Rule | Dar tutulur; destructive, credential, publish veya release auto-allow olmaz. |
| Lifecycle automation | Hook | Sadece incelenmis guardrail icindir; ana guvenlik siniri degildir. |
| Push, release, deploy, external upload | Approval gate | `release_verifier` hazirlik kanitlar; aksiyon icin yine acik onay gerekir. |

Subagent eslesmesi oneridir. Yalniz bagimsiz paralel is icin, gurultulu log
veya arastirmayi ayirmak icin ya da kullanici acikca ajan istedigi icin spawn
et. `max_threads = 10` birden fazla Codex penceresine kapasite birakir; normal
fan-out bir ile dorttur. Routing'i bir kez `Routing plan:`, bir kez de
`Routing result:` ile raporla; ajan/skill/MCP basina ayri lifecycle mesaji basma.

Karar gerekcesi: [ADR-001](decisions/001-adaptive-routing-and-user-owned-config-overlay.md).

## GStack Tarzi Workflow Mapping

| Workflow | Iyi Codex karsiligi | Bu starter'da destek | Guvenlik siniri |
| --- | --- | --- | --- |
| `/office-hours` | Skill veya `product_strategist` subagent | `product_strategist` | Dosya edit yok; implementasyon oncesi scope sorgular. |
| `/plan-ceo-review` | Skill veya `product_strategist` subagent | `product_strategist` | Hype yok; scope tradeoff ve en kucuk faydali surum doner. |
| `/plan-eng-review` | `engineering_planner` subagent | `engineering_planner` | Mimari iddia icin once kod okunur. |
| `/plan-design-review` | `design_reviewer`, UI varsa `frontend_verifier` | `design_reviewer`, `frontend_verifier` | Render edilen UI icin browser kaniti gerekir. |
| `/plan-devex-review` | `devex_auditor` subagent | `devex_auditor` | Safe local smoke test; global setup write yok. |
| `/autoplan` | `product_strategist`, `design_reviewer`, `engineering_planner` zinciri | Ucu de var | Ana thread karar verir; gizli otomatik orkestrasyon yok. |
| `/spec` | `spec_author` veya spec skill | `spec_author` | Ayrica istenmedikce sadece spec. |
| Context-heavy repo veya arastirma isi | `context-budget-planner` skill'i | `context-budget-planner` | Genis isten once kaynak yukleme, token butcesi ve compaction handoff'u planlanir. |
| `/review` | `code_reviewer` subagent | `code_reviewer` | Bug, regression, security ve missing test onde gelir. |
| `/investigate` | `root_cause_debugger` subagent | `root_cause_debugger` | Fix oncesi reproduce ve hypothesis test. |
| `/qa` | `qa_lead` + `test_verifier` | `qa_lead`, `test_verifier` | Report-only ile fix scope ayrilir. |
| `/qa-only` | `qa_lead` report-only | `qa_lead` | Kullanici istemedikce edit yok. |
| `/cso` | `security_auditor` subagent | `security_auditor` | Secret veya credential yazdirmaz. |
| `/benchmark` | `performance_auditor` subagent | `performance_auditor` | Once olcum; production load onaysiz yok. |
| `/canary` | Release/performance izleme workflow'u | `release_verifier`, `performance_auditor` | Production monitoring ve external account onay ister. |
| `/document-release` | `docs_author` subagent | `docs_author` | Remote release state kanitsiz iddia edilmez. |
| `/document-generate` | `docs_author` veya docs skill | `docs_author` | Docs kod ve komutlarla eslesir. |
| `/codex` / cross-model review | Acik review workflow'u | `code_reviewer`, manuel Codex CLI kullanimi | Baska agent veya CLI otomatik calistirilmaz; cross-model kontrolu kullanici istemelidir. |
| `/browse` | Browser MCP + `frontend_verifier` | `frontend_verifier`, Playwright/Chrome MCP entries | Browser tool'lari prompt-gated. |
| `$fetch <url>` | Explicit yetkili site reconstruction skill'i | `fetch`, browser MCP, gerekirse dar kapsamlı uzmanlar | Public capture pasiftir; auth, private route, korumalı asset, install ve external write gated kalır. |
| `$seo <hedef>` | Kanıta dayalı audit, implementation ve verification skill'i | `seo`, `google_seo_auditor`, browser MCP, gerekirse performance verification | Local, rendered, deployed ve account kanıtı ayrı kalır; ranking, indexing, account write, publication ve deploy çıkarım yoluyla iddia edilmez. |
| `$evidence-research <soru>` | Kaynakları izlenebilir deep research skill'i | `evidence-research`, resmi kaynak araması, gerekirse domain reviewer | Fact, inference ve recommendation ayrılır; private data, ücretli API, katılımcı ve publication onay ister. |
| `/setup-browser-cookies` | Auth/session connector workflow | Default acik degil | Cookie/session import hassastir ve acik onay ister. |
| `/pair-agent` | External-agent collaboration service | Import edilmedi | Tunnel, scoped token ve external agent icin ayri design gerekir. |
| `/ship` | Release verification workflow | `release_verifier` | Commit, push, PR, tag, release ve deploy icin acik onay gerekir. |
| `/land-and-deploy` | Release/deploy workflow | `release_verifier` | Merge, deploy ve production verification otomatik default olmaz. |
| `/learn` | Memory workflow | Memory MCP uygun durumda kullanilir | Secret, session, cookie veya auth materyali saklanmaz. |
| `/make-pdf` | Gelecekte offline doc-export skill | Default uygulanmadi | Buyuk implicit dependency install yok; offline diagram asset'leri zaten `offline-diagram-triplet` ile uretilir. |
| `/diagram` | Offline diagram skill | `offline-diagram-triplet` | Zero network; artifact'ler istenmeden commit edilmez. |

## ECC Pattern Mapping

| ECC pattern | Bu starter neyi alir | Bu starter neyi almaz |
| --- | --- | --- |
| Buyuk skills ve agents katalogu | Validasyonlu `catalog/skills.json` ve `catalog/agents.json`. | Genis cross-harness kataloglari komple import etmez. |
| Manifest-driven install | `manifests/install-plan.json` ve `scripts/plan-install.mjs`. | Plan preview'da gorunmeyen global write yok. |
| Doctor/status komutlari | `npm run codex:doctor` ve JSON cikti. | Diagnostic sirasinda user secret okumaz veya global Codex state yazmaz. |
| Plugin dagitimi | Tam hedefli, trust-gated tek SessionEnd süreç hook'u olan lokal `codex-chef-workflows` plugin'i. | Context ekleyen hook, genis MCP veya external auth yok. |
| Legacy command uyumlulugu | Slash-like adlari Codex yuzeylerine map eden dokuman. | 80+ command shim veya deprecated prompt wrapper yok. |
| Security/runtime hardening | Gitleaks, workflow hardening, MCP least privilege, install backup ve bekleme sonrası sahiplik kapsamlı stale-MCP temizliği. | Genis cleanup, auto-publish, token scraping veya genis command allow rule yok. |

## Kanita Dayali Disarida Birakilanlar

Public GStack reposu browser pairing, cookie import, deploy automation,
continuous checkpoint commit, domain memory ve raw CDP gibi faydali workflow'lar
gosteriyor. Bunlar AgentChef'te default kurulum degil; cunku token, tunnel,
kalici browser state, production sistemi veya auto-commit davranisi getiriyor.
AgentChef guvenli esdegerleri korur: browser MCP entry'leri prompt-gated,
release verification push/deploy'dan ayridir, memory secret-aware calisir ve
tekrar kullanilabilir workflow'lar genis command shim yerine skill olarak gelir.

Public ECC reposu cok daha buyuk bir cross-harness operating-system yuzeyi
gosteriyor. AgentChef manifest/state preview, katalog, doctor check, plugin
paketleme ve validation gate fikirlerini alir; fakat wholesale cross-harness
sync, hook prompt injection, varsayilan acik authenticated connector ve
review edilmemis dev skill kataloglarini bloke eder.

Yuksek star sayisi guven karari degil, oncelik sinyalidir. Transfer kurali:
pattern'i incele, en kucuk Codex-native yuzeye map et, safety boundary'yi
dokumante et ve davranis kullanicinin makinesini degistirebiliyorsa validation
ekle.

## Onerilen Starter Zinciri

Ciddi islerde bu sirayi kullan:

1. `product_strategist` veya `spec_author` hedefi netlestirir.
2. Is genisse `context-budget-planner` kaynaklari ve handoff'u butceler.
3. Karar açısından kritik kaynak araştırmasını `$evidence-research`, arama
   odaklı kanıt ve uygulamayı ise kapsamdaysa `$seo` üstlenir.
4. `engineering_planner` mimariyi, data flow'u ve testleri map eder.
5. `code_mapper` genis edit oncesi repo kaniti toplar.
6. Ana thread scoped degisikligi uygular.
7. `code_reviewer`, `security_auditor`, `qa_lead` veya `test_verifier` riskli yuzeyi dogrular.
8. Push/release istenirse `release_verifier` publish readiness kontrol eder.

Ana thread sentez, editler, kullaniciya gorunen kararlar ve final kanittan
sorumludur. Subagent'lar approval, sandbox, credential veya external-state
kontrollerini bypass etmek icin kullanilmaz.
