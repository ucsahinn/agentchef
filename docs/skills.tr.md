# Codex Chef Skill'leri

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

Bu skill'ler Codex Chef plugin'inin içindedir ve repo ile birlikte gelir.
Installer on bir workflow'un tamamını aynı canonical kaynaktan
`AGENTS_HOME/skills/<ad>` hedeflerine senkronize eder. Böylece
`$adaptive-agent-routing`, `$context-budget-planner`, `$fetch <url>`, `$seo
<hedef>` ve `$evidence-research <soru>` gibi çağrılar doğrudan çalışır. Fetch
yalnız explicit çağrıyla çalışır; SEO ile Evidence Research ise istek
açıklamalarıyla açıkça eşleştiğinde otomatik de seçilebilir.

Kişisel marketplace kaydı plugin'i yalnızca keşfedilebilir yapar; kurmaz veya
etkinleştirmez. `$codex-chef-workflows:fetch` gibi namespace'li çağrılar için
`codex-chef-workflows@codex-chef` plugin'ini `/plugins` ya da `codex plugin add`
ile kurup yeni bir Codex oturumu başlatmak gerekir.

| Skill | Ne için kullanılır? |
| --- | --- |
| [`codex-chef-operator`](../plugins/codex-chef-workflows/skills/codex-chef-operator/SKILL.md) | Installer veya güvenlik sınırlarını gevşetmeden bu starter'ı bakımlı tutmak için. |
| [`codex-chef-brain`](../plugins/codex-chef-workflows/skills/codex-chef-brain/SKILL.md) | Kullanıcıya ait Markdown vault içinde seçili proje bilgisini preview, capture, retrieve, backup ve restore etmek için. |
| [`context-budget-planner`](../plugins/codex-chef-workflows/skills/context-budget-planner/SKILL.md) | Geniş işlerde kaynak, token kullanımı, compaction handoff ve doğrulama planlamak için. |
| [`adaptive-agent-routing`](../plugins/codex-chef-workflows/skills/adaptive-agent-routing/SKILL.md) | Varsayılan olarak spawn etmeden en dar agent, skill, MCP ve bekleme politikasını seçmek için. |
| [`external-review-workflow`](../plugins/codex-chef-workflows/skills/external-review-workflow/SKILL.md) | Hiçbir şeyi otomatik yüklemeden secret-safe ve hash-pinned manuel review handoff'u hazırlamak için. |
| [`gptpro`](../plugins/codex-chef-workflows/skills/gptpro/SKILL.md) | Taze external-review snapshot'ını yükleme yapmadan architecture-aware GPT Pro Project metin bağlamına dönüştürmek için. |
| [`gptpro-handoff`](../plugins/codex-chef-workflows/skills/gptpro-handoff/SKILL.md) | Review-ID-bound GPT Pro prompt'u yazmak ve dönen raporu implementation öncesinde doğrulamak için. |
| [`fetch`](../plugins/codex-chef-workflows/skills/fetch/SKILL.md) | Yetkili bir referans siteyi gerçek browser kanıtıyla yeniden kurmak, responsive etkileşimleri doğrulamak ve credential ya da server içi mantık kopyalamadan bütün fidelity farklarını raporlamak için. |
| [`seo`](../plugins/codex-chef-workflows/skills/seo/SKILL.md) | Ranking veya indexing kanıtı uydurmadan teknik SEO, rendering, structured data, content intent, uluslararası/lokal SEO, performans ve ölçüm işlerini audit etmek, uygulamak ve doğrulamak için. |
| [`evidence-research`](../plugins/codex-chef-workflows/skills/evidence-research/SKILL.md) | Karar sorusunu çerçevelemek, güncel kaynakları arayıp değerlendirmek, claim'leri izlenebilir tutmak, görüş ayrılıklarını ve belirsizliği açıklamak, yeniden üretilebilir araştırma paketi hazırlamak için. |
| [`offline-diagram-triplet`](../plugins/codex-chef-workflows/skills/offline-diagram-triplet/SKILL.md) | Mermaid kaynağını network kullanmadan editable Excalidraw, SVG, PNG ve Markdown asset'lerine çevirmek için. |

## ✅ Full Install İçin İncelenmiş On Beş Skill

Bu kayıtlar katalogda `install: true` taşır. Full install profili için
uygundurlar; package/skill çifti katalogda sabitlenir ve online doğrulama bu
çiftin hâlâ çözüldüğünü kontrol eder.

