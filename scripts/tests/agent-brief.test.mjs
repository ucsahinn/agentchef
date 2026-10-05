import assert from "node:assert/strict";
import test from "node:test";
import { BRIEF_FIELDS, HANDOFF_FIELDS, parseBrief, parseHandoff } from "../lib/agent-brief.mjs";

test("a brief parses the same in English and Turkish, as headings, bullets, or bold labels", () => {
  const english = parseBrief([
    "## Goal", "Speed up new sessions",
    "**Evidence:** 35 processes measured",
    "- Write scope: scripts/lib",
    "Boundaries: never touch the Beyin vault",
    "Done when: tests pass",
    "Return format: Outcome, Evidence",
    "User's words: \"pc çok yavaşladı\""
  ].join("\n"));
  assert.equal(english.ok, true, english.missing.join(", "));
  assert.equal(english.fields.goal, "Speed up new sessions");
  const turkish = parseBrief([
    "Hedef: oturumlar hızlansın", "Kanıt: ölçüm", "Kapsam: scripts/lib", "Sınırlar: Beyin'e dokunma",
    "Bitti kriteri: testler geçer", "Dönüş biçimi: Sonuç, Kanıt", "Kullanıcının özgün cümlesi: \"pc çok yavaşladı\""
  ].join("\n"));
  assert.equal(turkish.ok, true, turkish.missing.join(", "));
  assert.deepEqual(Object.keys(turkish.fields).sort(), BRIEF_FIELDS.map((field) => field.key).sort());
});

test("missing and empty fields are reported by their English label", () => {
  const result = parseBrief("Goal: x\nEvidence:\nBoundaries: y");
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["Evidence", "Write scope", "Done when", "Return format", "User's words"]);
  assert.equal(parseBrief("").missing.length, BRIEF_FIELDS.length);
});

test("a handoff needs every return field", () => {
  const full = parseHandoff("Sonuç: tamam\nKanıt: test\nDeğişen kapsam: yok\nRisk: düşük\nAçık soru: yok\nSıradaki doğrulama: CI");
  assert.equal(full.ok, true, full.missing.join(", "));
  assert.equal(parseHandoff("Outcome: done").missing.length, HANDOFF_FIELDS.length - 1);
});

test("bilingual labels such as \"Kapsam / Yazma kapsamı\" parse as one field", () => {
  const result = parseBrief([
    "## Goal / Hedef", "x",
    "**Kanıt / Evidence:** y",
    "- Kapsam / Yazma kapsamı: scripts/lib",
    "Sınırlar / Boundaries: z",
    "Done when / Bitti kriteri: tests",
    "Dönüş biçimi / Return format: handoff",
    "User's words / Kullanıcının özgün cümlesi: \"aynen\""
  ].join("\n"));
  assert.equal(result.ok, true, result.missing.join(", "));
  assert.equal(result.fields.scope, "scripts/lib");
});

test("labels parse in capitals, numbered lists, and bold with a parenthesized alias", () => {
  const caps = parseBrief("GOAL: a\nEVIDENCE: b\nWRITE SCOPE: c\nBOUNDARIES: d\nDONE WHEN: e\nRETURN FORMAT: f\nUSER'S WORDS: g");
  assert.equal(caps.ok, true, caps.missing.join(", "));
  assert.equal(Object.hasOwn(caps.fields, "undefined"), false);
  const numbered = parseBrief([
    "1. **Goal** (Hedef): a",
    "2. **Evidence** (Kanıt): b",
    "3. **Write scope** (Yazma kapsamı): c",
    "4. **Boundaries** (Sınırlar): d",
    "5. **Done when** (Bitti kriteri): e",
    "6. **Return format** (Dönüş biçimi): f",
    "7. **User's words** (Kullanıcının özgün cümlesi): g"
  ].join("\n"));
  assert.equal(numbered.ok, true, numbered.missing.join(", "));
  assert.equal(numbered.fields.scope, "c");
});

test("handoff labels accept the plural and Turkish variants agents write", () => {
  const result = parseHandoff("OUTCOME: x\nKanıt: y\nChanged scope: none\nRiskler: r\nAçık sorular: q\nSonraki doğrulama: n");
  assert.equal(result.ok, true, result.missing.join(", "));
  assert.equal(parseHandoff("Outcome: x\nEvidence: y\nChanged scope: none\nRISKS: r\nUnresolved questions: q\nNext verification need: n").ok, true);
});
