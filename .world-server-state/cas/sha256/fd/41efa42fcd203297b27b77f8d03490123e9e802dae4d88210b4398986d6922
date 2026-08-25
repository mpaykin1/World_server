'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const {
  PNG_SIGNATURE,
  makeChunk,
  parseChunks,
  encodeApng,
  parseApng,
  compositeFrames,
  analyzeApng,
  repairApng,
  frameMetrics
} = require('../lib/apng-engine');

function solid(width, height, r, g, b, a = 255) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}

function gradient(width, height, offset = 0) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const o = (y * width + x) * 4;
    out[o] = (x * 17 + offset) & 255;
    out[o + 1] = (y * 23 + offset * 2) & 255;
    out[o + 2] = ((x + y) * 13 + offset * 3) & 255;
    out[o + 3] = 255;
  }
  return out;
}

function frame(rgba, delayMs = 100) {
  return { rgba, delayNum: Math.round(delayMs / 10), delayDenRaw: 100, delayMs };
}

function rebuild(chunks) {
  return Buffer.concat([PNG_SIGNATURE, ...chunks.map((chunk) => makeChunk(chunk.type, chunk.data))]);
}

test('encodes and decodes full-frame APNG losslessly', () => {
  const width = 8; const height = 6;
  const source = [frame(solid(width, height, 10, 20, 30)), frame(solid(width, height, 50, 60, 70))];
  const apng = encodeApng(source, width, height);
  const parsed = parseApng(apng);
  const decoded = compositeFrames(parsed);
  assert.equal(decoded.length, 2);
  assert.deepEqual(decoded[0].rgba, source[0].rgba);
  assert.deepEqual(decoded[1].rgba, source[1].rgba);
  assert.equal(parsed.frames.every((f) => f.dispose === 0 && f.blend === 0), true);
});

test('detects and repairs a one-frame brightness/color flash', () => {
  const width = 10; const height = 10;
  const dark = solid(width, height, 30, 30, 30);
  const flash = solid(width, height, 250, 20, 250);
  const apng = encodeApng([frame(dark), frame(flash), frame(dark)], width, height);
  const before = analyzeApng(apng);
  assert.ok(before.issues.some((issue) => issue.code === 'APNG_BRIGHTNESS_FLASH' || issue.code === 'APNG_COLOR_FLASH'));
  const repaired = repairApng(apng, { temporal: true });
  assert.equal(repaired.report.verified, true);
  assert.equal(repaired.report.timelineExact, true);
  assert.ok(repaired.report.actions.some((action) => action.action === 'TEMPORAL_INTERPOLATION'));
  const decoded = compositeFrames(parseApng(repaired.output));
  assert.deepEqual(decoded[1].rgba, dark);
});

test('detects and repairs single-frame alpha collapse', () => {
  const width = 12; const height = 12;
  const opaque = solid(width, height, 100, 120, 140, 255);
  const transparent = solid(width, height, 100, 120, 140, 10);
  const apng = encodeApng([frame(opaque), frame(transparent), frame(opaque)], width, height);
  const before = analyzeApng(apng);
  assert.ok(before.issues.some((issue) => issue.code === 'APNG_ALPHA_COLLAPSE'));
  const repaired = repairApng(apng, { temporal: true });
  const decoded = compositeFrames(parseApng(repaired.output));
  assert.ok(frameMetrics(decoded[1].rgba, width, height).alphaRatio > 0.95);
});

test('codec-only repair preserves every displayed pixel and timeline', () => {
  const width = 7; const height = 5;
  const frames = [frame(gradient(width, height, 1), 80), frame(gradient(width, height, 2), 120), frame(gradient(width, height, 3), 160)];
  const input = encodeApng(frames, width, height, { numPlays: 3 });
  const original = compositeFrames(parseApng(input));
  const repaired = repairApng(input, { temporal: false });
  const output = compositeFrames(parseApng(repaired.output));
  assert.equal(repaired.report.pixelExactToRepairTarget, true);
  assert.equal(repaired.report.pixelExactToInput, true);
  assert.equal(repaired.report.timelineExact, true);
  assert.equal(parseApng(repaired.output).actl.numPlays, 3);
  for (let i = 0; i < original.length; i += 1) assert.deepEqual(output[i].rgba, original[i].rgba);
});

