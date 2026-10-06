import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { confidenceFor, formatRoutingHint, normalize, recommendProfiles } from "../lib/routing-recommendation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const routing = JSON.parse(fs.readFileSync(path.join(root, "catalog", "routing-profiles.json"), "utf8"));
const profiles = routing.profiles;

// Natural requests in both languages, with the profile each must rank first.
const golden = [
  ["bu repo'nun haritasını çıkar, mimariyi anlamadan değişiklik yapmayalım", "repo-map-before-change"],
  ["map the repository ownership and call paths before this broad change", "repo-map-before-change"],
  ["bu kütüphanenin güncel resmi dokümantasyonuna bak, API değişmiş olabilir", "current-docs-research"],
  ["check the official docs for the current version of this library", "current-docs-research"],
  ["derin araştırma yap, kaynakları karşılaştır ve kanıt ledger'ı çıkar", "evidence-backed-research"],
  ["do a deep research market review with a source ledger and explicit uncertainty", "evidence-backed-research"],
  ["bu kural nereye yazılmalı, AGENTS.md mi skill mi hook mu?", "context-surface-decision"],
  ["where should this context live: agents md, a skill, or a config profile?", "context-surface-decision"],
  ["test başarısız oluyor, kök nedeni bul", "bug-root-cause"],
  ["çalışmıyor, hata ayıkla", "bug-root-cause"],
  ["the failing CI test is a regression, find the root cause before fixing", "bug-root-cause"],
  ["yeni özellik ekle: kullanıcı profil sayfasına dışa aktarma", "bounded-feature"],
  ["implement a new feature that exports the report as CSV", "bounded-feature"],
  ["read-only data lineage and data quality evidence for the catalog", "data-systems"],
  ["veri soyağacı ve veri kalitesi kanıtlarını çıkar", "data-systems"],
  ["arayüzdeki buton mobilde bozuk görünüyor, ekran görüntüsüyle kontrol et", "frontend-ui"],
  ["check the responsive layout and browser evidence for the new UI", "frontend-ui"],
  ["güvenlik incelemesi yap: kimlik doğrulama ve yetkilendirme", "security-sensitive"],
  ["threat model the auth and access control paths before we ship", "security-sensitive"],
  ["sızıntı var mı, parola ve token kullanımına bak", "security-sensitive"],
  ["review this PR", "code-review"],
  ["şu diff'i incele, kodu gözden geçir", "code-review"],
  ["do a code review of the pull request before merge", "code-review"],
  ["MCP sunucusu için tool allowlist ve OAuth ayarlarını değiştir", "mcp-connector-change"],
  ["add an MCP connector with a narrow tool allowlist", "mcp-connector-change"],
  ["yayına al: sürüm çıkar, etiket oluştur ve GitHub release yap", "release-or-publish"],
  ["deploy", "release-or-publish"],
  ["create the tag and publish the GitHub release", "release-or-publish"],
  ["SEO denetimi: site haritası, canonical ve arama motoru indekslemesi", "seo-web-quality"],
  ["run an SEO audit for structured data and core web vitals", "seo-web-quality"],
  ["ilk kurulum yapan kullanıcı için sorun giderme ve kullanıcı desteği", "onboarding-support"],
  ["onboarding support: setup diagnostics and recovery guidance", "onboarding-support"],
  ["README güncelle ve sürüm notlarını yaz", "docs-and-adrs"],
  ["write the ADR and update the setup guide", "docs-and-adrs"],
  ["dış inceleme için repository snapshot hazırla, ikinci model baksın", "external-deep-review"],
  ["prepare a manual handoff snapshot for an external review by a second model", "external-deep-review"],
  ["GPT Pro proje bağlam paketi ve subsystem zip hazırla", "gptpro-project-context"],
  ["GPT Pro raporunu canlı kodla doğrula", "gptpro-report-verification"],
  ["kurulum sağlığı: managed file drift ve process hygiene kontrolü", "starter-health"],
  ["starter health: runtime verification and managed file drift", "starter-health"]
];

