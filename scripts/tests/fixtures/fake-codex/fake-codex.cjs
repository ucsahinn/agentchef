const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (args[0] === "login" && args[1] === "status") process.exit(process.env.FAKE_CODEX_LOGIN === "fail" ? 1 : 0);
if (args[0] === "exec" && args[1] === "--help") { console.log("--json --output-schema -o resume"); process.exit(0); }
const worktree = args[args.indexOf("-C") + 1];
const output = args[args.indexOf("-o") + 1];
const schemaPath = args[args.indexOf("--output-schema") + 1];
const prompt = fs.readFileSync(0, "utf8");
if (!args.includes("-C") || !args.includes("-o") || !args.includes("--output-schema") || !args.includes("-s") || (process.env.AGENTCHEF_TEAM_TASK !== "TASK-VERIFIER" && !prompt.includes("Team rules"))) process.exit(31);
if (process.env.AGENTCHEF_TEAM_TASK === "TASK-VERIFIER" && prompt.includes("## Team rules")) process.exit(35);
const scenarioFile = path.join(worktree, ".fake-scenario");
const scenario = process.env.FAKE_CODEX_SCENARIO || (fs.existsSync(scenarioFile) ? fs.readFileSync(scenarioFile, "utf8").trim() : "ok");
if (scenario === "crash") { console.error("simulated crash"); process.exit(9); }
if (scenario === "slow") { setTimeout(() => process.exit(0), 30000); return; }
if (scenario === "usage-limit") { console.log(JSON.stringify({ type: "error", message: "weekly limit reached" })); process.exit(1); }
if (scenario === "ok" || scenario === "verifier-pass" || scenario === "verifier-fail" || scenario === "verifier-warn" || scenario === "outside-scope" || scenario === "conflict" || scenario === "read-only" || scenario === "no-handoff" || scenario === "invalid-handoff") {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  void schema;
  const file = scenario === "conflict" ? "src/conflict.txt" : "src/change.txt";
  if (scenario !== "read-only" && process.env.AGENTCHEF_TEAM_TASK !== "TASK-VERIFIER") { fs.mkdirSync(path.dirname(path.join(worktree, file)), { recursive: true }); fs.writeFileSync(path.join(worktree, file), `worker output ${scenario}\n`); }
  if (scenario === "outside-scope") fs.writeFileSync(path.join(worktree, "escape.txt"), "outside scope\n");
  const changed = scenario === "read-only" || process.env.AGENTCHEF_TEAM_TASK === "TASK-VERIFIER" ? [] : scenario === "conflict" ? ["src/conflict.txt"] : ["src/change.txt"];
  const verdict = scenario === "verifier-fail" && process.env.AGENTCHEF_TEAM_TASK === "TASK-VERIFIER" ? "fail" : scenario === "verifier-warn" && process.env.AGENTCHEF_TEAM_TASK === "TASK-VERIFIER" ? "warn" : "pass";
  const value = { outcome: "fixture complete", evidence: [], changedScope: changed, risks: [], openQuestions: [], needs: [], nextVerification: "none", verdict, mutationCheck: { claimedPaths: changed, outsideScope: [] } };
  if (scenario === "invalid-handoff") fs.writeFileSync(output, JSON.stringify({ outcome: "invalid" }));
  else if (scenario !== "no-handoff") fs.writeFileSync(output, JSON.stringify(value));
  console.log(JSON.stringify({ type: "thread.started", thread_id: "fake-thread-1" }));
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(value) } }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 11, cached_input_tokens: 3, output_tokens: 7 } }));
  process.exit(0);
}
process.exit(32);