test('repair is byte-deterministic and idempotent after normalization', () => {
  const width = 9; const height = 7;
  const input = encodeApng([frame(gradient(width, height, 1)), frame(gradient(width, height, 2))], width, height);
  const first = repairApng(input, { temporal: false }).output;
  const second = repairApng(first, { temporal: false }).output;
  assert.deepEqual(second, first);
});

test('rejects APNG sequence-number corruption even with valid CRC', () => {
  const input = encodeApng([frame(solid(4, 4, 1, 2, 3)), frame(solid(4, 4, 4, 5, 6))], 4, 4);
  const chunks = parseChunks(input);
  const target = chunks.find((chunk) => chunk.type === 'fdAT');
  assert.ok(target);
  target.data.writeUInt32BE(999, 0);
  const corrupt = rebuild(chunks);
  assert.throws(() => parseApng(corrupt), /APNG_SEQUENCE_INVALID/);
});

test('rejects truncated/corrupt PNG data fail-closed', () => {
  const input = encodeApng([frame(solid(4, 4, 1, 2, 3))], 4, 4);
  assert.throws(() => parseApng(input.subarray(0, input.length - 7)), /PNG_CHUNK_TRUNCATED|PNG_IEND_MISSING/);
  const altered = Buffer.from(input);
  altered[altered.length - 1] ^= 1;
  assert.throws(() => parseApng(altered), /PNG_CRC_INVALID/);
});

test('enforces configured frame/decode resource limits', () => {
  const input = encodeApng([frame(solid(16, 16, 1, 2, 3)), frame(solid(16, 16, 4, 5, 6)), frame(solid(16, 16, 7, 8, 9))], 16, 16);
  assert.throws(() => parseApng(input, { maxFrames: 2 }), /APNG_FRAME_COUNT_UNSAFE/);
  assert.throws(() => parseApng(input, { maxDecodedBytes: 16 * 16 * 4 * 2 }), /APNG_DECODE_BUDGET_UNSAFE/);
});

test('reports duplicate frames and severe timing jitter as warnings', () => {
  const width = 6; const height = 6;
  const a = solid(width, height, 20, 30, 40);
  const b = solid(width, height, 25, 35, 45);
  const input = encodeApng([frame(a, 10), frame(a, 10), frame(b, 10), frame(a, 1000)], width, height);
  const report = analyzeApng(input);
  assert.ok(report.issues.some((issue) => issue.code === 'APNG_DUPLICATE_FRAME'));
  assert.ok(report.issues.some((issue) => issue.code === 'APNG_DELAY_JITTER'));
});

test('declared frame-count mismatch is observable instead of silently hidden', () => {
  const input = encodeApng([frame(solid(4, 4, 10, 20, 30)), frame(solid(4, 4, 20, 30, 40))], 4, 4);
  const chunks = parseChunks(input);
  const actl = chunks.find((chunk) => chunk.type === 'acTL');
  actl.data.writeUInt32BE(3, 0);
  const corrupt = rebuild(chunks);
  const report = analyzeApng(corrupt, { maxFrames: 8 });
  assert.ok(report.issues.some((issue) => issue.code === 'APNG_FRAME_COUNT_MISMATCH'));
});


test('decodes 8-bit grayscale tRNS transparency exactly', () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
  const actl = Buffer.alloc(8); actl.writeUInt32BE(1, 0); actl.writeUInt32BE(0, 4);
  const fctl = Buffer.alloc(26); fctl.writeUInt32BE(0, 0); fctl.writeUInt32BE(1, 4); fctl.writeUInt32BE(1, 8); fctl.writeUInt16BE(10, 20); fctl.writeUInt16BE(100, 22);
  const trns = Buffer.alloc(2); trns.writeUInt16BE(7, 0);
  const raw = Buffer.from([0, 7]);
  const input = Buffer.concat([PNG_SIGNATURE, makeChunk('IHDR', ihdr), makeChunk('tRNS', trns), makeChunk('acTL', actl), makeChunk('fcTL', fctl), makeChunk('IDAT', zlib.deflateSync(raw)), makeChunk('IEND', Buffer.alloc(0))]);
  const decoded = compositeFrames(parseApng(input));
  assert.equal(decoded[0].rgba[3], 0);
});

