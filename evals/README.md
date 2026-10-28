# Orchestration evaluations

Three seed tasks exercise scope isolation, lead review and capacity holds.
The twenty-task set and its final rubric are supplied by the lead separately.
List with `node scripts/run-orchestration-evals.mjs list`. Run each task in an
isolated scratch repository through the existing team-run workflow. The runner
never executes prompt text or launches another orchestration engine.

Score with `node scripts/run-orchestration-evals.mjs score evidence.json`.
Input is an array of `{taskId, observations: {criterionId: true}, evidence: ["path:line - observation"]}`.
Every criterion requires a boolean and each task requires evidence. Redirect
the JSON output to a repo-local ignored path for a timestamped schemaVersion 1
record with per-task scores and an aggregate. Scores are operator assessments,
not proof that tests were executed. Do not put secrets or private context in records.

`node scripts/run-orchestration-evals.mjs run` executes the registered repository smoke criteria with the existing Node test runner and returns a scored evidence record. It does not call a model or replace team-run. Use score for independently assessed model-task observations.
