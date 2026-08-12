# TASK-MSQFDHENWGDXJ — Chef role memory layer

## Ne yapıldı

- Brain candidate sözleşmesine isteğe bağlı `agentRoles` eklendi; `shared` ve
  mevcut Chef rol kimlikleri (`catalog/agents.json`) kabul edilir.
- `brain retrieve` komutu artık isteğe bağlı `--role` alır ve yalnız `shared`
  veya istenen rolle etiketli notları, mevcut exact-project ve boyut sınırları
  içinde döndürür.
- Context pack açıkça `untrusted: true` olarak işaretlenir. Hafıza notu komut
  onayı veremez, sandbox politikasını değiştiremez veya connector etkinleştiremez.
- Capture/retrieve tarafında bilinmeyen Chef rolleri fail-closed reddedilir.
- Windows PowerShell kaynaklı birden çok UTF-8 BOM içeren candidate JSON için
  uyumluluk eklendi ve regresyon testi yazıldı.
- AgentSpace kimlikleri ve `.agentspace/memory/**` notları ürüne
  kopyalanmadı ya da değiştirilmedi.

## Kanıt

- RED: `node --test scripts/tests/brain-cli.test.mjs` rol filtresi henüz
  uygulanmadığında `2 !== 0` ile fail etti; iki-BOM candidate testi de minimal
  normalizasyondan önce `1 !== 0` ile fail etti.
- GREEN: `C:\Users\ulasc\Desktop\.toolcache\node-v24.18.0-win-x64\node.exe --test scripts/tests/brain-cli.test.mjs scripts/tests/brain-foundation.test.mjs`
  → **24 pass, 0 fail**.
- `node scripts/validate-brain-foundation.mjs` → `Brain foundation validation passed.`
- `node scripts/validate-plugin-skills.mjs` → `Plugin skill validation passed.`
- `npm.cmd run validate`, `npm.cmd run validate:docs`, `npm.cmd run validate:doc-locales`
  (Node 24 PATH ile) → sırasıyla `Validation passed. Checked 381 files.`,
  `Documentation validation passed.`, `Doc locale validation passed for complete English and Turkish operator docs.`
- Gerçek disposable CLI akışı `C:\Users\ulasc\AppData\Local\Temp\codex-chef-role-memory-e2e-v3` üzerinde preview → apply → BOM'lu capture preview/apply → `retrieve --project codex-chef --role security --query approval` → audit ile çalıştı. Retrieve çıktısı 1 not, `agentRoles: ["shared", "security"]`, `untrusted: true`; audit `ok: true` döndürdü.
- Geniş `npm.cmd run check`: **173 pass, 0 fail, 1 skipped** testten ve tüm ilgili validatorlardan sonra, görev dışı `.agentspace/memory/shared/MEMORY.md:9:40` içindeki mevcut mojibake nedeniyle `validate-content-safety` aşamasında durdu.

## Değişen dosyalar

- `scripts/brain-cli.mjs`
- `scripts/lib/brain-foundation.mjs`
- `scripts/tests/brain-cli.test.mjs`
- `schemas/brain-candidate.schema.json`
- `docs/brain/README.md`
- `docs/brain/README.tr.md`
- `templates/brain/README.md`
- `docs/agent-results/TASK-MSQFDHENWGDXJ-secv.md`

## Riskler

- Rol etiketleri erişim kontrolü değildir; Brain notları yerel ve güvenilmeyen
  bağlamdır. Gizli bilgi ayrı owner-only konumda kalmalıdır.
- Windows ACL status'u disposable temp vaultta beklenen fail-closed sonuç
  verebilir; bu task content/audit ve CLI davranışını doğruladı, ACL uygulamadı.
- Tam repo check, görev dışı AgentSpace hafıza dosyasındaki kodlama sorunu
  çözülmeden yeşil olmaz.

## Açık sorular

- Yok. AgentSpace hafızasının otomatik import edilmesi bilinçli olarak kapsam
  dışıdır; ileride istenirse ayrı, explicit source + preview + apply tasarımı
  gerektirir.

## Sonraki adım

- Entegrasyon/review sahibi rol-hafıza CLI yüzeyini değerlendirebilir.
- Ayrı bir bakım işinde `.agentspace/memory/shared/MEMORY.md` mojibake sorunu
  düzeltilip `npm run check` yeniden çalıştırılmalıdır.
