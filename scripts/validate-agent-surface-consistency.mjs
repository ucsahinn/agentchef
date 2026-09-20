#!/usr/bin/env node
// Consistency checks that structural validators cannot see.
//
// Every check here exists because a real defect shipped past the existing
// validators: they verify that catalogs, templates, and locales agree with each
// other, not that an instruction is possible to follow or that a name resolves.
//
//   1. A specialist that no routing profile can reach is documented but unused.
//   2. Two roles in different coordinator domains describing the same work
//      leave a model no basis to choose between them.
//   3. A routing profile id named in the routing skill that the catalog does
//      not define sends a reader nowhere.
//   4. A Claude role whose tools cannot run commands, while its instructions
//      ask for command output, is told to do the impossible.
//   5. A bundled skill description that names one harness as the actor will not
//      trigger on the other target, even though the skill ships to both.
//   6. A command in a bundled skill that resolves to nothing fails at step one.
//   7. An MCP server granted to a role that is not installed for that target
//      produces an allowlist entry matching nothing, which removes the very
//      capability the grant was written to give.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const BACKTICK = String.fromCharCode(96);
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

const agents = readJson("catalog/agents.json");
const routing = readJson("catalog/routing-profiles.json");
const profiles = routing.profiles || [];
const profileIds = new Set(profiles.map((profile) => profile.id));
const domainOf = new Map();
for (const domain of agents.coordinatorDomains || []) {
  for (const specialist of domain.specialists || []) domainOf.set(specialist, domain.id);
}

// 1. Every specialist has at least one profile that routes to it. Coordinators
// are description-selected by design and are deliberately not required here.
{
  const routed = new Set(profiles.flatMap((profile) => profile.agents || []));
  const unreachable = [...domainOf.keys()].filter((name) => !routed.has(name));
  if (unreachable.length > 0) {
    fail(`specialists no routing profile can reach: ${unreachable.join(", ")}`);
  }
  notes.push(`${domainOf.size} specialists across ${(agents.coordinatorDomains || []).length} domains, ${profiles.length} profiles`);
}

// 2. Distinctive phrases shared by roles that belong to different domains. A
// collision inside one domain is fine: the coordinator picks between them.
// A phrase listed here with a boundary clause is a reviewed, resolved overlap.
const collisionPhrases = [
  "Core Web Vitals",
  "structured data",
  "edge cases",
  "test strategy",
  "root cause",
  "browser evidence"
];
{
  const described = [
    ...(agents.agents || []).map((agent) => ({
      name: agent.name,
      domain: domainOf.get(agent.name) || "(none)",
      text: `${agent.templateDescription || agent.description || ""} ${agent.primaryUse || ""}`
    }))
  ];
  for (const phrase of collisionPhrases) {
    const owners = described.filter((entry) => entry.text.includes(phrase));
    const domains = new Set(owners.map((entry) => entry.domain));
    if (owners.length < 2 || domains.size < 2) continue;
    // A boundary clause naming the other role resolves the collision.
    const resolved = owners.every((entry) => owners.some((other) => other !== entry && entry.text.includes(other.name)));
    if (resolved) continue;
    fail(`"${phrase}" is claimed by roles in different domains without a boundary clause: ${owners.map((entry) => `${entry.name} (${entry.domain})`).join(", ")}`);
  }
}

// 3. Profile ids named in the routing skill must exist in the catalog. Every
// hyphenated backticked token is treated as a claim about a profile unless it
// is a name the catalogs already explain, so a missing profile cannot hide
// behind an id shape this check did not anticipate.
{
  const reference = path.join(root, "plugins/agentchef-workflows/skills/adaptive-agent-routing/references/global-working-agreements.md");
  if (fs.existsSync(reference)) {
    const referenceText = fs.readFileSync(reference, "utf8");
    const skillCatalog = readJson("catalog/skills.json");
    const known = new Set([
      ...(agents.agents || []).map((agent) => agent.name),
      ...(agents.coordinators || []).map((coordinator) => coordinator.name),
      ...(agents.coordinatorDomains || []).map((domain) => domain.id),
      ...(skillCatalog.skills || []).map((skill) => skill.name),
      ...Object.keys(skillCatalog.compatibilityAliases || {}),
      ...(readJson("catalog/mcp-servers.json").servers || []).map((server) => server.name)
    ]);
    // Hyphenated tokens that are prose, flags, or file names, not routing ids.
    const notProfileIds = new Set([
      "read-only", "workspace-write", "official-first", "use-when-available-and-approved",
      "narrowest-owner", "parent-routed-handoff", "agents-md", "claude-md", "pre-commit",
      "dual-agent-brain", "cross-domain", "single-owner", "no-network", "on-request",
      "web-search", "danger-full-access", "ignore-rules", "zero-network", "read-write"
    ]);
    const tokenPattern = new RegExp(BACKTICK + "([a-z][a-z0-9]*(?:-[a-z0-9]+)+)" + BACKTICK, "g");
    const phantom = [...new Set([...referenceText.matchAll(tokenPattern)].map((match) => match[1]))]
      .filter((name) => !known.has(name) && !notProfileIds.has(name) && !profileIds.has(name));
    if (phantom.length > 0) {
      fail("routing reference names hyphenated ids that no catalog defines: " + phantom.join(", "));
    }
  }
}

