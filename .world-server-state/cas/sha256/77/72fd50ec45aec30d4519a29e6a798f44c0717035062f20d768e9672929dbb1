'use strict';

const zlib = require('zlib');
const crypto = require('crypto');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS_DEFAULT = 4096 * 4096;
const MAX_FRAMES_DEFAULT = 256;
const MAX_DECODED_BYTES_DEFAULT = 128 * 1024 * 1024;
const MAX_CHUNKS_DEFAULT = 100000;
const ENGINE_VERSION = '3.0.0';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.from(data || []);
  const out = Buffer.allocUnsafe(payload.length + 12);
  out.writeUInt32BE(payload.length, 0);
  typeBuffer.copy(out, 4);
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])), payload.length + 8);
  return out;
}

function parseChunks(input, options = {}) {
  const buffer = Buffer.from(input);
  if (buffer.length < 20 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG_SIGNATURE_INVALID');
  const validateCrc = options.validateCrc !== false;
  const maxChunks = Number(options.maxChunks || MAX_CHUNKS_DEFAULT);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    if (chunks.length >= maxChunks) throw new Error('PNG_CHUNK_COUNT_UNSAFE');
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > buffer.length) throw new Error('PNG_CHUNK_TRUNCATED');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(buffer.subarray(offset + 4, offset + 8 + length));
    if (validateCrc && expectedCrc !== actualCrc) throw new Error(`PNG_CRC_INVALID:${type}`);
    chunks.push({ type, data: Buffer.from(data), offset, length, crc: expectedCrc });
    offset = end;
    if (type === 'IEND') break;
  }
  if (chunks.length && chunks[chunks.length - 1].type === 'IEND' && offset !== buffer.length) throw new Error('PNG_TRAILING_BYTES');
  if (!chunks.length || chunks[0].type !== 'IHDR') throw new Error('PNG_IHDR_MISSING');
  if (chunks[chunks.length - 1].type !== 'IEND') throw new Error('PNG_IEND_MISSING');
  return chunks;
}

function parseFrameControl(data) {
  if (data.length !== 26) throw new Error('APNG_FCTL_INVALID_LENGTH');
  const delayNum = data.readUInt16BE(20);
  const delayDenRaw = data.readUInt16BE(22);
  const delayDen = delayDenRaw || 100;
  return {
    sequence: data.readUInt32BE(0),
    width: data.readUInt32BE(4),
    height: data.readUInt32BE(8),
    x: data.readUInt32BE(12),
    y: data.readUInt32BE(16),
    delayNum,
    delayDen,
    delayDenRaw,
    delayMs: (1000 * delayNum) / delayDen,
    dispose: data[24],
    blend: data[25]
  };
}

