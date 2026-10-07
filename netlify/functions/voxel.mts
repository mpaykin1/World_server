import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';
import { hasAdminSupabase, proxyCanonical } from './_upstream.mts';

const require = createRequire(import.meta.url);
const legacyHandler = require('../../api/voxel.js');

export default async (request) => {
  if (hasAdminSupabase()) return runLegacy(request, legacyHandler);
  return proxyCanonical(request, '/api/voxel');
};

export const config = { path: '/api/voxel' };