// 4. A rendered Claude role that cannot run commands must say so, because its
// instruction body still asks for command output.
{
  const agentsDir = path.join(root, "plugins/agentchef-workflows/agents");
  const commandEvidence = /\bgit diff\b|\bsecret-scan output\b|\brun the test suite\b/i;
  const caveat = /cannot run commands/i;
  for (const file of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((name) => name.endsWith(".md")) : []) {
    const text = fs.readFileSync(path.join(agentsDir, file), "utf8");
    const frontmatter = text.slice(0, text.indexOf("\n---", 4) + 1);
    if (!/^disallowedTools:.*\bBash\b/m.test(frontmatter)) continue;
    if (!commandEvidence.test(text)) continue;
    if (caveat.test(text)) continue;
    fail(`${file} cannot run commands but asks for command output without saying so`);
  }
}

// 5. A bundled skill ships to both targets, so its description must not name
// one harness as the actor performing the work.
{
  const skillsDir = path.join(root, "plugins/agentchef-workflows/skills");
  // The harness named as the actor performing the work, rather than as the
  // object being maintained: "Codex work", "when Codex should", "Codex agent".
  const harnessActor = /\b(?:Codex|Claude Code)\s+(?:work|agent|session|should|must|will|needs? to)\b|\b(?:when|before|after)\s+(?:Codex|Claude Code)\b/;
  for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const match = text.match(/^description:\s*(.+)$/m);
    if (!match) continue;
    const description = match[1];
    // Naming both harnesses together is a statement of scope, not an actor.
    if (description.includes("Codex") && description.includes("Claude")) continue;
    if (harnessActor.test(description)) {
      fail(`${name}: the skill description names one harness as the actor, so it will not trigger on the other target: ${description.slice(0, 110)}`);
    }
  }
}

// 6. A command a bundled skill tells the reader to run has to resolve. Scoped
// to the bug class this exists for: naming this product's own tooling by a
// command that does not exist, or a package script that was never defined.
{
  const skillsDir = path.join(root, "plugins/agentchef-workflows/skills");
  const packageScripts = new Set(Object.keys(readJson("package.json").scripts || {}));
  // Names a reader could mistake for an installed entry point of this product.
  const ourBinaries = /^(chef|agentchef|codex-chef)\b/;
  for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/`([a-z][^`\n]{2,100})`/g)) {
      const command = match[1].trim();
      if (ourBinaries.test(command)) {
        fail(`${name}: names \`${command.slice(0, 60)}\`, but this package ships no such binary; name the command a reader can actually run`);
        continue;
      }
      if (command.startsWith("npm run ")) {
        const script = command.slice("npm run ".length).split(/\s+/)[0];
        if (!packageScripts.has(script)) fail(`${name}: names \`npm run ${script}\`, which package.json does not define`);
        continue;
      }
      if (command.startsWith("node ")) {
        const target = command.split(/\s+/)[1] || "";
        // A placeholder root is fine as long as the script path under it exists.
        const relative = target.replace(/^<[^>]+>[\\/]/, "");
        if (relative.endsWith(".mjs") && !fs.existsSync(path.join(root, relative))) {
          fail(`${name}: names \`node ${target}\`, which does not resolve to a file in this repository`);
        }
      }
    }
  }
}

// 7. A granted MCP server has to exist and has to be one AgentChef installs
// for Claude Code. A name that matches nothing produces an allowlist entry
// granting nothing, which silently removes the capability it was written to
// give.
{
  const catalogued = new Set((readJson("catalog/mcp-servers.json").servers || []).map((server) => server.name));
  // Kept in step with claudeDefaultServers in lib/claude-mcp-merge.mjs.
  const installedForClaude = new Set(["context7", "serena"]);
  for (const agent of agents.agents || []) {
    for (const server of agent.claudeMcp || []) {
      if (!catalogued.has(server)) {
        fail(agent.name + ' is granted MCP server "' + server + '", which catalog/mcp-servers.json does not define');
        continue;
      }
      if (!installedForClaude.has(server)) {
        fail(agent.name + ' is granted MCP server "' + server + '", which AgentChef does not install for the Claude target, so the grant would never resolve');
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Agent surface consistency validation failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`Agent surface consistency validation passed. ${notes.join("; ")}.`);