function parseApng(input, options = {}) {
  const chunks = parseChunks(input, options);
  const ihdr = chunks[0].data;
  if (ihdr.length !== 13) throw new Error('PNG_IHDR_INVALID');
  const info = {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    compression: ihdr[10],
    filter: ihdr[11],
    interlace: ihdr[12]
  };
  const maxPixels = Number(options.maxPixels || MAX_PIXELS_DEFAULT);
  if (!info.width || !info.height || info.width * info.height > maxPixels) throw new Error('PNG_DIMENSIONS_UNSAFE');
  if (![8, 16].includes(info.bitDepth)) throw new Error('PNG_BIT_DEPTH_UNSUPPORTED');
  if (info.colorType === 3 && info.bitDepth !== 8) throw new Error('PNG_PALETTE_BIT_DEPTH_UNSUPPORTED');
  if (info.compression !== 0) throw new Error('PNG_COMPRESSION_UNSUPPORTED');
  if (info.filter !== 0) throw new Error('PNG_FILTER_METHOD_UNSUPPORTED');
  if (![0, 1].includes(info.interlace)) throw new Error('PNG_INTERLACE_UNSUPPORTED');
  if (![0, 2, 3, 4, 6].includes(info.colorType)) throw new Error('PNG_COLOR_TYPE_UNSUPPORTED');

  let actl = null;
  let palette = null;
  let transparency = null;
  const frames = [];
  const defaultData = [];
  const preservedChunks = [];
  let currentFrame = null;
  let seenIdat = false;
  let firstFrameUsesIdat = false;
  let expectedSequence = 0;
  let seenActl = false;
  const maxFrames = Number(options.maxFrames || MAX_FRAMES_DEFAULT);
  const maxDecodedBytes = Number(options.maxDecodedBytes || MAX_DECODED_BYTES_DEFAULT);
  const canvasBytes = info.width * info.height * 4;
  const sourceBytesPerSample = info.bitDepth === 16 ? 2 : 1;
  const sourceFrameBytes = info.width * info.height * channelsForColorType(info.colorType) * sourceBytesPerSample;
  const conservativePerFrameBudget = canvasBytes + sourceFrameBytes;

  for (let i = 1; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (chunk.type === 'acTL') {
      if (seenActl) throw new Error('APNG_ACTL_DUPLICATE');
      if (seenIdat) throw new Error('APNG_ACTL_AFTER_IDAT');
      if (chunk.data.length !== 8) throw new Error('APNG_ACTL_INVALID_LENGTH');
      actl = { numFrames: chunk.data.readUInt32BE(0), numPlays: chunk.data.readUInt32BE(4) };
      if (!actl.numFrames) throw new Error('APNG_FRAME_COUNT_ZERO');
      if (actl.numFrames > maxFrames) throw new Error('APNG_FRAME_COUNT_UNSAFE');
      if (conservativePerFrameBudget * actl.numFrames > maxDecodedBytes) throw new Error('APNG_DECODE_BUDGET_UNSAFE');
      seenActl = true;
    } else if (chunk.type === 'PLTE') {
      palette = Buffer.from(chunk.data);
      if (!seenIdat) preservedChunks.push(chunk);
    } else if (chunk.type === 'tRNS') {
      transparency = Buffer.from(chunk.data);
      if (!seenIdat) preservedChunks.push(chunk);
    } else if (chunk.type === 'fcTL') {
      if (!seenActl) throw new Error('APNG_FCTL_BEFORE_ACTL');
      const control = parseFrameControl(chunk.data);
      if (control.sequence !== expectedSequence) throw new Error(`APNG_SEQUENCE_INVALID:expected=${expectedSequence}:actual=${control.sequence}`);
      expectedSequence += 1;
      if (!control.width || !control.height || control.x + control.width > info.width || control.y + control.height > info.height) {
        throw new Error('APNG_FRAME_BOUNDS_INVALID');
      }
      if (control.dispose > 2) throw new Error('APNG_BAD_DISPOSE');
      if (control.blend > 1) throw new Error('APNG_BAD_BLEND');
      const source = frames.length === 0 && !seenIdat ? 'IDAT' : 'fdAT';
      if (source === 'IDAT') firstFrameUsesIdat = true;
      currentFrame = { ...control, source, data: [] };
      frames.push(currentFrame);
      if (frames.length > maxFrames || conservativePerFrameBudget * frames.length > maxDecodedBytes) throw new Error('APNG_DECODE_BUDGET_UNSAFE');
    } else if (chunk.type === 'IDAT') {
      if (!seenActl) throw new Error('APNG_IDAT_BEFORE_ACTL');
      seenIdat = true;
      if (firstFrameUsesIdat && frames[0]) frames[0].data.push(Buffer.from(chunk.data));
      else defaultData.push(Buffer.from(chunk.data));
    } else if (chunk.type === 'fdAT') {
      if (!seenActl) throw new Error('APNG_FDAT_BEFORE_ACTL');
      if (!currentFrame || chunk.data.length < 4) throw new Error('APNG_FDAT_WITHOUT_FRAME');
      const sequence = chunk.data.readUInt32BE(0);
      if (sequence !== expectedSequence) throw new Error(`APNG_SEQUENCE_INVALID:expected=${expectedSequence}:actual=${sequence}`);
      expectedSequence += 1;
      currentFrame.data.push(Buffer.from(chunk.data.subarray(4)));
    } else if (!seenIdat && !['IHDR', 'IEND'].includes(chunk.type)) {
      // Keep safe color/pixel-density metadata. Animation/data chunks are handled above.
      if (['cHRM', 'gAMA', 'iCCP', 'sRGB', 'pHYs'].includes(chunk.type)) preservedChunks.push(chunk);
    }
  }

  if (!actl) throw new Error('APNG_ACTL_MISSING');
  if (!frames.length) throw new Error('APNG_FRAMES_MISSING');
  if (info.colorType === 3 && (!palette || palette.length < 3 || palette.length > 768 || palette.length % 3 !== 0)) throw new Error('PNG_PALETTE_INVALID');
  if (actl.numFrames !== frames.length) {
    // Keep decoding so the report can surface this mismatch; repair will rewrite a consistent count.
  }
  for (const frame of frames) if (!frame.data.length) throw new Error('APNG_FRAME_DATA_MISSING');

  return { ...info, actl, frames, palette, transparency, preservedChunks, defaultData, chunks };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function channelsForColorType(colorType) {
  return ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType] || 0;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  if (raw.length !== height * (stride + 1)) throw new Error('PNG_DECOMPRESSED_SIZE_MISMATCH');
  const out = Buffer.allocUnsafe(height * stride);
  let inOffset = 0;
  let outOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inOffset++];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[inOffset++];
      const left = x >= bpp ? out[outOffset + x - bpp] : 0;
      const up = y > 0 ? out[outOffset + x - stride] : 0;
      const upLeft = y > 0 && x >= bpp ? out[outOffset + x - stride - bpp] : 0;
      let decoded;
      if (filter === 0) decoded = value;
      else if (filter === 1) decoded = (value + left) & 0xff;
      else if (filter === 2) decoded = (value + up) & 0xff;
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) decoded = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error('PNG_FILTER_UNSUPPORTED');
      out[outOffset + x] = decoded;
    }
    outOffset += stride;
  }
  return out;
}

function sampleTo8(value16) {
  return Math.max(0, Math.min(255, Math.round(value16 / 257)));
}

