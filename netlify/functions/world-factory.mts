import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';
import { hasAdminSupabase, proxyCanonical } from './_upstream.mts';
const require = createRequire(import.meta.url);
const legacyHandler = require('../../lib/api-handlers/world-factory.js');
export default async (request) => hasAdminSupabase() ? runLegacy(request, legacyHandler) : proxyCanonical(request, `/api/world-factory${new URL(request.url).search}`);
export const config = { path: '/api/world-factory' };
