# TASK-MSQ6XPFG8LARL — Chef portability

## Ne yapıldı

- İngilizce ve Türkçe kurulum rehberlerine, başka bir bilgisayarda güvenli ve
  izole deneme için `CODEX_HOME`/`AGENTS_HOME` kullanan Portable Workspace OS
  akışı eklendi.
- Codex Chef'in yalnız Codex çalışma zamanı yeteneklerini kurduğu; Control,
  Brain ve Kitchen'ı kurmadığı, yönetmediği veya onların özel durumunu
  taşımadığı açıkça sınırlandı.
- Dokümantasyon doğrulaması, bu taşınabilirlik ve yetki sınırının iki kurulum
  rehberinde kalmasını zorunlu tutacak şekilde genişletildi.

## Kanıt

```text
Documentation validation passed.
Doc locale validation passed for complete English and Turkish operator docs.
Installer alignment and portability validation passed.
tests 9; pass 9; fail 0
```

İzole geçici hedefte gerçek repair preview özeti:

```json
{"mode":"plan","applied":null,"backupRoot":null,"planned":289,"failures":0}
```

Bu komut `CODEX_HOME` ve `AGENTS_HOME` için yeni `%TEMP%` altı yollar kullandı;
normal kullanıcı `.codex` veya `.agents` hedeflerine yazmadı.

## Değişen dosyalar

- `docs/install.md`
- `docs/install.tr.md`
- `docs/security-model.md`
- `scripts/validate-docs.mjs`

## Riskler

- Gerçek kullanıcı-home kurulumu hâlâ kasıtlı olarak ayrı bir `--apply` kararı
  ve backup-backed plan gerektirir.
- Control, Brain ve Kitchen için ayrı kurulum/çalıştırma sözleşmeleri gerekir;
  Chef installer'ı bu yetki sınırını aşmaz.

## Açık sorular

- Yok. Çoklu uygulama dağıtımı için ileride ortak bir üst seviye bootstrap
  gerekiyorsa, her katmanın ayrı sürümlenmiş kurulum sözleşmesiyle tasarlanmalı.

## Sonraki adım

- Ana entegrasyon, Control'un sınırlı Brain-health projection'ı ve Kitchen'ın
  bu projection'ı salt-okunur göstermesi tamamlandığında çapraz ürün e2e
  doğrulamasını çalıştırmalıdır.
