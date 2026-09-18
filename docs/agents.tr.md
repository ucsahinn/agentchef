# AgentChef Agent'ları

[English](agents.md) | [Türkçe](agents.tr.md)

Agent, Codex workflow'undaki **kim** sorusunun cevabıdır: görevi, sınırı ve
döndüreceği kanıt belli olan uzman bir rol.

AgentChef 11 koordinasyon rolü ve 21 uzman worker rolü içerir. Bunlar arka
planda sürekli çalışan servisler değildir ve her görevde topluca açılmaz. Bir
rol, subagent başlatılmadan da ana oturuma yol gösterebilir. Delegasyon; işler
bağımsız ilerleyebiliyorsa, gürültülü çıktıyı ana thread'den ayırmak gerekiyorsa
veya sen açıkça paralel agent istiyorsan anlamlıdır.

Resmi Codex kaynağı: [Subagent'lar](https://developers.openai.com/codex/subagents)

## Bir Koordinatör Çağır

Belirli bir rolü normal dille iste. Görevi, koordinatörü, bağımsız işlerin
paralel ilerleyip ilerlemeyeceğini ve geri dönmesini istediğin kanıtı belirt.
Örneğin:

> `backend_coordinator` bu API bug'ını sahiplensin. Yalnız katalogdaki
> uzmanlarını kullansın, sonuçlarını beklesin; root cause, önerilen fix, test
> kanıtı, çatışmalar ve kalan riskleri döndürsün.

İnsan-dostu bir takma adla koordinatörü belirt, ancak çağrılabilir kimlik olarak
kanonik `*_coordinator` ID'sini kullan. Takma adlar yalnızca eşleştirme
etiketleridir; yeni bir agent, ayrı kurulan bir rol veya ek bir delegasyon
seviyesi oluşturmazlar.

| Takma ad adayları | Çağrılabilir kanonik ID |
| --- | --- |
| `Engineering Lead`, `Leadership Coordinator`, `Delivery Lead` | `leadership_coordinator` |
| `Product Lead`, `Product Coordinator`, `Scope Lead` | `product_coordinator` |
| `Backend Lead`, `Backend Coordinator`, `Integration Lead` | `backend_coordinator` |
| `Data Lead`, `Data Coordinator`, `Information Lead` | `data_coordinator` |
| `Frontend Lead`, `Frontend Coordinator`, `UI Evidence Lead` | `frontend_coordinator` |
| `DevOps Lead`, `DevOps Coordinator`, `Operations Lead` | `devops_coordinator` |
| `Security Lead`, `Security Coordinator`, `Risk Lead` | `security_coordinator` |
| `QA Lead`, `QA Coordinator`, `Assurance Lead` | `qa_coordinator` |
| `Design Lead`, `Design Coordinator`, `UX Review Lead` | `design_coordinator` |
| `Marketing Lead`, `Marketing Coordinator`, `Growth Lead` | `marketing_coordinator` |
| `Support Lead`, `Support Coordinator`, `Customer Care Lead` | `support_coordinator` |

Karar ve izin sınırı ana oturumda kalır. Koordinatör kanıtı korele eder; sessizce
publish/deploy yapmaz, yetki genişletmez veya ilgisiz işi devralmaz. CLI'da bir
agent thread'ini incelemek ya da ona geçmek için `/agent` kullan. App veya IDE'de
varsa subagent activity panelini aç; Codex'ten bir agent'ı yönlendirmesini,
durdurmasını veya kapatmasını da isteyebilirsin.

Routing yolu şöyledir:

`görev -> routing profili -> birincil koordinatör -> seçilen uzmanlar + dar skill/MCP'ler`

Alanlar arası iş, ana oturuma kısa bir handoff döndürür; başka bir koordinatör
gerekip gerekmediğine ana oturum karar verir.

## 🗺️ Önce Problemi Anla

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`code_mapper`](../templates/codex/agents/code_mapper.toml) | Değişiklikten önce gerçek dosyaları, çağrı yollarını, sahiplik sınırlarını ve mevcut pattern'leri bulman gerektiğinde. |
| [`docs_researcher`](../templates/codex/agents/docs_researcher.toml) | Bir API, araç, standart veya sürüm hassas bilgiyi güncel birincil kaynaktan doğrulamak gerektiğinde. |
| [`context_architect`](../templates/codex/agents/context_architect.toml) | Kalıcı davranışın prompt, `AGENTS.md`, skill, plugin, MCP, hook, memory, rule veya config'ten hangisine ait olduğuna karar verirken. |
| [`prompt_architect`](../templates/codex/agents/prompt_architect.toml) | Belirsiz bir istekten güvenilir brief, mode contract veya tekrar kullanılabilir prompt workflow'u çıkarırken. |
| [`mcp_integrator`](../templates/codex/agents/mcp_integrator.toml) | Bir connector için least-privilege erişim, auth sınırı, tool allowlist veya startup teşhisi gerektiğinde. |

