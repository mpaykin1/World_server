'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function idFor(e) { return crypto.createHash('sha1').update([e.projectId,e.sourceFile,e.sourcePattern,e.signature].join('|')).digest('hex').slice(0, 12); }
function compileRegressionTests(repoRoot, events = []) {
  const usable = events.filter(e => e.projectId && e.sourceFile && e.sourcePattern);
  const file = path.join(repoRoot, 'test', 'generated', 'quality-autopilot-regressions.test.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const cases = usable.map(e => ({ id: idFor(e), projectId: e.projectId, sourceFile: e.sourceFile, sourcePattern: e.sourcePattern, signature: e.signature || e.message || e.kind || 'production regression' }));
  const content = `'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst cases = ${JSON.stringify(cases, null, 2)};\nfor (const c of cases) {\n  test(\`regression ${'${c.id}'}: ${'${c.signature}'}\`, () => {\n    const file = path.resolve(process.cwd(), c.sourceFile);\n    assert.ok(fs.existsSync(file), \`protected source missing: ${'${c.sourceFile}'}\`);\n    const text = fs.readFileSync(file, 'utf8');\n    assert.equal(text.includes(c.sourcePattern), false, \`known bad pattern returned in ${'${c.sourceFile}'}\`);\n  });\n}\n`;
  fs.writeFileSync(file, content);
  return { file, cases: cases.length };
}
module.exports = { compileRegressionTests };
