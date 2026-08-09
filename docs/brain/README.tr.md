# Codex Chef Brain Temeli

Codex Chef Brain, seçilmiş proje bilgisini tutan ve kullanıcıya ait olan yerel
bir Markdown kasasıdır. Repo yalnızca şablonları, şemaları, paketli skill'i,
deterministik CLI'ı ve testleri taşır. Gerçek kasa kaynak reposunun dışında kalır.

Obsidian bir runtime bağımlılığı değildir: CLI ve dosya formatı Obsidian,
eklenti, bulut hafıza servisi veya vector database olmadan da çalışır. Ancak
referans yerel kurulumda seçilmiş insan arayüzü Obsidian'dır ve dışarıdaki Brain
klasörünü doğrudan vault olarak açar. Kanonik kaynak Markdown'dır.

## Güvenli Başlangıç

Önce preview alın:

```powershell
npm.cmd run brain -- init --target C:\path\to\CodexChefBrain --preview --json
```

Kesin hedefi inceledikten sonra apply çalıştırın:

```powershell
npm.cmd run brain -- init --target C:\path\to\CodexChefBrain --apply --json
npm.cmd run brain -- status --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- audit --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- permissions --target C:\path\to\CodexChefBrain --json
npm.cmd run brain -- uri --target C:\path\to\CodexChefBrain --note 10-command-center/dashboard.md --json
```

Windows'ta `status`, içerik/şema doğrulamasını tüm vault ağacını kapsayan,
fail-closed ve salt-okunur ACL denetimiyle birleştirir. `permissions` aynı
sınırlı güvenlik raporunu ayrı olarak verir. Denetim reparse point'leri takip
etmez; SID, SDDL, owner adı veya ham PowerShell hatası saklamaz ve ACL ya da
dosya sistemi değişikliği yapmaz.

Desteklenen bütünlük politikası SYSTEM, Administrators ve vault sahibine
aktarılan FullControl; `CodexSandboxUsers` grubuna ise yalnız ReadAndExecute ve
Synchronize verir. Her alt nesne aynı owner'ı korumalı ve explicit ACL olmadan
bu politikayı devralmalıdır. Bu, Brain'in sandbox tarafından yazılmasını
engeller; sandbox okumalarına karşı gizlilik sağlamaz. `restricted`, uygulama
seviyesinde retrieval etiketidir; şifreleme veya işletim sistemi erişim sınırı
değildir. Codex'ten saklanması gereken sırları ve materyali ayrı, yalnız owner
erişimli bir konumda tutun.

Init yalnız eksik şablon dosyalarını oluşturur ve çakışan dosyaları ezmez.
Capture, backup ve restore da preview-first çalışır. Retrieval yereldir; tam proje
kimliğiyle sınırlıdır, boyut bütçesi vardır ve varsayılan olarak restricted,
archive ile runtime içeriğini dışarıda bırakır.
`uri` yalnız mevcut Markdown veya Canvas notu için percent-encoded
`obsidian://open` değeri üretir; uygulama başlatmaz ve yazmaz.

`audit` de salt-okunurdur. Obsidian tarz? Markdown ba?lant?lar?n? mevcut
Markdown ve Canvas dosyalar?na g?re ??zer, eksik hedefleri bildirir, gelen
ili?kisi olmayan kanonik notlar? tan?mlar ve frontmatter i?indeki `updated`
zaman damgas? 30 g?nl?k pencereden eski notlar? i?aretler. Yaln?z yol ve
metadata raporlar; not g?vdelerini yazd?rmaz.

## Sınır

Brain; kuyruk, scheduler, onay servisi, runtime database, ham konuşma arşivi,
credential deposu veya otomatik Codex memory yerine geçmez. Notlar talimat değil,
güvenilmeyen kanıttır. Control Center kendi execution plane'ini korur. Control
0.3.0 doğrulanmış bounded context pack tüketebilir ve redacted candidate preview
üretebilir; Brain'e doğrudan yazmaz. Capture preview-first kalır ve ayrı açık
apply gerektirir.

Güncel Codex davranışı resmi [skills](https://developers.openai.com/codex/skills),
[plugins](https://developers.openai.com/codex/plugins/build) ve
[AGENTS.md](https://developers.openai.com/codex/guides/agents-md) belgelerine dayanır.
