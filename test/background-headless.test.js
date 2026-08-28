const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all World_server background launchers are headless/hidden', () => {
  const root = path.resolve(__dirname, '..');
  const launchers = [
    'state/blocker-repair/blocker-repair-tick.cmd',
    'state/session-recovery/session-watchdog.cmd',
    'state/blocker-repair/unified-tick.ps1',
  ];
  for (const rel of launchers) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    // Must contain WindowStyle Hidden or windowsHide
    const hasHidden = content.includes('WindowStyle Hidden') || content.includes('windowsHide') || content.includes('CREATE_NO_WINDOW') || content.includes('-WindowStyle Hidden');
    assert.ok(hasHidden, `${rel} must contain WindowStyle Hidden or equivalent, got: ${content.slice(0,200)}`);
  }
  // Check desktop-ai-session-recovery.cjs launchDetached uses windowsHide
  const recovery = fs.readFileSync(path.join(root, 'scripts/desktop-ai-session-recovery.cjs'), 'utf8');
  assert.ok(recovery.includes('windowsHide:true'), 'desktop-ai-session-recovery launchDetached must use windowsHide:true');
  assert.ok(recovery.includes('WindowStyle Hidden'), 'desktop-ai-session-recovery watchdog launcher must use WindowStyle Hidden');
  // Check autonomous-blocker-repair launcher
  const blocker = fs.readFileSync(path.join(root, 'scripts/autonomous-blocker-repair.cjs'), 'utf8');
  assert.ok(blocker.includes('WindowStyle Hidden'), 'autonomous-blocker-repair launcher must use WindowStyle Hidden');
});

test('scheduled tasks are configured Hidden', async () => {
  const { spawnSync } = require('node:child_process');
  const tasks = ['WorldServer-BlockerRepair-ce4c149910', 'WorldServer-SessionWatchdog-558605bcd9'];
  for (const tn of tasks) {
    const r = spawnSync('schtasks', ['/Query', '/TN', tn, '/XML'], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) continue; // task may not exist on non-Windows CI
    const xml = String(r.stdout || '');
    assert.ok(xml.includes('<Hidden>true</Hidden>'), `${tn} must have <Hidden>true</Hidden> in task XML`);
  }
});
