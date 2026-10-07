import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';
import { proxyCanonical } from './_upstream.mts';

const require = createRequire(import.meta.url);
const legacyHandler = require('../../api/apps.js');

export default async (request) => {
  try {
    const local = await runLegacy(request, legacyHandler);
    if (local.status < 500) return local;
  } catch {}
  const url = new URL(request.url);
  return proxyCanonical(request, `/api/apps${url.search}`);
};

export const config = { path: '/api/apps' };
