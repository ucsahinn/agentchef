# Araştırma Notları

Kontrol tarihi: 2026-06-14. Codex config, skill catalog, SEO uzman kararlari,
GStack/ECC workflow kararlari, research-synthesis kurallari, specialist
source-freshness cadence kararlari, agent basina expertise-signal coverage ve
supplemental research-reference validation icin 2026-06-15'te guncellendi.
PowerShell execution policy, Git config, GitHub supply-chain, SLSA, npm
provenance, npm trusted publishing ve Sigstore kaynak kapsami icin
2026-06-16'da guncellendi.

Aşağıdaki bilgiler resmi dokümanlardan, standartlardan, olgun public
repolardan, araştırma makalelerinden ve practitioner issue sinyallerinden
gelir. Practitioner feedback sadece risk pattern'i olarak kullanılır; kaynak
otoritesi resmi dokümanların yerini almaz.

## Kaynaklar

| Başlık | URL | Tip | Güven | Neyi destekler | Eskime riski |
| --- | --- | --- | --- | --- | --- |
| Codex Manual | https://developers.openai.com/codex/codex-manual.md | Resmi OpenAI docs | High | surfaces, config, AGENTS.md, skills, plugins, MCP, hooks, rules, approvals, sandboxing, auth, Windows, noninteractive use, subagents | Medium |
| Codex Config Reference | https://developers.openai.com/codex/config-reference#configtoml | Resmi OpenAI docs | High | `agents.<name>.description`, `agents.<name>.config_file`, agent thread/depth/runtime default'lari ve config guvenlik sinirlari | Medium |
| Enterprise Context Core (ECC) | https://github.com/affaan-m/ecc | Public starter/toolkit repo | Medium/High | genis cross-harness operating-system yuzeyi, manifest-driven install planning, target adapter'lari, install-state preview, schema validation, MCP drift check'leri ve security-scan pattern sinyali | High |
| GStack | https://github.com/garrytan/gstack | Public agent-workflow repo | Medium/High | adlandirilmis workflow/skill taksonomisi, product/design/eng/QA/release rolleri, browser workflow'lari, `/diagram`, `/make-pdf`, safety guardrail ve deploy automation pattern sinyali | High |
| Agent Skills - Codex | https://developers.openai.com/codex/skills | Resmi OpenAI docs | High | skill discovery, progressive disclosure, skill lokasyonları, plugin dağıtımı | Medium |
| Agent Skills Specification | https://agentskills.io/specification | Açık specification | High | `SKILL.md` alanları, opsiyonel dizinler, metadata, validation | Medium |
| openai/skills | https://github.com/openai/skills | Resmi public repo | High | curated skill örnekleri ve install beklentileri | Medium |
| Plugins - Codex | https://developers.openai.com/codex/plugins | Resmi OpenAI docs | High | skills, apps ve MCP metadata için plugin dağıtımı | Medium |
| Mermaid Flowcharts | https://mermaid.js.org/syntax/flowchart.html | Resmi proje dokumani | High | offline diagram source uretimi icin stabil flowchart syntax, node formlari ve edge label'lari | Medium |
| Excalidraw JSON schema | https://docs.excalidraw.com/docs/codebase/json-schema | Resmi proje dokumani | High | editable `.excalidraw` scene sekli, top-level alanlar, elements, appState ve files | Medium |
| Google SEO Starter Guide | https://developers.google.com/search/docs/fundamentals/seo-starter-guide | Resmi Google docs | High | crawlability, indexing, useful content, linkler, image SEO ve gercekci SEO beklentileri | Medium |
| Google Search structured data intro | https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data | Resmi Google docs | High | structured data eligibility ve validation sinirlari | Medium |
| Lighthouse docs | https://developer.chrome.com/docs/lighthouse/overview | Resmi Chrome docs | High | performance, accessibility, best-practices, SEO ve web quality audit kategorileri | Medium |
| addyosmani/web-quality-skills | https://github.com/addyosmani/web-quality-skills | Olgun public skill repo | Medium/High | web-quality, SEO, accessibility ve performance odakli skill ornekleri | Medium/High |
| anthropics/skills | https://github.com/anthropics/skills | Olgun public skill repo | Medium/High | webapp testing ve MCP builder skill ornekleri; yuksek community sinyali, fakat license repo-specific | Medium/High |
| obra/superpowers | https://github.com/obra/superpowers | Olgun public skill repo | Medium/High | test-driven development ve odakli workflow ornekleri | Medium/High |
| mattpocock/skills | https://github.com/mattpocock/skills | Olgun public skill repo | Medium/High | yuksek community sinyalli kucuk-adimli refactor planlama ornekleri | Medium/High |
| addyosmani/agent-skills | https://github.com/addyosmani/agent-skills | Olgun public skill repo | Medium/High | documentation, ADR, review ve engineering workflow ornekleri | Medium/High |
| ucsahinn/ai-project-starter | https://github.com/ucsahinn/ai-project-starter | First-party public skill repo | High | proje context temeli, starter docs, agent instruction files, enterprise starter docs ve vibe-coding guardrail'leri | Medium |
| ucsahinn/prompt-architect | https://github.com/ucsahinn/prompt-architect | First-party public skill repo | High | plan-first, approval-gated, security-aware Codex prompt paketleri, prompt audit'leri ve paketlenmis Prompt Lab KB workflow'lari | Medium |
| ucsahinn/ai-skill-create | https://github.com/ucsahinn/ai-skill-create | First-party public skill/plugin repo | High | Codex skill/plugin olusturma, iyilestirme, validation, forward-testing ve paketleme | Medium |
| Skills CLI public index aramalari | `npx skills find token`, `npx skills find context`, `npx skills find prompt-engineering`, `npx skills find memory` | Skills CLI uzerinden public paket/arama index'i | Medium | context, prompt, memory ve token baglantili aday kesfi; token sonuclarinin LLM context butcesinden cok auth/deployment/crypto tarafina kaydigini gosterir | High |
| Ajv JSON Schema Validator | https://ajv.js.org/ | Resmi proje dokümanı | Medium/High | JSON Schema validation tradeoff'ları ve bu starter'ın install-plan check'lerini npm install öncesi dependency-free tutması | Medium |
| MCP Security Best Practices | https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices | Resmi MCP guidance | High | consent, token/audience validation, SSRF, connector riski | Medium |
| GitHub Secret Scanning | https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning | Resmi GitHub docs | High | current-tree ve history secret scanning | Low/Medium |
| GitHub Actions Secure Use | https://docs.github.com/en/actions/reference/security/secure-use | Resmi GitHub docs | High | least-privilege workflow token'ları ve secret handling | Low/Medium |
| GitHub README guidance | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes | Resmi GitHub docs | High | README içeriği, yardım linkleri, contribution beklentisi, relative links | Low |
| PowerShell ShouldProcess | https://learn.microsoft.com/en-us/powershell/scripting/learn/deep-dives/everything-about-shouldprocess | Resmi Microsoft Learn | High | `-WhatIf`, `-Confirm`, daha güvenli mutating scriptler | Low/Medium |
| PowerShell execution policies | https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies | Resmi Microsoft Learn | High | process-scoped execution policy, `Unblock-File`, Windows policy davranisi | Medium |
| Git config | https://git-scm.com/docs/git-config | Resmi Git proje dokumani | High | `core.excludesfile`, `core.hooksPath`, `safe.directory`, protected config semantigi | Medium |
| GitHub supply chain security | https://docs.github.com/en/code-security/concepts/supply-chain-security/about-supply-chain-security | Resmi GitHub docs | High | dependency graph, dependency review, Dependabot, immutable release, artifact attestation | Medium |
| GitHub dependency review | https://docs.github.com/en/code-security/concepts/supply-chain-security/dependency-review | Resmi GitHub docs | High | PR dependency diff'i, lockfile review, vulnerable dependency engelleme | Medium |
| SLSA v1.2 | https://slsa.dev/spec/v1.2/ | Open specification | High | source/build provenance, attestation, artifact verification, supply-chain integrity | Medium |
| npm provenance | https://docs.npmjs.com/generating-provenance-statements/ | Resmi npm docs | High | provenance attestation, Sigstore-backed publish kaniti, provenance sinirlari | Medium |
| npm trusted publishing | https://docs.npmjs.com/trusted-publishers/ | Resmi npm docs | High | OIDC trusted publishing, tokenless npm publish, automatic provenance | Medium |
| Sigstore docs | https://docs.sigstore.dev/ | Resmi proje docs | High | keyless signing, identity binding, transparency-log verification, artifact signing | Medium |
| OpenSSF Scorecard | https://github.com/ossf/scorecard | Olgun public security projesi | Medium/High | public repo security-health gate fikirleri | Medium |
| ReAct | https://arxiv.org/abs/2210.03629 | Araştırma makalesi | Medium/High | reasoning ve tool-use birlikteliği | Low/Medium |
| Reflexion | https://arxiv.org/abs/2303.11366 | Araştırma makalesi | Medium/High | feedback, retry ve reflection loop'ları | Medium |
| Lost in the Middle | https://arxiv.org/abs/2307.03172 | Araştırma makalesi | Medium/High | progressive disclosure ve context placement disiplini | Medium |
| SWE-agent | https://arxiv.org/abs/2405.15793 | Araştırma makalesi | Medium/High | agent odaklı repo navigation, edit ve test interface'leri | Medium |
| openai/codex issues | https://github.com/openai/codex/issues | Practitioner issue tracker | Medium | Windows sandbox, PowerShell, MCP config ve AGENTS.md failure pattern'leri | High |

