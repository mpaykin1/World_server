'use strict';

const METRICS = Object.freeze({
  funds: { label: 'бюджет', direction: 1 },
  population: { label: 'население', direction: 1 },
  score: { label: 'рейтинг города', direction: 1 },
  traffic: { label: 'трафик', direction: -1 },
  pollution: { label: 'загрязнение', direction: -1 },
  crime: { label: 'преступность', direction: -1 },
  landValue: { label: 'стоимость земли', direction: 1 },
  resDemand: { label: 'спрос на жильё', direction: 0 },
  comDemand: { label: 'спрос на коммерцию', direction: 0 },
  indDemand: { label: 'спрос на промышленность', direction: 0 },
  poweredZones: { label: 'запитанные зоны', direction: 1 },
  unpoweredZones: { label: 'зоны без электричества', direction: -1 },
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampText(value, length = 80) {
  return String(value || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, length);
}
function normalizeForecast(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Invalid forecast'), { status: 400 });
  }
  const deltas = {};
  for (const key of Object.keys(METRICS)) deltas[key] = finite(input.deltas?.[key]);
  return {
    toolId: clampText(input.toolId, 32),
    toolLabel: clampText(input.toolLabel, 64),
    x: Math.trunc(finite(input.x)),
    y: Math.trunc(finite(input.y)),
    cost: Math.max(0, finite(input.cost)),
    horizonTicks: Math.max(1, Math.min(240, Math.trunc(finite(input.horizonTicks, 48)))),
    placementAllowed: input.placementAllowed === true,
    warnings: Array.isArray(input.warnings)
      ? input.warnings.slice(0, 4).map(value => clampText(value, 120))
      : [],
    deltas,
  };
}

function signed(value) {
  return (value > 0 ? '+' : '') + Math.round(value);
}
function deterministicExplanation(forecast) {
  if (!forecast.placementAllowed) {
    return forecast.warnings[0] || 'На выбранном участке эта постройка сейчас невозможна.';
  }
  const changes = Object.entries(forecast.deltas)
    .filter(([, value]) => Math.abs(value) >= 1)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (!changes.length) {
    return 'На выбранном горизонте Micropolis не показывает заметных системных изменений кроме прямой стоимости постройки.';
  }
  const parts = changes.slice(0, 5)
    .map(([key, value]) => METRICS[key].label + ' ' + signed(value));
  return 'Micropolis сравнил две версии города на ' + forecast.horizonTicks +
    ' тактов вперёд. Ожидаемые изменения: ' + parts.join(', ') + '.';
}

function buildPrompt(forecast) {
  const rows = Object.entries(forecast.deltas).map(([key, delta]) => ({
    metric: key,
    label: METRICS[key].label,
    delta: Math.round(delta * 100) / 100,
    preference: METRICS[key].direction,
  }));
  return [
    'Ты игровой советник в игре «Цепочка», использующей симуляцию Micropolis.',
    'Цифры ниже уже рассчитаны A/B-симуляцией игры. Не меняй и не выдумывай числа.',
    'Объясни последствия предполагаемой постройки по-русски в 2–4 коротких предложениях.',
    'Сначала самый важный эффект, затем выгоды и риски. Не утверждай причин, которых нет в данных.',
    JSON.stringify({ building: forecast.toolLabel, cost: forecast.cost, horizonTicks: forecast.horizonTicks, changes: rows }),
  ].join('\n');
}
function providerConfig(env = process.env) {
  if (env.GROQ_API_KEY && env.GROQ_MODEL) {
    return {
      name: 'groq', key: env.GROQ_API_KEY, model: env.GROQ_MODEL,
      url: 'https://api.groq.com/openai/v1/chat/completions',
    };
  }
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    return {
      name: 'openrouter', key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL,
      url: 'https://openrouter.ai/api/v1/chat/completions',
    };
  }
  return null;
}

async function narrateWithProvider(forecast, config, fetchImpl = fetch) {
  if (!config) return null;
  const response = await fetchImpl(config.url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + config.key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model, temperature: 0.2, max_tokens: 220,
      messages: [
        { role: 'system', content: 'Объясняй только результаты симуляции. Никогда не изменяй числовые данные.' },
        { role: 'user', content: buildPrompt(forecast) },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });  if (!response.ok) throw new Error('AI provider returned ' + response.status);
  const json = await response.json();
  const output = json?.choices?.[0]?.message?.content;
  return typeof output === 'string' && output.trim() ? output.trim().slice(0, 1200) : null;
}

async function explainForecast(input, options = {}) {
  const forecast = normalizeForecast(input);
  const fallback = deterministicExplanation(forecast);
  const config = options.config === undefined ? providerConfig(options.env) : options.config;
  if (!config) return { explanation: fallback, provider: 'rules', forecast };
  try {
    const explanation = await narrateWithProvider(forecast, config, options.fetchImpl);
    return {
      explanation: explanation || fallback,
      provider: explanation ? config.name : 'rules',
      forecast,
    };
  } catch (error) {
    return {
      explanation: fallback, provider: 'rules', forecast,
      aiError: String(error?.message || error).slice(0, 160),
    };
  }
}

module.exports = {
  METRICS, normalizeForecast, deterministicExplanation, buildPrompt,
  providerConfig, narrateWithProvider, explainForecast,
};