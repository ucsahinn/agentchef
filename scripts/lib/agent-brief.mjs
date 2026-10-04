// The task brief and handoff contract shared by agents (Claude, Codex, and
// their subagents). A brief is plain Markdown with one labeled field per
// section; English and Turkish labels are both accepted, so a brief written
// in either language parses the same way.
//
//   Goal / Hedef                                   what done means for the user
//   Evidence / Kanıt                               commands, paths, observations
//   Scope / Kapsam (write scope / yazma kapsamı)   what may change
//   Boundaries / Sınırlar                          what must not change
//   Done when / Bitti kriteri                      checkable acceptance
//   Return format / Dönüş biçimi                   the handoff fields below
//   User's words / Kullanıcının özgün cümlesi      the user's request, verbatim
//
// A handoff returns: Outcome / Sonuç, Evidence / Kanıt, Changed scope /
// Değişen kapsam, Risk, Open questions / Açık soru, Next verification /
// Sıradaki doğrulama.

export const BRIEF_FIELDS = Object.freeze([
  { key: "goal", labels: ["Goal", "Hedef"] },
  { key: "evidence", labels: ["Evidence", "Kanıt", "Kanit"] },
  { key: "scope", labels: ["Write scope", "Scope", "Yazma kapsamı", "Yazma kapsami", "Kapsam"] },
  { key: "boundaries", labels: ["Boundaries", "Sınırlar", "Sinirlar"] },
  { key: "doneWhen", labels: ["Done when", "Bitti kriteri"] },
  { key: "returnFormat", labels: ["Return format", "Dönüş biçimi", "Donus bicimi", "Dönüş", "Donus"] },
  { key: "userWords", labels: ["User's words", "User words", "Kullanıcının özgün cümlesi", "Kullanicinin ozgun cumlesi"] }
]);

export const HANDOFF_FIELDS = Object.freeze([
  { key: "outcome", labels: ["Outcome", "Sonuç", "Sonuc"] },
  { key: "evidence", labels: ["Evidence", "Kanıt", "Kanit"] },
  { key: "changedScope", labels: ["Changed scope", "Değişen kapsam", "Degisen kapsam"] },
  { key: "risk", labels: ["Risks", "Risk"] },
  { key: "openQuestions", labels: ["Open questions", "Open question", "Açık soru", "Acik soru"] },
  { key: "nextVerification", labels: ["Next verification", "Sıradaki doğrulama", "Siradaki dogrulama"] }
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A field starts on a line that is the label, optionally as a Markdown
// heading, list item, or bold text, followed by ":" or the end of the line.
function labelPattern(fields) {
  const labels = fields.flatMap((field) => field.labels.map((label) => ({ key: field.key, label })))
    .sort((left, right) => right.label.length - left.label.length);
  const alternatives = labels.map(({ label }) => escapeRegExp(label)).join("|");
  const pattern = new RegExp(`^\\s*(?:#{1,6}\\s*|[-*]\\s+)?(?:\\*\\*)?(${alternatives})(?:\\*\\*)?\\s*(?:[:：]\\s*(?:\\*\\*)?\\s*(.*))?$`, "iu");
  const keyFor = new Map(labels.map(({ key, label }) => [label.toLocaleLowerCase("tr"), key]));
  return { pattern, keyFor };
}

function parseFields(text, fields) {
  const { pattern, keyFor } = labelPattern(fields);
  const values = {};
  let current = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (match) {
      current = keyFor.get(match[1].toLocaleLowerCase("tr"));
      values[current] = values[current] ? `${values[current]}\n${match[2] ?? ""}` : (match[2] ?? "");
      continue;
    }
    if (current) values[current] = `${values[current]}\n${line}`;
  }
  const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
  const missing = fields.filter((field) => !trimmed[field.key]).map((field) => field.labels[0]);
  return { ok: missing.length === 0, fields: trimmed, missing };
}

export function parseBrief(text) {
  return parseFields(text, BRIEF_FIELDS);
}

export function parseHandoff(text) {
  return parseFields(text, HANDOFF_FIELDS);
}
