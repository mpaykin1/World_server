'use strict';
// Derive a playable branching scenario from a validated StoryBible.
// This module never renders dialogue over gameplay and never commits history early.
const { validateStoryBible } = require('./dramaturgy.cjs');
const STAGES = Object.freeze(['завязка', 'развитие', 'кульминация', 'развязка']);
const TRACE_KEYS = Object.freeze(['доверие', 'жертва', 'правда', 'милосердие', 'бездействие']);
const SCENE_IDS = Object.freeze(['s1', 's2', 's3', 's4', 's5', 's6']);

function checkSeed(seed) {
  if (!Number.isSafeInteger(seed)) throw new TypeError('randomSeed must be a safe integer');
}
function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(name + ' must be an object');
  }
  return value;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createScenario({ storyBible, recentGames = [], randomSeed, gameCard = {} } = {}) {
  record(storyBible, 'storyBible');
  record(gameCard, 'gameCard');
  checkSeed(randomSeed);
  if (!Array.isArray(recentGames)) throw new TypeError('recentGames must be an array');
  if (storyBible.randomSeed !== String(randomSeed)) throw new TypeError('StoryBible seed mismatch');
  if (gameCard.id && gameCard.id !== storyBible.gameId) throw new TypeError('GameCard ID mismatch');
  const checked = validateStoryBible(storyBible, recentGames);
  if (!checked.ok) throw new Error('Invalid StoryBible: ' + checked.errors.join('; '));
  if (!Array.isArray(storyBible.characters) || storyBible.characters.length < 2 ||
      storyBible.characters.some(c => !c || typeof c.motive !== 'string' || !c.motive.trim())) {
    throw new Error('At least two motivated suspects required');
  }
  if (!Array.isArray(storyBible.twists) || storyBible.twists.length !== 2 ||
      storyBible.twists.some(t => !t || !Array.isArray(t.clues) ||
        t.clues.some(s => typeof s !== 'string' || !s.trim()))) {
    throw new Error('Two fully evidenced twists required');
  }
  if (!Array.isArray(storyBible.endings) || storyBible.endings.some(e =>
      !e || !TRACE_KEYS.includes(e.trace) || typeof e.finalLocation !== 'string' ||
      !e.finalLocation.trim())) throw new Error('Endings need trace and destination');

  const bible = clone(storyBible);
  const actor = bible.interferenceSource;
  const sceneTexts = [
    'В ' + bible.openingLocation + ' герой стремится ' + bible.heroHappiness +
      ', но сталкивается с конфликтом ' + bible.primaryConflict + '.',
    'Два свидетеля спорят о причине события. Первый мотив: ' +
      bible.characters[0].motive + '; второй: ' + bible.characters[1].motive + '.',
    'Герой проверяет источники сведений и сопоставляет следы прежде, чем действовать.',
    'Первое открытие меняет первоначальное объяснение событий: ' + bible.twistType + '.',
    'Источник помех раскрывается через мотив ' + actor.motive +
      '; второй поворот требует нового решения.',
    'Герой получает возможность ' + bible.repairType +
      ' и достигает места развязки согласно выбранным поступкам.'
  ];
  const sceneStages = ['завязка', 'завязка', 'развитие', 'развитие', 'кульминация', 'развязка'];
  const scenes = SCENE_IDS.map((id, i) => ({
    id, stage: sceneStages[i], pacing: bible.tempoStages[sceneStages[i]],
    synopsis: sceneTexts[i], worldLaws: i === 0 ? bible.world_laws : [],
    gameTextPlacement: 'menu_only'
  }));
  const clues = [];
  const twists = bible.twists.map((twist, ti) => {
    const revealScene = ti === 0 ? 's4' : 's5';
    const eligible = ti === 0 ? ['s1', 's2', 's3'] : ['s2', 's3', 's4'];
    const clueIds = twist.clues.map((hint, i) => {
      const clue = { id: 'clue-' + ti + '-' + i, hint, scene: eligible[i],
        test: bible.mysteryMechanics[i % bible.mysteryMechanics.length].reveal,
        forTwist: twist.type };
      clues.push(clue);
      return clue.id;
    });
    return { type: twist.type, revealScene, clueIds };
  });
  const choices = bible.choices.map((choice, i) => ({
    id: 'choice-' + (i + 1), type: choice.type, scene: SCENE_IDS[i % 5],
    menuOnly: true,
    options: [
      { id: 'act', label: 'Поступить: ' + choice.type, traceDelta: { [choice.trace]: 1 } },
      { id: 'decline', label: 'Отказаться от выбора', traceDelta: {} }
    ]
  }));
  const endings = bible.endings.map((ending, i) => ({
    id: 'ending-' + i, type: ending.type, finalLocation: ending.finalLocation,
    scene: 's6', traceConditions: { [ending.trace]: 1 }
  }));
  const events = [
    { id: 'investigation', scene: 's3', action: 'compare_evidence', clueIds: clues.map(c => c.id) },
    ...twists.map((twist, i) => ({ id: 'reveal-' + i, scene: twist.revealScene,
      action: 'reveal_twist', twistType: twist.type, prerequisiteClues: twist.clueIds })),
    { id: 'repair', scene: 's6', action: 'repair_hurtful_twist', repairType: bible.repairType }
  ];
  const dialogues = [
    { id: 'witness-a', scene: 's2', speaker: bible.characters[0].name || bible.characters[0].role,
      text: 'Я действовал из-за: ' + bible.characters[0].motive + '. Проверь мои слова.',
      menuOnly: true },
    { id: 'witness-b', scene: 's2', speaker: bible.characters[1].name || bible.characters[1].role,
      text: 'Моя причина иная: ' + bible.characters[1].motive + '. Найди доказательство.',
      menuOnly: true },
    { id: 'confront', scene: 's5', speaker: 'герой',
      text: 'Теперь я знаю мотив. Можно ли исправить последствия?', menuOnly: true }
  ];
  const result = {
    gameId: bible.gameId, randomSeed, primaryConflict: bible.primaryConflict,
    openingLocation: bible.openingLocation, twist: twists[0], twists, scenes,
    clues, events, dialogues, choices, endings,
    mysteryMechanics: bible.mysteryMechanics,
    interferenceSource: actor, stagePacing: bible.tempoStages,
    hurtfulTwistRepair: { type: bible.repairType, payoffScene: 's6' },
    suspects: bible.characters.slice(0, 2).map(c => ({ role: c.role, motive: c.motive })),
    historyEntry: null, selectedEnding: null
  };
  const validation = validateScenario(result);
  if (!validation.ok) throw new Error('Invalid Scenario: ' + validation.errors.join('; '));
  return result;
}
function validateScenario(scenario) {
  const errors = [];
  if (!scenario || typeof scenario !== 'object') return { ok: false, errors: ['Scenario required'] };
  const scenes = Array.isArray(scenario.scenes) ? scenario.scenes : [];
  const indexed = new Map(scenes.map((s, i) => [s.id, i]));
  if (indexed.size !== 6 || scenes.length !== 6 ||
      STAGES.some(stage => !scenes.some(s => s.stage === stage && s.pacing === scenario.stagePacing?.[stage]))) {
    errors.push('Missing scene or independent stage pacing');
  }
  for (const twist of scenario.twists || []) {
    if (!indexed.has(twist.revealScene) || !Array.isArray(twist.clueIds) ||
        twist.clueIds.length < 2 || twist.clueIds.length > 3) {
      errors.push('Twist requires two or three prior clues'); continue;
    }
    for (const id of twist.clueIds) {
      const clue = (scenario.clues || []).find(c => c.id === id);
      if (!clue || !indexed.has(clue.scene) || indexed.get(clue.scene) >= indexed.get(twist.revealScene) ||
          !clue.test) errors.push('Unverifiable or late clue: ' + id);
    }
  }
  if (!Array.isArray(scenario.suspects) || scenario.suspects.length < 2) errors.push('Two suspects required');
  const choices = scenario.choices || [];
  if (choices.length < 5 || choices.length > 7 ||
      choices.some((c, i) => !c.menuOnly || !indexed.has(c.scene) ||
        (i && c.type === choices[i - 1].type))) errors.push('Choices invalid');
  if (!Array.isArray(scenario.endings) || scenario.endings.length < 2 ||
      scenario.endings.some(e => !indexed.has(e.scene) ||
        !Object.keys(e.traceConditions || {}).some(key => TRACE_KEYS.includes(key) &&
          e.traceConditions[key] === 1))) errors.push('Endings need reachable trace gates');
  if (scenario.historyEntry !== null || scenario.selectedEnding !== null) errors.push('History cannot be finalized early');
  return { ok: errors.length === 0, errors };
}
function completeScenario(scenario, { endingId, traces } = {}) {
  if (!validateScenario(scenario).ok) throw new Error('Scenario is not valid or already completed');
  record(traces, 'traces');
  if (Object.entries(traces).some(([key, value]) =>
      !TRACE_KEYS.includes(key) || !Number.isSafeInteger(value) || value < 0)) {
    throw new TypeError('Only nonnegative integer player traces are allowed');
  }
  const ending = scenario.endings.find(e => e.id === endingId);
  if (!ending) throw new Error('Unknown ending');
  if (Object.entries(ending.traceConditions).some(([key, minimum]) => (traces[key] || 0) < minimum)) {
    throw new Error('Ending condition not met');
  }
  // Caller persists only this completed-game record after gameplay; no implicit write.
  return {
    ...clone(scenario), selectedEnding: ending.id,
    historyEntry: {
      gameId: scenario.gameId, primaryConflict: scenario.primaryConflict,
      twistType: scenario.twist.type, endingType: ending.type,
      finalLocation: ending.finalLocation,
      interferenceSourceType: scenario.interferenceSource.type,
      tempoStages: clone(scenario.stagePacing),
      repairType: scenario.hurtfulTwistRepair.type,
      choices: scenario.choices.map(c => ({ type: c.type }))
    }
  };
}
module.exports = { createScenario, validateScenario, completeScenario };
