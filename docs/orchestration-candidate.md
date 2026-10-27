# Orchestration candidate

This work extends the 1.8.6 team runtime. It is an unpublished candidate for a
proposed 1.9.0 release; the package version remains 1.8.6 until user approval.
No second executor or brief/handoff contract is introduced.

| Brief item | Implementation surface | Acceptance |
| --- | --- | --- |
| Y8 | codex-exec worker overrides | Worker-only max_depth 1 and measured max_threads, at most 8; role TOMLs preserve interactive capacity |
| Y15 / AS-A2 | orchestration-engines catalog and validator | Continuation, MCP delivery, suitability; adapter availability is separate |
| Y16 / AS-C3 | team-run setupJournal | Proposed plan, consumed human start approval, apply and failed-start rollback |
| Y17 / AS-G1/G2 | skill-lifecycle | Draft, lint, hash-bound approval, publish readiness and version ledger; divergent engine views refuse readiness |
| I2 | team-runtime ownership, team-run | Single active file owner; overlapping scopes become ordered dependencies when serialization is selected |
| Y12 | team-run lead-review | Claude review evidence binds to the successful integration commit; required before verify and merge |
| H3 | routing-profiles, team-run verify | Default verifier plus every selected autoVerify profile's verifier |
| H5 | collect, integrate | Collect stores a scanned immutable patch without committing; existing worker commits are folded into it with a warning |
| I3 | workerResources, workerEnv, cleanup | Shared run cache, disjoint port ranges; cleanup requires explicit approval |
| Y6 | agent-brief field registry, rendered schemas | Existing seven brief and six handoff fields; optional existing fields stay optional |
| Y7 | evals, run-orchestration-evals | Three seed tasks, evidence records and weighted scoring; twenty-task rubric awaits the lead |
| Y5 | adaptive-agent-routing | One worker for sequential work, independent teams sized to scope and live capacity |
| AS-E4 | team-worker.config.toml, validators | node_repl and managed MCPs parked only in the worker process; no global config override |

## Existing runtime entry points

`beyin takim` remains the team-run entry point. Plan and start still use the
existing `baslat` approval artifact and merge uses `birlestir`. Engine metadata
does not implement a Claude team-run worker adapter. The interactive Claude
lead remains responsible for decisions and review.

Plans can include `routingProfiles: ["release-or-publish"]`. Profiles come
from `catalog/routing-profiles.json`; unknown IDs fail planning. The default
test_verifier and mandatory selected roles run independently of implementation.
Read-only report runs retain the existing collected-report completion behavior;
this does not close board tasks as independently verified work.

Select `plan --serialize-overlaps` to order workers sharing files. Independent
owners can run together; a dependent receives the collected predecessor patches
before launch. The lease is transferred only after evidence and a linked report
reach review. Failed dependencies block dependent work. Collection records patch
hashes, and integration checks them before committing. Existing legacy collected
records retain their integration path. Worker commits are folded into the delivery
patch with a warning; the worker prompt still says not to commit.

Integration records a pending commit intent in the same run record before
applying the patch, using a temporary index to calculate its target tree. A failed
Git commit reverses only its applied patch and allows retry. If the commit
succeeds but the record write fails, retry recognizes the exact parent, tree
and subject and reconciles the worker without committing twice. If a process
stops after apply, retry reverses only the exact recorded patch with the expected
index tree and no unstaged or untracked changes. Unrelated changes or incomplete
inheritance checkpoints fail closed and preserve the worktree for inspection.

After integration, the Claude lead writes a JSON review:

```json
{"engine":"claude","reviewer":"lead-session","verdict":"pass","integrationCommit":"<40-character integration HEAD>","evidence":["review.md:10 - diff inspected against all briefs"]}
```

Record it with `node scripts/team-run.mjs lead-review --run R-example --state board.json --review-file review.json`.
The report is evidence supplied by the operator; typed reviewer metadata is not
cryptographic proof of model identity. Changed integration commits invalidate it.
Legacy verified runs can attach this evidence when their successful integration
commit is still present and matches the integration worktree HEAD.
Then run the existing verify and human-approved merge steps.