test('enforces repaired-output byte budget fail-closed', () => {
  const width = 20; const height = 20;
  const input = encodeApng([frame(gradient(width, height, 1)), frame(gradient(width, height, 2))], width, height);
  assert.throws(() => repairApng(input, { temporal: false, maxOutputBytes: 32 }), /APNG_REPAIR_OUTPUT_TOO_LARGE/);
});

test('seeded synthetic corpus roundtrips without pixel or timeline drift', () => {
  let seed = 0x12345678;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let caseIndex = 0; caseIndex < 25; caseIndex += 1) {
    const width = 3 + (rnd() % 8); const height = 3 + (rnd() % 8); const count = 2 + (rnd() % 6);
    const frames = [];
    for (let i = 0; i < count; i += 1) {
      const rgba = Buffer.alloc(width * height * 4);
      for (let p = 0; p < width * height; p += 1) {
        const o = p * 4; rgba[o] = rnd() & 255; rgba[o + 1] = rnd() & 255; rgba[o + 2] = rnd() & 255; rgba[o + 3] = rnd() & 255;
      }
      frames.push(frame(rgba, 20 + (rnd() % 300)));
    }
    const input = encodeApng(frames, width, height, { numPlays: rnd() % 5 });
    const repaired = repairApng(input, { temporal: false, sanitizeTransparentRgb: false });
    assert.equal(repaired.report.pixelExactToInput, true);
    assert.equal(repaired.report.timelineExact, true);
  }
});

function buildSingleFrameApng({ width, height, bitDepth, colorType, interlace, raw, transparency = null }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace;
  const actl = Buffer.alloc(8); actl.writeUInt32BE(1, 0); actl.writeUInt32BE(0, 4);
  const fctl = Buffer.alloc(26); fctl.writeUInt32BE(0, 0); fctl.writeUInt32BE(width, 4); fctl.writeUInt32BE(height, 8); fctl.writeUInt16BE(10, 20); fctl.writeUInt16BE(100, 22);
  const chunks = [PNG_SIGNATURE, makeChunk('IHDR', ihdr)];
  if (transparency) chunks.push(makeChunk('tRNS', transparency));
  chunks.push(makeChunk('acTL', actl), makeChunk('fcTL', fctl), makeChunk('IDAT', zlib.deflateSync(raw)), makeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function adam7Raw8Gray(width, height, values) {
  const passes = [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
  const bytes = [];
  for (const [x0,y0,dx,dy] of passes) {
    const pw = width <= x0 ? 0 : Math.ceil((width - x0) / dx);
    const ph = height <= y0 ? 0 : Math.ceil((height - y0) / dy);
    for (let py = 0; py < ph; py += 1) {
      bytes.push(0);
      const y = y0 + py * dy;
      for (let px = 0; px < pw; px += 1) {
        const x = x0 + px * dx;
        bytes.push(values[y * width + x]);
      }
    }
  }
  return Buffer.from(bytes);
}

test('decodes 16-bit RGBA APNG and normalizes it to verified 8-bit RGBA', () => {
  const raw = Buffer.alloc(1 + 2 * 8); raw[0] = 0;
  const samples = [65535, 0, 32768, 65535, 0, 65535, 16384, 32768];
  samples.forEach((v, i) => raw.writeUInt16BE(v, 1 + i * 2));
  const input = buildSingleFrameApng({ width: 2, height: 1, bitDepth: 16, colorType: 6, interlace: 0, raw });
  const parsed = parseApng(input); const decoded = compositeFrames(parsed)[0].rgba;
  assert.deepEqual([...decoded], [255, 0, 128, 255, 0, 255, 64, 128]);
  const repaired = repairApng(input, { temporal: false, sanitizeTransparentRgb: false });
  assert.equal(repaired.report.sourceBitDepth, 16);
  assert.equal(repaired.report.outputBitDepth, 8);
  assert.equal(repaired.report.verified, true);
});

test('decodes Adam7-interlaced 8-bit APNG exactly and normalizes to non-interlaced output', () => {
  const width = 5; const height = 5;
  const values = Array.from({ length: width * height }, (_, i) => (i * 9 + 7) & 255);
  const input = buildSingleFrameApng({ width, height, bitDepth: 8, colorType: 0, interlace: 1, raw: adam7Raw8Gray(width, height, values) });
  const parsed = parseApng(input); const decoded = compositeFrames(parsed)[0].rgba;
  for (let i = 0; i < values.length; i += 1) {
    const o = i * 4; assert.equal(decoded[o], values[i]); assert.equal(decoded[o + 1], values[i]); assert.equal(decoded[o + 2], values[i]); assert.equal(decoded[o + 3], 255);
  }
  const repaired = repairApng(input, { temporal: false, sanitizeTransparentRgb: false });
  assert.equal(repaired.report.sourceInterlace, 1);
  assert.equal(repaired.report.outputInterlace, 0);
});

test('detects invisible RGB halo risk and removes fully transparent RGB without visible alpha changes', () => {
  const width = 8; const height = 8; const rgba = Buffer.alloc(width * height * 4);
  for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) {
    const o = (y * width + x) * 4; rgba[o] = 220; rgba[o + 1] = 120; rgba[o + 2] = 20; rgba[o + 3] = 255;
  }
  for (let y = 1; y < 7; y += 1) for (let x = 1; x < 7; x += 1) {
    const o = (y * width + x) * 4; if (rgba[o + 3] === 0) { rgba[o] = 255; rgba[o + 1] = 0; rgba[o + 2] = 255; }
  }
  const input = encodeApng([frame(rgba)], width, height);
  const before = analyzeApng(input);
  assert.ok(before.issues.some((i) => i.code === 'APNG_ALPHA_HALO_RISK'));
  const repaired = repairApng(input, { temporal: false });
  assert.ok(repaired.report.actions.some((a) => a.action === 'TRANSPARENT_RGB_SANITIZE'));
  const out = compositeFrames(parseApng(repaired.output))[0].rgba;
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] === 0) assert.deepEqual([...out.subarray(i, i + 3)], [0, 0, 0]);
});

