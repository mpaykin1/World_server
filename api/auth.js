'use strict';

const { sendJson } = require('../lib/http');
const handlers = Object.freeze({
  register: require('../lib/api-handlers/register'),
  login: require('../lib/api-handlers/login'),
  me: require('../lib/api-handlers/me'),
  logout: require('../lib/api-handlers/logout')
});

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = requestUrl.searchParams.get('__route') || '';
  const handler = handlers[route];
  if (!handler) return sendJson(res, 404, { error: 'Маршрут не найден.' });
  return handler(req, res);
};
