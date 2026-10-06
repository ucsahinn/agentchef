# AgentChef Skill'leri

[English](skills.md) | [Türkçe](skills.tr.md)

Skill, Codex workflow'undaki **nasıl** sorusunun cevabıdır. Belirli bir işi her
seferinde sıfırdan tarif etmek yerine odaklı talimatları, referansları ve
gerekirse script'leri tek bir workflow altında toplar.

Codex progressive disclosure kullanır: önce skill'in adını ve kısa açıklamasını
görür, tam `SKILL.md` içeriğini yalnızca görev eşleştiğinde veya skill'i sen
açıkça çağırdığında okur. Bu yüzden katalog; repo ile gelenleri, full install
profilinin ekleyebildiklerini ve yalnızca opsiyonel referans olarak tutulanları
ayrı gösterir.

Resmi Codex kaynağı: [Skill oluşturma](https://developers.openai.com/codex/skills)

## 🍱 Repo İle Gelen On Bir Workflow

Bu skill'ler `agentchef` plugin'inin içindedir ve repo ile birlikte gelir.
Installer onları `AGENTS_HOME/plugins/sources/agentchef/skills/<ad>` plugin
kaynağına yerleştirir; 1.3.0'dan beri `AGENTS_HOME/skills` altına kopyalamaz,
böylece her skill CLI başına bir kez listelenir. Örneğin `$fetch`, `$seo` ve
`$evidence-research` workflow'ları Codex'te `$agentchef:fetch <url>`,
`$agentchef:seo <hedef>` ve `$agentchef:evidence-research <soru>`, Claude
Code'da `/agentchef:<skill>` diye çağrılır. Fetch yalnız explicit çağrıyla çalışır; SEO ile Evidence
Research ise istek açıklamalarıyla açıkça eşleştiğinde otomatik de seçilebilir.

Kişisel marketplace kaydı plugin'i yalnızca keşfedilebilir yapar; kurmaz veya
etkinleştirmez. `$agentchef:fetch` gibi namespace'li çağrılar için
`agentchef@agentchef` plugin'ini `/plugins` ya da `codex plugin add`
ile kurup yeni bir Codex oturumu başlatmak gerekir.

| Skill | Ne için kullanılır? |
| --- | --- |
| [`agentchef-operator`](../plugins/agentchef/skills/agentchef-operator/SKILL.md) | Installer veya güvenlik sınırlarını gevşetmeden bu starter'ı bakımlı tutmak için. |
| [`context-budget-planner`](../plugins/agentchef/skills/context-budget-planner/SKILL.md) | Geniş işlerde kaynak, token kullanımı, compaction handoff ve doğrulama planlamak için. |
| [`adaptive-agent-routing`](../plugins/agentchef/skills/adaptive-agent-routing/SKILL.md) | En dar agent, skill, MCP ve bekleme politikasını seçmek için. 1.3.4 ile yalnızca dört katalog koşulundan biri geçerliyse agent başlatır, eşleşen profilin auto-skill'ini önce yükler ve `autoVerify` profillerinde verifier'ı zorunlu kılar. |
| [`agent-brief`](../plugins/agentchef/skills/agent-brief/SKILL.md) | Orkestratörün başka bir ajana verdiği yedi alanlı brief'i (`coordination-board brief-check` ile denetlenir) ve geri dönen altı alanlı handoff'u (1.3.3 ile `coordination-board handoff-check` ile denetlenir) yazmak için; ekip protokolünü de tutar: Direct ve Team rotaları, görev başına en çok dört worker (koordinatör sayılmaz), birleştirme ve doğrulayan kuralları. |
| [`external-review-workflow`](../plugins/agentchef/skills/external-review-workflow/SKILL.md) | Hiçbir şeyi otomatik yüklemeden secret-safe ve hash-pinned manuel review handoff'u hazırlamak için. |
| [`gptpro`](../plugins/agentchef/skills/gptpro/SKILL.md) | Taze external-review snapshot'ını yükleme yapmadan architecture-aware GPT Pro Project metin bağlamına dönüştürmek için. |
| [`gptpro-handoff`](../plugins/agentchef/skills/gptpro-handoff/SKILL.md) | Review-ID-bound GPT Pro prompt'u yazmak ve dönen raporu implementation öncesinde doğrulamak için. |
| [`fetch`](../plugins/agentchef/skills/fetch/SKILL.md) | Yetkili bir referans siteyi gerçek browser kanıtıyla yeniden kurmak, responsive etkileşimleri doğrulamak ve credential ya da server içi mantık kopyalamadan bütün fidelity farklarını raporlamak için. |
| [`seo`](../plugins/agentchef/skills/seo/SKILL.md) | Ranking veya indexing kanıtı uydurmadan teknik SEO, rendering, structured data, content intent, uluslararası/lokal SEO, performans ve ölçüm işlerini audit etmek, uygulamak ve doğrulamak için. |
| [`evidence-research`](../plugins/agentchef/skills/evidence-research/SKILL.md) | Karar sorusunu çerçevelemek, güncel kaynakları arayıp değerlendirmek, claim'leri izlenebilir tutmak, görüş ayrılıklarını ve belirsizliği açıklamak, yeniden üretilebilir araştırma paketi hazırlamak için. |
| [`offline-diagram-triplet`](../plugins/agentchef/skills/offline-diagram-triplet/SKILL.md) | Mermaid kaynağını network kullanmadan editable Excalidraw, SVG, PNG ve Markdown asset'lerine çevirmek için. |

## ✅ Full Install İçin İncelenmiş On Sekiz Skill

Bu kayıtlar katalogda `install: true` taşır. Full install profili için
uygundurlar; package/skill çifti katalogda sabitlenir ve online doğrulama bu
çiftin hâlâ çözüldüğünü kontrol eder. Installer her birini bundled skill'lerle
aynı plugin kaynağına, `.agentchef-source.json` provenance kaydıyla yazar;
böylece bunlar da plugin altında görünür.

| Skill | Ne ekler? | Kaynak | Lisans |
| --- | --- | --- | --- |
| `dependency-upgrade` | Uyumluluk kontrolüyle adımlı dependency upgrade. | [wshobson/agents](https://github.com/wshobson/agents) | MIT |
| `gh-fix-ci` | Failing GitHub Actions kontrolleri için resmi OpenAI workflow'u. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `git-workflow-and-versioning` | Atomik commit, temiz branch ve pull request, semantic version, tag ve changelog. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `shipping-and-launch` | Yayın öncesi checklist, monitoring, kademeli rollout ve rollback planı. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `systematic-debugging` | Kod değişmeden önce root-cause araştırması. | [obra/superpowers](https://github.com/obra/superpowers) | MIT |
| `improve-codebase-architecture` | Mimariyi derinleştirme fırsatlarını bulup seçilen refactor'ı planlar; upstream'de açık çağrıyla çalışır. | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT |
| `security-best-practices` | Desteklenen stack'ler için resmi OpenAI secure-default rehberi. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `security-threat-model` | Yalnızca açıkça istendiğinde, repoya dayalı resmi OpenAI threat model'i. | [openai/skills](https://github.com/openai/skills) | Apache-2.0 |
| `frontend-design` | Yeni veya yeniden şekillenen UI için özgün, bilinçli görsel yön ve tipografi. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `webapp-testing` | Lokal web app için browser kanıtı, screenshot ve log. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `web-quality-audit` | Performance, accessibility, SEO ve best-practice kontrolü. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | MIT |
| `accessibility` | Keyboard, focus, form, ARIA, semantic HTML ve WCAG odaklı inceleme. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) | MIT |
| `test-driven-development` | Implementation öncesi odaklı davranış testleri. | [obra/superpowers](https://github.com/obra/superpowers) | MIT |
| `documentation-and-adrs` | README, ADR ve kalıcı proje dokümantasyonu. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT |
| `mcp-builder` | MCP tool, schema, transport ve evaluation tasarımı. | [anthropics/skills](https://github.com/anthropics/skills) | Apache-2.0 |
| `ai-project-starter` | AI-coding-ready proje context'i, starter docs ve guardrail'ler. | [ucsahinn/ai-project-starter](https://github.com/ucsahinn/ai-project-starter) | MIT |
| `prompt-architect` | Plan-first, approval-aware Codex prompt'ları ve prompt audit'leri. | [ucsahinn/prompt-architect](https://github.com/ucsahinn/prompt-architect) | MIT |
| `ai-skill-create` | Codex skill ve plugin'lerini oluşturma, doğrulama, forward-test ve paketleme. | [ucsahinn/ai-skill-create](https://github.com/ucsahinn/ai-skill-create) | MIT |

Lisans sütunu, sabitlenen commit'te upstream depoda ölçülen lisansı kaydeder;
lock dosyası da aynı değeri tutar, böylece bir pin değişikliği lisansı sessizce
değiştiremez.

### İki Sabitlenmiş Skill'in Bilinen Sınırları

- `improve-codebase-architecture`, upstream `SKILL.md` dosyasında
  `disable-model-invocation: true` taşır. Görev eşleşse bile agent'lar onu
  kendiliğinden seçmez. Açıkça çağır: Codex'te
  `$agentchef:improve-codebase-architecture`, Claude Code'da
  `/agentchef:improve-codebase-architecture`.
- `git-workflow-and-versioning` upstream'de kendini "Use when making any code
  change" diye tanımlar; bu yüzden bir agent onu sıradan düzenlemelerde de
  yükleyebilir. Yüklenmesi bir yetki vermez: AgentChef çalışma sözleşmesi,
  sen istemedikçe asla commit veya push yapılmamasını söyler ve bu kural
  skill'in kontrol listesinden önce gelir.

### Yalnızca Açıkça İstenen Skill'ler

`catalog/skills.json` içinde dört skill `implicitInvocation: false` taşır:
`fetch`, `security-best-practices`, `security-threat-model` ve
`improve-codebase-architecture`. Yalnızca sen adıyla istediğinde kullanılırlar.
1.3.4 ile auto-skill'i bunlardan biri olan bir routing
profili (örneğin `security-best-practices` ile `security-sensitive`) skill'i
kendiliğinden yüklemez; oturum bunu sana önerir. Yukarıdaki iki sabitlenmiş
skill uyarısı geçerliliğini korur.

## 🧰 Katalogda Bulunan Diğer Workflow'lar

AgentChef aşağıdaki isimleri otomatik kurmaz.

<details>
<summary><strong>Uyumluluk takma adları</strong></summary>

Bir takma ad, eski veya çakışan bir ismi bu işin artık sahibi olan kurulu
skill'e yönlendirir. Aynı görevde takma adı ve hedefini birlikte yüklemeyin.

| Takma ad | Bunun yerine |
| --- | --- |
| `codex-chef-operator` | `agentchef-operator` |
| `context-engineering-project-starter` | `ai-project-starter` |
| `codex-skill-forge` | `ai-skill-create` |
| `codex-enterprise-prompt-architect` | `prompt-architect` |
| `investigate` | `systematic-debugging` |
| `incident-triage` | `systematic-debugging` |
| `new-feature` | `test-driven-development` |
| `test-backfill` | `test-driven-development` |
| `security-check` | `security-best-practices` |
| `context-map` | `context-budget-planner` |
| `what-context-needed` | `context-budget-planner` |
| `prompt-engineering-patterns` | `prompt-architect` |
| `playwright` | `webapp-testing` |
| `babysit-pr` | `gh-fix-ci` |
| `impeccable` | `frontend-design` |
| `design-taste-frontend` | `frontend-design` |
| `high-end-visual-design` | `frontend-design` |
| `image-to-code` | `frontend-design` |
| `frontend-skill` | `frontend-design` |
| `refactor-plan` | `improve-codebase-architecture` |
| `request-refactor-plan` | `improve-codebase-architecture` |
| `open-pr` | `git-workflow-and-versioning` |
| `codex-pr-body` | `git-workflow-and-versioning` |
| `git-hygiene` | `git-workflow-and-versioning` |
| `release-verify` | `shipping-and-launch` |

</details>

<details>
<summary><strong>Emekliye ayrılan referanslar</strong></summary>

Bu kayıtlar eski referanslar bir yönlendirme bulsun diye katalogda
`retired: true` ile kalır; yerlerini bir harness skill'i, bir agent rolü ya da
ikisi birlikte alır.

| Emekli isim | Yerine geçen |
| --- | --- |
| `mcp-connectors` | `mcp_integrator` + `mcp-builder` |
| `performance-audit` | `performance_auditor` + `web-quality-audit` |
| `code-review` | `code_reviewer` |
| `sentry-code-review` | `code_reviewer` |
| `web-design-guidelines` | `web-quality-audit` + `accessibility` |
| `ai-prompt-engineering-safety-review` | `prompt-architect` + `security_auditor` |

</details>

<details>
<summary><strong>Opsiyonel manuel referanslar</strong></summary>

- `db-migration-review`, `vercel-react-best-practices`, `vercel-optimize`, `memory-safety-patterns`, ve `vercel-cli-with-tokens` opt-in kalır: framework'e veya
  vendor'a özeldir, credential ister ya da henüz harness karşılığı yoktur.

</details>

## “Katalogda Var” Ne Demek?

- Katalog kaydı incelenmiş metadata'dır; skill'in kurulu olduğunu kanıtlamaz.
- Bundled skill bu repodaki plugin'in içinde yaşar. Codex'e ve Claude Code'a
  yalnızca o plugin üzerinden ulaşır; ikinci bir doğrudan kopya yoktur.
- `install: true` kaydı full install profiline uygun demektir.
- Manuel referans, varsayılan bir skill ile çakışabilir veya credential, vendor
  kurulumu ya da daha özel bir görev gerektirebilir.
- Skill'ler kendi kendine çalışmaz. Codex, görev eşleştiğinde veya sen açıkça
  çağırdığında skill'i seçer.
- Claude Code aynı plugin kaynağını `claude plugin install` ile yükler;
  `~/.claude/skills` altına hiçbir bağlantı kurulmaz, bu yüzden her skill bir
  kez listelenir. Orada bir skill'i `/agentchef:<ad>` ile, başka bir komut
  aynı adı taşımıyorsa yalın `/<ad>` ile çağırırsın. 1.0–1.2 kurulumundan
  kalan bağlantılar için bkz.
  [Claude skill bağlantıları](../kb/claude-skill-links.tr.md).

Makine tarafından okunan kaynak
[`catalog/skills.json`](../catalog/skills.json) dosyasıdır. İncelenmiş kurulum
hedefleri [`catalog/skills-lock.json`](../catalog/skills-lock.json) içinde
tam upstream commit SHA'ları ve tarihli Skills CLI uyumluluk/keşif metadatasıyla
yansıtılır. Kurulumun kendisi doğrulanmış native-copy yolunu kullanır.

[README'ye dön](../README.tr.md) veya [agent'lar](agents.tr.md) ve
[MCP'lerle](mcp-catalog.tr.md) devam et.
