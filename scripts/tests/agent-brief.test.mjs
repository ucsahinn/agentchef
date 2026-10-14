import assert from "node:assert/strict";
import test from "node:test";
import { BRIEF_FIELDS, HANDOFF_FIELDS, parseBrief, parseHandoff, validateVerdictAndMutation } from "../lib/agent-brief.mjs";

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
  assert.deepEqual(Object.keys(turkish.fields).sort(), BRIEF_FIELDS.filter((field) => !field.optional).map((field) => field.key).sort());
});

test("missing and empty fields are reported by their English label", () => {
  const result = parseBrief("Goal: x\nEvidence:\nBoundaries: y");
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["Evidence", "Write scope", "Done when", "Return format", "User's words"]);
  assert.equal(parseBrief("").missing.length, BRIEF_FIELDS.filter((field) => !field.optional).length);
});

test("a handoff needs every return field", () => {
  const full = parseHandoff("Sonuç: tamam\nKanıt: test\nDeğişen kapsam: yok\nRisk: düşük\nAçık soru: yok\nSıradaki doğrulama: CI");
  assert.equal(full.ok, true, full.missing.join(", "));
  assert.equal(parseHandoff("Outcome: done").missing.length, HANDOFF_FIELDS.filter((field) => !field.optional).length - 1);
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

test("optional brief and handoff fields do not change legacy required-field behavior", () => {
  const brief = parseBrief("Goal: x\nEnvironment traps: shell quoting\nIsolation: local only\nEvidence: y\nWrite scope: z\nBoundaries: b\nDone when: d\nReturn format: r\nUser's words: u");
  assert.equal(brief.ok, true, brief.missing.join(", "));
  assert.equal(brief.fields.environmentTraps, "shell quoting");
  assert.equal(brief.fields.isolation, "local only");
  const oldHandoff = "Outcome: done\nEvidence: ok\nChanged scope: none\nRisks: none\nOpen questions: none\nNext verification: none";
  assert.equal(parseHandoff(oldHandoff).ok, true);
  assert.equal(parseHandoff(oldHandoff).missing.length, 0);
});

test("strict handoffs require verdict and mutation check, and normalize accepted verdicts", () => {
  const base = "Outcome: done\nEvidence: ok\nChanged scope: none\nRisks: none\nOpen questions: none\nNext verification: none";
  const strictMissing = parseHandoff(base, { strict: true });
  assert.deepEqual(strictMissing.missing, ["Verdict", "Mutation check"]);
  for (const [value, expected] of [["VERIFIED", "VERIFIED"], ["DOGRULANDI", "VERIFIED"], ["ÇÜRÜTÜLDÜ", "REFUTED"], ["ölçülemedi", "UNMEASURED"], ["PASS", "PASS"], ["Warn", "WARN"], ["PARTIAL", "PARTIAL"], ["blocked", "BLOCKED"], ["FAIL", "FAIL"]]) {
    const result = parseHandoff(`${base}\nSonuç sınıfı: ${value}\nMutasyon kontrolü: none - documentation only`, { strict: true });
    assert.equal(result.ok, true, `${value}: ${result.missing.join(", ")}`);
    assert.equal(result.fields.verdict, expected);
    assert.equal(result.fields.mutationCheck, "none - documentation only");
  }
});

test("invalid verdict is a warning and helper reports invalid verdict and mutation separately", () => {
  const base = "Outcome: done\nEvidence: ok\nChanged scope: none\nRisks: none\nOpen questions: none\nNext verification: none\nVerdict: maybe";
  const parsed = parseHandoff(base);
  assert.equal(parsed.ok, true);
  assert.match(parsed.warnings.join(" "), /verdict/i);
  assert.deepEqual(validateVerdictAndMutation(base).errors, ["Verdict must be one of VERIFIED, REFUTED, UNMEASURED, PASS, WARN, PARTIAL, BLOCKED, FAIL.", "Mutation check must describe changed paths or use none - <reason>."]);
  assert.deepEqual(validateVerdictAndMutation("Verdict: verified\nMutation check: none - docs only").errors, []);
});
