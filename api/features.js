'use strict';
// Same router/handler split as quality/auth/generative; public URLs stay stable.
const { sendJson } = require('../lib/http');
const routes = Object.freeze({
  'community-message': require('../lib/api-handlers/community-message'),
  'community-report': require('../lib/api-handlers/community-report'),
  'feature-vote': require('../lib/api-handlers/feature-vote'),
  'feedback': require('../lib/api-handlers/feedback'),
  'feedback-roadmap': require('../lib/api-handlers/feedback-roadmap'),
  'function-admin': require('../lib/api-handlers/function-admin'),
  'function-catalog': require('../lib/api-handlers/function-catalog'),
  'function-install-request': require('../lib/api-handlers/function-install-request'),
  'function-invoke': require('../lib/api-handlers/function-invoke'),
  'game-design-spec': require('../lib/api-handlers/game-design-spec'),
  'live-translate-token': require('../lib/api-handlers/live-translate-token'),
  'livekit-token': require('../lib/api-handlers/livekit-token'),
  'locales': require('../lib/api-handlers/locales'),
  'rtc-config': require('../lib/api-handlers/rtc-config'),
  'translate': require('../lib/api-handlers/translate'),
  'translation-correction': require('../lib/api-handlers/translation-correction'),
});
module.exports = async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const publicRoute = url.pathname.replace(/^\/api\//, '');
  const route = publicRoute !== 'features' ? publicRoute : String(req.query?.__route || url.searchParams.get('__route') || '');
  if (!Object.hasOwn(routes, route)) return sendJson(res, 404, { ok: false, error: 'Unknown feature route' });
  return routes[route](req, res);
};
