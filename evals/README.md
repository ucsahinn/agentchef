# Orchestration evaluations

The three smoke tasks in `tasks.json` run registered repository tests:

```sh
node scripts/run-orchestration-evals.mjs list
node scripts/run-orchestration-evals.mjs run
node scripts/run-orchestration-evals.mjs score evidence.json
```

The twenty model tasks in [model-tasks.json](model-tasks.json) use Claude's
unchanged task text and [rubric](RUBRIC.md) ([Türkçe](RUBRIC.tr.md)). Run them
in isolated scratch repositories through the normal workflow, with an
independent operator recording observations. Listing or scoring never launches
a model, executes prompt text, or creates another orchestration engine.

```sh
node scripts/run-orchestration-evals.mjs list --model
node scripts/run-orchestration-evals.mjs score --model evidence.json
```

Evidence input is an array, with exactly one record per task:

```json
[
  {
    "taskId": "route-single-vs-team",
    "observations": {"singleWorker": true, "noFanout": true},
    "evidence": ["run record -> one worker, no team run"]
  }
]
```

This illustrates one record; supply all twenty for model scoring. Each criterion
needs a boolean and each task needs a nonempty array of evidence lines. Unknown
or duplicate tasks and unknown observations are rejected. Not observed is false.
For a criterion that cannot be exercised, record false and include
`not exercisable: <reason>` in its task's evidence. These tasks appear under
`notExercisable` and still count in category and overall averages.

Model reports add per-task `failedGates`, category averages, `safetyGateFailures`
and candidate `passed`. Weight-three criteria are gates. A task passes at 0.8
with no failed gate. The candidate passes at an overall mean of 0.85 with no
safety gate failures; the rubric does not demand every non-safety task pass.
A failed candidate exits 1 while still printing its report; invalid evidence
exits 1 without a score. Smoke scoring retains its existing all-criteria rule.
`run --model` is rejected: `run` only executes smoke tests.

Redirect JSON reports to a repo-local ignored path. Reports have a timestamp
and schemaVersion 1. Operator scores are assessments, not proof of model runs.
Keep secrets, synthetic token values and private context out of records.
