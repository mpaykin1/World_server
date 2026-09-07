'use strict';

function redundantCandidateScore({ neighborCount, radiusGrid, random01 = 0 }) {
  const n = Number(neighborCount);
  const radius = Number(radiusGrid);
  const r = Number(random01);
  if (![n, radius, r].every(Number.isFinite)) throw new Error('Invalid redundant candidate score input');
  return n * 4 - radius * 0.15 + r * 0.75;
}

module.exports = { redundantCandidateScore };
