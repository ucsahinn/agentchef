// Claude Code reads ~/.claude/skills/, not ~/.agents/skills/. Instead of a
// second managed copy, each managed skill is exposed to Claude through a
// directory link (Windows junction, POSIX symlink) that points at the single
// AgentChef-managed tree under AGENTS_HOME. Foreign real directories are
// never replaced without explicit adoption.
import fs from "node:fs";
import path from "node:path";

function lstatOrNull(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function comparable(value) {
  const resolved = path.resolve(value).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function inspectSkillLink(linkPath, targetPath) {
  const stat = lstatOrNull(linkPath);
  if (!stat) return { status: "absent", linkPath, targetPath };
  if (stat.isSymbolicLink()) {
    let resolvedTarget;
    try {
      resolvedTarget = fs.readlinkSync(linkPath);
    } catch (error) {
      return { status: "unreadable-link", linkPath, targetPath, reason: error.message };
    }
    const absoluteTarget = path.isAbsolute(resolvedTarget) ? resolvedTarget : path.resolve(path.dirname(linkPath), resolvedTarget);
    const current = comparable(absoluteTarget) === comparable(targetPath);
    return { status: current ? "link-current" : "link-elsewhere", linkPath, targetPath, resolvedTarget: absoluteTarget };
  }
  if (stat.isDirectory()) return { status: "real-directory", linkPath, targetPath };
  return { status: "not-a-directory", linkPath, targetPath };
}

export function createSkillLink(linkPath, targetPath) {
  const targetStat = lstatOrNull(targetPath);
  if (!targetStat || !targetStat.isDirectory() || targetStat.isSymbolicLink()) {
    throw new Error(`Skill link target must be a real directory: ${targetPath}`);
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(path.resolve(targetPath), linkPath, process.platform === "win32" ? "junction" : "dir");
  return inspectSkillLink(linkPath, targetPath);
}

export function removeSkillLink(linkPath) {
  const stat = lstatOrNull(linkPath);
  if (!stat) return false;
  if (!stat.isSymbolicLink()) throw new Error(`Refusing to remove a non-link path as a skill link: ${linkPath}`);
  fs.unlinkSync(linkPath);
  return true;
}