function pixelsToRgba(scan, width, height, colorType, palette, transparency, bitDepth = 8) {
  const channels = channelsForColorType(colorType);
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const rgba = Buffer.allocUnsafe(width * height * 4);
  let src = 0;
  let dst = 0;
  const readSample = () => {
    if (bytesPerSample === 1) return scan[src++];
    const value = scan.readUInt16BE(src); src += 2; return value;
  };
  const to8 = (value) => bytesPerSample === 1 ? value : sampleTo8(value);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 6) {
      const rr = readSample(); const gg = readSample(); const bb = readSample(); const aa = readSample();
      rgba[dst++] = to8(rr); rgba[dst++] = to8(gg); rgba[dst++] = to8(bb); rgba[dst++] = to8(aa);
    } else if (colorType === 2) {
      const rr = readSample(); const gg = readSample(); const bb = readSample();
      let aa = 255;
      if (transparency && transparency.length >= 6 && rr === transparency.readUInt16BE(0) && gg === transparency.readUInt16BE(2) && bb === transparency.readUInt16BE(4)) aa = 0;
      rgba[dst++] = to8(rr); rgba[dst++] = to8(gg); rgba[dst++] = to8(bb); rgba[dst++] = aa;
    } else if (colorType === 0) {
      const gray = readSample();
      const a = transparency && transparency.length >= 2 && gray === transparency.readUInt16BE(0) ? 0 : 255;
      const g8 = to8(gray); rgba[dst++] = g8; rgba[dst++] = g8; rgba[dst++] = g8; rgba[dst++] = a;
    } else if (colorType === 4) {
      const gray = readSample(); const aa = readSample(); const g8 = to8(gray);
      rgba[dst++] = g8; rgba[dst++] = g8; rgba[dst++] = g8; rgba[dst++] = to8(aa);
    } else if (colorType === 3) {
      const index = scan[src++];
      const pi = index * 3;
      if (!palette || pi + 2 >= palette.length) throw new Error('PNG_PALETTE_INDEX_INVALID');
      rgba[dst++] = palette[pi]; rgba[dst++] = palette[pi + 1]; rgba[dst++] = palette[pi + 2];
      rgba[dst++] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  if (!channels) throw new Error('PNG_COLOR_TYPE_UNSUPPORTED');
  return rgba;
}

const ADAM7_PASSES = Object.freeze([
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]
]);

function passSize(size, start, step) {
  return size <= start ? 0 : Math.ceil((size - start) / step);
}

function expectedInflatedBytes(width, height, bpp, interlace) {
  if (interlace === 0) return height * (width * bpp + 1);
  let total = 0;
  for (const [x0, y0, dx, dy] of ADAM7_PASSES) {
    const pw = passSize(width, x0, dx); const ph = passSize(height, y0, dy);
    if (pw && ph) total += ph * (pw * bpp + 1);
  }
  return total;
}

function deinterlaceAdam7(raw, width, height, bpp) {
  const out = Buffer.alloc(width * height * bpp);
  let offset = 0;
  for (const [x0, y0, dx, dy] of ADAM7_PASSES) {
    const pw = passSize(width, x0, dx); const ph = passSize(height, y0, dy);
    if (!pw || !ph) continue;
    const passBytes = ph * (pw * bpp + 1);
    if (offset + passBytes > raw.length) throw new Error('PNG_ADAM7_TRUNCATED');
    const pass = unfilter(raw.subarray(offset, offset + passBytes), pw, ph, bpp);
    offset += passBytes;
    for (let py = 0; py < ph; py += 1) {
      const y = y0 + py * dy;
      for (let px = 0; px < pw; px += 1) {
        const x = x0 + px * dx;
        const si = (py * pw + px) * bpp;
        const di = (y * width + x) * bpp;
        pass.copy(out, di, si, si + bpp);
      }
    }
  }
  if (offset !== raw.length) throw new Error('PNG_ADAM7_SIZE_MISMATCH');
  return out;
}

function decodeFrame(frame, parsed) {
  const bytesPerSample = parsed.bitDepth === 16 ? 2 : 1;
  const bpp = channelsForColorType(parsed.colorType) * bytesPerSample;
  const expected = expectedInflatedBytes(frame.width, frame.height, bpp, parsed.interlace);
  const compressed = Buffer.concat(frame.data);
  const raw = zlib.inflateSync(compressed, { maxOutputLength: expected });
  if (raw.length !== expected) throw new Error('PNG_DECOMPRESSED_SIZE_MISMATCH');
  const scan = parsed.interlace === 1 ? deinterlaceAdam7(raw, frame.width, frame.height, bpp) : unfilter(raw, frame.width, frame.height, bpp);
  return pixelsToRgba(scan, frame.width, frame.height, parsed.colorType, parsed.palette, parsed.transparency, parsed.bitDepth);
}

function alphaOver(dst, di, src, si) {
  const sa = src[si + 3] / 255;
  if (sa <= 0) return;
  if (sa >= 1) {
    dst[di] = src[si]; dst[di + 1] = src[si + 1]; dst[di + 2] = src[si + 2]; dst[di + 3] = 255;
    return;
  }
  const da = dst[di + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) { dst[di] = 0; dst[di + 1] = 0; dst[di + 2] = 0; dst[di + 3] = 0; return; }
  dst[di] = Math.round((src[si] * sa + dst[di] * da * (1 - sa)) / oa);
  dst[di + 1] = Math.round((src[si + 1] * sa + dst[di + 1] * da * (1 - sa)) / oa);
  dst[di + 2] = Math.round((src[si + 2] * sa + dst[di + 2] * da * (1 - sa)) / oa);
  dst[di + 3] = Math.round(oa * 255);
}

