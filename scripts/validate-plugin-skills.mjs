#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const failures = [];

const pluginManifestRel = "plugins/codex-chef-workflows/.codex-plugin/plugin.json";
const pluginManifestPath = path.join(root, pluginManifestRel);
const expectedBundledSkills = new Set([
  "adaptive-agent-routing",
  "codex-chef-operator",
  "context-budget-planner",
  "evidence-research",
  "external-review-workflow",
  "fetch",
  "gptpro",
  "gptpro-handoff",
  "offline-diagram-triplet",
  "seo"
]);

function posix(filePath) {
  return filePath.split(path.sep).join("/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseFrontmatter(text, rel) {
  if (!text.startsWith("---\n")) {
    failures.push(`${rel} must start with YAML frontmatter.`);
    return {};
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    failures.push(`${rel} frontmatter must close with --- on its own line.`);
    return {};
  }
  const frontmatter = text.slice(4, end).trim();
  const data = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      failures.push(`${rel} frontmatter contains an unsupported line: ${line}`);
      continue;
    }
    const rawValue = match[2].trim();
    const isDoubleQuoted = rawValue.startsWith("\"") && rawValue.endsWith("\"");
    const isSingleQuoted = rawValue.startsWith("'") && rawValue.endsWith("'");
    if (rawValue.includes(": ") && !isDoubleQuoted && !isSingleQuoted) {
      failures.push(`${rel} frontmatter ${match[1]} must quote YAML values containing ': '.`);
    }
    if (
      (rawValue.startsWith("\"") && !rawValue.endsWith("\""))
      || (rawValue.startsWith("'") && !rawValue.endsWith("'"))
    ) {
      failures.push(`${rel} frontmatter ${match[1]} has an unterminated quoted value.`);
    }
    data[match[1]] = rawValue.replace(/^["']|["']$/g, "");
  }
  const keys = Object.keys(data).sort();
  if (keys.join(",") !== "description,name") {
    failures.push(`${rel} frontmatter must contain only name and description.`);
  }
  return data;
}

function parseSimpleOpenAiYaml(text, rel) {
  const displayName = text.match(/^\s{2}display_name:\s*"([^"]+)"/m)?.[1];
  const shortDescription = text.match(/^\s{2}short_description:\s*"([^"]+)"/m)?.[1];
  const defaultPrompt = text.match(/^\s{2}default_prompt:\s*"([^"]+)"/m)?.[1];
  const allowImplicit = text.match(/^\s{2}allow_implicit_invocation:\s*(true|false)/m)?.[1];
  if (!/^interface:\s*$/m.test(text)) failures.push(`${rel} must include an interface block.`);
  if (!/^policy:\s*$/m.test(text)) failures.push(`${rel} must include a policy block.`);
  if (!displayName) failures.push(`${rel} must define interface.display_name.`);
  if (!shortDescription) failures.push(`${rel} must define interface.short_description.`);
  if (!defaultPrompt) failures.push(`${rel} must define interface.default_prompt.`);
  if (!allowImplicit) failures.push(`${rel} must define policy.allow_implicit_invocation.`);
  return { shortDescription, defaultPrompt };
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function checkPublicSafeText(filePath) {
  const rel = posix(path.relative(root, filePath));
  const text = readText(filePath);
  const forbiddenPatterns = [
    { name: "non-placeholder drive user path", pattern: /[A-Za-z]:[\\/]Users[\\/](?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i },
    { name: "non-placeholder macOS user path", pattern: /\/Users\/(?!user\b|username\b|you\b|yourname\b|yourusername\b)[A-Za-z0-9._-]+/i },
    { name: "non-placeholder Linux home path", pattern: /\/home\/(?!user\b|username\b|you\b|yourname\b|yourusername\b|runner\b)[A-Za-z0-9._-]+/i },
    { name: "OpenAI/API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
    { name: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/ },
    { name: "private key marker", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
    { name: "secret-like assignment", pattern: /\b(?:api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["'][^"']{16,}["']/i },
    { name: "placeholder marker", pattern: /\b(?:TODO|TBD|lorem ipsum)\b/i }
  ];
  for (const { name, pattern } of forbiddenPatterns) {
    if (pattern.test(text)) failures.push(`${name} found in ${rel}`);
  }
}

if (!fs.existsSync(pluginManifestPath)) {
  failures.push(`Missing plugin manifest: ${pluginManifestRel}`);
} else {
  const plugin = JSON.parse(readText(pluginManifestPath));
  if (plugin.name !== "codex-chef-workflows") {
    failures.push(`${pluginManifestRel} must keep name codex-chef-workflows.`);
  }
  if (typeof plugin.skills !== "string") {
    failures.push(`${pluginManifestRel} must declare skills as a string path.`);
  } else {
    const skillsDir = path.resolve(path.dirname(pluginManifestPath), "..", plugin.skills);
    if (!fs.existsSync(skillsDir)) {
      failures.push(`Plugin skills path does not exist: ${plugin.skills}`);
    } else {
      const catalog = JSON.parse(readText(path.join(root, "catalog/skills.json")));
      const catalogByName = new Map((catalog.skills || []).map((skill) => [skill.name, skill]));
      const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const seen = new Set();

      for (const expectedSkill of expectedBundledSkills) {
        if (!skillDirs.includes(expectedSkill)) {
          failures.push(`Missing bundled plugin skill: ${expectedSkill}`);
        }
      }

      for (const skillName of skillDirs) {
        if (seen.has(skillName)) failures.push(`Duplicate bundled plugin skill: ${skillName}`);
        seen.add(skillName);
        const skillDir = path.join(skillsDir, skillName);
        const skillRel = posix(path.relative(root, skillDir));
        const skillMdPath = path.join(skillDir, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) {
          failures.push(`${skillRel} must include SKILL.md.`);
          continue;
        }

        const skillMdText = readText(skillMdPath);
        const frontmatter = parseFrontmatter(skillMdText, `${skillRel}/SKILL.md`);
        if (frontmatter.name !== skillName) {
          failures.push(`${skillRel}/SKILL.md name must match folder name.`);
        }
        const description = frontmatter.description || "";
        if (description.length < 80 || description.length > 500) {
          failures.push(`${skillRel}/SKILL.md description should be 80-500 characters for reliable routing.`);
        }
        if (!/references\//.test(skillMdText) && !/references\\/.test(skillMdText)) {
          failures.push(`${skillRel}/SKILL.md must route to a references/ file.`);
        }

        const referencesDir = path.join(skillDir, "references");
        if (!fs.existsSync(referencesDir)) {
          failures.push(`${skillRel} must include references/.`);
        } else {
          const referenceFiles = fs.readdirSync(referencesDir).filter((file) => file.endsWith(".md"));
          if (referenceFiles.length < 1) {
            failures.push(`${skillRel}/references must include at least one markdown reference.`);
          }
          for (const file of referenceFiles) {
            const referenceText = readText(path.join(referencesDir, file));
            if (!referenceText.startsWith("# ")) {
              failures.push(`${skillRel}/references/${file} must start with an H1.`);
            }
          }
        }

        const openAiYamlPath = path.join(skillDir, "agents", "openai.yaml");
        if (!fs.existsSync(openAiYamlPath)) {
          failures.push(`${skillRel} must include agents/openai.yaml.`);
        } else {
          const openAi = parseSimpleOpenAiYaml(readText(openAiYamlPath), `${skillRel}/agents/openai.yaml`);
          if (openAi.shortDescription && (openAi.shortDescription.length < 25 || openAi.shortDescription.length > 80)) {
            failures.push(`${skillRel}/agents/openai.yaml short_description should be 25-80 characters.`);
          }
          if (openAi.defaultPrompt && !openAi.defaultPrompt.includes(`$${skillName}`)) {
            failures.push(`${skillRel}/agents/openai.yaml default_prompt must mention $${skillName}.`);
          }
        }

        const catalogEntry = catalogByName.get(skillName);
        if (!catalogEntry) {
          failures.push(`catalog/skills.json must include bundled local skill ${skillName}.`);
        } else {
          if (catalogEntry.install !== false) {
            failures.push(`Bundled local skill ${skillName} must keep install=false in catalog/skills.json.`);
          }
          if (!/bundled|local|plugin/i.test(catalogEntry.reason || "")) {
            failures.push(`Bundled local skill ${skillName} catalog reason must mention bundled/local/plugin scope.`);
          }
        }

        for (const file of walk(skillDir)) checkPublicSafeText(file);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Plugin skill validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Plugin skill validation passed.");
