import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(root, "scripts", "security-audit.mjs"), "utf8");

// The audit runs on import, so its patterns are read from the source.
function statePattern(name) {
  const line = source.split("\n").find((entry) => entry.includes(`name: "${name}"`));
  assert.ok(line, `${name} is defined`);
  const literal = /pattern: (\/.*\/[a-z]*) \}/.exec(line)?.[1];
  assert.ok(literal, `${name} has a regex literal`);
  return new Function(`return ${literal};`)();
}

// Sample paths are assembled at run time: written out whole, they would trip
// the very audits that keep user paths out of this repository.
const win = (user, rest = "project") => ["C:", "Users", user, rest].join("\\");
const fwd = (prefix, user, rest = "project") => [prefix, user, rest].join("/");

test("home-path patterns catch non-ASCII user names and leave placeholders alone", () => {
  const drive = statePattern("non-placeholder drive user path");
  const mac = statePattern("non-placeholder macOS user path");
  const linux = statePattern("non-placeholder Linux home path");
  for (const leaked of [win("\u00dclk\u00fc"), fwd("C:/Users", "\u015fule"), win("alice")]) {
    assert.ok(drive.test(leaked), "flags a real user name");
  }
  assert.ok(mac.test(fwd("/Users", "\u00e7a\u011fr\u0131")));
  assert.ok(linux.test(fwd("/home", "g\u00f6ktu\u011f")));
  for (const placeholder of [win("$env:USERNAME"), win("<you>"), win("user"), win("%USERNAME%"), win("${HOME}")]) {
    assert.ok(!drive.test(placeholder), `keeps the placeholder ${placeholder.split("\\")[2]}`);
  }
  assert.ok(!linux.test(fwd("/home", "runner", "work")), "CI runner paths stay allowed");
});

test("tracked files are listed NUL-separated, so non-ASCII paths are not quoted past the ignore check", () => {
  assert.match(source, /spawnSync\("git", \["ls-files", "-z"\]/);
  assert.match(source, /result\.stdout\.split\("\\0"\)/);
});