function compositeFrames(parsed) {
  const canvas = Buffer.alloc(parsed.width * parsed.height * 4);
  const displayed = [];
  for (const frame of parsed.frames) {
    const before = frame.dispose === 2 ? Buffer.from(canvas) : null;
    const pixels = decodeFrame(frame, parsed);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < frame.width; x += 1) {
        const si = (y * frame.width + x) * 4;
        const di = ((frame.y + y) * parsed.width + frame.x + x) * 4;
        if (frame.blend === 0) {
          canvas[di] = pixels[si]; canvas[di + 1] = pixels[si + 1]; canvas[di + 2] = pixels[si + 2]; canvas[di + 3] = pixels[si + 3];
        } else alphaOver(canvas, di, pixels, si);
      }
    }
    displayed.push({
      rgba: Buffer.from(canvas),
      delayNum: frame.delayNum,
      delayDen: frame.delayDen,
      delayDenRaw: frame.delayDenRaw,
      delayMs: frame.delayMs,
      sourceControl: { width: frame.width, height: frame.height, x: frame.x, y: frame.y, dispose: frame.dispose, blend: frame.blend }
    });
    if (frame.dispose === 1) {
      for (let y = 0; y < frame.height; y += 1) {
        const start = ((frame.y + y) * parsed.width + frame.x) * 4;
        canvas.fill(0, start, start + frame.width * 4);
      }
    } else if (frame.dispose === 2 && before) before.copy(canvas);
  }
  return displayed;
}

function frameMetrics(rgba, width, height) {
  let alphaSum = 0;
  let visible = 0;
  let r = 0; let g = 0; let b = 0; let l = 0;
  let cx = 0; let cy = 0;
  const pixels = width * height;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const a = rgba[o + 3] / 255;
    alphaSum += a;
    if (rgba[o + 3] > 16) {
      visible += 1;
      r += rgba[o] / 255; g += rgba[o + 1] / 255; b += rgba[o + 2] / 255;
      l += (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255;
    }
    if (a > 0) { cx += (i % width) * a; cy += Math.floor(i / width) * a; }
  }
  return {
    alphaRatio: alphaSum / pixels,
    visibleRatio: visible / pixels,
    meanR: visible ? r / visible : 0,
    meanG: visible ? g / visible : 0,
    meanB: visible ? b / visible : 0,
    luma: visible ? l / visible : 0,
    centroidX: alphaSum ? cx / alphaSum : width / 2,
    centroidY: alphaSum ? cy / alphaSum : height / 2
  };
}

function normalizedFrameDiff(a, b) {
  if (a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
    sum += Math.abs(a[i + 1] - b[i + 1]);
    sum += Math.abs(a[i + 2] - b[i + 2]);
    sum += Math.abs(a[i + 3] - b[i + 3]);
  }
  return sum / ((a.length / 4) * 4 * 255);
}

function alphaEdgeMetrics(rgba, width, height) {
  let edgePixels = 0; let semiTransparent = 0; let hiddenRgb = 0; let hiddenRgbNearEdge = 0;
  const visible = (x, y) => rgba[(y * width + x) * 4 + 3] > 16;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const o = (y * width + x) * 4; const a = rgba[o + 3];
    const nearVisible = (x > 0 && visible(x - 1, y)) || (x + 1 < width && visible(x + 1, y)) || (y > 0 && visible(x, y - 1)) || (y + 1 < height && visible(x, y + 1));
    if (a > 0 && a < 255) semiTransparent += 1;
    if (nearVisible && a <= 32) edgePixels += 1;
    if (a === 0 && (rgba[o] > 8 || rgba[o + 1] > 8 || rgba[o + 2] > 8)) {
      hiddenRgb += 1; if (nearVisible) hiddenRgbNearEdge += 1;
    }
  }
  const pixels = width * height;
  return {
    edgeRatio: edgePixels / pixels,
    semiTransparentRatio: semiTransparent / pixels,
    hiddenRgbRatio: hiddenRgb / pixels,
    hiddenRgbNearEdgeRatio: hiddenRgbNearEdge / pixels
  };
}

function estimateTranslation(a, b, width, height, maxShift = 8) {
  const pixels = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(pixels / 16000)));
  const shift = Math.max(1, Math.min(maxShift, Math.floor(Math.min(width, height) * 0.08)));
  let best = { dx: 0, dy: 0, score: Infinity }; let zeroScore = Infinity;
  const sample = (buf, x, y) => {
    const o = (y * width + x) * 4;
    const alpha = buf[o + 3] / 255;
    const luma = (0.2126 * buf[o] + 0.7152 * buf[o + 1] + 0.0722 * buf[o + 2]) / 255;
    return [alpha, luma * alpha];
  };
  for (let dy = -shift; dy <= shift; dy += 1) for (let dx = -shift; dx <= shift; dx += 1) {
    let sum = 0; let count = 0;
    for (let y = shift; y < height - shift; y += stride) for (let x = shift; x < width - shift; x += stride) {
      const bx = x + dx; const by = y + dy;
      if (bx < 0 || bx >= width || by < 0 || by >= height) continue;
      const av = sample(a, x, y); const bv = sample(b, bx, by);
      sum += Math.abs(av[0] - bv[0]) * 0.65 + Math.abs(av[1] - bv[1]) * 0.35; count += 1;
    }
    const score = count ? sum / count : 1;
    if (dx === 0 && dy === 0) zeroScore = score;
    if (score < best.score) best = { dx, dy, score };
  }
  return { ...best, improvement: Number.isFinite(zeroScore) && zeroScore > 0 ? Math.max(0, (zeroScore - best.score) / zeroScore) : 0 };
}

function sanitizeTransparentRgb(rgba) {
  const out = Buffer.from(rgba); let changed = 0;
  for (let i = 0; i < out.length; i += 4) if (out[i + 3] === 0 && (out[i] || out[i + 1] || out[i + 2])) {
    out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; changed += 1;
  }
  return { rgba: out, changed };
}