## Kaynaklı Kararlar

- `workspace-write`, `on-request` ve network-off default'ları korunur.
- Auth isteyen hesap, database ve broad filesystem MCP connector'ları default
  disabled kalır.
- Subprocess'ler geniş secret environment devralmasın diye
  `shell_environment_policy` eklenir.
- PowerShell `-WhatIf` ve Bash `--dry-run` ile installer ön izleme davranışı
  eklenir.
- Windows-safe Skills CLI çağrılarında `--agent codex` korunur.
- Default kurulabilir skill seti genis ama cakismayan tutulur: maintenance, CI
  repair, security, testing, frontend, SEO, accessibility, web quality ve docs
  bircok repo icin genel fayda saglar; dar Vercel/React/design polish
  skill'leri manual opt-in olarak katalogda kalir.
- Default kurulabilir skill seti sadece ayri ve yuksek faydali workflow varsa
  genisletilir: systematic debugging, refactor request planning,
  Playwright tabanli webapp testing, MCP server building ve uc first-party
  AgentChef ekosistem skill'i mevcut listeyle cakismadan bundled ajanlari
  tamamlar.
- Bir skill sadece install sayisi daha yuksek diye secilmez. SEO marketing,
  prompt-polish, release-only ve framework/vendor-specific skill'ler faydali
  olabilir; fakat Windows-first Codex setup starter icin default kurulumda daha
  fazla trigger cakismasi veya risk yaratir.