## 🧭 Ne Yapılacağına Karar Ver

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`product_strategist`](../templates/codex/agents/product_strategist.toml) | Ürün hedefi, kullanıcı, kapsam veya en küçük faydalı sürüm hâlâ net değilse. |
| [`engineering_planner`](../templates/codex/agents/engineering_planner.toml) | Geniş bir değişiklik için mimari, data flow, invariant, edge case ve test stratejisi gerekiyorsa. |
| [`spec_author`](../templates/codex/agents/spec_author.toml) | Niyetin kanıt ve quality gate içeren uygulanabilir bir spec'e dönüşmesi gerekiyorsa. |
| [`design_reviewer`](../templates/codex/agents/design_reviewer.toml) | Bir arayüzde hiyerarşi, UX kararı, erişilebilirlik veya AI-slop kontrolü gerekiyorsa. |
| [`devex_auditor`](../templates/codex/agents/devex_auditor.toml) | Onboarding, dokümantasyon veya ilk çalıştırma olması gerekenden daha zor geliyorsa. |

## 🔍 Araştır Ve Doğrula

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`root_cause_debugger`](../templates/codex/agents/root_cause_debugger.toml) | Bug, regresyon veya failing test için fix'ten önce reproduction ve doğrulanmış root cause gerekiyorsa. |
| [`qa_lead`](../templates/codex/agents/qa_lead.toml) | Bir workflow için uçtan uca bug taraması, regression kapsamı ve yeniden doğrulama planı gerekiyorsa. |
| [`performance_auditor`](../templates/codex/agents/performance_auditor.toml) | Page speed, Core Web Vitals, runtime maliyeti veya başka bir hot path ölçülmüş kanıt istiyorsa. |
| [`frontend_verifier`](../templates/codex/agents/frontend_verifier.toml) | Render edilmiş UI için browser, screenshot, responsive layout, console veya interaction kanıtı gerekiyorsa. |
| [`test_verifier`](../templates/codex/agents/test_verifier.toml) | Lint, typecheck, test, build, smoke veya runtime kontrolleri bağımsız doğrulanabiliyorsa. |

## ✍️ İncele Ve Anlat

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`docs_author`](../templates/codex/agents/docs_author.toml) | Dokümantasyon daha açık bir harita, eksik rehber, release güncellemesi veya stale-content temizliği istiyorsa. |
| [`code_reviewer`](../templates/codex/agents/code_reviewer.toml) | Yeni bir göz doğruluk risklerine, regresyonlara ve eksik testlere bakmalıysa. |
| [`google_seo_auditor`](../templates/codex/agents/google_seo_auditor.toml) | Public sayfalar crawlability, metadata, structured data, Core Web Vitals ve Search Console hazırlığı istiyorsa. |

## 🛡️ Sınırı Koru

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`security_auditor`](../templates/codex/agents/security_auditor.toml) | Auth, secret, izin, API, veri erişimi veya abuse path'ler için read-only güvenlik incelemesi gerekiyorsa. |
| [`release_verifier`](../templates/codex/agents/release_verifier.toml) | Gerçek bir release için Git hijyeni, artifact kontrolü, secret scan ve publish gate gerekiyorsa. |
| [`codex_doctor`](../templates/codex/agents/codex_doctor.toml) | Starter, katalog, install plan, docs veya kurulu runtime drift etmiş olabilir diye düşünüyorsan. |

## Seçim Nasıl Çalışıyor?

1. Codex görev biçimini en dar ve faydalı rolle eşleştirir.
2. Bir eşleşme subagent başlatmayı **zorunlu kılmaz**. Ana oturum rolün
   rehberliğini doğrudan kullanabilir.
3. Spawn edilen agent'lar mevcut onay ve sandbox sınırlarını miras alır.
4. Aynı dosyalara dokunan paralel işler koordinasyon maliyeti yarattığı için
   write-heavy delegasyon sınırlı tutulur.
5. Aktif kullanıcı profili yetkili kalır; AgentChef rol dosyaları her agent'ı
   tek bir modele sabitlemez.

Veri rotası dardır: `data_coordinator`, `docs_researcher` ile salt-okunur lineage,
katalog, kalite ve kaynak kanıtını birleştirir. Data engineering, veritabanı
performansı, güvenlik veya operasyon uzmanlığı iddia etmez. Uygulama geliştirme,
veritabanı erişimi ve veritabanı performansı ihtiyaçları soru, incelenen kanıt,
çatışma, gereken karar ve açık doğrulama ihtiyacını içeren kısa bir parent-routed
handoff ile `backend_coordinator` için ana oturuma döner. Customer support/onboarding rotası da
advisory'dir. Bu rotalar veritabanı, customer-account veya production erişimi vermez.

