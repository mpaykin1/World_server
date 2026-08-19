'use strict';

const texturePack = require('../apps/voxel-world/materials-roblox.json');

const ALLOWED_IDS = new Set();
for (const material of texturePack.materials || []) {
  for (const key of ['colorMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'texturePack']) {
    const id = Number(material?.[key]);
    if (Number.isSafeInteger(id) && id > 0) ALLOWED_IDS.add(String(id));
  }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(body);
}

function firstLocation(json) {
  if (!json || typeof json !== 'object') return '';
  if (typeof json.location === 'string') return json.location;
  if (typeof json.url === 'string') return json.url;
  if (Array.isArray(json.locations)) {
    for (const item of json.locations) {
      const value = item?.location || item?.url;
      if (typeof value === 'string' && /^https:\/\//i.test(value)) return value;
    }
  }
  return '';
}

function imageContentType(buffer, upstreamType) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return String(upstreamType || '').toLowerCase().startsWith('image/') ? upstreamType : '';
}

async function fetchWithTimeout(url, init = {}, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAssetResponse(id) {
  const key = process.env.ROBLOX_OPEN_CLOUD_API_KEY || '';

  // Preferred stable path when a scoped Roblox Open Cloud key is configured.
  if (key) {
    const openCloud = await fetchWithTimeout(
      `https://apis.roblox.com/asset-delivery-api/v1/assetId/${id}`,
      { headers: { 'x-api-key': key, 'accept': 'application/json' } }
    );
    if (openCloud.ok) return openCloud;
    if (![401, 403, 404].includes(openCloud.status)) return openCloud;
  }

  // Current Roblox Asset Delivery v2 remains useful for publicly deliverable assets.
  return fetchWithTimeout(
    `https://assetdelivery.roblox.com/v2/assetId/${id}`,
    { headers: { 'accept': 'application/json, image/*, application/octet-stream' } }
  );
}

async function getThumbnailAsset(id) {
  const metadataResponse = await fetchWithTimeout(
    `https://thumbnails.roblox.com/v1/assets?assetIds=${id}&returnPolicy=PlaceHolder&size=420x420&format=Png&isCircular=false`,
    { headers: { 'accept': 'application/json' } }
  );
  if (!metadataResponse.ok) {
    const error = new Error(`Roblox thumbnail lookup failed: ${metadataResponse.status}`);
    error.status = 502;
    throw error;
  }

  const metadata = await metadataResponse.json();
  const imageUrl = metadata?.data?.find(item => String(item?.targetId) === id && item?.state === 'Completed')?.imageUrl || '';
  let parsed;
  try { parsed = new URL(imageUrl); } catch {}
  if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.rbxcdn.com')) {
    const error = new Error('Roblox thumbnail lookup returned no trusted image URL.');
    error.status = 502;
    throw error;
  }

  const image = await fetchWithTimeout(imageUrl, { headers: { 'accept': 'image/*' } });
  if (!image.ok) {
    const error = new Error(`Roblox thumbnail fetch failed: ${image.status}`);
    error.status = 502;
    throw error;
  }
  const type = (image.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('image/')) {
    const error = new Error('Roblox thumbnail response was not an image.');
    error.status = 502;
    throw error;
  }
  return { response: image, type };
}

async function getBinaryAsset(id) {
  try {
    const first = await resolveAssetResponse(id);
    if (first.ok) {
      const type = (first.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('json')) {
        return { response: first, type: type || 'application/octet-stream' };
      }

      const metadata = await first.json();
      const location = firstLocation(metadata);
      let parsed;
      try { parsed = new URL(location); } catch {}
      if (parsed?.protocol === 'https:' && parsed.hostname.endsWith('.rbxcdn.com')) {
        const binary = await fetchWithTimeout(location, {
          headers: { 'accept': 'image/*, application/octet-stream' }
        });
        if (binary.ok) {
          return {
            response: binary,
            type: binary.headers.get('content-type') || 'application/octet-stream'
          };
        }
      }
    }
  } catch {
    // The public thumbnail endpoint below keeps textures available when Asset
    // Delivery requires authentication or is temporarily unavailable.
  }
  return getThumbnailAsset(id);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method Not Allowed');
  }

  const raw = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const id = String(raw || '').trim();

  if (!/^\d{4,20}$/.test(id) || !ALLOWED_IDS.has(id)) {
    return send(res, 404, 'Texture not found');
  }

  try {
    const { response, type } = await getBinaryAsset(id);

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const buffer = Buffer.from(await response.arrayBuffer());
    const safeType = imageContentType(buffer, type);
    if (!safeType) return send(res, 502, 'Texture delivery returned an unsupported file');
    res.setHeader('Content-Type', safeType);
    res.setHeader('Content-Length', String(buffer.length));
    if (req.method === 'HEAD') return res.end();
    return res.end(buffer);
  } catch (error) {
    console.error('[roblox-texture]', id, error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 502;
    return send(res, status, 'Texture delivery failed');
  }
};

module.exports._private = { imageContentType };
