'use strict';

// Optional character-design engine. Never represents a scientific or clinical assessment.
const METHODS = Object.freeze(['natal', 'socionics', 'human_design']);
const THEMES = Object.freeze({
  natal: ['ночная память', 'дорога', 'перемена', 'любопытство', 'тихий выбор', 'зеркало'],
  socionics: ['наблюдательность', 'смелый вопрос', 'упорство', 'внимание к другому', 'мягкий риск', 'прямота'],
  human_design: ['ритм путешествия', 'неожиданная развилка', 'скрытый ресурс', 'отголосок решения', 'двойной смысл', 'поиск связи']
});
const BEATS = Object.freeze(['завязка', 'поворот', 'развязка']);
function validBirth(date) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}
function hashString(input) {
  let state = 2166136261;
  for (let i = 0; i < input.length; i++) {
    state = Math.imul(state ^ input.charCodeAt(i), 16777619) >>> 0;
  }
  return state;
}
function pickUnique(pool, hash, count = 3) {
  const choices = [...pool], output = [];
  let cursor = hash >>> 0;
  for (let i = 0; i < count; i++) {
    cursor = (Math.imul(cursor ^ (cursor >>> 15), 2246822519) + 3266489917) >>> 0;
    const index = cursor % choices.length;
    output.push(choices.splice(index, 1)[0]);
  }
  return output;
}
function createCalcProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('CharacterSeed must be an object');
  }
  const { name, birth, traits = [], method, randomSeed = 0 } = input;
  if (typeof name !== 'string' || !name.trim() || name.length > 120) {
    throw new TypeError('CharacterSeed.name must be a non-empty string of at most 120 characters');
  }
  if (birth !== undefined && (typeof birth !== 'string' || !validBirth(birth))) {
    throw new TypeError('CharacterSeed.birth must be a real YYYY-MM-DD date');
  }
  if (!Array.isArray(traits) || traits.length > 16 ||
      traits.some(x => typeof x !== 'string' || !x.trim() || x.length > 70)) {
    throw new TypeError('CharacterSeed.traits must be up to 16 non-empty strings');
  }
  if (!Number.isSafeInteger(randomSeed)) {
    throw new TypeError('randomSeed must be a safe integer');
  }
  if (method === undefined || method === null) return null;
  if (!METHODS.includes(method)) throw new TypeError('method must be natal, socionics or human_design');
  const seed = hashString([method, name, birth || '', String(randomSeed), ...traits].join('\u0001'));
  const motifs = pickUnique(THEMES[method], seed);
  return {
    source: method,
    traits: [...new Set([...traits, ...motifs])],
    timeline: BEATS.map((stage, i) => ({ stage, motif: motifs[i] })),
    disclaimer: 'fictional_character_design'
  };
}
module.exports = { METHODS, createCalcProfile };
