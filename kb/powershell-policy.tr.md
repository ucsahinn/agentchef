# PowerShell Policy Ve Windows Başlatma

PowerShell `install.ps1` dosyasını engelliyorsa veya terminal çıktıyı bozuk
gösteriyorsa bu makaleyi kullan.

## Güvenli Başlatma Komutu

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf
```

`Bypass` yalnızca bu PowerShell süreci için geçerlidir. Makine genelindeki
execution policy değerini değiştirmez.

## Plain Output Ne Zaman Kullanılır?

Eski konsollar Unicode veya emoji karakterlerini kötü gösteriyorsa plain output
kullan:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -All -WhatIf -PlainOutput
```

## Durma Koşulları

- Bu repo için makine genelindeki execution policy değerini gevşetme.
- Doğrulanmamış URL'den script indirip çalıştıran komutları paste etme.
- Preview, `manifests/install-plan.json` içindeki managed hedefler dışında
  write gösteriyorsa devam etme.

## Doğrulama

```bash
npm run validate:installer
npm run validate:installer-smoke
```
