'use strict';

function dominates(a, b, protectedKeys = []) {
  let strictlyBetter = false;
  for (const key of protectedKeys) {
    const av = Number(a.metrics?.[key] ?? a[key] ?? 0);
    const bv = Number(b.metrics?.[key] ?? b[key] ?? 0);
    if (av < bv) return false;
    if (av > bv) strictlyBetter = true;
  }
  return strictlyBetter;
}

function rankCandidates(candidates, weights = {}) {
  const scored = candidates.map(c => {
    let utility = Number(c.score || 0);
    for (const [key, weight] of Object.entries(weights)) utility += Number(c.metrics?.[key] || 0) * Number(weight);
    if (c.regression) utility -= 1e6;
    return { ...c, utility };
  }).sort((a, b) => b.utility - a.utility);
  return { winner: scored.find(c => !c.regression) || null, ranked: scored };
}

function paretoFront(candidates, protectedKeys = ['score']) {
  return candidates.filter((candidate, i) => !candidates.some((other, j) => j !== i && dominates(other, candidate, protectedKeys)));
}

module.exports = { dominates, paretoFront, rankCandidates };
