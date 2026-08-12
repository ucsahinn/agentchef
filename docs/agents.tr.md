# Codex Chef Agent'ları

[English](agents.md) | [Türkçe](agents.tr.md)

Agent, Codex workflow'undaki **kim** sorusunun cevabıdır: görevi, sınırı ve
döndüreceği kanıt belli olan uzman bir rol.

Codex Chef 21 özel rol içerir. Bunlar arka planda sürekli çalışan servisler
değildir ve her görevde topluca açılmaz. Bir rol, subagent başlatılmadan da ana
oturuma yol gösterebilir. Delegasyon; işler bağımsız ilerleyebiliyorsa, gürültülü
çıktıyı ana thread'den ayırmak gerekiyorsa veya sen açıkça paralel agent
istiyorsan anlamlıdır.

Resmi Codex kaynağı: [Subagent'lar](https://developers.openai.com/codex/subagents)

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
5. Aktif kullanıcı profili yetkili kalır; Codex Chef rol dosyaları her agent'ı
   tek bir modele sabitlemez.

## AgentSpace Sahipliği, Knowledge ve Worker Güvenliği

Sekiz AgentSpace ofis rolü işin sahibidir; 21 Codex Chef uzmanı dar görev
worker'ları olarak kalır. \`catalog/agents.json\` eksiksiz 8→21 sahiplik eşlemesini
tutar. Routing sonucu seçilen her worker için sahibi ve uzman adıyla aynı olan
\`knowledgeRef\` değerini gösterir. Bu referans yalnızca
\`catalog/agent-research-corpus.json\` içindeki incelenmiş metadata'ya çözülür;
routing AgentSpace hafızasını, auth/session verisini veya makineye özel içeriği
prompt'a enjekte etmez.

Kurulan her worker TOML'ü \`approval_policy = "on-request"\` ve katalogdaki dar
sandbox değerini (\`read-only\` veya \`workspace-write\`) uygular. İncelenmiş
\`rules/default.rules\` yalnız dar ve güvenli inceleme komutlarını promptsuz
çalıştırabilir; yıkıcı, credential kullanan, publish/deploy yapan, geniş shell ve
diğer riskli sınıflar prompt-gated kalır. Worker'lar \`danger-full-access\` veya
global \`approval_policy = "never"\` varsayılanını kullanmaz.

Bu sayfanın arkasındaki incelenmiş metadata
[`catalog/agents.json`](../catalog/agents.json) dosyasında. Routing profilleri
ise [`catalog/routing-profiles.json`](../catalog/routing-profiles.json) içinde.

[README'ye dön](../README.tr.md) veya [skill'ler](skills.tr.md) ve
[MCP'lerle](mcp-catalog.tr.md) devam et.
