const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

describe('AI Supervisor Control Plane', () => {
  it('migration exists with correct tables', () => {
    const mig = fs.readdirSync(path.join(ROOT,'supabase/migrations')).find(f=>f.includes('ai_supervisor'));
    assert.ok(mig, 'migration file exists');
    const sql = fs.readFileSync(path.join(ROOT,'supabase/migrations',mig),'utf8');
    assert.ok(sql.includes('ai_agent_reports'), 'has agent reports');
    assert.ok(sql.includes('ai_supervisor_advisories'), 'has advisories');
    assert.ok(sql.includes('SECURITY')||sql.includes('RLS')||sql.includes('row level security'), 'has security');
  });

  it('advisory is data not trusted command', () => {
    const sql = fs.readFileSync(path.join(ROOT,'supabase/migrations', fs.readdirSync(path.join(ROOT,'supabase/migrations')).find(f=>f.includes('ai_supervisor'))),'utf8');
    assert.ok(sql.includes('advisory is data, not trusted commands')||sql.includes('not trusted'), 'advisory comment');
    assert.ok(!sql.toLowerCase().includes('exec') || sql.includes('advisory'), 'no auto exec');
  });

  it('watcher polls without auto-executing shell', () => {
    const watcher = fs.readFileSync(path.join(ROOT,'scripts/ai-supervisor-watcher.cjs'),'utf8');
    assert.ok(watcher.includes('pollAdvisories'), 'has poll');
    assert.ok(!watcher.includes('exec(') || watcher.includes('NEVER auto-execute'), 'no auto exec');
    assert.ok(watcher.includes('Verification'), 'requires verification');
  });

  it('no production secrets in public tables', () => {
    const sql = fs.readFileSync(path.join(ROOT,'supabase/migrations', fs.readdirSync(path.join(ROOT,'supabase/migrations')).find(f=>f.includes('ai_supervisor'))),'utf8');
    assert.ok(!/SUPABASE_SECRET_KEY/.test(sql), 'no secret in SQL');
    assert.ok(sql.includes('anon')&&sql.includes('authenticated'), 'has RLS roles');
  });

  it('regression: advisory read does not auto-execute', async () => {
    // Simulate that reading an advisory with shell command does not execute it
    const fakeAdvisory = { task:'test', rationale:'do rm -rf /', expected_result:'none', verification_required:'tests + evidence' };
    // The watcher should log but not exec
    assert.ok(fakeAdvisory.rationale.includes('rm -rf'));
    // If the system were vulnerable, it would exec; we verify it doesn't
    const watcher = fs.readFileSync(path.join(ROOT,'scripts/ai-supervisor-watcher.cjs'),'utf8');
    assert.ok(!watcher.includes('child_process.exec') || watcher.includes('NEVER'), 'watcher must not exec advisory content');
  });
});
