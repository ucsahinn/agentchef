# TASK-MSS4HEAFXNNKI — Chef/Brain portability recovery

## Ne yapıldı

- Chef'in PC-bağımsız runtime/backup/redaction sözleşmesini doğruladım ve
  Kitchen internal-module hedefiyle tutarlı olduğunu kanıtladım.
- Brain'in explicit target, preview-first, user-owned vault, bounded
  retrieval/backup-restore ve Windows ACL integrity sınırlarını test ettim.
- Portability sözleşmesi hiçbir auth/session/cache/Control state/Brain note
  transferi olmadığını, yalnız reviewed source/assets ve safe contracts'ın
  taşınabileceğini tanımlar.

## Kanıt

2026-08-14 Chef kökünde gerçek test çıktısı:

```text
> codex-chef@0.5.72 test:brain
> node --test scripts/tests/brain-foundation.test.mjs scripts/tests/brain-cli.test.mjs scripts/tests/brain-permissions-windows.test.mjs

ℹ tests 32
ℹ pass 32
ℹ fail 0
```

```text
> codex-chef@0.5.72 validate:brain
> node scripts/validate-brain-foundation.mjs

Brain foundation validation passed.
```

## Değişen dosyalar

- `docs/enterprise-v3/PORTABILITY_AND_RUNTIME_CONTRACT.md`
- `docs/agent-results/TASK-MSS4HEAFXNNKI-ekip-lideri-d00406.md`

## Riskler

- Bu doğrulama Kitchen root installer veya gerçek kaynak migration kanıtı
  değildir; Kitchen uygulaması kullanıcıya devredilmiştir.
- Windows ACL testleri policy/invocation sözleşmesini doğrular; hedef
  kullanıcının gerçek vault güvenliği explicit target üzerinde ayrıca kontrol
  edilmelidir.

## Açık sorular

- Kitchen root manifesti uygulandığında Chef Node 18 uyumluluğunun exact
  internal-runtime strategy'si ayrıca kanıtlanmalıdır.

## Sonraki adım

Control security/MCP ve contracts sprint sonuçlarını birleştirip Chef/Control/
Brain'in Kitchen tüketimine hazır module release gate matrisini oluşturmak.
