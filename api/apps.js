'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

const root = process.cwd();

function titleFromIndex(appDir, fallback) {
  try {
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || fallback;
  } catch { return fallback; }
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const appsDir = path.join(root, 'apps');
  const apps = fs.readdirSync(appsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(appsDir, entry.name, 'index.html')))
    .map(entry => {
      const dir = path.join(appsDir, entry.name);
      const hasClient = fs.existsSync(path.join(dir, 'client.js'));
      return {
        id: entry.name,
        title: titleFromIndex(dir, entry.name.replace(/[-_]+/g, ' ')),
        description: hasClient ? `Автоматически найдено в папке apps/${entry.name}` : `HTML-приложение из папки apps/${entry.name}`,
        url: `/apps/${entry.name}/`,
        icon: fs.existsSync(path.join(dir, 'ico.png')) ? `/apps/${entry.name}/ico.png` : '',
        hasClient
      };
    })
    .sort((a, b) => (a.id === 'catalog' ? -1 : b.id === 'catalog' ? 1 : a.title.localeCompare(b.title, 'ru')));
  sendJson(res, 200, { apps });
});
