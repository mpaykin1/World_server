'use strict';

const core = require('../shared/world-procedural-core');

function clamp(v, a, b) { return Math.max(a, Math.min(b, Number(v))); }

function buildAudioPlan(recipeInput = {}, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const seed = (recipe.seed + recipe.audio.seedOffset) >>> 0;
  const random = core.mulberry32(seed);
  const intensity = clamp(recipe.audio.intensity, 0, 1);
  const darkness = clamp(recipe.atmosphere.darkness, 0, 1);
  const wind = clamp(recipe.atmosphere.wind, 0, 1);
  const base = 42 + Math.round(random() * 34);
  const voices = [
    { type: 'sine', hz: base, gain: +(0.05 + intensity * 0.08).toFixed(4) },
    { type: 'sine', hz: Math.round(base * 1.5), gain: +(0.015 + darkness * 0.035).toFixed(4) },
    { type: 'noise', hz: 0, gain: +(0.008 + wind * 0.05).toFixed(4) }
  ];
  const pulses = [];
  const pulseCount = Math.max(1, Math.round(2 + intensity * 6));
  for (let i = 0; i < pulseCount; i += 1) {
    pulses.push({ at: +(random() * 8).toFixed(3), hz: Math.round(base * (2 + random() * 4)), gain: +(0.01 + random() * intensity * 0.06).toFixed(4) });
  }
  pulses.sort((a, b) => a.at - b.at);
  return { engine: 'world-procedural-audio-v1', seed, ambience: recipe.audio.ambience, intensity, voices, pulses };
}

function writeWavHeader(buffer, sampleRate, samples) {
  const dataBytes = samples * 2;
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
}

function synthesizeWav(recipeInput = {}, options = {}) {
  const plan = buildAudioPlan(recipeInput, options);
  const sampleRate = Math.max(8000, Math.min(48000, Math.trunc(Number(options.sampleRate) || 22050)));
  const durationSeconds = Math.max(0.05, Math.min(30, Number(options.durationSeconds) || 1));
  const samples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const out = Buffer.alloc(44 + samples * 2);
  writeWavHeader(out, sampleRate, samples);
  const random = core.mulberry32(plan.seed ^ 0x9e3779b9);
  let lowNoise = 0;
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    let value = 0;
    for (const voice of plan.voices) {
      if (voice.type === 'sine') value += Math.sin(Math.PI * 2 * voice.hz * t) * voice.gain;
      else {
        lowNoise = lowNoise * 0.94 + (random() * 2 - 1) * 0.06;
        value += lowNoise * voice.gain;
      }
    }
    for (const pulse of plan.pulses) {
      const local = t - (pulse.at % durationSeconds);
      if (local >= 0 && local < 0.12) value += Math.sin(Math.PI * 2 * pulse.hz * t) * pulse.gain * (1 - local / 0.12);
    }
    value = clamp(value, -1, 1);
    out.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return { plan, sampleRate, durationSeconds, buffer: out };
}

module.exports = { buildAudioPlan, synthesizeWav };