const ISSUE_CONFIDENCE = Object.freeze({
  APNG_BRIGHTNESS_FLASH: 0.97, APNG_COLOR_FLASH: 0.95, APNG_ALPHA_COLLAPSE: 0.98, APNG_ANCHOR_DRIFT: 0.90,
  APNG_FRAME_COUNT_MISMATCH: 1, APNG_SUSPICIOUS_DELAY: 0.85, APNG_DUPLICATE_FRAME: 0.92, APNG_DELAY_JITTER: 0.82,
  APNG_LOOP_SEAM: 0.84, APNG_CODEC_FLICKER_RISK: 0.99, APNG_ALPHA_HALO_RISK: 0.91, APNG_EDGE_POP: 0.88,
  APNG_MOTION_REVERSAL_SPIKE: 0.90
});
function addIssue(issues, code, frame, severity, evidence) {
  issues.push({ code, frame, severity, confidence: ISSUE_CONFIDENCE[code] || 0.9, evidence });
}
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeComposited(parsed, frames) {
  const metrics = frames.map((frame) => frameMetrics(frame.rgba, parsed.width, parsed.height));
  const edgeMetrics = frames.map((frame) => alphaEdgeMetrics(frame.rgba, parsed.width, parsed.height));
  const issues = [];
  if (parsed.actl.numFrames !== parsed.frames.length) addIssue(issues, 'APNG_FRAME_COUNT_MISMATCH', null, 'error', { declared: parsed.actl.numFrames, decoded: parsed.frames.length });

  for (let i = 0; i < parsed.frames.length; i += 1) {
    const f = parsed.frames[i];
    if (f.dispose > 2) addIssue(issues, 'APNG_BAD_DISPOSE', i, 'error', { dispose: f.dispose });
    if (f.blend > 1) addIssue(issues, 'APNG_BAD_BLEND', i, 'error', { blend: f.blend });
    if (!Number.isFinite(f.delayMs) || f.delayMs < 10 || f.delayMs > 10000) addIssue(issues, 'APNG_SUSPICIOUS_DELAY', i, 'warning', { delayMs: f.delayMs });
  }
  const codecRisk = parsed.frames.some((f) => f.width !== parsed.width || f.height !== parsed.height || f.x !== 0 || f.y !== 0 || f.dispose !== 0 || f.blend !== 0);
  if (codecRisk) addIssue(issues, 'APNG_CODEC_FLICKER_RISK', null, 'warning', { recommendation: 'full-frame SOURCE + dispose NONE normalization' });
  const delays = parsed.frames.map((f) => f.delayMs).filter(Number.isFinite);
  if (delays.length >= 4) {
    const med = median(delays); const min = Math.min(...delays); const max = Math.max(...delays);
    if (med > 0 && max / Math.max(1, min) > 8) addIssue(issues, 'APNG_DELAY_JITTER', null, 'warning', { minMs: min, medianMs: med, maxMs: max });
  }
  for (let i = 1; i < frames.length; i += 1) {
    const diff = normalizedFrameDiff(frames[i - 1].rgba, frames[i].rgba);
    if (diff === 0) addIssue(issues, 'APNG_DUPLICATE_FRAME', i, 'warning', { previousFrame: i - 1, delayMs: parsed.frames[i].delayMs });
  }
  for (let i = 0; i < edgeMetrics.length; i += 1) {
    const edge = edgeMetrics[i];
    if (edge.hiddenRgbNearEdgeRatio > 0.0025) addIssue(issues, 'APNG_ALPHA_HALO_RISK', i, 'warning', edge);
    if (i > 0 && i + 1 < edgeMetrics.length) {
      const neighbor = (edgeMetrics[i - 1].edgeRatio + edgeMetrics[i + 1].edgeRatio) / 2;
      if (neighbor > 0.002 && Math.abs(edge.edgeRatio - neighbor) > Math.max(0.02, neighbor * 1.8)) addIssue(issues, 'APNG_EDGE_POP', i, 'warning', { edgeRatio: edge.edgeRatio, neighborMean: neighbor });
    }
  }
  const motionVectors = [];
  if (frames.length <= 120 && parsed.width * parsed.height <= 1024 * 1024) {
    for (let i = 1; i < frames.length; i += 1) motionVectors.push(estimateTranslation(frames[i - 1].rgba, frames[i].rgba, parsed.width, parsed.height));
    for (let i = 1; i < motionVectors.length; i += 1) {
      const a = motionVectors[i - 1]; const b = motionVectors[i];
      const magA = Math.hypot(a.dx, a.dy); const magB = Math.hypot(b.dx, b.dy);
      const reversal = Math.hypot(a.dx + b.dx, a.dy + b.dy);
      if (magA >= 3 && magB >= 3 && reversal <= 1.5 && a.improvement > 0.08 && b.improvement > 0.08) {
        addIssue(issues, 'APNG_MOTION_REVERSAL_SPIKE', i, 'warning', { in: a, out: b, reversalResidual: reversal });
      }
    }
  }

  if (parsed.actl.numPlays === 0 && frames.length >= 3) {
    const adjacent = []; for (let i = 1; i < frames.length; i += 1) adjacent.push(normalizedFrameDiff(frames[i - 1].rgba, frames[i].rgba));
    const seam = normalizedFrameDiff(frames[frames.length - 1].rgba, frames[0].rgba); const typical = median(adjacent);
    if (typical < 0.12 && seam > Math.max(0.25, typical * 4)) addIssue(issues, 'APNG_LOOP_SEAM', null, 'warning', { seamDiff: seam, medianAdjacentDiff: typical });
  }

  const diag = Math.hypot(parsed.width, parsed.height);
  for (let i = 1; i < frames.length - 1; i += 1) {
    const prev = metrics[i - 1]; const cur = metrics[i]; const next = metrics[i + 1];
    const prevNextLuma = Math.abs(prev.luma - next.luma);
    const targetLuma = (prev.luma + next.luma) / 2;
    const dPrev = normalizedFrameDiff(frames[i].rgba, frames[i - 1].rgba);
    const dNext = normalizedFrameDiff(frames[i].rgba, frames[i + 1].rgba);
    if (prevNextLuma < 0.08 && Math.abs(cur.luma - targetLuma) > 0.22 && dPrev > 0.18 && dNext > 0.18) {
      addIssue(issues, 'APNG_BRIGHTNESS_FLASH', i, 'error', { luma: cur.luma, neighborMean: targetLuma, neighborDelta: prevNextLuma, diffPrev: dPrev, diffNext: dNext });
    }

    const neighborColorDelta = Math.max(Math.abs(prev.meanR - next.meanR), Math.abs(prev.meanG - next.meanG), Math.abs(prev.meanB - next.meanB));
    const colorSpike = Math.max(
      Math.abs(cur.meanR - (prev.meanR + next.meanR) / 2),
      Math.abs(cur.meanG - (prev.meanG + next.meanG) / 2),
      Math.abs(cur.meanB - (prev.meanB + next.meanB) / 2)
    );
    if (neighborColorDelta < 0.10 && colorSpike > 0.28 && dPrev > 0.18 && dNext > 0.18) {
      addIssue(issues, 'APNG_COLOR_FLASH', i, 'error', { colorSpike, neighborColorDelta });
    }

    const neighborAlpha = Math.min(prev.alphaRatio, next.alphaRatio);
    if (neighborAlpha > 0.08 && cur.alphaRatio < neighborAlpha * 0.45) {
      addIssue(issues, 'APNG_ALPHA_COLLAPSE', i, 'error', { alphaRatio: cur.alphaRatio, neighborFloor: neighborAlpha });
    }

    const targetX = (prev.centroidX + next.centroidX) / 2;
    const targetY = (prev.centroidY + next.centroidY) / 2;
    const drift = Math.hypot(cur.centroidX - targetX, cur.centroidY - targetY);
    const neighborDrift = Math.hypot(prev.centroidX - next.centroidX, prev.centroidY - next.centroidY);
    const threshold = Math.max(3, diag * 0.03);
    if (neighborDrift < threshold * 0.6 && drift > threshold && Math.abs(cur.alphaRatio - (prev.alphaRatio + next.alphaRatio) / 2) < 0.15) {
      addIssue(issues, 'APNG_ANCHOR_DRIFT', i, 'warning', { driftPixels: drift, targetX, targetY, centroidX: cur.centroidX, centroidY: cur.centroidY });
    }
  }

  return { metrics, edgeMetrics, motionVectors, issues };
}

