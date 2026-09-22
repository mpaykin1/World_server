'use strict';

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function normalizeImage(image) {
  const width = Math.max(1, Math.floor(Number(image?.width) || 0));
  const height = Math.max(1, Math.floor(Number(image?.height) || 0));
  const pixels = image?.pixels;
  if (!pixels || typeof pixels.length !== 'number' || pixels.length !== width * height * 4) throw new TypeError('RGBA image evidence required');
  return { width, height, pixels };
}

function luminance(pixels, offset) {
  return (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255;
}

function compareReferenceRuntime(referenceInput, runtimeInput, options = {}) {
  const reference = normalizeImage(referenceInput), runtime = normalizeImage(runtimeInput);
  if (reference.width !== runtime.width || reference.height !== runtime.height) throw new RangeError('reference/runtime dimensions must match');
  const count = reference.width * reference.height;
  const heroMask = options.heroMask;
  if (heroMask && heroMask.length !== count) throw new RangeError('heroMask dimensions must match image');
  let colorError = 0, heroError = 0, heroCount = 0, edgeError = 0, edgeCount = 0;
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const dr = Math.abs(reference.pixels[o] - runtime.pixels[o]) / 255;
    const dg = Math.abs(reference.pixels[o + 1] - runtime.pixels[o + 1]) / 255;
    const db = Math.abs(reference.pixels[o + 2] - runtime.pixels[o + 2]) / 255;
    const error = (dr + dg + db) / 3;
    colorError += error;
    if (heroMask?.[i]) { heroError += error; heroCount += 1; }
    const x = i % reference.width;
    if (x > 0) {
      const prev = o - 4;
      const refEdge = Math.abs(luminance(reference.pixels, o) - luminance(reference.pixels, prev));
      const runEdge = Math.abs(luminance(runtime.pixels, o) - luminance(runtime.pixels, prev));
      edgeError += Math.abs(refEdge - runEdge); edgeCount += 1;
    }
  }
  const identityFidelity = clamp01(1 - colorError / count);
  const heroDetailFidelity = heroCount ? clamp01(1 - heroError / heroCount) : identityFidelity;
  const structuralFidelity = edgeCount ? clamp01(1 - edgeError / edgeCount) : identityFidelity;
  const score = clamp01(identityFidelity * 0.5 + heroDetailFidelity * 0.3 + structuralFidelity * 0.2);
  return {
    identityFidelity: Number(identityFidelity.toFixed(4)),
    heroDetailFidelity: Number(heroDetailFidelity.toFixed(4)),
    structuralFidelity: Number(structuralFidelity.toFixed(4)),
    score: Number(score.toFixed(4)),
    method: 'cpu-rgba-color-edge-v1',
    pixelsCompared: count,
    heroPixelsCompared: heroCount
  };
}

module.exports = { compareReferenceRuntime };
