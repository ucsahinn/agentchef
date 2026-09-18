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
[`plugins/codex-chef-workflows/skills`](../plugins/codex-chef-workflows/skills)
altında durur. Public katalog isteğe bağlı seçenekleri de gösterir; katalogda
yer alması her skill'in otomatik kurulacağı anlamına gelmez.

## Plugins

Yerel plugin, AgentChef'e ait akışları birlikte kurup güncelleyebilmek için
paketler:

- [Plugin manifesti](../plugins/codex-chef-workflows/.codex-plugin/plugin.json)
- [Marketplace kaydı](../.agents/plugins/marketplace.json)
- [Hazır workflow kaynakları](../plugins/codex-chef-workflows/skills)

Plugin'i kurduktan sonra Codex'i yeniden başlatıp `/plugins` üzerinden kontrol
edebilirsin.

## Koordinatörler ve Uzman Agent'lar

On bir çağrılabilir koordinatör işi sahiplenip kanıtı birleştirir; 21 dar uzman
worker araştırma, repo haritalama, review veya doğrulama gerektiğinde devreye
girer. Bir rolün işe uygun olması, her küçük görevde yeni bir subagent açılması
gerektiği anlamına gelmez.

- [11 koordinatörü ve 21 uzman worker'ın tamamını gör](agents.tr.md)
- [Makine tarafından okunan agent kataloğunu aç](../catalog/agents.json)
- [Resmî Codex subagents rehberini oku](https://developers.openai.com/codex/subagents)

Subagent'lar mevcut onay ve sandbox sınırlarını devralır. İşin devredilmesi,
onlara fazladan yetki vermez.

## Acik Koordinasyon Panosu Akisi

Koordinasyon durumu yalnizca kullanicinin acikca olusturdugu gorevle baslar.
Pane acmak, agent secmek veya routing profiliyle eslesmek calismayi baslatmaz.
Koordinator yalnizca katalogdaki worker'lari secer. Her worker; sonucu, kaniti,
kapsam degisikligini, riskleri, acik sorulari ve sonraki dogrulama ihtiyacini
iceren yapilandirilmis bir handoff dondurur. Alanlar arasi handoff'u ana oturum
iletir. Kanit eklenip incelenmeden gorev done olmaz; auto-start ve auto-complete
yoktur.

Kullanici tarafindan secilen, repo-yerel bir state yolu kullanin. Baslatma veya
gorev olusturma yalnizca koordinasyon durumunu kaydeder; koordinator ya da
worker otomatik baslamaz.

```bash
npm run coordination:board -- init --state .coordination-board.json
npm run coordination:board -- create --state .coordination-board.json --id TASK-001 --title "API zaman asimini incele" --owner-coordinator backend_coordinator
```

## Enterprise Routing Profiles

Routing profilleri; yapılacak işi uygun agent, skill, MCP, kontrol komutu ve
güvenlik sınırlarıyla eşleştirir. Codex'e makul bir rota gösterir ama eşleşen
her şeyi arka planda sessizce çalıştırmaz.

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
seçmez, browser açmaz veya kaynak dosya yüklemez.