function analyzeApng(input, options = {}) {
  const parsed = parseApng(input, options);
  const frames = compositeFrames(parsed);
  const analysis = analyzeComposited(parsed, frames);
  return {
    format: 'APNG',
    width: parsed.width,
    height: parsed.height,
    frameCount: parsed.frames.length,
    declaredFrameCount: parsed.actl.numFrames,
    plays: parsed.actl.numPlays,
    durationMs: parsed.frames.reduce((sum, f) => sum + f.delayMs, 0),
    inputBytes: Buffer.byteLength(input),
    inputSha256: crypto.createHash('sha256').update(input).digest('hex'),
    issues: analysis.issues,
    metrics: analysis.metrics,
    edgeMetrics: analysis.edgeMetrics,
    motionVectors: analysis.motionVectors,
    codec: {
      bitDepth: parsed.bitDepth,
      colorType: parsed.colorType,
      interlace: parsed.interlace,
      fullFrameCount: parsed.frames.filter((f) => f.width === parsed.width && f.height === parsed.height && f.x === 0 && f.y === 0).length,
      disposeModes: [...new Set(parsed.frames.map((f) => f.dispose))],
      blendModes: [...new Set(parsed.frames.map((f) => f.blend))],
      normalizedSafeCodec: parsed.frames.every((f) => f.width === parsed.width && f.height === parsed.height && f.x === 0 && f.y === 0 && f.dispose === 0 && f.blend === 0),
      sourceBitDepth: parsed.bitDepth,
      sourceInterlacedAdam7: parsed.interlace === 1
    },
    qualityScore: Math.max(0, 100 - analysis.issues.reduce((sum, issue) => sum + (issue.severity === 'error' ? 18 : 4), 0)),
    engineVersion: ENGINE_VERSION
  };
}

function averageFrames(a, b) {
  const out = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = Math.round((a[i] + b[i]) / 2);
  return out;
}

function shiftFrame(rgba, width, height, dx, dy) {
  const out = Buffer.alloc(rgba.length);
  for (let y = 0; y < height; y += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      const src = (y * width + x) * 4;
      const dst = (ny * width + nx) * 4;
      rgba.copy(out, dst, src, src + 4);
    }
  }
  return out;
}