| Skill | Ne ekler? | Kaynak |
| --- | --- | --- |
| `dependency-upgrade` | Uyumluluk kontrolüyle adımlı dependency upgrade. | [wshobson/agents](https://github.com/wshobson/agents) |
| `gh-fix-ci` | Failing GitHub Actions kontrolleri için resmi OpenAI workflow'u. | [openai/skills](https://github.com/openai/skills) |
| `systematic-debugging` | Kod değişmeden önce root-cause araştırması. | [obra/superpowers](https://github.com/obra/superpowers) |
| `request-refactor-plan` | Geniş refactor'lar için küçük ve çalışır adımlar. | [mattpocock/skills](https://github.com/mattpocock/skills) |
| `security-best-practices` | Desteklenen stack'ler için resmi OpenAI secure-default rehberi. | [openai/skills](https://github.com/openai/skills) |
| `frontend-skill` | Geniş kapsamlı frontend üretim workflow'u. | [nexu-io/open-design](https://github.com/nexu-io/open-design) |
| `webapp-testing` | Lokal web app için browser kanıtı, screenshot ve log. | [anthropics/skills](https://github.com/anthropics/skills) |
| `web-quality-audit` | Performance, accessibility, SEO ve best-practice kontrolü. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) |
| `accessibility` | Keyboard, focus, form, ARIA, semantic HTML ve WCAG odaklı inceleme. | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) |
| `test-driven-development` | Implementation öncesi odaklı davranış testleri. | [obra/superpowers](https://github.com/obra/superpowers) |
| `documentation-and-adrs` | README, ADR ve kalıcı proje dokümantasyonu. | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |
| `mcp-builder` | MCP tool, schema, transport ve evaluation tasarımı. | [anthropics/skills](https://github.com/anthropics/skills) |
| `ai-project-starter` | AI-coding-ready proje context'i, starter docs ve guardrail'ler. | [ucsahinn/ai-project-starter](https://github.com/ucsahinn/ai-project-starter) |
| `prompt-architect` | Plan-first, approval-aware Codex prompt'ları ve prompt audit'leri. | [ucsahinn/prompt-architect](https://github.com/ucsahinn/prompt-architect) |
| `ai-skill-create` | Codex skill ve plugin'lerini oluşturma, doğrulama, forward-test ve paketleme. | [ucsahinn/ai-skill-create](https://github.com/ucsahinn/ai-skill-create) |

## 🧰 Katalogda Bulunan Diğer Workflow'lar

Aşağıdaki isimler keşfedilebilir kalır; fakat Codex Chef bunları otomatik
kurmaz. Bazıları lokal uyumluluk adlarıdır, bazılarıysa varsayılan skill
listesini kalabalıklaştırmamak için opt-in tutulan özel upstream seçeneklerdir.

<details>
<summary><strong>Debugging, implementation, review ve release</strong></summary>

- `investigate`, `incident-triage`, `new-feature`, `refactor-plan`,
  `test-backfill`, `performance-audit`, `db-migration-review`,
  `release-verify`, `code-review`, `sentry-code-review`, `codex-pr-body`,
  `babysit-pr` ve `open-pr`
- `git-hygiene`, `security-check` ve `security-threat-model`

</details>

<details>
<summary><strong>Frontend, browser ve hosting referansları</strong></summary>

- `impeccable`, `design-taste-frontend`, `image-to-code`,
  `high-end-visual-design` ve `web-design-guidelines`
- `vercel-react-best-practices`, `vercel-optimize`,
  `vercel-cli-with-tokens` ve `playwright`

</details>

<details>
<summary><strong>Context, prompt, memory ve MCP kurulumu</strong></summary>

- `mcp-connectors`, `context-map`, `what-context-needed`,
  `prompt-engineering-patterns`, `ai-prompt-engineering-safety-review` ve
  `memory-safety-patterns`

</details>

## “Katalogda Var” Ne Demek?

- Katalog kaydı incelenmiş metadata'dır; skill'in kurulu olduğunu kanıtlamaz.
- Bundled skill bu repodaki plugin'in içinde yaşar. On bir bundled workflow'un
  tamamı, repoda ikinci bir canonical kaynak oluşturmadan yönetilen direct
  skill olarak da senkronize edilir.
- `install: true` kaydı full install profiline uygun demektir.
- Manuel referans, varsayılan bir skill ile çakışabilir veya credential, vendor
  kurulumu ya da daha özel bir görev gerektirebilir.
- Skill'ler kendi kendine çalışmaz. Codex, görev eşleştiğinde veya sen açıkça
  çağırdığında skill'i seçer.

Makine tarafından okunan kaynak
[`catalog/skills.json`](../catalog/skills.json) dosyasıdır. İncelenmiş kurulum
hedefleri [`catalog/skills-lock.json`](../catalog/skills-lock.json) içinde
tam upstream commit SHA'ları ve tarihli Skills CLI uyumluluk/keşif metadatasıyla
yansıtılır. Kurulumun kendisi doğrulanmış native-copy yolunu kullanır.

[README'ye dön](../README.tr.md) veya [agent'lar](agents.tr.md) ve
[MCP'lerle](mcp-catalog.tr.md) devam et.
