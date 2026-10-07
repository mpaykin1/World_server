import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('TED/media readiness contract is internally consistent', () => {
  const output = execFileSync(process.execPath, ['scripts/validate-ted-media-readiness.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  assert.match(output, /Готовность TED — 23%/);
  assert.match(output, /TED_MEDIA_READINESS_EXACT=23\.1/);
  assert.match(output, /BASELINE_SHA=44385eaca11a3ee112113518da676e8fdfbb5af7/);
});
