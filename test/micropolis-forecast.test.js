'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeForecast, deterministicExplanation, providerConfig, explainForecast, buildPrompt,
} = require('../lib/micropolis-forecast-narrative');

const SAMPLE = {
  toolId: 'park', toolLabel: 'Park', x: 12, y: 8, cost: 10, horizonTicks: 48,
  placementAllowed: true, warnings: [],
  deltas: {
    funds: -10, population: 4, score: 3, traffic: -2, pollution: -3, crime: -1,
    landValue: 5, resDemand: 2, comDemand: 0, indDemand: -1, poweredZones: 0, unpoweredZones: 0,
  },
};

test('normalizes only the supported Micropolis forecast fields', () => {
  const forecast = normalizeForecast({ ...SAMPLE, evil: 'ignored', horizonTicks: 9999 });
  assert.equal(forecast.toolId, 'park');
  assert.equal(forecast.horizonTicks, 240);
  assert.equal(Object.hasOwn(forecast, 'evil'), false);
  assert.deepEqual(Object.keys(forecast.deltas).sort(), [
    'comDemand','crime','funds','indDemand','landValue','pollution',
    'population','poweredZones','resDemand','score','traffic','unpoweredZones',
  ].sort());
});

test('fallback explanation is grounded in simulation deltas', () => {
  const text = deterministicExplanation(normalizeForecast(SAMPLE));
  assert.match(text, /48/);
  assert.match(text, /бюджет -10/);
  assert.match(text, /стоимость земли \+5/);
});
test('provider selection requires both key and explicit model', () => {
  assert.equal(providerConfig({ GROQ_API_KEY: 'x' }), null);
  assert.deepEqual(providerConfig({ GROQ_API_KEY: 'x', GROQ_MODEL: 'demo' }), {
    name: 'groq', key: 'x', model: 'demo',
    url: 'https://api.groq.com/openai/v1/chat/completions',
  });
});

test('AI prompt forbids inventing or changing simulation numbers', () => {
  const prompt = buildPrompt(normalizeForecast(SAMPLE));
  assert.match(prompt, /Не меняй/);
  assert.match(prompt, /не выдумывай/i);
  assert.match(prompt, /-10/);
});

test('uses AI only as narration and falls back cleanly', async () => {
  const failed = await explainForecast(SAMPLE, {
    config: { name: 'groq', key: 'x', model: 'demo', url: 'https://example.test' },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(failed.provider, 'rules');
  assert.match(failed.explanation, /бюджет -10/);

  const ok = await explainForecast(SAMPLE, {
    config: { name: 'groq', key: 'x', model: 'demo', url: 'https://example.test' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Симуляция показывает улучшение стоимости земли.' } }] }),
    }),
  });
  assert.equal(ok.provider, 'groq');
  assert.equal(ok.explanation, 'Симуляция показывает улучшение стоимости земли.');
});