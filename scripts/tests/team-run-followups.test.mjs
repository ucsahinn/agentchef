import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
test("merge rejects the unreachable skip-conflicted option",()=>{
  const result=spawnSync(process.execPath,[path.join(root,"scripts/team-run.mjs"),"merge","--run","R-test","--state","unused.json","--skip-conflicted"],{cwd:root,encoding:"utf8",windowsHide:true});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/merge does not accept --skip-conflicted/);
});
