# AgentChef Agent'ları

[English](agents.md) | [Türkçe](agents.tr.md)

Agent, Codex workflow'undaki **kim** sorusunun cevabıdır: görevi, sınırı ve
döndüreceği kanıt belli olan uzman bir rol.

AgentChef 7 koordinasyon rolü ve 21 uzman worker rolü içerir. Bunlar arka
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
| `DevOps Lead`, `DevOps Coordinator`, `Operations Lead` | `devops_coordinator` |
| `QA Lead`, `QA Coordinator`, `Assurance Lead` | `qa_coordinator` |
| `UI Lead`, `UI Coordinator`, `UX Evidence Lead` | `ui_coordinator` |
| `Marketing Lead`, `Marketing Coordinator`, `Growth Lead` | `marketing_coordinator` |

Karar ve izin sınırı ana oturumda kalır. Koordinatör kanıtı korele eder; sessizce
publish/deploy yapmaz, yetki genişletmez veya ilgisiz işi devralmaz. CLI'da bir
agent thread'ini incelemek ya da ona geçmek için `/agent` kullan. App veya IDE'de
varsa subagent activity panelini aç; Codex'ten bir agent'ı yönlendirmesini,
durdurmasını veya kapatmasını da isteyebilirsin.

Routing yolu şöyledir:

`görev -> routing profili -> birincil koordinatör -> seçilen uzmanlar + dar skill/MCP'ler`

Alanlar arası iş, ana oturuma kısa bir handoff döndürür; başka bir koordinatör
gerekip gerekmediğine ana oturum karar verir.

Bundled `agent-brief` skill'i (Codex'te `$agentchef:agent-brief`, Claude
Code'da `/agentchef:agent-brief`) bu alışverişi sabitler: worker'ın aldığı
brief ve döndürdüğü handoff (Sonuç, Kanıt, Değişen kapsam, Risk, Açık soru,
Sonraki doğrulama).