function filterScore(buffer) {
  let score = 0;
  for (let i = 0; i < buffer.length; i += 1) score += Math.abs(buffer[i] < 128 ? buffer[i] : buffer[i] - 256);
  return score;
}

function encodeScanlinesRgba(rgba, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.allocUnsafe(height * (stride + 1));
  let outOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    let bestType = 0;
    let best = Buffer.from(rgba.subarray(rowStart, rowStart + stride));
    let bestScore = filterScore(best);
    for (let type = 1; type <= 4; type += 1) {
      const candidate = Buffer.allocUnsafe(stride);
      for (let x = 0; x < stride; x += 1) {
        const value = rgba[rowStart + x];
        const left = x >= bpp ? rgba[rowStart + x - bpp] : 0;
        const up = y > 0 ? rgba[rowStart + x - stride] : 0;
        const upLeft = y > 0 && x >= bpp ? rgba[rowStart + x - stride - bpp] : 0;
        let predictor = 0;
        if (type === 1) predictor = left;
        else if (type === 2) predictor = up;
        else if (type === 3) predictor = Math.floor((left + up) / 2);
        else predictor = paeth(left, up, upLeft);
        candidate[x] = (value - predictor + 256) & 0xff;
      }
      const score = filterScore(candidate);
      if (score < bestScore) { bestScore = score; bestType = type; best = candidate; }
    }
    raw[outOffset++] = bestType;
    best.copy(raw, outOffset);
    outOffset += stride;
  }
  return raw;
}

function makeFcTL(sequence, width, height, delayNum, delayDenRaw, dispose = 0, blend = 0) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence >>> 0, 0);
  data.writeUInt32BE(width >>> 0, 4);
  data.writeUInt32BE(height >>> 0, 8);
  data.writeUInt32BE(0, 12);
  data.writeUInt32BE(0, 16);
  data.writeUInt16BE(Math.max(0, Math.min(65535, delayNum || 0)), 20);
  data.writeUInt16BE(Math.max(0, Math.min(65535, delayDenRaw || 0)), 22);
  data[24] = dispose;
  data[25] = blend;
  return data;
}

