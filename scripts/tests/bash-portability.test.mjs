import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Unix installer avoids Bash 4-only mapfile so macOS system Bash can acquire locks", () => {
  const installer = fs.readFileSync(path.join(root, "scripts", "install.sh"), "utf8");
  assert.doesNotMatch(
    installer,
    /\bmapfile\b/,
    "macOS ships Bash 3.2, which has no mapfile builtin; lock-root collection must use portable shell syntax"
  );
});
