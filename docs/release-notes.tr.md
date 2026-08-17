# Sürüm Notları

Bu sayfa kullanıcıların şimdi kurması gereken sürümü anlatır. Eski mühendislik geçmişi [CHANGELOG.md](../CHANGELOG.md) içinde korunur; böylece public sürüm rehberi büyüyen bir arşive dönüşmeden güncel kalır.

## v0.5.74 - 2026-08-14

Codex Chef 0.5.74 son bagimsiz Codex Chef bakim surumudur. Bagimsiz kurulum
sozlesmesini korurken, bu sozlesmeyi her desteklenen CI hostunda kanitlamak
icin gereken platformlar arasi test fixture'larini duzeltir.

### Neler Degisti?

- Platformlar arasi fixture'larda POSIX gecici home'lara Windows yol kurallari
  uygulamak yerine, calisan hostun repair sozlesmesini kullanir.
- Tam yonetilen durum assertion'undan once Unix Git-hook fixture'ini
  calistirilabilir yapar ve Windows ACL denetiminin desteklenmedigi
  platformlardaki belgelenmis unavailable Brain-health projeksiyonunu kabul
  eder.

### Urun Siniri

Bu surum bagimsiz kurulabilir kalir ve bu repoda belgelenen uyumluluk
taahhutlerini tasir. Kitchen'i kurmaz; global Codex, Agents, Git, Brain,
oturum, credential veya cache durumunu Kitchen'a tasimaz. Kitchen migration
cutover sonrasinda Kitchen tek public installer ve release train olacak;
Chef, [ADR-005](decisions/005-kitchen-unified-workspace-and-module-boundaries.md)
uyumluluk ve migration kurallariyla yonetilen versioned bir dahili modul
olacak.
