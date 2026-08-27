'use strict';

const { ENGINE_VERSION, PNG_SIGNATURE, analyzeApng, repairApng } = require('../lib/apng-engine');

const DEFAULT_MAX_MB = 4;
const DEFAULT_MAX_FRAMES = 256;
const DEFAULT_MAX_DECODE_MB = 128;
const DEFAULT_MAX_OUTPUT_MB = 32;

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function limits() {
  return {
    maxBytes: boundedNumber(process.env.APNG_MAX_UPLOAD_MB, DEFAULT_MAX_MB, 1, 16) * 1024 * 1024,
    maxFrames: Math.floor(boundedNumber(process.env.APNG_MAX_FRAMES, DEFAULT_MAX_FRAMES, 1, 1024)),
    maxDecodedBytes: boundedNumber(process.env.APNG_MAX_DECODE_MB, DEFAULT_MAX_DECODE_MB, 16, 512) * 1024 * 1024,
    maxOutputBytes: boundedNumber(process.env.APNG_MAX_OUTPUT_MB, DEFAULT_MAX_OUTPUT_MB, 4, 128) * 1024 * 1024
  };
}

async function readBody(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error('APNG_UPLOAD_TOO_LARGE');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-APNG-Engine-Version', ENGINE_VERSION);
  res.end(body);
}

function compactSummary(report) {
  return {
    frames: report.frameCount,
    before: report.issuesBefore.length,
    after: report.issuesAfter.length,
    actions: report.actions.length,
    verified: report.verified,
    timelineExact: report.timelineExact,
    outputSha256: report.outputSha256
  };
}

function contentTypeAllowed(req) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  return !contentType || contentType.startsWith('image/png') || contentType.startsWith('application/octet-stream');
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const action = (url.searchParams.get('action') || 'analyze').toLowerCase();

  if (req.method === 'GET' && action === 'health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'apng-quality-system',
      engineVersion: ENGINE_VERSION,
      architecture: 'validate -> 8/16-bit + Adam7 decode/composite -> pixel/edge/motion QA -> confidence-gated repair -> transparent-RGB sanitize -> full-frame normalize -> decode/pixel/timeline verify',
      capabilities: { bitDepths: [8, 16], adam7: true, edgeHaloDetection: true, motionVectorQA: true, transparentRgbSanitize: true, crossBrowserGate: true },
      limits: limits()
    });
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  if (!contentTypeAllowed(req)) return sendJson(res, 415, { ok: false, error: 'APNG_CONTENT_TYPE_UNSUPPORTED' });

  try {
    const resourceLimits = limits();
    const input = await readBody(req, resourceLimits.maxBytes);
    if (!input.length) return sendJson(res, 400, { ok: false, error: 'APNG_BODY_EMPTY' });
    if (input.length < PNG_SIGNATURE.length || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return sendJson(res, 415, { ok: false, error: 'PNG_SIGNATURE_INVALID' });
    }

    const engineOptions = {
      maxFrames: resourceLimits.maxFrames,
      maxDecodedBytes: resourceLimits.maxDecodedBytes,
      maxOutputBytes: resourceLimits.maxOutputBytes
    };
    const temporal = url.searchParams.get('temporal') !== '0';
    const minConfidence = boundedNumber(url.searchParams.get('confidence'), 0.94, 0.80, 1);
    const sanitizeTransparentRgb = url.searchParams.get('sanitize') !== '0';

    if (action === 'analyze') {
      const report = analyzeApng(input, engineOptions);
      return sendJson(res, 200, { ok: true, report });
    }

    if (action === 'repair') {
      const result = repairApng(input, { ...engineOptions, temporal, minConfidence, sanitizeTransparentRgb });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'attachment; filename="repaired.apng"');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-APNG-Engine-Version', ENGINE_VERSION);
      res.setHeader('X-APNG-Verified', '1');
      res.setHeader('X-APNG-Quality-Score', String(result.report.qualityScoreAfter));
      res.setHeader('X-APNG-Repair', Buffer.from(JSON.stringify(compactSummary(result.report))).toString('base64url'));
      res.setHeader('Content-Length', result.output.length);
      return res.end(result.output);
    }

    return sendJson(res, 400, { ok: false, error: 'APNG_ACTION_UNKNOWN', allowed: ['health', 'analyze', 'repair'] });
  } catch (error) {
    const message = error.message || 'APNG_PROCESSING_FAILED';
    const status = error.statusCode || (/UNSAFE|TOO_LARGE/.test(message) ? 413 : 422);
    return sendJson(res, status, { ok: false, error: message, engineVersion: ENGINE_VERSION });
  }
};
