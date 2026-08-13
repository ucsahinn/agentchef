# TASK-MSR02V1DK60YF — Repair validator hang diagnosis

## Ne yapıldı

- `validate-repair-install.mjs` fixture child süreçlerini yalnız Node çalışma
  zamanını içeren bir `PATH` ile başlatacak şekilde izole edildi.
- Böylece fixture içindeki her `repair-install` çağrısı, ambient Codex CLI
  bulunduğunda tekrar eden `validate-approval-harmony` execpolicy matrisini
  çalıştırmaz; üretimdeki repair preflight ise değişmeden kalır.
- Bu lifecycle sınırını koruyan dar regresyon testi eklendi.

## Kanıt

- Kök neden ölçümü: `validate-approval-harmony.mjs` **10,754 ms**, boş fixture
  `repair-install` planı **11,536 ms** sürdü. Validator 22 repair çağrısı
  yaptığından tekrar eden dış Codex CLI matrisi araç zaman aşımına yol açıyordu.
- RED: `node.exe --test scripts/tests/repair-validator-lifecycle.test.mjs` →
  `AssertionError`: `fixtureChildEnv` bulunamadı.
- GREEN: aynı test → **1 pass, 0 fail**.
- `node.exe scripts/validate-repair-install.mjs` →
  `Repair install validation passed.` (37.6 s).
- `npm.cmd run check` repair validator aşamasını geçti ve toplam **98.5 s**
  sonra görev dışı `scripts/tests/coordination-runtime.test.mjs` içindeki
  `C:\\Users\\private` mutlak yolu nedeniyle `validate-installer-alignment`te
  fail etti. Hang veya repair child leak gözlenmedi.

## Değişen dosyalar

- `scripts/validate-repair-install.mjs`
- `scripts/tests/repair-validator-lifecycle.test.mjs`
- `docs/agent-results/TASK-MSR02V1DK60YF-secv.md`

## Riskler

- Fixture alt süreçleri ambient Codex CLI matrisini atlar; bu matrix, tam
  `npm run check` sırasında üretim ortamında ayrı olarak çalışmaya devam eder.
- Tam kalite kapısı, görev kapsamı dışındaki coordination runtime testindeki
  mutlak yol ihlali çözülene kadar PASS değildir.

## Açık sorular

- `scripts/tests/coordination-runtime.test.mjs` içindeki makine-özel test
  girdisi installer-alignment politikasına uygun biçimde düzeltilmeli mi?

## Sonraki adım

- Coordination runtime değişikliğinin sahibi mutlak yol ihlalini düzelttikten
  sonra `npm run check` yeniden çalıştırılmalı.
