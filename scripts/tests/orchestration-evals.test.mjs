import test from 'node:test';
import assert from 'node:assert/strict';
import * as evals from '../run-orchestration-evals.mjs';
test('eval runner scores supplied evidence without executing task instructions', () => {
  assert.equal(typeof evals.scoreEvaluation, 'function');
  const task = { id: 'scope', criteria: [{ id: 'scope', weight: 2 }, { id: 'test', weight: 1 }] };
  assert.equal(evals.scoreEvaluation(task, { scope: true, test: false }).score, 2 / 3);
  assert.throws(() => evals.scoreEvaluation(task, { scope: 'true' }), /boolean/);
});
