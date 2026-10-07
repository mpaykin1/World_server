import { createRequire } from 'node:module';
import { runLegacy } from './_legacy-adapter.mts';

const require = createRequire(import.meta.url);
const legacyHandler = require('../../api/quality-telemetry.js');

export default async (request) => runLegacy(request, legacyHandler);

export const config = { path: '/api/quality-telemetry' };
