# TASK-MSS2GNPZRIMYU — Üç repo baseline ve dirty-scope kanıtı

## Ne yapıldı

- `codex-chef`, `codex-chef-control` ve `kitchen` için salt-okunur Git baseline,
  kök manifest ve HEAD mimari yüzeyleri incelendi.
- Her repoda staged, unstaged ve untracked çalışma kapsamı ayrıştırıldı; hiçbir
  dosya değiştirilmedi, reset/stash/checkout/cleanup uygulanmadı.
- Yeniden kullanım sınırları belirlendi: Codex Chef routing/uzmanlık katmanını,
  Control foreground yürütme ve approval/worktree otoritesini, Kitchen ise
  salt-okunur olay/projeksiyon katmanını sahiplenir.
- Task Board kaydı `in_progress` durumuna taşındı. Board liste aracı bu kaydın
  zengin açıklama gövdesini döndürmediğinden, kullanıcı tarafından verilen görev
  sözleşmesi çalışma otoritesi olarak kullanıldı.

## Kanıt

Gerçek, salt-okunur komut çıktıları:

```text
codex-chef
branch: dev
HEAD: 99387e4 2026-08-14 fix(installer): finalize Unix operation cleanup
dirty: staged=0, unstaged=12, untracked=1
manifest: codex-chef@0.5.71; results:index ve codex:routing komutları mevcut

codex-chef-control
branch: main...origin/main [ahead 3]
HEAD: 6b7ec46 2026-08-10 test: harden Control fixture secret handling
dirty: staged=0, unstaged=74, untracked=61
manifest: codex-chef-control@0.3.0; doctor ve test komutları mevcut

kitchen
branch: dev
HEAD: 7207a89 2026-08-12 docs: add Kitchen closure audit
dirty: staged=1, unstaged=77, untracked=129
staged path: docs/agent-results/TASK-MSQCTM75IX04P-kitchen-release-audit.md
manifest: codex-chef-kitchen@0.1.0; Electron 43.3.0 ve test komutu mevcut
```

HEAD mimari kanıtı:

- `codex-chef` `docs/agents.md`: 11 koordinasyon rolü, 21 uzman worker ve
  katalog tabanlı routing/knowledge referansı tanımlar.
- `codex-chef-control` `docs/ARCHITECTURE.md`: tek foreground read-only Codex
  çalıştırması, onay deposu ve izole Git worktree yaşam döngüsünü tanımlar;
  Kitchen için yalnız `kitchen.snapshot` metadata projeksiyonu verir.
- `kitchen` `ARCHITECTURE.md`: Codex/Codex Chef'i kaynak gerçek kabul eder;
  Kitchen'ın schedule/spawn/stop/merge/authorize/mutate yetkisi olmayan,
  disposable read-optimized projection olduğunu belirtir.

Komutlar:

```powershell
git status --short --branch
git log -1 --format="%H%n%h %cs %s"
git diff --cached --name-status
git diff --name-only
git ls-files --others --exclude-standard
git show HEAD:package.json
git show HEAD:docs/ARCHITECTURE.md   # Control
git show HEAD:ARCHITECTURE.md        # Kitchen
npm.cmd run results:index
```

`npm.cmd run results:index` başarıyla `Agent results index updated (103 reports).`
çıktısını verdi. `docs/agent-results/` `.gitignore` içinde olduğu ve `INDEX.md`
izlenmediği için indeksin tamamını yeni bir dosya olarak commit etmek task scope'u
aşardı; yerel indeks güncellendi, commit kapsamına alınmadı.

## Değişen dosyalar

- `docs/agent-results/TASK-MSS2GNPZRIMYU-repo-mapper.md` (bu rapor)

## Riskler

- Üç repo da geniş dirty scope taşıyor; özellikle Kitchen'da başka göreve ait bir
  staged rapor var. Bu görev yalnız Codex Chef içindeki kendi raporunu ve
  izlenebilir bir görev-indeks değişikliği olsaydı onu explicit-path ile stage
  edebilirdi. Mevcut `INDEX.md` izlenmediğinden yalnız rapor stage edilir.
- Control ve Kitchen'daki mevcut değişikliklerin çoğu henüz commit edilmemiş;
  cross-repo uygulama işi bu baseline üzerinde ayrı worktree/scope kararı olmadan
  başlatılmamalı.
- Task Board listeleme yüzeyi zengin açıklama gövdesini göstermedi; ayrıntılı
  kabul kriterleri kullanıcı mesajından alındı.

## Açık sorular

- M0/M1 entegrasyonunun hangi commit veya izole worktree baseline'ına bağlanacağı
  synthesis/merge kapısında seçilmeli.
- Kitchen'daki staged raporun sahibi tarafından mı commit edileceği netleşmeli;
  bu görev onu değiştirmedi veya sahiplenmedi.

## Sonraki adım

1. `FND-03` bu üç sınırı mevcut ADR ve reuse kararlarıyla çakıştırmalı.
2. `SYN-01`, M0 işleri için seçilecek Control/Kitchen/Codex Chef baseline'ını ve
   merge sırasını açıkça belirlemeli.
3. M0/M1 uygulama işi açıldığında bu baseline raporunu başlangıç kanıtı olarak
   kullan; yerel sonuç indeksi zaten yenilendi ve repo kapsamına alınmadı.
