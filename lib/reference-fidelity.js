'use strict';

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

function normalizeImage(image) {
  const width = Math.max(1, Math.floor(Number(image?.width) || 0));
  const height = Math.max(1, Math.floor(Number(image?.height) || 0));
  const pixels = image?.pixels;
  if (!pixels || typeof pixels.length !== 'number' || pixels.length !== width * height * 4) throw new TypeError('RGBA image evidence required');
  return { width, height, pixels };
}

function resampleNearest(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const src = (sy * image.width + sx) * 4, dst = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) pixels[dst + channel] = image.pixels[src + channel];
    }
  }
  return { width, height, pixels };
}

function luminance(pixels, offset) {
  return (0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]) / 255;
}

function compareReferenceRuntime(referenceInput, runtimeInput, options = {}) {
  let reference = normalizeImage(referenceInput), runtime = normalizeImage(runtimeInput);
  const comparisonWidth = Math.min(reference.width, runtime.width), comparisonHeight = Math.min(reference.height, runtime.height);
  const resampled = reference.width !== runtime.width || reference.height !== runtime.height;
  reference = resampleNearest(reference, comparisonWidth, comparisonHeight);
  runtime = resampleNearest(runtime, comparisonWidth, comparisonHeight);
  const count = comparisonWidth * comparisonHeight;
  const heroMask = options.heroMask;
  if (heroMask && heroMask.length !== count) throw new RangeError('heroMask dimensions must match comparison image');
  let colorError = 0, heroError = 0, heroCount = 0, edgeError = 0, edgeCount = 0;
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const dr = Math.abs(reference.pixels[o] - runtime.pixels[o]) / 255;
    const dg = Math.abs(reference.pixels[o + 1] - runtime.pixels[o + 1]) / 255;
    const db = Math.abs(reference.pixels[o + 2] - runtime.pixels[o + 2]) / 255;
    const error = (dr + dg + db) / 3;
    colorError += error;
    if (heroMask?.[i]) { heroError += error; heroCount += 1; }
    const x = i % comparisonWidth;
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
    identityFidelity: Number(identityFidelity.toFixed(4)), heroDetailFidelity: Number(heroDetailFidelity.toFixed(4)),
    structuralFidelity: Number(structuralFidelity.toFixed(4)), score: Number(score.toFixed(4)),
    method: resampled ? 'cpu-rgba-resample-color-edge-v2' : 'cpu-rgba-color-edge-v1',
    comparisonWidth, comparisonHeight, resampled, pixelsCompared: count, heroPixelsCompared: heroCount
  };
}

module.exports = { compareReferenceRuntime };
