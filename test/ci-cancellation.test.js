'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('cancelled CI releases Lighthouse but ordinary failures retain diagnostics', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yml'), 'utf8');
  const job = workflow.split('  lighthouse:')[1].split('  agent-rules:')[0];
  assert.match(job, /needs: check\s+if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(job, /Upload Lighthouse reports\s+if: always\(\)/);
  assert.match(workflow, /cancel-in-progress: true/);
});
