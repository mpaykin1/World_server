'use strict';

// Server-side port of apps/improve-world-home/public/app.js's finish() logic
// (the client's Narrative Blueprint generator). No LLM/generation service is
// installed anywhere in this repo (verified: package.json has no such SDK,
// and grepping the codebase for one turns up nothing) -- this is deliberately
// the same deterministic templating the client already does, moved
// server-side so a Story's blueprint can be computed once, persisted, and
// reused by World generation and Merge composition instead of only ever
// existing transiently in a browser tab.
//
// Keeping this logic identical to the client (not "improved") matters: the
// questionnaire/blueprint UX is an explicit non-redesign target this session
// (see WORK_IN_PROGRESS.md), and e2e/improve-world-home-baseline.spec.js
// pins the client behavior as the source of truth.

function safeText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function titleFor(answers, journey, sourceTitle) {
  if (journey === 'join' && sourceTitle) return `${sourceTitle} — альтернативная ветка`;
  return safeText(answers.story, 'Новая история').slice(0, 55);
}

function modeFor(format) {
  if (format === 'game') return 'Игра';
  if (format === 'story') return 'Интерактивный рассказ';
  if (format === 'both') return 'Игра + интерактивный рассказ';
  return 'Формат будет выбран автоматически';
}

function sceneFor(answers) {
  const desire = safeText(answers.storyDesire, 'найти направление');
  const source = safeText(answers.storySource, 'неизвестность');
  return `История начинает замечать тебя. Она хочет ${desire}. Источник напряжения: ${source}.\n\n` +
    'Это первая точка Narrative Blueprint. Отсюда можно строить сцены, выборы и альтернативные ветки.';
}

/**
 * @param {object} answers - the questionnaire data object (same shape as the
 *   client's `d` state: story, storyDesire, storySource, format, chars[], worlds[], ...)
 * @param {{journey?: 'create'|'join', sourceTitle?: string}} context
 */
function buildBlueprint(answers, context = {}) {
  const journey = context.journey === 'join' ? 'join' : 'create';
  return {
    title: titleFor(answers, journey, context.sourceTitle),
    mode: modeFor(answers.format),
    scene: sceneFor(answers)
  };
}

module.exports = { buildBlueprint };
