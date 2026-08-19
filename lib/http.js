'use strict';

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  sendJson(res, 405, { error: 'Метод не поддерживается.' });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { throw Object.assign(new Error('Некорректный JSON.'), { status: 400 }); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Запрос слишком большой.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Некорректный JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function apiError(res, error) {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(error);
  const message = status >= 500 ? 'Внутренняя ошибка сервера.' : (error?.message || 'Ошибка запроса.');
  sendJson(res, status, { error: message });
}

function withErrors(handler) {
  return async function safeHandler(req, res) {
    try { await handler(req, res); }
    catch (error) { apiError(res, error); }
  };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

module.exports = { sendJson, methodNotAllowed, readJsonBody, apiError, withErrors, httpError };
