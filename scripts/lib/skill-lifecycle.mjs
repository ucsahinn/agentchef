import crypto from 'node:crypto';
import { assertTeamTextSafe } from './team-runtime.mjs';

// The ledger describes release readiness. It never uploads, installs or edits
// an engine's installed skill view. A publisher still needs its normal approval.
export function advanceSkill(previous, action, { source, approval, version, views } = {}) {
  if (previous && (previous.schemaVersion !== 1 || !['draft', 'linted', 'approved', 'publish-ready'].includes(previous.state) || !/^[a-f0-9]{64}$/.test(previous.digest || '') || !Array.isArray(previous.history) || !Array.isArray(previous.versions))) throw new Error('Refusing to overwrite a non-lifecycle ledger.');
  if (typeof source !== 'string') throw new Error('Skill source is required.');
  assertTeamTextSafe(source);
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  const at = new Date().toISOString();
  if (action === 'draft') return { schemaVersion: 1, state: 'draft', digest, versions: previous?.versions || [], history: [...(previous?.history || []), { action, at, digest }] };
  if (!previous || previous.digest !== digest) throw new Error('Skill source changed; create and lint a new draft.');
  const next = structuredClone(previous);
  if (action === 'lint') {
    if (previous.state !== 'draft' || !/^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---\r?\n[\s\S]*\S/.test(source)) throw new Error('Skill lint requires a draft with name, description and body.');
    next.state = 'linted';
  } else if (action === 'approve') {
    if (previous.state !== 'linted' || approval?.digest !== digest || approval.approvedBy !== 'user' || !Number.isFinite(Date.parse(approval.approvedAt)) || Date.parse(approval.approvedAt) > Date.now()) throw new Error('A hash-bound user approval is required after lint.');
    next.state = 'approved'; next.approval = approval;
  } else if (action === 'publish') {
    if (previous.state !== 'approved') throw new Error('Publish readiness requires a linted, approved skill.');
    if (views?.codex !== digest || views?.claude !== digest) throw new Error('Engine views need reconciliation before publish readiness.');
    if (!/^\d+\.\d+\.\d+$/.test(version || '') || next.versions.some(entry => entry.version === version)) throw new Error('A unique semantic version is required.');
    next.state = 'publish-ready'; next.versions.push({ version, digest, at, approval: next.approval, views });
  } else throw new Error('Unknown skill lifecycle action.');
  next.history.push({ action, at, digest });
  return next;
}
