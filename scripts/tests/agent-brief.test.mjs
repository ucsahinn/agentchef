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
