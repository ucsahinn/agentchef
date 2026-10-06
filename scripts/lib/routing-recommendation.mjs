// Weighted routing recommendation shared by the routing board, `chef --routing
// --task`, the validators, and the plugin's prompt-submit hook (which carries
// a byte-identical copy under plugins/agentchef/scripts). No file, network, or
// process access lives here, so the hook copy stays inert.

const IDENTIFIER = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
export const ROUTING_HINT_MAX_LENGTH = 300;

// NFKD splits İ into I plus a combining dot and strips accents (ç ğ ö ş ü);
// the dotless ı has no decomposition, so it is folded by hand before the
// ASCII lower-casing. Turkish locale lower-casing is avoided on purpose: it
// would turn an ASCII I into ı.
export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokens(value) {
  return normalize(value).split(" ").filter(Boolean);
}

function includesPhrase(normalizedTask, phrase) {
  return ` ${normalizedTask} `.includes(` ${normalize(phrase)} `);
}

function scoreProfile(profile, normalizedTask, catalogIndex) {
  const matchedTerms = [];
  const matchedPhrases = [];
  let score = 0;

  for (const [phrase, weight] of profile.match?.phrases || []) {
    if (includesPhrase(normalizedTask, phrase)) {
      matchedPhrases.push(phrase);
      score += weight;
    }
  }
  for (const [term, weight] of profile.match?.terms || []) {
    if (includesPhrase(normalizedTask, term)) {
      matchedTerms.push(term);
      score += weight;
    }
  }
  // An exclude term may be a phrase ("gpt pro report"); it is matched the
  // same way as a positive phrase.
  const excludedTerms = (profile.match?.excludeTerms || []).filter((term) => includesPhrase(normalizedTask, term));
  score -= 20 * excludedTerms.length;

  return { profile, catalogIndex, matchedTerms, matchedPhrases, excludedTerms, score: Math.max(0, score), priority: profile.match?.priority || 0 };
}

// "high" needs either a clear lead over the runner-up or a strong single
// signal with no comparable alternative, so one decisive word ("deploy",
// "güvenlik") still routes while two profiles scoring alike do not.
export function confidenceFor(score, nextScore) {
  const noRival = nextScore === undefined;
  if (score >= 12 && (noRival || score - nextScore >= 3)) return "high";
  if (score >= 9 && (noRival || nextScore * 2 <= score)) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export function recommendProfiles(profiles, task, limit = 3) {
  const normalizedTask = normalize(task);
  // Confidence is judged against the whole ranking, not only the entries that
  // survive the limit, so the last shown entry is not "high" by default.
  const ranked = profiles
    .map((profile, catalogIndex) => scoreProfile(profile, normalizedTask, catalogIndex))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.priority - left.priority || left.catalogIndex - right.catalogIndex)
    .map((entry, index, all) => ({ ...entry, confidence: confidenceFor(entry.score, all[index + 1]?.score) }));
  return ranked.slice(0, limit);
}

function identifier(value, label) {
  const text = String(value ?? "");
  if (!IDENTIFIER.test(text)) throw new Error(`${label} is not a catalog identifier.`);
  return text;
}

// The one line a routing match turns into: a fixed template filled only with
// validated catalog identifiers, so neither prompt text nor free text from an
// index can reach the model through it. Used by the board, chef --routing
// --task, and the prompt-submit hook, so they cannot disagree.
export function formatRoutingHint(entry, { version, cap }) {
  if (!VERSION.test(String(version))) throw new Error("version must be MAJOR.MINOR.PATCH.");
  if (!Number.isInteger(cap) || cap < 1 || cap > 4) throw new Error("cap must be an integer from 1 to 4.");
  if (!["high", "medium", "low"].includes(entry.confidence)) throw new Error("confidence must be high, medium, or low.");
  const parts = [`AgentChef route ${version}: ${identifier(entry.id, "profile id")} (${entry.confidence})`];
  if (entry.autoSkill) {
    const mode = entry.autoSkillMode === "suggest" ? "suggest skill" : "load skill";
    parts.push(`${mode}: ${identifier(entry.autoSkill, "skill")}`);
  }
  if (entry.verifier) {
    parts.push(`verifier: ${identifier(entry.verifier, "verifier")} (${entry.autoVerify === true ? "required" : "suggested"})`);
  }
  const agents = (entry.agents || []).slice(0, cap).map((agent) => identifier(agent, "agent"));
  if (agents.length) parts.push(`agents: ${agents.join(", ")}`);
  parts.push(`auto-spawn cap: ${cap}`);
  const line = parts.join(" | ");
  if (line.length > ROUTING_HINT_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(line)) throw new Error("hint line out of bounds.");
  return line;
}