Ayrıntılı coordination-board sözleşmesi
[Skill'ler, Plugin'ler ve Uzman Agent'lar](skills-and-agents.tr.md) sayfasındadır:
iş yalnızca kullanıcının açıkça oluşturduğu bir board göreviyle başlar; pane
seçimi, rol seçimi ve routing eşleşmeleri onu asla kendiliğinden başlatmaz.
Koordinatörler yalnızca katalogdaki worker'larını seçer, worker'lar yapılandırılmış
kanıt handoff'u döndürür, alanlar arası soruları ana oturum iletir ve görev done
olmadan önce kanıt eklenip incelenmelidir.

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
5. Açtığın oturum kendi modelini ve profilini korur. Delege edilen roller daha
   ucuz worker modelinde çalışır; bkz. [Model Katmanları](#model-katmanları).

Veri rotası dardır: `backend_coordinator`, `docs_researcher` ile salt-okunur
lineage, katalog, kalite ve kaynak kanıtını birleştirir. Data engineering,
veritabanı performansı, güvenlik veya operasyon uzmanlığı iddia etmez. Veritabanı
performans ölçümü, runtime sağlığı ve operasyonel tanılama ihtiyaçları soru,
incelenen kanıt, çatışma, gereken karar ve açık doğrulama ihtiyacını içeren kısa
bir parent-routed handoff ile `devops_coordinator` için ana oturuma döner.
Customer support/onboarding rotası (`devops_coordinator` ile `devex_auditor`) da
advisory'dir. Bu rotalar veritabanı, customer-account veya production erişimi vermez.

### Aynı roller Claude Code'da

Claude Code hedefi aynı 28 rolü `agentchef:<rol>` adlı plugin subagent'ları
olarak taşır (örneğin `agentchef:code-mapper`). `npm run render:targets`
katalogdan üretir: salt-okunur Codex rolleri `Read`, `Grep`, `Glob` araçlı
ve `Write`, `Edit`, `Bash` yasaklı subagent'lara dönüşür; workspace-write
roller düzenleme araçlarını korur; koordinatörler yalnızca kataloğa bağlı
worker'larını `Agent(agentchef:<worker>)` ile başlatabilir. AgentChef
`~/.claude/agents/` dizinine asla yazmaz ve asla `bypassPermissions` üretmez.

## Model Katmanları

AgentChef işi iki model katmanına böler. Bu, 1.3.2 ile geçerlidir;
1.3.1 ve öncesinde her rol oturumun modelinde çalışır.

| Katman | Kim çalışır | Model | Nerede ayarlanır |
| --- | --- | --- | --- |
| Orkestratör | Açtığın oturum (ana thread) | Senin seçimin; AgentChef bunu asla değiştirmez | Codex: `config.toml` içindeki `model` veya aktif profil. Claude Code: `/model`, `--model` veya ayarların |
| Worker | 28 rolün tamamı: 21 uzman ve 7 koordinatör | Codex `gpt-6-luna`, Claude Code `sonnet` | [`catalog/agents.json`](../catalog/agents.json) içindeki `workerModels` |

Worker modeli her CLI'a rol dosyası başına tek satır olarak ulaşır: her
`templates/codex/agents/*.toml` dosyasında `model = "gpt-6-luna"`
(`~/.codex/agents/` altına kurulur) ve her `plugins/agentchef/agents/*.md`
dosyasının frontmatter'ında `model: sonnet`. Koordinatörler de worker modelinde
çalışır; yalnızca açtığın oturum kendi modelinde plan yapar.

Reasoning effort sabitlenmez. Hiçbir rol dosyası `model_reasoning_effort`
koymaz; resmi Codex subagent rehberine göre yalnızca `model` koyan özel agent
dosyası, spawn için zaten çözülmüş effort değerini korur. AgentChef Claude Code
frontmatter'ına da effort alanı yazmaz.

Birden fazla değer varsa hangisi kazanır:

- Codex: özel agent dosyasındaki `model` önceliklidir
  ([Codex subagent'ları](https://developers.openai.com/codex/subagents),
  2026-10-04'te kontrol edildi).
- Claude Code: tek bir `Agent` çağrısında verilen `model` önce gelir, sonra
  agent'ın `model:` frontmatter'ı, sonra `CLAUDE_CODE_SUBAGENT_MODEL`
  değişkeni, en son ana konuşmanın modeli
  ([Claude Code subagent'ları](https://code.claude.com/docs/en/sub-agents),
  2026-10-04'te kontrol edildi). Bu yüzden ortam değişkeni AgentChef'in
  `sonnet` değerini ezmez; çağrı başına `model` ezer.

Güvenlik ve inceleme kararları da worker katmanından gelir: `security-auditor`,
`code-reviewer` ve `release-verifier` diğer roller gibi worker modelinde
çalışır. Yüksek riskli bir inceleme için onu açtığın oturumda çalıştır ya da
Claude Code'da o tek `Agent` çağrısına daha güçlü bir `model` ver.

Worker modelinin hesabında kullanılabilir olması gerekir. Bir rolü başlatmak
model hatasıyla başarısız olursa worker modelini aşağıdaki gibi değiştir.

Kendi checkout'unda `workerModels` değerini değiştirmek için:

1. `catalog/agents.json` içinde `workerModels.codex` ve `workerModels.claude`
   değerlerini düzenle.
2. Aynı değeri 28 `templates/codex/agents/*.toml` dosyasının
   `model = "..."` satırına yaz; her satır katalogla eşleşene kadar
   `node scripts/validate-agent-config.mjs` başarısız olur.
3. `templates/shared/working-agreement.md` içindeki ve iki değeri de sabitleyen
   `scripts/tests/claude-emitters.test.mjs` içindeki model adlarını güncelle.
4. Claude agent dosyalarını, Codex `AGENTS.md` dosyasını ve Claude kuralını
   yeniden üretmek için `npm run render:targets`, ardından `npm run check`
   çalıştır.
5. `npm run chef -- --update` ile önizle, `npm run chef -- --update --apply`
   ile uygula.

Kurulu tek bir `~/.codex/agents/<rol>.toml` dosyasının `model` satırını
düzenlemek o makinede çalışır, ancak bu yönetilen bir dosyadır: sonraki update
veya repair şablonu (yedek aldıktan sonra) geri yazar ve düzenlemeyi drift
olarak raporlar.

## Agent'lar Birbiriyle Nasıl Konuşur

İletişim hiyerarşik ve tek seferliktir, sürekli bir sohbet değildir:

`ana oturum -> koordinatör -> uzman`

- Derinlik iki seviyede durur (Codex config'inde `max_depth = 2`). Bir
  koordinatör kendi katalogdaki worker'larından en çok dördünü seçer; worker'lar
  asla agent başlatmaz. Claude Code'da `Agent` aracını yalnızca koordinatör
  dosyaları verir, o da yalnızca kendi worker'ları için.
- Bir agent tek bir brief alır ve tek bir handoff döndürür. Agent'lar çalışırken
  birbirine mesaj atmaz; alanlar arası sorular ana oturuma döner ve sonraki
  adıma ana oturum karar verir.
- Orkestratör brief'i `agent-brief` skill'iyle yazar. Belirsiz veya çok adımlı
  bir istekte skill, önce `prompt-architect` ile plan-only modunda plan
  yapılmasını söyler. Bu orkestratörün uyduğu bir kuraldır, otomatik bir adım
  değildir: hiçbir şey brief'ten önce plan yapılmasını zorlamaz.

İki CLI arasında doğrudan bir araç yoktur:

- Claude Code salt-okunur bir işi, brief'i
  `codex exec --sandbox read-only - < brief.md` komutuna pipe ederek Codex'e
  verebilir; prompt `-` olduğunda Codex onu stdin'den okur. `codex exec` soru
  sormaz, bu yüzden tek sınır sandbox'tır; Codex açık MCP sunucularını ve web
  aramasını yine başlatır. Brief'i repo dışına yaz, içine sır koyma ve iş MCP
  sunucusu gerektirmiyorsa `--profile offline` ekle (web aramasını ve shell ağ
  erişimini kapatmaz).
- Codex, Claude Code'u çağıramaz. İşi bir coordination-board görevi üzerinden
  (bkz. [Skill'ler, Plugin'ler ve Uzman Agent'lar](skills-and-agents.tr.md))
  veya ayrı Beyin motorundaki `beyin aktar` ile
  ([`dual-agent-brain`](https://github.com/ucsahinn/dual-agent-brain))
  devreder; AgentChef bu motoru kurmaz.

## AgentSpace Sahipliği, Knowledge ve Worker Güvenliği

| Koordinatör | Sınırlı uzman worker'lar |
| --- | --- |
| `leadership_coordinator` | `context_architect`, `engineering_planner`, `code_reviewer`, `release_verifier` |
| `product_coordinator` | `prompt_architect`, `product_strategist`, `spec_author` |
| `backend_coordinator` | `code_mapper`, `mcp_integrator`, `root_cause_debugger`, `docs_researcher` |
| `devops_coordinator` | `performance_auditor`, `codex_doctor`, `devex_auditor` |
| `qa_coordinator` | `qa_lead`, `test_verifier`, `security_auditor` |
| `ui_coordinator` | `frontend_verifier`, `design_reviewer` |
| `marketing_coordinator` | `google_seo_auditor`, `docs_author` |

Kurulumda çalışan yedi koordinatör vardır: leadership, product, backend, DevOps,
QA, UI ve marketing. 21 AgentChef uzmanı dar görev worker'ı olarak kalır.
\`catalog/agents.json\` eksiksiz 7→21 sahiplik eşlemesini tutar. Bir koordinatör
yalnızca katalogdaki worker grubunu (en çok dört worker) seçebilir; worker daha
fazla delege etmez.

1.3.0 ile birlikte, 1.2 kurulumundan yapılan yükseltme kaldırılan beş koordinatör
rol dosyasını (`data_coordinator`, `frontend_coordinator`, `design_coordinator`,
`security_coordinator` ve `support_coordinator`) emekliye ayırır; bunu installer
migration'ı yapar, elle temizlik gerekmez.

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