function encodeApng(frames, width, height, options = {}) {
  if (!Array.isArray(frames) || frames.length < 1) throw new Error('APNG_ENCODE_FRAMES_EMPTY');
  const maxFrames = Number(options.maxFrames || MAX_FRAMES_DEFAULT);
  if (frames.length > maxFrames) throw new Error('APNG_FRAME_COUNT_UNSAFE');
  const maxPixels = Number(options.maxPixels || MAX_PIXELS_DEFAULT);
  if (!width || !height || width * height > maxPixels) throw new Error('PNG_DIMENSIONS_UNSAFE');
  const chunks = [PNG_SIGNATURE];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(makeChunk('IHDR', ihdr));
  for (const chunk of options.preservedChunks || []) {
    if (['cHRM', 'gAMA', 'iCCP', 'sRGB', 'pHYs'].includes(chunk.type)) chunks.push(makeChunk(chunk.type, chunk.data));
  }
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0);
  actl.writeUInt32BE((options.numPlays || 0) >>> 0, 4);
  chunks.push(makeChunk('acTL', actl));

  let sequence = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    if (!Buffer.isBuffer(frame.rgba) || frame.rgba.length !== width * height * 4) throw new Error('APNG_ENCODE_FRAME_SIZE_INVALID');
    const delayNum = Number.isInteger(frame.delayNum) ? frame.delayNum : Math.max(1, Math.round((frame.delayMs || 100) / 10));
    const delayDenRaw = Number.isInteger(frame.delayDenRaw) ? frame.delayDenRaw : 100;
    chunks.push(makeChunk('fcTL', makeFcTL(sequence++, width, height, delayNum, delayDenRaw, 0, 0)));
    const raw = encodeScanlinesRgba(frame.rgba, width, height);
    const compressed = zlib.deflateSync(raw, { level: 9 });
    if (i === 0) {
      chunks.push(makeChunk('IDAT', compressed));
    } else {
      const fdat = Buffer.allocUnsafe(compressed.length + 4);
      fdat.writeUInt32BE(sequence++, 0);
      compressed.copy(fdat, 4);
      chunks.push(makeChunk('fdAT', fdat));
    }
  }
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function repairApng(input, options = {}) {
  const parsed = parseApng(input, options);
  const originalFrames = compositeFrames(parsed);
  const before = analyzeComposited(parsed, originalFrames);
  const targetFrames = originalFrames.map((f) => ({ ...f, rgba: Buffer.from(f.rgba) }));
  const actions = [];
  const temporal = options.temporal !== false;
  const minConfidence = Number.isFinite(Number(options.minConfidence)) ? Number(options.minConfidence) : 0.94;
  if (temporal) {
    const replaceCodes = new Set(['APNG_BRIGHTNESS_FLASH', 'APNG_COLOR_FLASH', 'APNG_ALPHA_COLLAPSE']);
    const replacementIndexes = [...new Set(before.issues.filter((issue) => replaceCodes.has(issue.code) && Number.isInteger(issue.frame) && issue.confidence >= minConfidence).map((issue) => issue.frame))];
    for (const index of replacementIndexes) {
      if (index <= 0 || index >= targetFrames.length - 1) continue;
      targetFrames[index].rgba = averageFrames(originalFrames[index - 1].rgba, originalFrames[index + 1].rgba);
      actions.push({ action: 'TEMPORAL_INTERPOLATION', frame: index, reason: before.issues.filter((i) => i.frame === index && replaceCodes.has(i.code)).map((i) => i.code) });
    }

    for (const issue of before.issues.filter((i) => i.code === 'APNG_ANCHOR_DRIFT' && Number.isInteger(i.frame) && i.confidence >= Math.min(minConfidence, 0.90))) {
      const index = issue.frame;
      if (replacementIndexes.includes(index)) continue;
      const dx = Math.round(issue.evidence.targetX - issue.evidence.centroidX);
      const dy = Math.round(issue.evidence.targetY - issue.evidence.centroidY);
      if (Math.abs(dx) <= parsed.width * 0.12 && Math.abs(dy) <= parsed.height * 0.12) {
        targetFrames[index].rgba = shiftFrame(targetFrames[index].rgba, parsed.width, parsed.height, dx, dy);
        actions.push({ action: 'ANCHOR_RECENTER', frame: index, dx, dy, reason: issue.code });
      }
    }
  }

  if (options.sanitizeTransparentRgb !== false) {
    let sanitizedPixels = 0;
    for (let i = 0; i < targetFrames.length; i += 1) {
      const sanitized = sanitizeTransparentRgb(targetFrames[i].rgba);
      if (sanitized.changed) { targetFrames[i].rgba = sanitized.rgba; sanitizedPixels += sanitized.changed; }
    }
    if (sanitizedPixels) actions.push({ action: 'TRANSPARENT_RGB_SANITIZE', pixels: sanitizedPixels, reason: 'remove invisible RGB that can create sampling halos without changing visible alpha-composited pixels' });
  }

  // Full-frame/source/no-disposal normalization removes decoder-dependent APNG disposal/blend flicker.
  actions.unshift({ action: 'CODEC_NORMALIZE_FULL_FRAME', frames: targetFrames.length, dispose: 0, blend: 0 });
  const output = encodeApng(targetFrames, parsed.width, parsed.height, { numPlays: parsed.actl.numPlays, preservedChunks: parsed.preservedChunks, maxPixels: options.maxPixels, maxFrames: options.maxFrames });
  const maxOutputBytes = Number(options.maxOutputBytes || 0);
  if (maxOutputBytes > 0 && output.length > maxOutputBytes) throw new Error('APNG_REPAIR_OUTPUT_TOO_LARGE');
  const reparsed = parseApng(output, options);
  const verifiedFrames = compositeFrames(reparsed);
  let exact = verifiedFrames.length === targetFrames.length;
  if (exact) {
    for (let i = 0; i < targetFrames.length; i += 1) {
      if (!verifiedFrames[i].rgba.equals(targetFrames[i].rgba)) { exact = false; break; }
    }
  }
  if (!exact) throw new Error('APNG_REPAIR_VERIFY_PIXEL_MISMATCH');
  const inputDurationMs = parsed.frames.reduce((sum, f) => sum + f.delayMs, 0);
  const outputDurationMs = reparsed.frames.reduce((sum, f) => sum + f.delayMs, 0);
  const timelineExact = parsed.actl.numPlays === reparsed.actl.numPlays && parsed.frames.length === reparsed.frames.length && Math.abs(inputDurationMs - outputDurationMs) < 0.0001;
  if (!timelineExact) throw new Error('APNG_REPAIR_VERIFY_TIMELINE_MISMATCH');
  const after = analyzeComposited(reparsed, verifiedFrames);
  const remainingErrors = after.issues.filter((issue) => issue.severity === 'error');
  if (remainingErrors.length) throw new Error(`APNG_REPAIR_REMAINING_ERRORS:${remainingErrors.map((issue) => issue.code).join(',')}`);

  return {
    output,
    report: {
      format: 'APNG',
      width: parsed.width,
      height: parsed.height,
      frameCount: targetFrames.length,
      plays: parsed.actl.numPlays,
      inputBytes: Buffer.byteLength(input),
      outputBytes: output.length,
      inputSha256: crypto.createHash('sha256').update(input).digest('hex'),
      outputSha256: crypto.createHash('sha256').update(output).digest('hex'),
      issuesBefore: before.issues,
      issuesAfter: after.issues,
      actions,
      verified: true,
      pixelExactToRepairTarget: true,
      codecNormalized: true,
      temporalRepairEnabled: temporal,
      minConfidence,
      timelineExact,
      inputDurationMs,
      outputDurationMs,
      pixelExactToInput: temporal ? null : (actions.some((a) => a.action === 'TRANSPARENT_RGB_SANITIZE') ? null : true),
      sourceBitDepth: parsed.bitDepth,
      sourceInterlace: parsed.interlace,
      outputBitDepth: reparsed.bitDepth,
      outputInterlace: reparsed.interlace,
      qualityScoreBefore: Math.max(0, 100 - before.issues.reduce((sum, issue) => sum + (issue.severity === 'error' ? 18 : 4), 0)),
      qualityScoreAfter: Math.max(0, 100 - after.issues.reduce((sum, issue) => sum + (issue.severity === 'error' ? 18 : 4), 0)),
      engineVersion: ENGINE_VERSION
    }
  };
}

module.exports = {
  ENGINE_VERSION,
  PNG_SIGNATURE,
  makeChunk,
  parseChunks,
  parseApng,
  compositeFrames,
  analyzeApng,
  repairApng,
  encodeApng,
  frameMetrics,
  normalizedFrameDiff,
  alphaEdgeMetrics,
  estimateTranslation,
  sanitizeTransparentRgb
};
