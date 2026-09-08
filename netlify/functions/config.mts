import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';
import { hasPublicSupabase, proxyCanonical } from './_upstream.mts';

const require = createRequire(import.meta.url);
const legacyHandler = require('../../api/config.js');

export default async (request) => {
  if (hasPublicSupabase()) return runLegacy(request, legacyHandler);
  return proxyCanonical(request, '/api/config');
};

export const config = { path: '/api/config' };
