'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const integrator = path.resolve(__dirname, '../scripts/integrate-apng-system.js');

function run(cwd) {
  const result = spawnSync(process.execPath, [integrator], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('integration patcher is idempotent and preserves existing server/package content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apng-integrate-'));
  try {
    fs.writeFileSync(path.join(dir, 'server.js'), `'use strict';\nconst untouched = 123;\nconst apiHandlers = new Map([\n  ['/api/apps', require('./api/apps')]\n]);\nmodule.exports = { untouched, apiHandlers };\n`);
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts/quality-master-report.js'), `const load=(x)=>x; const report={governance:load('QUALITY_REPORT.json')};\n`);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'mock-world-server',
      scripts: { check: 'node --test', 'quality:master-report': 'node scripts/quality-master-report.js', 'release:gate': 'npm run check' },
      marker: { preserve: true }
    }, null, 2));

    run(dir);
    const firstServer = fs.readFileSync(path.join(dir, 'server.js'), 'utf8');
    const firstPkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    assert.equal((firstServer.match(/\['\/api\/apng'/g) || []).length, 1);
    assert.match(firstServer, /const untouched = 123/);
    assert.equal(firstPkg.marker.preserve, true);
    assert.match(firstPkg.scripts['release:gate'], /apng:check/);
    assert.match(firstPkg.scripts['release:gate'], /quality:master-report/);
    assert.match(firstPkg.scripts['apng:browser'], /playwright/);
    const firstMasterReport = fs.readFileSync(path.join(dir, 'scripts/quality-master-report.js'), 'utf8');
    assert.equal((firstMasterReport.match(/apngQuality/g) || []).length, 1);

    run(dir);
    const secondServer = fs.readFileSync(path.join(dir, 'server.js'), 'utf8');
    const secondPkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const secondMasterReport = fs.readFileSync(path.join(dir, 'scripts/quality-master-report.js'), 'utf8');
    assert.equal(secondServer, firstServer);
    assert.equal(secondMasterReport, firstMasterReport);
    assert.deepEqual(secondPkg, firstPkg);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
