# Brain emekliliği

[English](brain-retirement.md) | [Türkçe](brain-retirement.tr.md)

AgentChef 0.6.0, yerleşik Markdown Brain workflow'unu kaldırır. Codex ve
Claude Code için kalıcı, oturumlar arası hafıza artık ayrı geliştirilen
[`dual-agent-brain`](https://github.com/ucsahinn/dual-agent-brain) motorunun
işidir; iki ajan da bu motoru oturum hook'ları üzerinden zaten paylaşıyor.
Kurulum kitinin içinde ikinci bir vault uygulaması tutmak, zamanla birbirinden
uzaklaşan iki beyin demek olurdu.

## Neler kaldırıldı

- `codex-chef-brain` bundled skill'i ve doğrudan kurulum adımı
  (`${AGENTS_HOME}/skills/codex-chef-brain`);
- `scripts/brain-cli.mjs`, `templates/brain/` altındaki vault şablonu,
  `brain-*.schema.json` dosyaları, `manifests/brain-vault.json` ile Brain
  doğrulayıcıları ve testleri;
- `--continuity` / `--control-brain` operatör ekranı ve artık okunmayan
  `CODEX_CHEF_BRAIN_HOME` ortam değişkeni.

Installer hiçbir zaman vault oluşturmadı; yalnızca skill'i kopyaladı. Belgeler
klasörünüzdeki hiçbir şeye bu değişiklik dokunmaz.

## Mevcut bir vault için anlamı

Eski skill ile başlatılmış bir vault hâlâ `.codex-chef-brain.json` işaretçisini
taşır. Bu işaretçi kullanıcı verisidir. AgentChef onu silmez, yeniden yazmaz,
"uzlaştırmaz"; hiçbir repair veya doctor komutu bunu önermez. Vault artık
`dual-agent-brain` tarafından yönetiliyorsa dosyayı olduğu yerde bırakın; motor
onu yok sayar.

Ortamınızda `CODEX_CHEF_BRAIN_HOME` hâlâ tanımlıysa kendiniz kaldırın; artık
hiçbir şey onu okumuyor.

## `dual-agent-brain` yedek bağımlılığı

Motorun `beyin yedek` komutu ve haftalık zamanlanmış yedek görevi
`brain-cli.mjs` dosyasını diskte arar. Bu sürümden sonra CLI bu depoda yok.
Motor kendi yerel yedeğini kazanana kadar, CLI'ı hâlâ içeren son checkout'un
dondurulmuş bir kopyasını gösterin:

```powershell
setx BEYIN_BRAIN_CLI "<v0.5.74-checkout-yolu>\scripts\brain-cli.mjs"
```

Yeni bir terminal açın, ardından `beyin yedek` ve `beyin durum` ile doğrulayın.
CLI bulunamazsa motor zarifçe geriler: doktor "vault şeması" kontrolünü atlandı
olarak işaretler ve yedek görevi kaydedilmez.

## Durum görünürlüğü

AgentChef vault'u okumaz. İleriki bir sürüm `npm run codex:status` içinde
motorun kendi `beyin durum` komutunu çağırarak tek satırlık salt-okunur bir
özet (örneğin `Beyin: temiz (N kontrol)`) gösterebilir; vault'a veya motorun
ayarlarına asla yazmaz.

## İlgili

- [ADR-006: bağımsız, çift hedefli ürün olarak devam](decisions/006-agentchef-independent-dual-target-product.md)
- [Güvenlik modeli](security-model.tr.md)
