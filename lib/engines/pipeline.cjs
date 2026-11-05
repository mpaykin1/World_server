'use strict';

// No assertion of game integration is made by this orchestrator. Every adapter
// is explicit and an engine can only be certified by the separate G4/G5 gates.
const SEQUENCE = Object.freeze([
  'calc', 'dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding'
]);
const REQUIRED = Object.freeze(SEQUENCE.filter(x => x !== 'calc'));
function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(field + ' must be an object');
  }
  return value;
}
function runPipeline({ gameCard, randomSeed, recentGames = [], adapters = {}, timestamp = null }) {
  record(gameCard, 'gameCard');
  record(adapters, 'adapters');
  if (typeof gameCard.id !== 'string' || !gameCard.id.trim()) {
    throw new TypeError('gameCard.id is required');
  }
  if (typeof gameCard.genre !== 'string' || !gameCard.genre.trim()) {
    throw new TypeError('gameCard.genre is required');
  }
  if (!Array.isArray(gameCard.engines_enabled) ||
      gameCard.engines_enabled.some(x => typeof x !== 'string' || !SEQUENCE.includes(x)) ||
      new Set(gameCard.engines_enabled).size !== gameCard.engines_enabled.length) {
    throw new TypeError('gameCard.engines_enabled must contain unique known engine names');
  }
  const missing = REQUIRED.filter(x => !gameCard.engines_enabled.includes(x));
  if (missing.length) throw new TypeError('gameCard.engines_enabled missing required: ' + missing.join(', '));
  if (randomSeed === undefined || randomSeed === null || String(randomSeed).length === 0) {
    throw new TypeError('randomSeed is required');
  }
  if (!Array.isArray(recentGames)) throw new TypeError('recentGames must be an array');
  if (timestamp !== null && (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp)))) {
    throw new TypeError('timestamp must be a valid ISO date or null');
  }
  // Snapshot once, then detach every stage context. Shallow copies let a later
  // adapter rewrite the caller's history or an earlier engine's evidence.
  const inputs = structuredClone({ gameCard, randomSeed, recentGames });
  const gameId = inputs.gameCard.id;
  const seed = String(inputs.randomSeed);
  const steps = [];
  const outputs = {};
  const errors = [];
  for (const engine of SEQUENCE) {
    if (engine === 'calc' && !inputs.gameCard.engines_enabled.includes('calc')) {
      steps.push({ engine, status: 'skipped_optional', ok: false, input_ref: null, out_ref: null });
      continue;
    }
    const adapter = adapters[engine];
    if (typeof adapter !== 'function') {
      errors.push({ engine, code: 'ENGINE_UNAVAILABLE', message: 'No adapter for ' + engine });
      steps.push({ engine, status: 'blocked', ok: false, input_ref: null, out_ref: null });
      break;
    }
    const inputRef = engine === 'calc' || engine === 'dramaturgy' ? 'gameCard:' + gameId :
      'result:' + SEQUENCE[SEQUENCE.indexOf(engine) - 1];
    try {
      const output = adapter(structuredClone({ ...inputs, outputs }));
      if (!output || typeof output !== 'object' || Array.isArray(output) ||
          output.value === undefined || (output.value === null && engine !== 'calc')) {
        throw new TypeError('Adapter must return {value, out_ref?}');
      }
      if (engine === 'calc' && output.value === null) {
        outputs.calc = null;
        steps.push({ engine, status: 'skipped_optional', ok: false, input_ref: inputRef, out_ref: null });
        continue;
      }
      // Human-readable out_ref is only accepted if provided, never invented.
      const outRef = typeof output.out_ref === 'string' && output.out_ref.trim()
        ? output.out_ref : null;
      // Producers may retain their result object; do not retain that alias.
      outputs[engine] = structuredClone(output.value);
      steps.push({
        engine,
        status: 'produced_unverified',
        ok: false,
        input_ref: inputRef,
        out_ref: outRef
      });
    } catch (error) {
      errors.push({ engine, code: 'ENGINE_FAILED', message: String(error?.message || error) });
      steps.push({ engine, status: 'failed', ok: false, input_ref: inputRef, out_ref: null });
      break;
    }
  }
  return {
    gameId,
    seed,
    steps,
    generated_at: timestamp,
    errors,
    outputs
  };
}
module.exports = { SEQUENCE, REQUIRED, runPipeline };