Workers receive `npm_config_cache`, `AGENTCHEF_PORT_START` and
`AGENTCHEF_PORT_END`. Applications must honor their assigned port interval.
Cache sharing does not install packages or share node_modules. Worktrees are
retained by default. `cleanup --approved` or `merge --cleanup-approved` expresses
explicit cleanup approval after reviewing paths; the existing ownership checks
still apply. Skill publication and installed-home changes remain separate approvals.

## Structured contracts and skill readiness

`schemas/agent-brief.schema.json` and `schemas/agent-handoff.schema.json` are
rendered from `scripts/lib/agent-brief.mjs`. The existing brief-check and
handoff-check accept their JSON objects as well as Markdown. The team's existing
strict worker-output schema retains arrays, needs, verdict and mutation checks.
Use a schema file with `codex exec --output-schema`; Claude accepts the schema
JSON through `claude -p --output-format json --json-schema`. See the
[Codex CLI reference](https://developers.openai.com/codex/cli/reference/) and
[Claude CLI reference](https://code.claude.com/docs/en/cli-reference).

`node scripts/skill-lifecycle.mjs draft --source SKILL.md --ledger tmp/skill.json`
starts a repo-local ledger. Repeat with `lint`, then `approve --approval approval.json`
where approval contains `{digest, approvedBy:"user", approvedAt}`. Finally,
`publish --version 1.0.0 --views views.json` checks `{codex:digest, claude:digest}`
and records **publish-ready**. It never uploads, installs or publishes externally.
Source changes require a new draft and approval. Keep ledgers out of source control.

## Release decision and Beyin integration

### Draft CHANGELOG for 1.9.0: breaking changes

This is a draft for the final, separately approved version commit. Do not move it
to CHANGELOG.md, date a release, or change version numbers before that decision.

- **BREAKING:** `cleanup` requires explicit `--approved` cleanup consent.
- **BREAKING:** Merge retains worktrees by default; removal requires
  `merge --cleanup-approved` or a later approved cleanup.
- **BREAKING:** Write runs require a passing, exact-commit Claude `lead-review`
  between integrate and verify; merge also enforces that gate.
- **BREAKING:** Verify runs the default verifier plus every selected routing
  profile's required verifier. Callers must handle multiple verifier results.
- **BREAKING:** Integration uses scanned delivery patches and `git apply --index`
  instead of merging worker history. Existing worker commits are folded into the
  patch with a warning; integration creates its own delivery commit. The final
  merge into the user's branch keeps the existing human approval gate.

The proposed version is 1.9.0. On approval, change package.json, the dated
CHANGELOG heading, EN/TR release notes and the Development version lines in
github-settings and publish docs together as the final separate commit. Run
extract-release-notes --check and the full release gates after that decision.

Beyin's parallel channel should consume the existing team-run commands, capacity
file v1, seven/six field schemas, role TOMLs and worker process profile. It must
relay user approval artifacts rather than manufacture them. It must supply
selected routing profile IDs, Claude review evidence and engine-view digests.
Real Beyin integration and the twenty-task evaluation set require lead evidence;
local fixture tests do not prove that external integration.

## Local verification

The check scripts bound Node test-file concurrency to two. On Windows, use a
short repo-local temporary root and a scratch-only Git config with
`core.longpaths=true` when verification must stay inside this worktree. Set
`GIT_CEILING_DIRECTORIES` to that temporary root so intentionally uninitialized
Git fixtures cannot discover the surrounding worktree. Point all three managed
homes at scratch directories and run `npm run dev:assert-scratch` before the
full `npm run check` and `npm run validate`. See [installation safety](install.md).
These environment values belong to the verification process and its children.

For evaluation smoke evidence, `node scripts/run-orchestration-evals.mjs run` executes registered criteria through the existing Node test runner. It does not call a model; use score for model-task evidence.
