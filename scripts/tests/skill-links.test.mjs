import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSkillLink, inspectSkillLink, removeSkillLink } from "../lib/skill-links.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentchef-skill-links-"));
  const agentsSkills = path.join(root, "agents", "skills");
  const claudeSkills = path.join(root, "claude", "skills");
  fs.mkdirSync(path.join(agentsSkills, "demo"), { recursive: true });
  fs.writeFileSync(path.join(agentsSkills, "demo", "SKILL.md"), "---\nname: demo\ndescription: demo\n---\n# demo\n");
  fs.mkdirSync(path.join(agentsSkills, "other"), { recursive: true });
  return { root, agentsSkills, claudeSkills };
}

test("a skill link is created as a junction/symlink and inspected as current", () => {
  const { root, agentsSkills, claudeSkills } = fixture();
  const link = path.join(claudeSkills, "demo");
  const target = path.join(agentsSkills, "demo");
  assert.equal(inspectSkillLink(link, target).status, "absent");
  const created = createSkillLink(link, target);
  assert.equal(created.status, "link-current");
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(link, "SKILL.md"), "utf8").includes("name: demo"), true, "the link resolves into the managed tree");
  assert.equal(inspectSkillLink(link, path.join(agentsSkills, "other")).status, "link-elsewhere");
  assert.equal(removeSkillLink(link), true);
  assert.equal(inspectSkillLink(link, target).status, "absent");
  assert.ok(fs.existsSync(path.join(target, "SKILL.md")), "removing the link never touches the managed tree");
  fs.rmSync(root, { recursive: true, force: true });
});

test("real directories are reported and never removed as links", () => {
  const { root, agentsSkills, claudeSkills } = fixture();
  const real = path.join(claudeSkills, "demo");
  fs.mkdirSync(real, { recursive: true });
  fs.writeFileSync(path.join(real, "SKILL.md"), "user copy\n");
  assert.equal(inspectSkillLink(real, path.join(agentsSkills, "demo")).status, "real-directory");
  assert.throws(() => removeSkillLink(real), /Refusing to remove a non-link path/);
  assert.equal(fs.readFileSync(path.join(real, "SKILL.md"), "utf8"), "user copy\n");
  const file = path.join(claudeSkills, "file-skill");
  fs.writeFileSync(file, "not a directory\n");
  assert.equal(inspectSkillLink(file, path.join(agentsSkills, "demo")).status, "not-a-directory");
  fs.rmSync(root, { recursive: true, force: true });
});

test("a link target must be a real managed directory", () => {
  const { root, agentsSkills, claudeSkills } = fixture();
  assert.throws(() => createSkillLink(path.join(claudeSkills, "missing"), path.join(agentsSkills, "missing")), /must be a real directory/);
  assert.ok(!fs.existsSync(path.join(claudeSkills, "missing")));
  fs.rmSync(root, { recursive: true, force: true });
});
