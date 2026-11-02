'use strict';
// Validation boundary for two sequential completed games; not a story generator.
const FIELDS = Object.freeze(['primaryConflict','twistType','endingType','finalLocation','interferenceSourceType']);
function validateAdjacentGames(previous, current) {
  if (!previous || !current || typeof previous !== 'object' || typeof current !== 'object') {
    throw new TypeError('Two completed game records are required');
  }
  const errors = [];
  for (const field of FIELDS) {
    if (typeof previous[field] !== 'string' || !previous[field].trim() ||
        typeof current[field] !== 'string' || !current[field].trim()) {
      errors.push(field + ': missing');
    } else if (previous[field] === current[field]) {
      errors.push(field + ': repeated');
    }
  }
  return { ok: errors.length === 0, errors };
}
function validateRecentHistory(recentGames, candidate) {
  if (!Array.isArray(recentGames)) throw new TypeError('recentGames must be an array');
  const result = recentGames.length ? validateAdjacentGames(recentGames[recentGames.length - 1], candidate) : {ok:true,errors:[]};
  const lastThree = recentGames.slice(-3);
  if (lastThree.some(x => x && x.primaryConflict === candidate?.primaryConflict) &&
      !result.errors.includes('primaryConflict: repeated')) result.errors.push('primaryConflict: used in last three');
  result.ok = result.errors.length === 0;
  return result;
}
module.exports = { FIELDS, validateAdjacentGames, validateRecentHistory };