// Short, synthetic, or conversational turns must never produce a high-confidence route.
const negatives = [
  "devam",
  "evet tamam",
  "thanks",
  "ok",
  "summarize the above",
  "yukarıdakini özetle",
  "ne demek istedin?",
  "bunu türkçe söyle",
  "/agentchef:fetch",
  "$agentchef:gptpro",
  "!git status",
  "<task-notification> done </task-notification>",
  "[Subagent hand-back] Outcome: done",
  "merhaba nasılsın",
  "biraz daha açıklar mısın"
];

test("normalize folds Turkish letters, including the dotless ı, and strips punctuation", () => {
  assert.equal(normalize("ÇALIŞMIYOR, hata!"), "calismiyor hata");
  assert.equal(normalize("İstanbul ışık"), "istanbul isik");
  assert.equal(normalize("Dönüş   biçimi"), "donus bicimi");
  assert.equal(normalize("I am"), "i am", "an ASCII I is never turned into a dotless ı");
});

test("every golden prompt ranks its profile first", () => {
  const misses = [];
  for (const [task, expected] of golden) {
    const top = recommendProfiles(profiles, task)[0];
    if (top?.profile.id !== expected) misses.push(`${JSON.stringify(task)} -> ${top?.profile.id ?? "none"} (expected ${expected})`);
  }
  assert.deepEqual(misses, []);
});

test("most golden prompts reach high confidence, and none routes to the wrong profile with high confidence", () => {
  let high = 0;
  const wrong = [];
  for (const [task, expected] of golden) {
    const top = recommendProfiles(profiles, task)[0];
    if (top?.confidence === "high") {
      high += 1;
      if (top.profile.id !== expected) wrong.push(task);
    }
  }
  assert.deepEqual(wrong, []);
  assert.ok(high >= 30, `only ${high}/${golden.length} golden prompts reached high confidence`);
});

test("negative prompts never produce a high-confidence route", () => {
  const fired = negatives.filter((task) => recommendProfiles(profiles, task)[0]?.confidence === "high");
  assert.deepEqual(fired, []);
});

test("multi-word exclude terms demote a profile", () => {
  const top = recommendProfiles(profiles, "gpt pro report verify the returned findings")[0];
  assert.equal(top.profile.id, "gptpro-report-verification");
  assert.ok(!recommendProfiles(profiles, "gpt pro report verify the returned findings").some((entry) => entry.profile.id === "gptpro-project-context" && entry.score > 0));
});

test("confidence is judged against the whole ranking, not the shown slice", () => {
  const all = recommendProfiles(profiles, "security review of the auth and oauth connector tools", 10);
  const shown = recommendProfiles(profiles, "security review of the auth and oauth connector tools", 2);
  assert.deepEqual(shown.map((entry) => entry.confidence), all.slice(0, 2).map((entry) => entry.confidence));
  assert.equal(confidenceFor(12, 9), "high");
  assert.equal(confidenceFor(12, 10), "medium");
  assert.equal(confidenceFor(10, undefined), "high");
  assert.equal(confidenceFor(10, 5), "high");
  assert.equal(confidenceFor(10, 6), "medium");
  assert.equal(confidenceFor(5, undefined), "low");
});

test("the hint line is built only from catalog identifiers", () => {
  const line = formatRoutingHint({ id: "security-sensitive", confidence: "high", autoSkill: "security-best-practices", autoSkillMode: "suggest", verifier: "security_auditor", autoVerify: true, agents: ["security_auditor", "code_reviewer", "extra_agent"] }, { version: "1.3.4", cap: 2 });
  assert.equal(line, "AgentChef route 1.3.4: security-sensitive (high) | suggest skill: security-best-practices | verifier: security_auditor (required) | agents: security_auditor, code_reviewer | auto-spawn cap: 2");
  assert.ok(line.length <= 300);
  assert.throws(() => formatRoutingHint({ id: "ok; rm -rf", confidence: "high", agents: [] }, { version: "1.3.4", cap: 2 }), /identifier/);
  assert.throws(() => formatRoutingHint({ id: "code-review", confidence: "high", agents: ["x y"] }, { version: "1.3.4", cap: 2 }), /identifier/);
  assert.throws(() => formatRoutingHint({ id: "code-review", confidence: "high", agents: [] }, { version: "1.3.4", cap: 9 }), /cap/);
  assert.throws(() => formatRoutingHint({ id: "code-review", confidence: "high", agents: [] }, { version: "latest", cap: 2 }), /version/);
});
