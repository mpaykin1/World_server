'use strict';

// Split only at complete git file-diff boundaries and prove UTF-8 byte-exact
// reconstruction. Oversized indivisible files remain fail-closed.
function splitPatchAtFileBoundaries(patch, limit) {
  if (typeof patch !== 'string' || !Number.isFinite(limit) || limit <= 0) return null;
  if (Buffer.byteLength(patch, 'utf8') <= limit) return [patch];
  const starts = [...patch.matchAll(/^diff --git /gm)].map(match => match.index);
  if (starts.length < 2 || starts[0] !== 0) return null;
  const files = starts.map((start, index) => patch.slice(start, starts[index + 1] ?? patch.length));
  if (files.some(file => Buffer.byteLength(file, 'utf8') > limit)) return null;
  const chunks = [];
  let current = '';
  for (const file of files) {
    if (current && Buffer.byteLength(current + file, 'utf8') > limit) {
      chunks.push(current);
      current = '';
    }
    current += file;
  }
  if (current) chunks.push(current);
  if (!chunks.length) return null;
  const reconstructed = chunks.join('');
  const byteExact = Buffer.from(reconstructed, 'utf8').equals(Buffer.from(patch, 'utf8'));
  const withinBudget = chunks.every(chunk => Buffer.byteLength(chunk, 'utf8') <= limit);
  return byteExact && withinBudget ? chunks : null;
}

function combineChunkReviews(model, reviews, totalChunks) {
  const blocked = reviews.some(review => review.verdict === 'BLOCK');
  const complete = totalChunks > 0 && reviews.length === totalChunks &&
    reviews.every(review => review.verdict === 'PASS');
  const prioritized = reviews.map((review, index) => ({review, index}))
    .sort((a, b) => Number(b.review.verdict === 'BLOCK') - Number(a.review.verdict === 'BLOCK'));
  return {
    provider: 'cloudflare', model: model.id, family: model.family,
    verdict: blocked ? 'BLOCK' : complete ? 'PASS' : 'INCONCLUSIVE',
    findings: prioritized.flatMap(item => item.review.findings || []).slice(0, 12),
    falsification_attempts: prioritized.flatMap(({review, index}) =>
      (review.falsification_attempts || []).map(attempt =>
        'chunk ' + (index + 1) + ': ' + attempt)).slice(0, 12),
    reviewedChunks: reviews.length, totalChunks,
    durationMs: reviews.reduce((sum, review) => sum + (review.durationMs || 0), 0),
    reason: reviews.find(review => review.verdict === 'INCONCLUSIVE')?.reason
  };
}

module.exports = {splitPatchAtFileBoundaries, combineChunkReviews};