- `impeccable`, ekstra design-taste, Vercel, prompt, context, memory ve
  token-related skill'ler bundled ajanlarla cakistiginda veya auth/vendor akisi
  gerektirdiginde manuel opt-in katalog referansi olarak korunur.
- First-party ekosistem skill'leri incelenmis `-All` / `-InstallSkills` setine
  alinir:
  `ai-project-starter`, `prompt-architect`
  ve `ai-skill-create`. Boylece kabiliyet first-party sahiplik altinda
  kurulur; dis kaynakli cakisan design, Vercel, memory, token, prompt ve
  context referanslari manual kalir.
- Global Git guard degisiklikleri `-All` disinda tutulur; global
  `core.excludesfile` ve `core.hooksPath` degisiklikleri mevcut kullanicinin
  butun repolarini etkiledigi icin acik opt-in ister.
- Public `token` skill aramasi cogunlukla auth/deployment/crypto-token
  workflow'larina ciktigi icin LLM token ve context butcesi icin bundled yerel
  `context-budget-planner` skill'i eklenir.
- Bundled yerel skill'ler reference-backed tutulur: kisa `SKILL.md` girisi,
  detayli `references/` dosyalari ve `agents/openai.yaml` UI metadata'si. Bu
  Codex progressive disclosure modeline uyar ve tum workflow detaylarinin ilk
  context'i sisirmesini engeller.
- Yerel plugin skill'leri sessizce `SKILL.md`, reference, UI metadata veya
  catalog kaydi kaybetmesin diye `npm run validate:plugin-skills` eklenir.
- Offline diagram skill'i tam Mermaid renderer kapsami vaat etmez; sinirli
  Mermaid flowchart subset'i ve editable Excalidraw JSON cikti sozlesmesiyle
  guvenilir tutulur.
- Google SEO uzmani read-only eklenir; cunku search visibility faydali ama
  Search Central/Lighthouse kanitina dayali kalmali, ranking garantisi
  vermemeli ve default olarak credentialed Search Console erisimi kullanmamali.
- Online skill validation network ve dış package resolution kullandığı için
  offline validation'dan ayrı tutulur.
