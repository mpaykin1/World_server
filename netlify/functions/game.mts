import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';
import { hasAdminSupabase, proxyCanonical } from './_upstream.mts';

const require = createRequire(import.meta.url);
const legacyHandler = require('../../api/game.js');

export default async (request) => {
  if (hasAdminSupabase()) return runLegacy(request, legacyHandler);
  return proxyCanonical(request, '/api/game');
};

export const config = { path: '/api/game' };
