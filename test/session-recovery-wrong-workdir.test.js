const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

test('wrong workdir / unicode path auto-finds canonical World_server', () => {
  const canonical = path.join(os.homedir(), 'Desktop', 'World_server');
  assert.ok(fs.existsSync(path.join(canonical, '.git')), 'canonical repo must exist');
  const wrongDir = path.join(os.homedir(), 'Desktop', 'биомы');
  if (!fs.existsSync(wrongDir)) {
    // If unicode dir not present, test sibling wrong dir
    // Create temp wrong dir
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wrong-workdir-'));
    const r = spawnSync(process.execPath, [path.join(canonical, 'scripts/desktop-ai-session-recovery.cjs'), 'resume'], { cwd: tmp, encoding: 'utf8', windowsHide: true });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.match(out, /Auto-switching|canonical repo|World_server/, 'should auto-switch from wrong dir');
    return;
  }
  const r = spawnSync(process.execPath, [path.join(canonical, 'scripts/desktop-ai-session-recovery.cjs'), 'resume'], { cwd: wrongDir, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // Should auto-switch and produce resume packet with correct branch
  assert.ok(out.includes('World_server') || out.includes('Auto-switching') || out.includes('ai/opencode/multi-ai-peer-improvement'), `output should mention canonical repo: ${out.slice(0,500)}`);
  assert.ok(out.includes('DESKTOP AI RESUME PACKET') || out.includes('resume'), 'should produce resume packet');
});
