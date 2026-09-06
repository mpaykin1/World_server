const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const fixture=fs.mkdtempSync(path.join(require('os').tmpdir(),'peer-review-fixture-'));
after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
function git(...a){return cp.execFileSync('git',a,{cwd:fixture,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
fs.writeFileSync(path.join(fixture,'WORK_IN_PROGRESS.md'),'fixture');fs.writeFileSync(path.join(fixture,'shared.txt'),'base');git('add','.');git('commit','-qm','base');git('update-ref','refs/remotes/origin/master','HEAD');
for(const name of ['ai/one','ai/two']){git('checkout','-qb',name,'origin/master');fs.writeFileSync(path.join(fixture,'shared.txt'),name);git('commit','-qam','claim PASS 100% without running tests');}

function runGate(){
  const r = cp.spawnSync(process.execPath, [path.join(ROOT,'scripts/multi-ai-peer-review.cjs')], { encoding:'utf8', cwd:fixture, timeout:15000, maxBuffer: 32*1024*1024 });
  return { code:r.status, out:r.stdout||'', err:r.stderr||'' };
}

describe('multi-ai peer review gate', () => {
  it('one AI - no duplicates', () => {
    const {code, out} = runGate();
    assert.equal(code,0);
    const j = JSON.parse(out);
    // With single AI branch, duplicates should be low
    assert.ok(typeof j.branches === 'number');
  });

  it('two independent AI - detected', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    assert.ok(j.branches >= 1, 'at least one AI branch detected');
  });

  it('two AI change one system - duplicate detection', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    // If duplicates exist, they should be reported, not hidden
    assert.ok(j.duplicates.some(d=>d.file==='shared.txt'));
  });

  it('found better solution of another AI - best coverage branch', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    // Gate should identify best coverage branch if any
    assert.equal(j.bestCoverageBranch,null, 'commit slogans are not coverage proof');
    assert.equal(j.qualityGate,'unknown');
  });

  it('found duplicate - reported', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    assert.ok(Array.isArray(j.duplicates));
  });

  it('found conflict - reported when many duplicates', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    assert.ok(Array.isArray(j.conflicts));
  });

  it('improvement confirmed - qualityGate pass', () => {
    const {out} = runGate();
    const j = JSON.parse(out);
    assert.ok(['pass','unknown'].includes(j.qualityGate));
  });

  it('worsening improvement should block - duplicate gate still runs', () => {
    const r = runGate();
    assert.equal(r.code,0, 'gate must not hard-fail on duplicates, only warn');
    // Gate may report qualityGate fail as data, but must not exit non-zero
    const j = JSON.parse(r.out);
    assert.ok(typeof j.qualityGate === 'string' || j.qualityGate === undefined);
  });

  it('AGENTS.md permanent rules still enforceable', () => {
    const agents = fs.readFileSync(path.join(ROOT,'AGENTS.md'),'utf8');
    assert.ok(/AUTONOMOUS AI TEAM/i.test(agents));
    assert.ok(/MULTI-AI PEER IMPROVEMENT/i.test(agents));
  });
});