### Aynı roller Claude Code'da

Claude Code hedefi aynı 32 rolü `agentchef:<rol>` adlı plugin subagent'ları
olarak taşır (örneğin `agentchef:code-mapper`). `npm run render:targets`
katalogdan üretir: salt-okunur Codex rolleri `Read`, `Grep`, `Glob` araçlı
ve `Write`, `Edit`, `Bash` yasaklı subagent'lara dönüşür; workspace-write
roller düzenleme araçlarını korur; koordinatörler yalnızca kataloğa bağlı
worker'larını `Agent(agentchef:<worker>)` ile başlatabilir. AgentChef
`~/.claude/agents/` dizinine asla yazmaz ve asla `bypassPermissions` üretmez.

## AgentSpace Sahipliği, Knowledge ve Worker Güvenliği

| Koordinatör | Sınırlı uzman worker'lar |
| --- | --- |
| `leadership_coordinator` | `context_architect`, `engineering_planner`, `code_reviewer`, `release_verifier` |
| `product_coordinator` | `prompt_architect`, `product_strategist`, `spec_author` |
| `backend_coordinator` | `code_mapper`, `mcp_integrator`, `root_cause_debugger` |
| `data_coordinator` | `docs_researcher` |
| `frontend_coordinator` | `frontend_verifier` |
| `devops_coordinator` | `performance_auditor`, `codex_doctor` |
| `security_coordinator` | `security_auditor` |
| `qa_coordinator` | `qa_lead`, `test_verifier` |
| `design_coordinator` | `design_reviewer` |
| `marketing_coordinator` | `google_seo_auditor`, `docs_author` |
| `support_coordinator` | `devex_auditor` |

Kurulumda çalışan on bir koordinatör vardır: leadership, product, backend, data,
frontend, DevOps, security, QA, design, marketing ve customer support. 21 Codex
Chef uzmanı dar görev worker'ı olarak kalır. \`catalog/agents.json\` eksiksiz
11→21 sahiplik eşlemesini tutar. Bir koordinatör yalnızca katalogdaki worker
grubunu (en çok dört worker) seçebilir; worker daha fazla delege etmez.

Alanlar arası koordinasyon doğrudan peer spawn değil, ana oturum üzerinden giden
kısa bir handoff'tur: birincil koordinatör soruyu, kanıtı, çatışmayı, kararı ve
açık doğrulama ihtiyacını ana oturuma döndürür; akran koordinatör gerekip
gerekmediğine ana oturum karar verir. Bu, iki seviye delegasyon sınırını korur
ve recursive agent tree oluşmasını önler. Routing sonucu seçilen her worker için
sahibi ve uzman adıyla aynı olan \`knowledgeRef\` değerini gösterir. Bu referans
yalnızca \`catalog/agent-research-corpus.json\` içindeki incelenmiş metadata'ya
çözülür; routing AgentSpace hafızasını, auth/session verisini veya makineye özel
içeriği prompt'a enjekte etmez.

Kurulan her koordinatör ve worker TOML'ü \`approval_policy = "on-request"\`
uygular. AgentSpace worker oturumunun ayrı bir runtime profili vardır:
\`sandbox_mode = "workspace-write"\`, \`approval_policy = "on-request"\` ve
\`approvals_reviewer = "auto_review"\`. Routing, bu etkin oturum profilini ve
uzmanın daha dar \`roleSandboxMode\` değerini ayrı ayrı gösterir. AgentSpace hesap
profilleri izole bir \`CODEX_HOME\` kullandığından bu kök anahtarlar o profilde
bulunmalıdır; başka bir Codex home'un varsayılanları devralınmaz. Resmi
[Codex Configuration Reference](https://developers.openai.com/codex/config-reference#configtoml),
`approvals_reviewer = "auto_review"` değerini reviewer-subagent modu olarak
tanımlar ve sandbox sınırını değiştirmediğini belirtir. Koordinatörler
read-only kalır; uzman rol dosyaları katalogdaki dar sandbox değerini
(\`read-only\` veya \`workspace-write\`) korur. İncelenmiş
\`rules/default.rules\` yalnız dar ve güvenli inceleme komutlarını promptsuz
çalıştırabilir; yıkıcı, credential kullanan, publish/deploy yapan, geniş shell ve
diğer riskli sınıflar prompt-gated kalır. Worker'lar \`danger-full-access\` veya
global \`approval_policy = "never"\` varsayılanını kullanmaz.

Bu sayfanın arkasındaki incelenmiş metadata
[`catalog/agents.json`](../catalog/agents.json) dosyasında. Routing profilleri
ise [`catalog/routing-profiles.json`](../catalog/routing-profiles.json) içinde.

[README'ye dön](../README.tr.md) veya [skill'ler](skills.tr.md) ve
[MCP'lerle](mcp-catalog.tr.md) devam et.