- Third-party skill kaynakları review edilebilsin diye `catalog/skills-lock.json`
  ve daha zengin catalog metadata'sı eklenir.
- Paketlenen uzman ajan config'i incelenebilir olsun ve Windows/Unix
  template'leriyle karsilastirilabilsin diye `catalog/agents.json` eklenir.
- MCP config explicit source, risk, auth ve approval metadata'sı olan bir trust
  boundary olarak ele alınır.
- ECC'nin manifest/plan/state fikri alınır; geniş global sync, otomatik
  dependency install veya default açık connector kapsamı içeri taşınmaz.
- Fresh clone üzerinde `npm run check` çalışabilsin diye install-plan validation
  dependency-free tutulur.
- Dokumante edilen connector inventory ile gercek Codex template'leri sessizce
  ayrismasin diye MCP catalog/config drift kontrolu eklenir.
- Remote shell pipe, download-execute, guvensiz destructive shell snippet,
  floating active package spec ve implicit installer dependency install
  desenleri icin bounded supply-chain IOC taramasi eklenir.
- README kısa ve taranabilir tutulur; troubleshooting, upgrade ve expected
  output detayları odaklı docs dosyalarına taşınır.
- Public issue tracker sinyalleri troubleshooting'i iyileştirmek için kullanılır,
  resmi Codex dokümanlarının yerine geçmez.
- GStack'in faydali rol taksonomisi Codex-native ajan/skill olarak alinir;
  default slash-command shim olarak alinmaz. Browser pairing, cookie import,
  deploy, raw CDP ve continuous checkpoint davranislari token, tunnel, browser
  state, production sistemi veya auto-commit davranisi getirdigi icin default
  kurulum disinda kalir.
- Star sayisi sadece kesif sinyalidir. ECC ve GStack daha derin audit'i hakli
  cikarir, ama alinan her davranis yine Codex-native bir yuzeye, guvenli
  default'a, dokumante edilmis exclusion sinirina ve installable davranisi
  etkiliyorsa validator/release gate'e baglanir.
- Yirmi bir specialist agent rol dosyasina research-synthesis ve
  adversarial-validation guidance eklendi; dis kaynaklar gizli prompt
  kalabaligi olarak degil, kompakt action map, constraint, verification plan
  veya risk karari olarak tasinir.
- Yirmi bir specialist agent rol dosyasina source-refresh, source-currency,
  corpus-expansion ve expert-calibration guidance eklendi; stale kanit
  yenilensin, genis kanit compact calisma kuralina donussun ve dusuk guvenli
  cikti handoff oncesi zorlansin.
- Genisletilmis agent corpus validation ile korunur: her role dosyasi her
  zorunlu guardrail blogundan bir tane, en az 100 source-backed instruction
  item'i ve en az 20 distinct source marker tasimalidir.
- Machine-readable agent research corpus manifest'i eklenir; incelenmis source
  domain, source type, refresh trigger ve handoff hedefleri uzun role
  prompt'larinin disinda da gorunur olur.
- Corpus'a reviewed authority-reference metadata'si eklenir; agent source
  aileleri, URL'ler, source type'lar, staleness risk'leri ve source marker'lar
  tek yerden kontrol edilip guncellenebilir ve eslesen agent TOML
  promptlarindaki source marker'lara karsi dogrulanir.
- Her reviewed authority reference'a review cadence metadata'si eklenir; hizli
  degisen resmi docs ve tool kaynaklari en az 45 gunde, daha yavas standartlar
  ve olgun engineering guide'lar 180 gunde refresh edilmelidir. Stale corpus
  `dateChecked` degerleri release oncesi validation'da fail eder.
- Research corpus'a agent basina expertise signal eklenir; boylece her
  specialist'in reviewed bilgisi decision heuristic, yaygin failure mode ve
  verification signal olarak structured data seklinde dogrulanabilir.
- Research corpus'a `supplementalResearchRefs` eklenir; repo pattern'leri,
  skill ornekleri, local command snapshot'lari, resmi proje docs'lari ve
  research paper'lari heuristic'leri besler ama agent `authorityRefs` icine
  terfi edene kadar default runtime authority olmaz.
- Guncel OpenAI config referansi app/connector kapilarini MCP server approval
  ayarlarindan ayri gosterdigi icin Codex template'lerine acik
  `apps._default.enabled = false`,
  `apps._default.destructive_enabled = false` ve
  `apps._default.open_world_enabled = false` eklenir.
