# AgentChef Agent'ları

[English](agents.md) | [Türkçe](agents.tr.md)

Agent, Codex workflow'undaki **kim** sorusunun cevabıdır: görevi, sınırı ve
döndüreceği kanıt belli olan uzman bir rol.

AgentChef 7 koordinasyon rolü ve 21 uzman worker rolü içerir. Bunlar arka
planda sürekli çalışan servisler değildir ve her görevde topluca açılmaz. Bir
rol, subagent başlatılmadan da ana oturuma yol gösterebilir. 1.3.4 ile (henüz
yayımlanmadı) bir agent yalnızca dört koşuldan biri geçerliyse başlatılır:
verifier gerektiren bir routing profili eşleşti ve dosyalar değişti, bağımsız
paralel iş var, gürültülü log veya araştırma ana thread'den ayrılmalı ya da sen
açıkça delegasyon istedin (bkz. [Routing profilleri ve otomatik
kullanım](#routing-profilleri-ve-otomatik-kullanım)).

Resmi kaynaklar: [Codex subagent'ları](https://learn.chatgpt.com/docs/agent-configuration/subagents)
(eski `developers.openai.com/codex/subagents` adresi buraya yönlenir) ve
[Claude Code subagent'ları](https://code.claude.com/docs/en/sub-agents); ikisi
de 2026-10-05'te kontrol edildi.

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
| `QA Coordinator`, `Assurance Lead`, `Quality Lead` | `qa_coordinator` |
| `UI Lead`, `UI Coordinator`, `UX Evidence Lead` | `ui_coordinator` |
| `Marketing Lead`, `Marketing Coordinator`, `Growth Lead` | `marketing_coordinator` |

1.3.3 ile QA koordinatörü artık `QA Lead` adına yanıt
vermez; bu ad `qa_lead` worker'ının rolüdür. 1.3.2 ve öncesi hâlâ `QA Lead`,
`QA Coordinator` ve `Assurance Lead` adlarını listeler.

Karar ve izin sınırı ana oturumda kalır. Koordinatör kanıtı korele eder; sessizce
publish/deploy yapmaz, yetki genişletmez veya ilgisiz işi devralmaz. CLI'da bir
agent thread'ini incelemek ya da ona geçmek için `/agent` kullan. App veya IDE'de
varsa subagent activity panelini aç; Codex'ten bir agent'ı yönlendirmesini,
durdurmasını veya kapatmasını da isteyebilirsin.

Routing yolu iki rotadır; ikisi de en fazla iki seviye derindir:

- **Direct**: `görev -> routing profili -> ana oturum bir ila dört uzmana brief verir + dar skill/MCP'ler`
- **Team**: senin oluşturduğun bir board görevi için `görev -> routing profili -> ana oturum o görevin koordinatörüne brief verir -> koordinatörün katalogdaki worker'ları`

Yani koordinatör her zaman yolda değildir; yalnızca Team rotasında kullanılır.
Alanlar arası iş, ana oturuma kısa bir handoff döndürür; başka bir koordinatör
gerekip gerekmediğine ana oturum karar verir.

Bundled `agent-brief` skill'i (Codex'te `$agentchef:agent-brief`, Claude
Code'da `/agentchef:agent-brief`) bu alışverişi sabitler: worker'ın aldığı
yedi alanlı brief ve döndürdüğü altı alanlı handoff (Sonuç, Kanıt, Değişen
kapsam, Riskler, Açık sorular, Sıradaki doğrulama).
`coordination-board brief-check` brief'i göndermeden önce denetler; 1.3.3 ile
`coordination-board handoff-check` geri dönen handoff'u
denetler.

Ayrıntılı coordination-board sözleşmesi
[Skill'ler, Plugin'ler ve Uzman Agent'lar](skills-and-agents.tr.md) sayfasındadır:
iş yalnızca kullanıcının açıkça oluşturduğu bir board göreviyle başlar; pane
seçimi, rol seçimi ve routing eşleşmeleri onu asla kendiliğinden başlatmaz.
Koordinatörler yalnızca katalogdaki worker'larını seçer, worker'lar altı
handoff alanını döndürür, alanlar arası soruları ana oturum iletir ve her board
komutunu ana oturum çalıştırır; görev done olmadan önce kanıt eklenmeli ve işi
yapmamış bir ajan tarafından kontrol edilmelidir.

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
| [`code_reviewer`](../templates/codex/agents/code_reviewer.toml) | Yeni bir göz, merge edilmeden veya bitti denmeden önce bir diff'e ya da pull request'e doğruluk riskleri, regresyonlar ve eksik testler açısından bakmalıysa. |
| [`google_seo_auditor`](../templates/codex/agents/google_seo_auditor.toml) | Public sayfalar crawlability, metadata, structured data ve Search Console hazırlığı istiyorsa. Core Web Vitals ölçümü `performance_auditor`'a aittir. |

## 🛡️ Sınırı Koru

| Agent | Ne zaman işe yarar? |
| --- | --- |
| [`security_auditor`](../templates/codex/agents/security_auditor.toml) | Auth, secret, izin, API, veri erişimi veya abuse path'ler için read-only güvenlik incelemesi gerekiyorsa. |
| [`release_verifier`](../templates/codex/agents/release_verifier.toml) | Gerçek bir release için Git hijyeni, artifact kontrolü, secret scan ve publish gate gerekiyorsa. |
| [`codex_doctor`](../templates/codex/agents/codex_doctor.toml) | Starter, katalog, install plan, docs veya kurulu runtime drift etmiş olabilir diye düşünüyorsan. |

## Seçim Nasıl Çalışıyor?

1. Oturum görev biçimini bir routing profiliyle ve en dar faydalı rolle
   eşleştirir.
2. Bir eşleşme subagent başlatmayı **zorunlu kılmaz**. Ana oturum rolün
   rehberliğini doğrudan kullanabilir. Codex yalnızca sen doğrudan istediğinde
   ya da `AGENTS.md` veya bir skill yönergesi istediğinde delege eder;
   AgentChef'in çalışma sözleşmesi böyle bir yönergedir ve 1.3.4 ile (henüz
   yayımlanmadı) dört spawn koşulu sayar: verifier gerektiren bir routing
   profili eşleşti ve dosyalar değişti; bağımsız paralel iş var; gürültülü log
   veya araştırma ana thread'den ayrılmalı; sen açıkça delegasyon istedin.
   Önemsiz, kesinlikle sıralı, sıkı bağlı ve delegasyonun koordinasyon maliyeti
   getirdiği tek dosyalık işlerde spawn etmez.
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

### Routing profilleri ve otomatik kullanım

1.3.4 ile (henüz yayımlanmadı) `catalog/routing-profiles.json` (sürüm 0.4.0)
yeni `code-review` profili dahil 19 routing profili içerir. Her profil şunları
belirtir:

- bir **verifier**: işi bağımsız denetleyen rol. Beş `autoVerify` profilinde
  (`security-sensitive`, `release-or-publish`, `mcp-connector-change`,
  `frontend-ui`, `data-systems`) zorunludur: dosyalar değiştikten sonra görev
  bitti denmeden önce verifier çalışır. Diğer profillerde verifier yalnızca
  önerilir.
- önce yüklenecek bir **auto-skill**. Yalnızca açıkça istenen bir skill
  (`implicitInvocation: false`, bkz. [Skill'ler](skills.tr.md)) yüklenmez, sana
  önerilir.

Sen adlarını vermeden görev başına en fazla 2 agent başlar; adını verdiğin
agent'lar sayılmaz ve görev başına dört worker sınırı geçerliliğini korur.
Eşleşme tavsiyedir: işin agent gerektirip gerektirmediğine yine ana oturum karar
verir.

Bir istek için eşleşmeyi görmek üzere şunu çalıştır:

```bash
npm run chef -- --routing --task "<istek>"
```

Çıktı profili, Verifier ve Auto-skill alanlarını ve bir `[hint]` satırını (tek
satırlık routing ipucu; bunu oturuma ekleyen hook güvenlik modelinde, commit C,
anlatılır) yazar. Güven kuralları için [Codex Flag'leri](codex-flags.tr.md)
sayfasına bak.

Her rolün `catalog/agents.json` içinde tetik biçiminde tek bir `description`
metni ("Use proactively when ...") vardır ve 13 rol bir skill'i önceden yükler:
Claude Code bunu plugin agent dosyasındaki `skills:` frontmatter'ından okur;
Codex rol dosyaları "Load the `<skill>` skill before starting" der.

| Rol | Önceden yüklenen skill |
| --- | --- |
| `docs_researcher` | `evidence-research` |
| `context_architect` | `context-budget-planner` |
| `prompt_architect` | `prompt-architect` |
| `mcp_integrator` | `mcp-builder` |
| `design_reviewer` | `frontend-design` |
| `root_cause_debugger` | `systematic-debugging` |
| `performance_auditor` | `web-quality-audit` |
| `google_seo_auditor` | `seo` |
| `docs_author` | `documentation-and-adrs` |
| `spec_author` | `ai-project-starter` |
| `frontend_verifier` | `webapp-testing` |
| `release_verifier` | `shipping-and-launch` |
| `codex_doctor` | `agentchef-operator` |

### Aynı roller Claude Code'da

Claude Code hedefi aynı 28 rolü `agentchef:<rol>` adlı plugin subagent'ları
olarak taşır (örneğin `agentchef:code-mapper`). `npm run render:targets`
katalogdan üretir: salt-okunur Codex rolleri `Read`, `Grep`, `Glob` araçlı
ve `Write`, `Edit`, `Bash` yasaklı subagent'lara dönüşür; workspace-write
roller düzenleme araçlarını korur. AgentChef `~/.claude/agents/` dizinine asla
yazmaz ve asla `bypassPermissions` üretmez.

1.3.3 ile:

- `performance-auditor` ayrıca `chrome-devtools` araçlarını alır. Bunlar
  yalnızca `chrome-devtools` MCP sunucusunu proje bazında kendin eklediysen
  çalışır (bkz. [MCP'ler](mcp-catalog.tr.md)); AgentChef onu açmaz.
- `chrome-devtools`, Serena'da olduğu gibi araç adıyla ve katalogun incelediği
  on bir araçla sınırlı verilir; script çalıştırma, form doldurma ve dosya
  yükleme erişim dışında kalır.
- Hiçbir rol `Skill` aracını almaz: bir skill `general-purpose` bir subagent
  fork edebilir ya da rolün kendi araç listesi dışında shell komutu çalıştırabilir.

Hiçbir rolün araç listesinde `SendMessage` yoktur; bu yüzden bir rol çalışırken
başka bir ajana mesaj atamaz. `Agent` aracını yalnızca koordinatör dosyaları,
kendi katalog worker'larıyla `Agent(agentchef:<worker>, ...)` biçiminde
listeler. Claude Code bu listeyi yalnızca koordinatör ana thread olarak
çalıştığında (`claude --agent`) uygular; sıradan bir subagent olarak
çalıştığında parantez içindeki adlar yok sayılır ve koordinatör herhangi bir
agent türünü başlatabilir. 1.3.3 ile plugin bu açığı
`Agent` aracı üzerindeki bir `PreToolUse` hook'uyla kapatır
(`plugins/agentchef/scripts/agent-spawn-guard.mjs`):

- Listesi dışındaki bir worker'ı isteyen AgentChef koordinatörü reddedilir
  (çıkış kodu 2, gerekçe çağırana gösterilir); izin verilen liste koordinatörün
  kendi agent dosyasından okunur, böylece hook ile frontmatter birbirinden
  kopamaz.
- Worker tam adıyla istenmelidir (`agentchef:test-verifier`): yalın
  `test-verifier` önce aynı adlı bir proje ya da kullanıcı agent'ına çözülür,
  bu yüzden reddedilir.
- Bir AgentChef worker'ının her spawn denemesi reddedilir; plugin'de agent
  dosyası olmayan AgentChef adlı bir çağıranınki de.
- Ana oturum, senin kendi agent'ların ve AgentChef dışı plugin agent'ları
  engellenmez; yalnız `claude --agent agentchef:<rol>` ile açılan oturum o rolün
  kuralına tabidir. Hook'un okuyamadığı girdi geçirilir ve kararı Claude
  Code'un kendi kuralları verir.
- Hook çağıranı `agentchef:<rol>`, `plugin_agentchef_<rol>` ya da
  `plugin:agentchef:<rol>` olarak, aracı da `Agent` ya da eski adı `Task`
  olarak tanır.

1.3.2 ve öncesinde böyle bir hook yoktur: koordinatör subagent olarak
çalışırken worker listesi yalnızca yönlendirme niteliğindedir.

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
dosyası, spawn için zaten çözülmüş effort değerini korur. Claude Code
subagent'lar için bir `effort` frontmatter alanını destekler (oturum effort
değerini ezer); AgentChef bunu koymaz, bu yüzden Claude rolleri de oturumun
effort değerini devralır.

Birden fazla değer varsa hangisi kazanır:

- Codex: özel agent dosyasındaki `model` önceliklidir
  ([Codex subagent'ları](https://learn.chatgpt.com/docs/agent-configuration/subagents),
  2026-10-05'te kontrol edildi).
- Claude Code: tek bir `Agent` çağrısında verilen `model` önce gelir, sonra
  agent'ın `model:` frontmatter'ı, sonra `CLAUDE_CODE_SUBAGENT_MODEL`
  değişkeni, en son ana konuşmanın modeli
  ([Claude Code subagent'ları](https://code.claude.com/docs/en/sub-agents),
  2026-10-05'te kontrol edildi). Bu yüzden ortam değişkeni tek başına
  AgentChef'in `sonnet` değerini ezmez; çağrı başına `model` ezer.
- Claude Code'da `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (Claude Code v2.1.257 veya
  sonrası): her subagent `CLAUDE_CODE_SUBAGENT_MODEL` modelinde, bu değişken
  yoksa ana konuşmanın modelinde çalışır. Bu, AgentChef'in `sonnet` değerini ve
  çağrı başına verilen `model`'i ezer.
- Claude Code'da ana oturum Sonnet ise: `sonnet` takma adı, normalde işaret
  ettiği sürüme değil, ana konuşmanın tam modeline (`[1m]` eki dahil) çözülür.

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

1.3.3 ile çalışma sözleşmesinde, `agent-brief`
skill'inde, her rol dosyasında ve bu dokümanlarda tek bir ekip protokolü
geçerlidir. Bir ofis ekibi gibi işler:

| Kim | Ne yapar | Asla ne yapmaz |
| --- | --- | --- |
| Sen | Riskli işlemleri onaylarsın ve board görevi istersin. | - |
| Ana oturum | Plan yapar, her brief'i yazar, handoff'ları birleştirir, her coordination-board komutunu çalıştırır, doğrulayanı seçer ve sana raporlar. | İstemediğin bir board görevi oluşturmak. |
| Koordinatör | Yalnızca katalogdaki kendi worker'larını seçer, her birine brief verir, handoff'larını birleştirir ve ana oturuma escalate eder. Salt-okunurdur. | `general-purpose`, `fork`, başka bir koordinatör ya da listesi dışındaki bir worker başlatmak; board komutu çalıştırmak; kendi görevini doğrulamak. |
| Worker | Tek bir sınırlı işi yapar ve altı handoff alanını döndürür. | Herhangi bir agent başlatmak. Başka bir rol gerekirse Açık sorular altına `needs: <role> - <why>` yazar; kararı üst oturum verir. |

İki rota vardır, ikisi de en çok iki seviye derinliktedir:

- **Direct**: ana oturum bir ila dört uzmana brief'i kendisi verir.
- **Team**: senin oluşturduğun bir board görevi için ana oturum o görevin
  koordinatörüne brief verir, koordinatör de kendi worker'larına.

Görev başına en çok dört worker kullan (koordinatör sayılmaz); fazlası senin
açık isteğini gerektirir.

- Bir agent tek bir brief alır ve tek bir handoff döndürür. Agent'lar çalışırken
  birbirine mesaj atmaz; alanlar arası sorular ana oturum üzerinden giden bir
  escalation olarak ana oturuma döner ve sonraki adıma ana oturum karar verir.
- Orkestratör brief'i `agent-brief` skill'iyle yazar. Belirsiz veya çok adımlı
  bir istekte skill, önce `prompt-architect` ile plan-only modunda plan
  yapılmasını söyler. Bu orkestratörün uyduğu bir kuraldır, otomatik bir adım
  değildir: hiçbir şey brief'ten önce plan yapılmasını zorlamaz.
- Birleştirme: ana oturum (veya kendi worker'ları için koordinatör) her
  Değişen kapsamı ilgili brief'in Yazma kapsamıyla karşılaştırır, çelişen
  kanıtı ortalamak yerine kaynaklarıyla yan yana tutar, çatışmayı çözer ya da
  sana sorar ve her Bitti kriteri kontrolünü birleşmiş sonuç üzerinde yeniden
  çalıştırır. Handoff bir rapordur, kanıt değildir.
- Koordinatör şu durumlarda escalate eder: onay gerekiyorsa, bir worker
  takıldıysa veya başarısız olduysa, yazma kapsamı değişiyorsa, başka bir alan
  gerekiyorsa ya da bir yeniden denemeden sonra kanıt hâlâ eksikse.
- Doğrulamayı işi yapmamış bir ajan yapar: asla sahip, onun oturumu ya da
  koordinatörü değil. İş türüne göre seç: kontroller için `test_verifier`,
  diff için `code_reviewer`, UI için `frontend_verifier`, güvenlik için
  `security_auditor` ya da sen.

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

### Her CLI'daki Derinlik Ve Spawn Sınırları

Codex ([Codex subagent'ları](https://learn.chatgpt.com/docs/agent-configuration/subagents)
ve [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
ile 2026-10-05'te kontrol edildi):

- Güncel yerel Codex sürümleri subagent'ları yalnızca doğrudan bir istekten ya
  da geçerli bir proje veya skill talimatından sonra başlatır. AgentChef'in çalışma sözleşmesi böyle bir talimattır ve delegasyonu
  yukarıdaki durumlarla sınırlar.
- AgentChef `[agents]` altına `max_depth = 2` yazar. Varsayılan multi-agent
  backend'i bunu uygular; isteğe bağlı `multi_agent_v2` backend'i yok sayar,
  bu yüzden orada iki seviye kuralı rol talimatlarına dayanır.
- `max_threads = 10`, `max_concurrent_threads_per_session` için eski bir takma
  addır: hedef değil, oturum genelinde bir tavandır. Görev başına dört worker
  kuralı yine geçerlidir.
- AgentChef ayrıca `job_max_runtime_seconds = 3600` yazar; upstream'de artık
  etkisi yoktur ve zararsızdır. Güncel configuration reference `max_depth` ya
  da `job_max_runtime_seconds` anahtarını listelemez.

Claude Code ([Claude Code subagent'ları](https://code.claude.com/docs/en/sub-agents)
ve [agent teams](https://code.claude.com/docs/en/agent-teams) ile
2026-10-05'te kontrol edildi):

- Varsayılan olarak bir subagent, ana konuşmanın üç katman altına kadar kendi
  subagent'larını başlatabilir (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` bunu
  değiştirir). 1.3.3 ile bir AgentChef ağacı iki seviyede
  kalır: worker'larda `Agent` aracı yoktur ve yukarıdaki spawn guard hook'u her
  worker spawn'ını ve koordinatörün listesi dışındaki her spawn'ı reddeder.
  1.3.2 ve öncesinde subagent olarak çalışan bir koordinatör başka bir agent
  türü başlatabilir, o da daha derine inebilirdi.
- Agent teams deneyseldir ve `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
  ayarlanmadıkça kapalıdır. Teams açıkken Claude'un adlandırdığı bir subagent
  teammate olarak başlayabilir ve Claude Code in-process teammate'lere
  `SendMessage` ekler; böylece agent'lar brief ve handoff dışında konuşabilir.
  AgentChef agent teams'in kapalı olduğunu varsayar.

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
`catalog/agents.json` eksiksiz 7→21 sahiplik eşlemesini tutar. Bir koordinatör
yalnızca katalogdaki worker grubunu, görev başına en çok dört worker sınırı
içinde (koordinatörün kendisi sayılmaz) seçebilir; worker daha fazla delege
etmez.

1.3.0 ile birlikte, 1.2 kurulumundan yapılan yükseltme kaldırılan beş koordinatör
rol dosyasını (`data_coordinator`, `frontend_coordinator`, `design_coordinator`,
`security_coordinator` ve `support_coordinator`) emekliye ayırır; bunu installer
migration'ı yapar, elle temizlik gerekmez.

Alanlar arası koordinasyon doğrudan peer spawn değil, ana oturum üzerinden giden
kısa bir handoff'tur: birincil koordinatör soruyu, kanıtı, çatışmayı, kararı ve
açık doğrulama ihtiyacını ana oturuma döndürür; akran koordinatör gerekip
gerekmediğine ana oturum karar verir. Bu, iki seviye delegasyon sınırını korur
ve recursive agent tree oluşmasını önler. Routing sonucu seçilen her worker için
sahibi ve uzman adıyla aynı olan `knowledgeRef` değerini gösterir. Bu referans
yalnızca `catalog/agent-research-corpus.json` içindeki incelenmiş metadata'ya
çözülür; routing AgentSpace hafızasını, auth/session verisini veya makineye özel
içeriği prompt'a enjekte etmez.

Kurulan her koordinatör ve worker TOML'ü `approval_policy = "on-request"`
uygular. AgentSpace worker oturumunun ayrı bir runtime profili vardır:
`sandbox_mode = "workspace-write"`, `approval_policy = "on-request"` ve
`approvals_reviewer = "auto_review"`. Routing, bu etkin oturum profilini ve
uzmanın daha dar `roleSandboxMode` değerini ayrı ayrı gösterir. AgentSpace hesap
profilleri izole bir `CODEX_HOME` kullandığından bu kök anahtarlar o profilde
bulunmalıdır; başka bir Codex home'un varsayılanları devralınmaz. Resmi
[Codex Configuration Reference](https://developers.openai.com/codex/config-reference#configtoml),
`approvals_reviewer = "auto_review"` değerini reviewer-subagent modu olarak
tanımlar ve sandbox sınırını değiştirmediğini belirtir. Koordinatörler
read-only kalır; uzman rol dosyaları katalogdaki dar sandbox değerini
(`read-only` veya `workspace-write`) korur. İncelenmiş
`rules/default.rules` yalnız dar ve güvenli inceleme komutlarını promptsuz
çalıştırabilir; yıkıcı, credential kullanan, publish/deploy yapan, geniş shell ve
diğer riskli sınıflar prompt-gated kalır. Worker'lar `danger-full-access` veya
global `approval_policy = "never"` varsayılanını kullanmaz.

Bu sayfanın arkasındaki incelenmiş metadata
[`catalog/agents.json`](../catalog/agents.json) dosyasında. Routing profilleri
ise [`catalog/routing-profiles.json`](../catalog/routing-profiles.json) içinde.

[README'ye dön](../README.tr.md) veya [skill'ler](skills.tr.md) ve
[MCP'lerle](mcp-catalog.tr.md) devam et.
