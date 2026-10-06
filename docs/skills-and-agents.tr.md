# Skill'ler, Plugin'ler ve Uzman Agent'lar

[English](skills-and-agents.md) | [Türkçe](skills-and-agents.tr.md)

Bu sayfada eskiden bütün agent ve skill'ler tek bir uzun listede duruyordu.
Artık kaydırıp durmadan aradığın bölüme ulaşabileceğin kısa bir harita olarak
kalıyor.

## Skills

Skill, tekrar kullanabileceğin bir çalışma akışıdır. Codex yapılacak işe göre
uygun skill'i seçebilir; istersen kullanmasını istediğin skill'i doğrudan da
söyleyebilirsin.

- [Bütün skill'leri ve nasıl kurulduğunu gör](skills.tr.md)
- [Makine tarafından okunan skill kataloğunu aç](../catalog/skills.json)
- [Resmî Codex skills rehberini oku](https://developers.openai.com/codex/skills)

AgentChef'e ait hazır akışlar
[`plugins/agentchef/skills`](../plugins/agentchef/skills)
altında durur. Public katalog isteğe bağlı seçenekleri de gösterir; katalogda
yer alması her skill'in otomatik kurulacağı anlamına gelmez.

## Plugins

Yerel plugin, AgentChef'e ait akışları birlikte kurup güncelleyebilmek için
paketler:

- [Plugin manifesti](../plugins/agentchef/.codex-plugin/plugin.json)
- [Marketplace kaydı](../.agents/plugins/marketplace.json)
- [Hazır workflow kaynakları](../plugins/agentchef/skills)

Plugin'i kurduktan sonra Codex'i yeniden başlatıp `/plugins` üzerinden kontrol
edebilirsin.

## Koordinatörler ve Uzman Agent'lar

Yedi çağrılabilir koordinatör işi sahiplenip kanıtı birleştirir; 21 dar uzman
worker araştırma, repo haritalama, review veya doğrulama gerektiğinde devreye
girer. Bir rolün işe uygun olması, her küçük görevde yeni bir subagent açılması
gerektiği anlamına gelmez.

- [7 koordinatörü ve 21 uzman worker'ın tamamını gör](agents.tr.md)
- [Makine tarafından okunan agent kataloğunu aç](../catalog/agents.json)
- [Resmî Codex subagents rehberini oku](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Resmî Claude Code subagents rehberini oku](https://code.claude.com/docs/en/sub-agents)

Subagent'lar mevcut onay ve sandbox sınırlarını devralır. İşin devredilmesi,
onlara fazladan yetki vermez.

1.3.2 ile roller daha ucuz bir worker modelinde çalışır,
açtığın oturum ise kendi modelini korur; bkz.
[Model Katmanları](agents.tr.md#model-katmanları). Agent'lar birbiriyle
sohbet etmez. 1.3.3 ile iki rota vardır, ikisi de en çok
iki seviye derinliktedir: Direct, ana oturum bir ila dört uzmana brief verir;
Team, bir board görevi için ana oturum o görevin koordinatörüne brief verir,
koordinatör de kendi worker'larına. Görev başına en çok dört worker kullan
(koordinatör sayılmaz); her agent tek bir handoff döndürür.
1.3.4 ile bir agent yalnızca dört koşuldan biri geçerliyse
başlar (verifier gerektiren bir routing profili eşleşti ve dosyalar değişti;
bağımsız paralel iş; ayrılması gereken gürültülü log veya araştırma; sen istedin)
ve sen adlarını vermeden görev başına en fazla 2 agent başlar; bkz.
[Routing profilleri ve otomatik kullanım](agents.tr.md#routing-profilleri-ve-otomatik-kullanım). Codex ile Claude Code
arasında doğrudan bir araç yoktur; bkz.
[Agent'lar Birbiriyle Nasıl Konuşur](agents.tr.md#agentlar-birbiriyle-nasıl-konuşur).

## Açık Koordinasyon Panosu Akışı

Koordinasyon durumu yalnızca kullanıcının açıkça oluşturduğu görevle başlar.
Pane açmak, agent seçmek veya routing profiliyle eşleşmek çalışmayı başlatmaz.
1.3.3 ile her pano komutunu ana oturum çalıştırır;
koordinatörler ve worker'lar asla çalıştırmaz. Koordinatör yalnızca katalogdaki
worker'larını seçer; her worker altı etiketli handoff alanı döndürür: Sonuç,
Kanıt, Değişen kapsam, Riskler, Açık sorular ve Sıradaki doğrulama. Alanlar
arası handoff'u ana oturum iletir. Kanıt eklenip sahibinden farklı bir ajan
tarafından kontrol edilmeden görev done olmaz; auto-start ve auto-complete
yoktur.

Kullanıcı tarafından seçilen, repo-yerel bir state yolu kullanın. Başlatma veya
görev oluşturma yalnızca koordinasyon durumunu kaydeder; koordinatör ya da
worker otomatik başlamaz.

```bash
npm run coordination:board -- init --state .coordination-board.json
npm run coordination:board -- create --state .coordination-board.json --id TASK-001 --title "API zaman asimini incele" --owner-coordinator backend_coordinator
```

1.3.0 ile (durum şeması v3) bir görev, onu kimin yürüttüğünü ve neyi
yazabileceğini de kaydeder; iş yalnızca eksiksiz bir brief ile başlar:

- `create … --owner-agent codex --owner-session <ad> --write-repo <repo> --write-paths scripts/lib,docs`
  sahibi ve repo-göreli yazma kapsamını kaydeder.
- `brief --task <id> --brief-file brief.md` brief'i saklar. Brief, İngilizce
  ya da Türkçe etiketli yedi alandan oluşur: Hedef, Kanıt, Yazma kapsamı,
  Sınırlar, Bitti kriteri, Dönüş biçimi ve kullanıcının özgün cümlesi
  (birebir). `brief-check --brief-file brief.md` brief'i göndermeden önce,
  pano gerekmeden denetler. Bundled `agent-brief` skill'i bu brief'i yazar
  ve geri dönen handoff'u denetler; `Kapsam / Yazma kapsamı` gibi iki dilli
  etiketler de ayrıştırılır.
- İşe başlamak (`in_progress`) eksiksiz brief ister; yazma kapsamı olan görev
  ayrıca canlı bir kira ister: `renew-lease --task <id> --minutes 90` (en çok
  24 saat). Diğer ajanlar kapsamı ve kirayı okuyarak neyin alındığını görür.
- `add-evidence --task <id> --evidence "<komut>: <sonuç>"` kanıt ekler.
- `--state` verilmezse pano dosyasını `AGENTCHEF_BOARD_STATE` belirler.

### 1.3.3 İle Pano Değişiklikleri

1.3.3 ile pano durum şeması 4'ü kaydeder. v1, v2 veya v3
pano okunurken bellekte taşınır ve sonraki yazım v4 olarak kaydeder; AgentChef
1.3.2 ve öncesi bu dosyayı yanlış okumak yerine reddeder.

Durumlar `backlog`, `todo`, `in_progress`, `review`, `done`, `blocked` ve
`cancelled`'dır. İzin verilen geçişler:

| Geçiş | Gerekenler |
| --- | --- |
| `backlog` -> `todo` | hiçbir şey |
| `todo` -> `in_progress` | bir sahip, eksiksiz bir brief, görevin yazma kapsamı varsa canlı bir kira ve çakışan bir yolda canlı kira tutan başka açık görev olmaması |
| `in_progress` -> `review` | en az bir kanıt kaydı |
| `review` -> `done` | kanıt, bağlı bir rapor, karar gerektiren her handoff'un çözülmüş olması ve `--verified-by <ajan>` |
| `review` -> `in_progress` (yeniden çalışma) | `--reason`; `in_progress` kontrolleri yeniden uygulanır |
| `in_progress` -> `todo` (bırakma) | `--reason`; kirayı temizler |
| herhangi bir açık durum -> `blocked` | `--reason`; engellenen görev yalnızca engellendiği duruma döner ve o durumun kontrolleri uygulanır |
| herhangi bir açık durum veya `blocked` -> `cancelled` | `--reason`; kesindir |

- İki yol aynı repodaysa ve biri diğerine eşitse ya da diğeriyle başlayıp `/`
  ile devam ediyorsa çakışır; repo ve yol büyük/küçük harf duyarsız
  karşılaştırılır. `renew-lease` de çakışan kirayı reddeder.
- `assign --task <id> --owner-agent <ajan> [--owner-session <ad>] [--owner-coordinator <koordinatör>] [--by <aktör>]`
  sahibi atar veya değiştirir.
- `--verified-by` sahip ajan, sahip oturum veya sahip koordinatör olamaz; adlar
  büyük/küçük harf duyarsız karşılaştırılır ve `-` ile `_` aynı sayılır
  (`root-cause-debugger`, `root_cause_debugger` ile aynıdır). `show`
  doğrulayanı ve zamanı `verification` altında gösterir. Adları çağıran yazar;
  bu, kaza eseri hataları durdurur, kimliğe bürünmeyi değil.
- `done` ve `cancelled` görevler artık değişiklik kabul etmez ve kiraları
  temizlenir.
- `renew-lease --task <id> --minutes <1-1440> [--by <ajan>]`, sahip olmayan bir
  `--by` değerini reddeder.
- `handoff --task <id> --source-coordinator <a> --target-coordinator <b> --question "<metin>" [--decision-needed "<metin>"]`
  bir kimlik (`H1`, `H2`, ...) ve zamanla bir handoff kaydeder. Kaynak ve hedef
  farklı katalog koordinatörleri olmalı, biri görevin sahip koordinatörü
  olmalıdır. `resolve-handoff --task <id> --handoff H1 --answer "<metin>"` onu
  çözer.
- Her değişiklik bir `history` kaydı ekler (`at`, `action` ve uygun olduğunda
  `from`, `to`, `by`, `reason`) ve `updatedAt` değerini ayarlar; `create`
  `createdAt` değerini ayarlar.
- `show [--task <id>] [--status <liste>|open] [--owner <ajan>]` iki hesaplanmış
  alan ekler: `leaseState` (`none`, `live` veya `expired`) ve `stale` (yazma
  kapsamı kirası canlı olmayan ya da 24 saattir kimsenin değiştirmediği bir
  `in_progress` veya `review` görevi). `--status open` `blocked` görevleri de
  içerir.
- Her komut kabul etmediği seçenekleri reddeder, `--help` kullanımı yazdırır,
  `add-evidence` `--evidence-file` de alır ve
  `handoff-check --handoff-file handoff.md` (veya `--handoff`) dönen bir
  handoff'u pano gerekmeden denetler; bir alan eksikse 1 ile çıkar.
- Brief ve handoff etiketleri numaralı (`1. Goal:`), parantez içinde takma
  adlı kalın (`**Goal** (Hedef):`) ya da büyük harfli (`EVIDENCE:`) olabilir.
  Handoff'lar ayrıca `Risks`/`Riskler`, `Open questions`/`Açık sorular`/
  `Unresolved questions` ve `Next verification need`/`Sonraki doğrulama`
  etiketlerini kabul eder.
- Çöken bir süreçten kalan kilit (30 saniyeden eski) devralınır; meşgul bir
  kilit komut başarısız olmadan önce yaklaşık iki saniye yeniden denenir.
- Kimlik bilgisine benzeyen metin reddedilir; buna artık Bearer token'lar,
  JWT'ler ve URL içindeki kimlik bilgileri de dahildir.

## Enterprise Routing Profiles

Routing profilleri; yapılacak işi uygun agent, skill, MCP, kontrol komutu ve
güvenlik sınırlarıyla eşleştirir. Codex'e makul bir rota gösterir ama eşleşen
her şeyi arka planda sessizce çalıştırmaz.

1.3.4 ile `catalog/routing-profiles.json` (sürüm 0.4.0)
yeni `code-review` profili dahil 19 profil içerir. Her profil bir verifier ve bir
auto-skill belirtir. Verifier, beş `autoVerify` profilinde (`security-sensitive`,
`release-or-publish`, `mcp-connector-change`, `frontend-ui`, `data-systems`)
dosyalar değiştikten sonra zorunludur; diğerlerinde yalnızca önerilir. Auto-skill
önce yüklenir; skill yalnızca açıkça istenen türdeyse sana önerilir (bkz.
[Skill'ler](skills.tr.md#yalnızca-açıkça-istenen-skillter)). Routing skill'inin
`references/global-working-agreements.md` dosyasındaki profil listesi elle
yazılmaz, katalogdan üretilir. Bir istek için tek bakışta:
`npm run chef -- --routing --task "<istek>"`.

```bash
npm run chef -- --routing
npm run chef -- --routing --profile starter-health
```

- [Routing profilleri](../catalog/routing-profiles.json)
- [Workflow yüzey haritası](workflow-surface-map.tr.md)
- [MCP kataloğu](mcp-catalog.tr.md)

## Manual External Deep Review

Hazır gelen `external-review-workflow`, başka bir yerde yapılacak inceleme için
takip edilen dosyalardan public-safe bir paket hazırlar ve dönen JSON raporunu
doğrular. Kendi başına dosya yüklemez veya harici bir modeli çağırmaz.

```bash
npm run chef -- review pack --target <repo>
npm run chef -- review verify --target <repo> --manifest <manifest> --report <json>
```

Varsayılan davranış ön izlemedir. Handoff'u gerçekten uygulamak için açık bir
komut gerekir; gerçek bir upload ise bu reponun otomatik akışının dışındadır.

## GPT Pro Project Review

Hazır gelen `gptpro` ve `gptpro-handoff` aynı review ID üzerine kurulur: ilki
manuel yönetilen GPT Pro Project için metin bundle'ları üretir, ikincisi ise
sınırları belirli prompt'u yazar ve dönen raporu doğrular. Hiçbiri provider
seçmez, browser açmaz veya kaynak dosya yüklemez. Exporter, review pack'in
hassas yol ve ikili dosya denetimlerini her manifest girdisine kendi başına
yeniden uygular; handoff ise her bulguyu implement-now, needs-decision veya
discard olarak sınıflandıran bir triyaj kaydıyla biter.
