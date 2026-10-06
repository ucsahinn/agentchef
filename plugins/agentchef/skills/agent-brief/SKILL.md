---
name: agent-brief
description: Write the task brief an orchestrator hands to another agent (subagent, Codex worker, or peer session) and check the handoff that comes back. Use before any delegation that has a goal, a write scope, or acceptance criteria; skip it for a one-line read-only question.
---

# Agent Brief

One fixed shape for every delegated task, so the receiving agent never guesses
the goal, the limits, or what "done" means, and the reply can be checked
field by field.

## When

- Before delegating work that changes files, runs commands, or must meet a
  stated result. A read-only lookup needs no brief.
- A matched autoVerify routing profile (`security-sensitive`,
  `release-or-publish`, `mcp-connector-change`, `frontend-ui`, `data-systems`)
  makes its verifier mandatory once files changed: brief that verifier before
  reporting done.
- If the request is vague or has many steps, first make a plan with
  `prompt-architect` in its plan-only mode, then write the brief from that plan.
- If the user asked for a board task, record its write scope there
  (`create --write-repo --write-paths`) before work starts. Without a board
  task, list the write scope in the brief only. Never create a board task the
  user did not ask for.

## Team protocol

- Roles: the user approves; the main session plans, briefs, merges, runs every
  board command, and reports; a coordinator picks its own cataloged workers and
  merges their handoffs (read-only); a worker does one bounded job.
- Routes: Direct, the main session briefs one to four specialists; Team, for a
  board task, the main session briefs its coordinator, which briefs its own
  workers. At most four workers per task (a coordinator is not counted); two
  levels.
- Workers never spawn. When another role is needed, the worker writes
  `needs: <role> - <why>` under Open questions and the parent decides.

## Brief fields

Write each label on its own line as `Label:` or `## Label`, optionally
bilingual (`Goal / Hedef:`, `**Goal** (Hedef):`). English or Turkish labels
both parse, and so do numbered or bulleted labels. Write `none` for an empty
field; never drop a label. A filled-in example is in
[references/brief-template.md](references/brief-template.md).

- **Goal** (Hedef): the outcome for the user in one or two sentences.
- **Evidence** (Kanıt): what is already known, with commands, paths, and
  measurements. No guesses presented as facts.
- **Write scope** (Yazma kapsamı): the repository and paths that may change.
  Write "read-only" when nothing may change. Two workers never share a path.
- **Boundaries** (Sınırlar): what must not change or run: other agents'
  areas, live systems, approvals still needed.
- **Done when** (Bitti kriteri): checkable acceptance, such as a test, a
  command's output, or a measured number. It is also the stop condition.
- **Return format** (Dönüş biçimi): the six handoff fields below, on one line.
- **User's words** (Kullanıcının özgün cümlesi): the user's request copied
  verbatim, never paraphrased.

Check it before sending:

```bash
npm run coordination:board -- brief-check --brief-file brief.md --json
```

On a board task, store it with `brief --task <id> --brief-file brief.md`. The
task cannot move to `in_progress` without an owner and a complete brief, and a
task with a write scope also needs a lease (`renew-lease --task <id> --minutes 90`)
that no other open task holds on the same paths.

## Handoff fields

The receiving agent returns exactly these six, in this order:

1. **Outcome** (Sonuç): what is now true.
2. **Evidence** (Kanıt): the commands run and their results, and paths.
3. **Changed scope** (Değişen kapsam): every file or setting changed, or `none`.
4. **Risks** (Riskler): what could still be wrong.
5. **Open questions** (Açık sorular): decisions left to the orchestrator or
   user, and any `needs: <role>` request.
6. **Next verification** (Sıradaki doğrulama): the next check worth running.

Check it when it comes back:

```bash
npm run coordination:board -- handoff-check --handoff-file handoff.md --json
```

## Merge and verify

- Merge: check each Changed scope against its brief's Write scope, resolve
  conflicts or ask the user, and rerun every Done-when check on the merged
  result. A handoff is a report, not proof.
- Verify with an agent that did not do the work: never the owner, its session,
  or its coordinator. Pick by work type: `test_verifier` for checks,
  `code_reviewer` for diffs, `frontend_verifier` for UI, `security_auditor`
  for security, or the user. Give the verifier the brief and the handoff.
- Close a board task in order: `add-evidence`, `attach-report`, resolve any
  open decision (`resolve-handoff`), then
  `transition --status done --verified-by <agent>`. If verification fails,
  renew the lease first, then move it back with
  `transition --status in_progress --reason "<why>"`, and update the same brief. A stuck task is `blocked` with a
  reason; unwanted work is `cancelled`.
- Verifier names are typed by the caller, so the board stops honest mistakes,
  not a deliberate impersonation.

## Rules

- Never put secrets, tokens, or private memory content in a brief; the board
  refuses text that looks like a credential.
- Keep the user's words verbatim even when the rest is translated.
- One brief per worker. If the scope changes, update that brief instead of
  sending a second message that contradicts it.
