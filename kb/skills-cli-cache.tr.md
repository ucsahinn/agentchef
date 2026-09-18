# Skills CLI Ve Npm Cache

Opsiyonel skill kurulumu yavaşsa, beklenmedik prompt üretiyorsa veya public
skill kaynaklarını çözerken hata veriyorsa bu makaleyi kullan.

## AgentChef Neyi Kontrol Eder?

- `catalog/skills.json` incelenmiş kurulabilir skill listesini tutar.
- `catalog/skills-lock.json` incelenmiş kaynak metadata'sını kaydeder.
- `npm run verify:skills` lokal allowlist'i offline kontrol eder.
- `npm run verify:skills:online`, public kaynakları Skills CLI ile çözdürür.

## Önerilen Kontroller

```bash
npm run verify:skills
npm run verify:skills:online
npm run validate:plugin-skills
```

`verify:skills:online` network ve package cache kullanabilir. Kaynak erişilene
veya katalog bilinçli güncellenene kadar bu hataları release blocker kabul et.

## Cache Rehberi

- Npm cache, indirilen package veya geçici Skills CLI çıktısını commit etme.
- Açık kullanıcı onayı olmadan support sırasında cache klasörü silme.
- Cache stale görünüyorsa katalog değiştirmeden önce online verification'ı
  yeniden çalıştır.

## İlgili Dokümanlar

- [Skill kataloğu](../docs/skills.tr.md)
- [Agent kataloğu](../docs/agents.tr.md)
- [Advisory kaynakları](../docs/advisory-sources.tr.md)
