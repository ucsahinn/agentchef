---
title: Unified Workspace bootstrap implementation assessment
task: TASK-MSR02V5MU3PH9
agent: bob
status: blocked
type: runtime
---

## Ne yapıldı

Unified Workspace OS bootstrap'ı uygulamak için Chef çalışma alanı ve ilgili
ADR incelendi. Bu depoda uygulanabilir bir bootstrap artefaktı, sürümlü şema,
release manifesti veya Control/Kitchen owner setup yüzeyi bulunmadığı
doğrulandı. Bu nedenle güvenlik sınırını ihlal edecek sahte bir üç-bileşenli
`apply` implementasyonu yapılmadı.

ADR-004 bu işin sahibi olarak açıkça `codex-chef-control` deposunu atar;
Chef'te yalnız Control şeması kararlı olduktan sonra adapter/dokümantasyon
eklenebilir. İstenen gerçek preview/apply/E2E kabulü de Control ve Kitchen
payload'ları ile temiz bir Windows profilini gerektirir; bu girdiler bu
çalışma alanında yoktur.

## Kanıt

```text
Get-ChildItem -Path . -Recurse -Force -File -Include *.ps1,*.json,*.mjs |
  Select-String -Pattern 'workspace-os\\.bootstrap|codex-workspace-bootstrap|InitializeBrain|selectedComponents' -List

C:\\Users\\ulasc\\Desktop\\codex-chef\\scripts\\lib\\install-contract.mjs
C:\\Users\\ulasc\\Desktop\\codex-chef\\scripts\\lib\\installer-safety-preflight.mjs
C:\\Users\\ulasc\\Desktop\\codex-chef\\scripts\\plan-install.mjs
C:\\Users\\ulasc\\Desktop\\codex-chef\\scripts\\validate-installer-alignment.mjs
```

Bu çıktıda `codex-workspace-bootstrap.ps1`, `workspace-os.bootstrap.v1`
şeması veya Control/Kitchen release manifesti yoktur.

`docs/decisions/004-workspace-os-unified-bootstrap.md` karar metninden:

```text
Create a new Windows-only Workspace OS bootstrap artifact in the Control
repository.

Until Control ships that artifact, Chef's existing Portable Workspace OS flow
remains Chef-only.
```

```text
git log --oneline -12 -- docs/decisions/004-workspace-os-unified-bootstrap.md
f48508a docs: clarify workspace bootstrap runtime gates
f24e22b docs: specify unified Workspace OS bootstrap
```

## Değişen dosyalar

- `docs/agent-results/TASK-MSR02V5MU3PH9-bob.md` — blocker ve doğrulanmış
  kapsam raporu.

## Riskler

- Chef deposunda Control/Kitchen installer'larını yeniden uygulamak, ADR'nin
  tek-otorite ve state-taşımama sınırlarını ihlal eder.
- Control şeması, pinli release manifesti ve owner health komutları olmadan
  `PlanId` bağlı apply, güvenli rollback veya gerçek birleşik health matrisi
  kanıtlanamaz.

## Açık sorular

- `codex-chef-control` çalışma ağacı ve Phase 0 artefaktları hangi konumda
  kullanılabilir?
- Gerçek E2E için disposable Windows kullanıcı profili/VM ve Kitchen desktop
  smoke ortamına erişim sağlanacak mı?

## Sonraki adım

Control deposunda ADR-004 Phase 0-3 uygulanmalı: şema ve release manifestini
ekle, preview/apply transaction'ını owner API'leriyle kur, sonra temiz profil
üzerinde Chef → Control → Kitchen gerçek E2E'yi çalıştır. Chef adapter'i ancak
o kararlı sözleşmeye karşı eklenebilir.
