const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

describe('supabase schema drift protection (error-prevention: supabase-schema-drift-missing-migrations)', () => {
  const MIGR_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
  const EXPECTED = {
    count: 108,
    digest: '6775a559063525b6dfb9ef61181c7eb83c1a05fe5eea6e2180c83ea6185a5363',
    latest: '20260824060624_unified_autonomous_game_factory_v1_hardening.sql'
  };
  it('migrations count is 108', () => {
    const files = fs.readdirSync(MIGR_DIR).filter(f => f.endsWith('.sql'));
    assert.equal(files.length, EXPECTED.count, `expected ${EXPECTED.count} migrations, got ${files.length}. Drift reintroduced!`);
  });
  it('digest matches production', () => {
    const files = fs.readdirSync(MIGR_DIR).filter(f => f.endsWith('.sql')).sort();
    const digest = crypto.createHash('sha256').update(files.join('\n'), 'utf8').digest('hex');
    assert.equal(digest, EXPECTED.digest, `digest ${digest} != ${EXPECTED.digest}`);
  });
  it('latest migration is hardening', () => {
    const files = fs.readdirSync(MIGR_DIR).filter(f => f.endsWith('.sql')).sort();
    assert.equal(files[files.length - 1], EXPECTED.latest);
  });
  it('registry marks error as protected', () => {
    const reg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'error-prevention-registry.json'), 'utf8'));
    const err = reg.knownErrors.find(e => e.id === 'supabase-schema-drift-missing-migrations');
    assert.ok(err, 'error not in registry');
    assert.equal(err.status, 'protected');
    assert.ok((err.protection||[]).length >= 3, 'protection missing');
  });
});
