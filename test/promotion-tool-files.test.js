const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

test('promotion tool is a non-catalog public workbench with no auto-send', () => {
  const html = read('tools/promotion-engine/index.html');
  const js = read('tools/promotion-engine/app.js');
  assert.match(html, /World Server Promotion Engine/);
  assert.match(html, /noindex,nofollow/);
  assert.ok(html.includes('data-panel="8"'));
  assert.equal(js.includes('sendEmail('), false);
  assert.equal(js.includes('/api/promotion'), true);
});

test('promotion profile keeps proposed B2B offers distinct from verified facts', () => {
  const data = JSON.parse(read('data/promotion-theater.json'));
  assert.ok(data.site.verifiedFacts.every((x) => x.source.startsWith('https://')));
  assert.equal(data.rules.autoSend, false);
  assert.equal(data.rules.citedFactsOnlyForPersonalization, true);
  const b2b = data.campaigns.filter((x) => x.id !== 'individuals_change');
  assert.ok(b2b.every((x) => x.status === 'proposal'));
});

test('Cloudflare worker routes promotion API before dynamic proxy', () => {
  const worker = read('cloudflare-worker.js');
  const route = worker.indexOf("url.pathname === '/api/promotion'");
  const dynamic = worker.indexOf("url.pathname.startsWith('/api/')");
  assert.ok(route > 0 && dynamic > route);
});
