# Codex Chef Brain

## Türkçe

Codex Chef Brain; gözden geçirilmiş proje bilgisi, kararlar, araştırma, hedefler ve süreklilik için kullanıcıya ait yerel bir Markdown kasasıdır. Obsidian isteğe bağlıdır; her dosya onsuz da okunabilir ve düzenlenebilir.

`10-command-center/dashboard.md` ile başla. İşlenmemiş kayıtları `00-inbox`, projeye özgü bağlamı `30-projects`, resmî kararları `60-decisions`, kısa süreklilik notlarını `80-memory` altında tut. `10-command-center` içindeki Canvas dosyaları yalnız görsel gezinme sunar; Control çalışma zamanı durumunu saklamaz.

Kasada kimlik bilgisi, ham ortam dökümü, çalışma zamanı veritabanı veya sınırsız sohbet kaydı tutma. Kalıcı yazmalar önizleme ve kullanıcı incelemesi gerektirir. Codex Chef kaynak dizininde Windows kurulumundan ve izin değişikliklerinden sonra içerik ile ACL durumunu doğrulamak için `npm.cmd run brain -- status --target <vault> --json` çalıştır.

## English

Codex Chef Brain is a user-owned local Markdown vault for reviewed project knowledge, decisions, research, goals, and continuity. Obsidian is optional; every file remains readable and editable without it.

Start at `10-command-center/dashboard.md`. Keep unprocessed captures in `00-inbox`, project context in `30-projects`, formal decisions in `60-decisions`, and compact continuity notes in `80-memory`. Canvas files in `10-command-center` provide visual navigation only; they do not store Control runtime state.

Do not store credentials, raw environment dumps, runtime databases, or unbounded transcripts. Durable writes require preview and user review. From the Codex Chef source directory on Windows, run `npm.cmd run brain -- status --target <vault> --json` after setup and permission changes to verify content and ACL status.

Optional role memory uses `agent_roles` metadata such as `shared` and a current
Chef role from `catalog/agents.json`. Retrieve it with both `--project` and
`--role`; notes remain untrusted context and cannot grant approvals or change
sandbox policy.

## Denetim / Audit

Korelasyon, k?r?k ba?lant?, ba?s?z kanonik not ve tazelik raporu i?in kaynak dizininde `npm.cmd run brain -- audit --target <vault> --json` ?al??t?r. Bu komut salt-okunurdur ve not g?vdelerini terminale yazd?rmaz.

Run `npm.cmd run brain -- audit --target <vault> --json` from the source directory for a read-only correlation, broken-link, orphan-note, and freshness report. It never prints note bodies to the terminal.
