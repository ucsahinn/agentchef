---
task: TASK-MSPY3J8FVTS2L
role: design-lead
title: Rol ve onboarding mental modeli doğrulaması
status: passed-with-one-critical-gap
date: 2026-08-12
---

# Rol ve onboarding mental modeli doğrulaması

## Sonuç

Temel model anlaşılır: kullanıcı 11 koordinatörün iş alanı sahibi, 21 uzman
worker'ın ise yalnız seçildiğinde kanıt üreten alt rol olduğunu öğrenebilir.
Roller sürekli çalışan servis değildir; delegasyon koşulludur. Ana oturum karar
ve izin sınırını korur, `/agent` thread izleme yoludur ve global `AGENTS.md`,
repo-içi `AGENTS.md` karşısında daha düşük önceliktedir.

Bir kritik onboarding boşluğu kaldı: rol nickname'leri yayınlanan en kısa
onboarding yüzeyinde canonical çağrılabilir role açıkça bağlanmıyor.

## Kanıt

| Zihinsel model parçası | Kanıt | Değerlendirme |
| --- | --- | --- |
| Sayı ve yaşam döngüsü | `docs/agents.tr.md:8-12` 11 koordinatör + 21 uzmanı, koşullu delegasyonu ve sürekli servis olmadıklarını açıklar. | Geçti |
| Coordinator → worker sınırı | `docs/agents.tr.md:98-126` sahiplik tablosunu, en fazla dört worker'ı, workers'ın yeniden delege edemeyeceğini ve parent-routed handoff'u gösterir. | Geçti |
| Gereksiz rol üst üste binmesi | Gerçek katalog sayımı 11 coordinator, 21 unique worker ve 21 unique atanmış worker verdi. Her worker tam olarak bir coordinator altında: `design_coordinator → design_reviewer`, `frontend_coordinator → frontend_verifier`, `qa_coordinator → qa_lead/test_verifier`, `support_coordinator → devex_auditor` vb. `catalog/agents.json` içindeki ayrı `primaryUse`/`mustNot` sözleşmeleri yakın alanları ayrıştırır. | Geçti |
| Çağırma ve izleme | `docs/agents.tr.md:16-37` canonical coordinator çağırma örneği, routing akışı ve `/agent` izleme/yönlendirme/kapatma yolunu verir; `docs/install.tr.md:217-222` aynı izleme yolunu tekrarlar. | Geçti |
| Repo/global ayrımı | `README.tr.md:63-71` global sözleşmenin `~/.codex/AGENTS.md` olarak kurulduğunu ve repo-içi `AGENTS.md`'nin daha spesifik/öncelikli kaldığını açıklar. | Geçti |
| Runtime görünürlüğü | `node scripts/codex-routing-board.mjs --task ...` gerçek çıktısında görünür routing sözleşmesi, `/agent`, `support_coordinator → devex_auditor`, koşullu delegasyon ve approval sınırı sunuldu. | Geçti |
| İsim/nickname ayrımı | `templates/codex/agents/design_coordinator.toml` `nickname_candidates = ["Design Lead", "Design Coordinator", "UX Review Lead"]` içerir. Buna karşılık `README.tr.md`, `docs/agents.tr.md` ve `docs/install.tr.md` içinde `Design Lead`, `nickname_candidates` veya takma adın canonical `design_coordinator` adına çözümü bulunmaz. Docs yalnız canonical adı çağırma örneği verir. | **Kritik boşluk** |

## Kritik UX boşluğu

Kullanıcıya bir görev veya ekip etiketi `Design Lead` olarak geldiğinde, bunun
`design_coordinator` çağrısına karşılık geldiğini onboarding belgelerinden
çıkaramaz. Runtime role dosyası nickname'i tanır; ancak kullanıcıya açık en kısa
giriş yüzeyi bu eşlemeyi ve nickname'in yalnız insan-dostu etiket, canonical
adın ise çağrılabilir kimlik olduğunu söylemez. Bu, görevi yanlışlıkla
`design_reviewer` worker'ına yönlendirme veya rolün hiç bulunmadığını sanma
riskini doğurur.

Önerilen dar düzeltme (bu görevde uygulanmadı): `docs/agents.tr.md` içindeki
"Bir Koordinatör Çağır" bölümüne tek satırlık bir kural ve 11 satırlık
nickname → canonical coordinator tablosu/bağlantısı ekleyin. README yalnız
aynı bölüme yönlendirsin; nickname'leri bağımsız ikinci bir role dönüşmesin.

## Zorunlu doğrulama

Gerçek çalıştırmalar:

```text
npm run chef -- --routing --profile starter-health --no-log  PASS
npm run validate:agents                                PASS (11 coordinator, 21 worker)
npm run validate:routing                               PASS (18 profile)
npm run validate:docs                                  PASS
npm run validate:doc-locales                           PASS
node scripts/codex-routing-board.mjs --task "Tasarım rolü..."  PASS
```

Not: `--profile design-review` denemesi geçerli bir profil adı olmadığı için
beklendiği gibi "Unknown routing profile" ile çıktı; bu deneme rapordaki
boşluğun dayanağı değildir.

## Kapsam

Ürün/dokümantasyon davranışı değiştirilmedi; bu yalnızca runtime ve onboarding
inceleme raporudur.

## Ne yapıldı

Koordinatör adlandırması ve onboarding mental modeli salt-okunur incelendi; nickname boşluğu tarihsel bulgu olarak kaydedildi.

## Kanıt

`npm run chef -- --routing --profile starter-health --no-log`, ajan/routing ve doküman doğrulamaları geçti. Bulgu daha sonra `TASK-MSQ2BHNM2XEX3` ile kapatıldı.

## Değişen dosyalar

Bu incelemede ürün dosyası değiştirilmedi.

## Riskler

Tarihsel rapordaki nickname boşluğu geriye dönük PASS sayılmamıştır; sonraki gap-fix kanıtıyla kapatılmıştır.

## Açık sorular

Yok; kapanış kanıtı `TASK-MSQ2BHNM2XEX3` raporundadır.

## Sonraki adım

Onboarding tablosunu katalog değişikliklerinde parity kapısıyla koru.