test('motion analysis flags a one-frame translation reversal spike', () => {
  const width = 32; const height = 24;
  const sprite = (offsetX) => {
    const out = Buffer.alloc(width * height * 4);
    for (let y = 7; y < 17; y += 1) for (let x = 8 + offsetX; x < 18 + offsetX; x += 1) {
      const o = (y * width + x) * 4; out[o] = 240; out[o + 1] = 220; out[o + 2] = 60; out[o + 3] = 255;
    }
    return out;
  };
  const input = encodeApng([frame(sprite(0)), frame(sprite(5)), frame(sprite(0))], width, height);
  const report = analyzeApng(input);
  assert.ok(report.issues.some((i) => i.code === 'APNG_MOTION_REVERSAL_SPIKE' || i.code === 'APNG_ANCHOR_DRIFT'));
});

test('decodes combined 16-bit + Adam7 RGBA source and normalizes safely', () => {
  const raw = Buffer.alloc(1 + 8); raw[0] = 0;
  [65535, 32768, 0, 49152].forEach((v, i) => raw.writeUInt16BE(v, 1 + i * 2));
  const input = buildSingleFrameApng({ width: 1, height: 1, bitDepth: 16, colorType: 6, interlace: 1, raw });
  const decoded = compositeFrames(parseApng(input))[0].rgba;
  assert.deepEqual([...decoded], [255, 128, 0, 191]);
  const repaired = repairApng(input, { temporal: false, sanitizeTransparentRgb: false });
  assert.equal(repaired.report.sourceBitDepth, 16);
  assert.equal(repaired.report.sourceInterlace, 1);
  assert.equal(repaired.report.outputBitDepth, 8);
  assert.equal(repaired.report.outputInterlace, 0);
});

test('mutation fuzz never emits an unverified repaired APNG', () => {
  const base = encodeApng([frame(gradient(9, 7, 1)), frame(gradient(9, 7, 2)), frame(gradient(9, 7, 3))], 9, 7);
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed; };
  for (let i = 0; i < 80; i += 1) {
    const mutated = Buffer.from(base);
    const pos = 8 + (rnd() % Math.max(1, mutated.length - 16));
    mutated[pos] ^= 1 << (rnd() % 8);
    try {
      const result = repairApng(mutated, { temporal: false, sanitizeTransparentRgb: false });
      assert.equal(result.report.verified, true);
      assert.equal(result.report.timelineExact, true);
      assert.equal(result.report.pixelExactToRepairTarget, true);
      parseApng(result.output);
    } catch (error) {
      assert.ok(error instanceof Error);
    }
  }
});
