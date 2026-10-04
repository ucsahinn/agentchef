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
- If the request is vague or has many steps, first make a plan with
  `prompt-architect` in its plan-only mode, then write the brief from that plan.
- If the task writes anything, open a coordination-board task first and record
  its write scope, so other agents can see which paths are taken.

## Brief fields

Write each field as a labeled line or heading. English or Turkish labels both
parse (`coordination-board brief-check` accepts either), and so does a
bilingual label such as `Kapsam / Yazma kapsamı`. The canonical labels are the
ones in bold below. A filled-in example is in
[references/brief-template.md](references/brief-template.md).

1. **Goal** (Hedef): the outcome for the user in one or two sentences.
2. **Evidence** (Kanıt): what is already known, with commands, paths, and
   measurements. No guesses presented as facts.
3. **Write scope** (Yazma kapsamı): the repository and paths that may change.
   Write "read-only" when nothing may change.
4. **Boundaries** (Sınırlar): what must not change or run: other agents'
   areas, live systems, approvals still needed.
5. **Done when** (Bitti kriteri): checkable acceptance, such as a test, a
   command's output, or a measured number.
6. **Return format** (Dönüş biçimi): the handoff fields below.
7. **User's words** (Kullanıcının özgün cümlesi): the user's request copied
   verbatim, never paraphrased.

Check it before sending:

```bash
npm run coordination:board -- brief-check --brief-file brief.md --json
```

On a board task, store it with `brief --task <id> --brief-file brief.md`. The
task cannot move to `in_progress` without a complete brief, and a task with a
write scope also needs a lease (`renew-lease --task <id> --minutes 90`).

## Handoff fields

The receiving agent returns exactly these:

1. **Outcome** (Sonuç): what is now true.
2. **Evidence** (Kanıt): the commands run and their results, and paths.
3. **Changed scope** (Değişen kapsam): every file or setting changed.
4. **Risk**: what could still be wrong.
5. **Open questions** (Açık soru): decisions left to the orchestrator or user.
6. **Next verification** (Sıradaki doğrulama): the next check worth running.

Attach the evidence to the board task (`add-evidence`) before it moves to
done. Verify the claims yourself before you relay them; a handoff is a report,
not proof.

## Rules

- Never put secrets, tokens, or private memory content in a brief; the board
  refuses text that looks like a credential.
- Keep the user's words verbatim even when the rest is translated.
- One brief per task. If the scope changes, update the brief instead of
  sending a second message that contradicts it.
