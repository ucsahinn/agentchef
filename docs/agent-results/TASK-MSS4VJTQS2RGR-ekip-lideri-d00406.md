# TASK-MSS4VJTQS2RGR — Kitchen unified product boundary

## Ne yapıldı

- Kitchen'ın tek kurulan ve yayınlanan Agent Workspace ürünü olduğu kararını
  ADR-005 ile kayda aldım.
- Chef, Control ve Brain'i ayrı müşteri ürünleri yerine Kitchen içindeki
  sürümlemeli modüller olarak sınırlandırdım; kaynak çoğaltma, ikinci onay/
  yürütme otoritesi ve gizli ortak state yasaklarını açıklaştırdım.
- ADR-004'ün çoklu bağımsız kurulum varsayımlarını supersede ettim; onun
  preview-first, state taşıma ve fail-closed güvenlik ilkelerini korudum.
- Mimari/sözleşme dondurması ile gerçek Kitchen release/publish kapısını
  ayırdım. Mevcut kanıtın release için yetersiz olduğunu ADR içinde yazdım.

## Kanıt

2026-08-14 tarihinde Chef kökünde çalıştırılan gerçek doğrulama çıktısı:

```text
> codex-chef@0.5.72 validate
> node scripts/validate-repo.mjs

Validation passed. Checked 397 files.
```

Bu doğrulama dokümantasyon/starter bütünlüğünü kanıtlar. Kitchen'ın gerçek
Windows Electron etkileşimi, temiz makine kurulumu ve paket yayın kanıtı henüz
çalıştırılmadığından bu rapor release-ready iddiası içermez.

## Değişen dosyalar

- `docs/decisions/005-kitchen-unified-workspace-and-module-boundaries.md`
- `docs/agent-results/TASK-MSS4VJTQS2RGR-ekip-lideri-d00406.md`

## Riskler

- Chef, Control ve Brain hâlen ayrı çalışma ağaçlarında bulunuyor; Kitchen
  monorepo geçişi ve tek kök manifest uygulanmadan hedef mimari işletimsel
  olarak tamamlanmış değildir.
- Mevcut çalışma ağaçlarındaki kullanıcı/değişken dosyalar temizlenmeden veya
  sahipliği kanıtlanmadan taşınmamalı ya da silinmemelidir.

## Açık sorular

- Kitchen'a taşınacak modüllerin kesin paket isimleri, runtime sınırları ve
  migration sırası contract envanteri tamamlanınca sabitlenecek.
- Eski bağımsız dağıtımların kullanıcıya dönük deprecation takvimi, gerçek
  Kitchen upgrade/migration E2E kanıtından sonra belirlenmeli.

## Sonraki adım

Chef/Control/Brain kaynak ve runtime envanterini Kitchen modül sınırlarına
eşlemek; ardından tek kök manifest, uyumluluk matrisi, preview-only migration
planı ve gerçek Windows Workspace E2E kapısını uygulamak.
