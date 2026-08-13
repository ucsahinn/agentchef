# TASK-MSQ6XP49NU55S — Control Brain health projection incelemesi

## Ne yapıldı

- Control/Brain continuity yolunun kodu incelendi: `scripts/chef-cli.mjs` içindeki `runContinuity()` ve `inspectBrainContinuity()`.
- Yerel Brain vault sağlık projeksiyonunun `brain-cli status --json` alt sürecinden geldiği; Control canlı proje sağlığının ise yalnız mevcut Codex oturumundaki Control MCP ile sorgulanabildiği doğrulandı.
- Rol-sınırlı, salt-okunur Brain retrieval'ın `scripts/lib/brain-foundation.mjs` içindeki `retrieveBrainNotes()` filtresi ve CLI sözleşmesi incelendi.
- Gerçek salt-okunur continuity komutu ve izole Brain CLI test akışı çalıştırıldı.

## Kanıt

Gerçek continuity sorgusu:

```text
& 'C:\\Program Files\\nodejs\\node.exe' scripts/chef-cli.mjs --continuity --json --no-log
Exit code: 0
```

Çıktının ilgili alanları:

```json
{
  "control": {
    "configured": false,
    "enabled": false,
    "liveStatus": "session-MCP-only",
    "liveProbe": {
      "cliSubprocessCanProbe": false,
      "availableFrom": "current-codex-session-mcp"
    }
  },
  "brain": {
    "vault": {
      "configured": true,
      "exists": true,
      "status": "ok",
      "contentOk": true,
      "securityOk": true,
      "scope": "local CODEX_CHEF_BRAIN_HOME only; separate from Control project Brain mappings"
    }
  },
  "boundaries": {
    "controlBrainBridge": "bounded read-only context only when explicitly requested and project-mapped",
    "controlProjectBrainMappingIsSeparateFromLocalVault": true
  }
}
```

İzole, gerçek alt-süreç/vault doğrulaması:

```text
& 'C:\\Program Files\\nodejs\\node.exe' --test scripts/tests/brain-cli.test.mjs scripts/tests/brain-foundation.test.mjs
tests 24
pass 24
fail 0
duration_ms 6877.5099
```

Bu testler explicit target gereksinimini, preview-first yazma kuralını, project/role-scoped retrieval'ı, shared-role erişimini, geçersiz rol reddini, Windows BOM girdisini, içerik/ACL health denetimini, capture/backup/restore güvenlik sınırlarını kapsar.

## Değişen dosyalar

- Ürün kaynak kodu değiştirilmedi.
- `docs/agent-results/TASK-MSQ6XP49NU55S-gelistirici.md` eklendi.
- `docs/agent-results/INDEX.md` güncellendi.

## Riskler

- Bu ortamda `codex_control` yapılandırılmamış olduğundan gerçek Control proje-health/projection değeri sorgulanamadı. Chef CLI bunu kasıtlı olarak yapmaz; yalnız mevcut Codex oturumunun Control MCP'si canlı durumu yetkili biçimde sağlayabilir.
- Yerel vault sağlığı `ok` olsa da bu, Control projesinin ayrı Brain mapping'inin sağlıklı olduğunu kanıtlamaz.

## Açık sorular

- Control MCP'nin etkin olduğu hedef Codex oturumunda, Control'e ait gerçek health projection çağrısının çıktısı ayrıca alınmalı mı? Bu depo bu çağrının istemci/API yüzeyini içermez.

## Sonraki adım

1. Control MCP etkin bir Codex oturumunda proje-health/projection sorgusunu gerçek MCP olayı ve yanıtıyla kaydedin.
2. Control/Brain projection sözleşmesi değişirse `npm.cmd run validate:chef-cli` kapısını daha uzun zaman aşımıyla yeniden çalıştırın; bu koşuda 120 saniyelik dış zaman aşımına ulaşıldı.
