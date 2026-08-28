'use strict';

const { sendJson, methodNotAllowed, withErrors } = require('../../lib/http');
const { issueAi3dToken } = require('../../lib/ai3d-auth');
const { deliveryPolicyForClient, deliveryStatusForClient } = require('../../lib/ai3d-delivery-policy');

function workerUrl() {
  return String(process.env.AI3D_WORKER_URL || '').trim().replace(/\/+$/, '');
}

async function workerHealth(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${url}/health`, { signal: controller.signal, headers: { Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, ...body };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const url = workerUrl();
  const action = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('action') || 'session';
  if (action === 'health') {
    if (!url) return sendJson(res, 503, { ok: false, enabled: false, error: 'AI3D_WORKER_URL is not configured.' });
    return sendJson(res, 200, await workerHealth(url));
  }

  if (action === 'delivery') {
    return sendJson(res, 200, {
      deliveryPolicy: deliveryPolicyForClient(),
      deliveryStatus: deliveryStatusForClient()
    });
  }

  const secret = String(process.env.AI3D_SHARED_SECRET || '');
  if (!url || secret.length < 24) {
    return sendJson(res, 200, {
      enabled: false,
      reason: !url ? 'AI3D_WORKER_URL is not configured.' : 'AI3D_SHARED_SECRET is not configured.'
    });
  }

  const ttlSeconds = Math.max(60, Math.min(Number(process.env.AI3D_TOKEN_TTL_SECONDS) || 600, 3600));
  const { token, payload } = issueAi3dToken({ secret, ttlSeconds });
  sendJson(res, 200, {
    enabled: true,
    workerUrl: url,
    token,
    expiresAt: payload.exp * 1000,
    maxUploadMb: Math.max(1, Math.min(Number(process.env.AI3D_MAX_UPLOAD_MB) || 25, 100)),
    modes: ['auto', 'image_to_3d', 'depth', 'building', 'map', 'voxel_city'],
    deliveryPolicy: deliveryPolicyForClient(),
    deliveryStatus: deliveryStatusForClient()
  });
});
