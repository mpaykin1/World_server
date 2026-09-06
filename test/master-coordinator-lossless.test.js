'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wsc-lossless-'));
const main = path.join(root, 'main');
fs.mkdirSync(main);
const realSpawn = cp.spawnSync;
function git(args, cwd = main) {
  const r = realSpawn('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
git(['init','-q']); git(['config','user.name','Fixture']); git(['config','user.email','fixture@example.invalid']);
fs.writeFileSync(path.join(main,'tracked.txt'),'base\n');
fs.writeFileSync(path.join(main,'.gitignore'),'ignored.txt\n');
git(['add','.']); git(['commit','-qm','base']);
process.env.WORLD_SERVER_MAIN_TREE = main;
process.env.WORLD_SERVER_WORKTREES_ROOT = path.join(root,'trees');
process.env.WORLD_SERVER_RECOVERY_ROOT = path.join(root,'recovery');
process.env.AI_AGENT_REPORTS_PATH = path.join(root,'reports.jsonl');
const mc = require('../scripts/master-coordinator.cjs');
function worker(t, fn, gitFailure) {
  t.mock.method(cp,'spawnSync',(command,args,opts)=>{
    if (command===mc.OPENCODE_CLI_PATH && args[0]==='run') return fn(args[args.indexOf('--dir') + 1]);
    if (command==='git' && gitFailure?.(args,opts)) return {status:1,stdout:'fixture completed',stderr:'injected git failure'};
    return realSpawn(command,args,opts);
  });
}
test.after(()=>{
  const resolved = path.resolve(root);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
  assert.ok(path.basename(resolved).startsWith('wsc-lossless-'));
  fs.rmSync(resolved,{recursive:true,force:true});
});

test('worker-created commit survives successful clean dispatch', async t=>{
  let head;
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'tracked.txt'),'worker commit\n');git(['add','.'],dir);git(['commit','-qm','worker'],dir);head=git(['rev-parse','HEAD'],dir);return {status:0,stdout:'fixture completed',stderr:''};});
  const r=await mc.invokeOpencode('fixture',{taskId:'self-commit',push:false});
  assert.equal(r.committed,head);
  assert.equal(git(['rev-parse',r.branch]),head);
  assert.equal(fs.existsSync(r.worktree),false);
});
test('failed dirty work remains in its original checkout', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'tracked.txt'),'unique failed work\n');return {status:1,stdout:'fixture completed',stderr:'failed'};});
  const r=await mc.invokeOpencode('fixture',{taskId:'dirty-failure',push:false});
  assert.equal(r.result,'FAIL');
  assert.equal(fs.readFileSync(path.join(r.worktree,'tracked.txt'),'utf8'),'unique failed work\n');
});
test('failed automatic commit cannot report PASS or discard untracked work', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'unique.txt'),'unique\n');return {status:0,stdout:'fixture completed',stderr:''};},args=>args[0]==='commit');
  const r=await mc.invokeOpencode('fixture',{taskId:'commit-failure',push:false});
  assert.equal(r.result,'FAIL');
  assert.equal(fs.readFileSync(path.join(r.worktree,'unique.txt'),'utf8'),'unique\n');
});
test('failed status inspection fails closed and retains checkout', async t=>{
  let didRun=false;
  worker(t,()=>{didRun=true;return {status:0,stdout:'fixture completed',stderr:''};},args=>didRun&&args[0]==='status');
  const r=await mc.invokeOpencode('fixture',{taskId:'status-failure',push:false});
  assert.equal(r.result,'FAIL');
  assert.ok(fs.existsSync(r.worktree));
});
test('ignored unique files prevent automatic cleanup and PASS', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'ignored.txt'),'private unique work');return {status:0,stdout:'fixture completed',stderr:''};});
  const r=await mc.invokeOpencode('fixture',{taskId:'ignored-work',push:false});
  assert.notEqual(r.result,'PASS');
  assert.equal(fs.readFileSync(path.join(r.worktree,'ignored.txt'),'utf8'),'private unique work');
});
test('cleanup is idempotent and refuses a foreign path', async()=>{
  const w=mc.createIsolatedWorktree('cleanup-once');
  assert.equal(mc.removeIsolatedWorktree(w.dir,w.branch).ok,true);
  assert.equal(mc.removeIsolatedWorktree(w.dir,w.branch).ok,true);
  assert.equal(mc.removeIsolatedWorktree(main,'master').ok,false);
  assert.ok(fs.existsSync(path.join(main,'tracked.txt')));
});
test('synchronous lease callback failure releases ownership', async()=>{
  await assert.rejects(mc.withSubtaskLease(main,'sync-failure',()=>{throw Error('fixture');}),/fixture/);
  const value=await mc.withSubtaskLease(main,'sync-failure',()=>42);
  assert.equal(value,42);
});
test('recovery write failure cannot trigger cleanup', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'tracked.txt'),'survive disk failure');return {status:1,stdout:'fixture completed',stderr:''};});
  const write = fs.writeFileSync;
  t.mock.method(fs,'writeFileSync',(file,...args)=>{
    if (String(file).includes('WORK_IN_PROGRESS.patch')) throw Error('injected disk full');
    return write(file,...args);
  });
  const r=await mc.invokeOpencode('fixture',{taskId:'disk-failure',push:false});
  assert.equal(r.result,'FAIL');
  assert.match(r.reason,/disk full/);
  assert.equal(fs.readFileSync(path.join(r.worktree,'tracked.txt'),'utf8'),'survive disk failure');
});
test('failed git add cannot turn partial staging into PASS', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'new.txt'),'preserve');return {status:0,stdout:'fixture completed',stderr:''};},args=>args[0]==='add');
  const r=await mc.invokeOpencode('fixture',{taskId:'add-failure',push:false});
  assert.equal(r.result,'FAIL');
  assert.equal(fs.readFileSync(path.join(r.worktree,'new.txt'),'utf8'),'preserve');
});
test('failed requested push cannot report PASS and keeps local commit reachable', async t=>{
  worker(t,dir=>{fs.writeFileSync(path.join(dir,'new.txt'),'commit me');return {status:0,stdout:'fixture completed',stderr:''};},args=>args[0]==='push');
  const r=await mc.invokeOpencode('fixture',{taskId:'push-failure',push:true});
  assert.equal(r.result,'FAIL');
  assert.equal(r.pushed,false);
  assert.equal(git(['rev-parse',r.branch]),r.committed);
});
test('final review survives a large tool stream prefix',()=>{
  const prefix = JSON.stringify({type:'tool_use',part:{output:'x'.repeat(20000)}});
  const final = JSON.stringify({type:'text',part:{text:'Concrete final review'}});
  assert.equal(mc.finalOpencodeText(prefix+'\n'+final),'Concrete final review');
});
test('invalid task ids cannot escape the coordinator root',()=>{
  assert.throws(()=>mc.createIsolatedWorktree('../foreign'),/Invalid task id/);
});
test('Zero-Chaos Git readiness rejects dirty, untracked and unpublished work idempotently',()=>{
  const housekeeping = require('../scripts/desktop-ai-session-housekeeping.cjs');
  const repo=path.join(root,'readiness');fs.mkdirSync(repo);
  git(['init','-q'],repo);git(['config','user.name','Fixture'],repo);git(['config','user.email','fixture@example.invalid'],repo);
  fs.writeFileSync(path.join(repo,'tracked.txt'),'base');git(['add','.'],repo);git(['commit','-qm','base'],repo);
  assert.equal(housekeeping.gitZeroChaosReadiness(repo).verdict,'FAIL','local master is not proof of push');
  git(['update-ref','refs/remotes/origin/main','HEAD'],repo);
  assert.equal(housekeeping.gitZeroChaosReadiness(repo).verdict,'PASS');
  fs.writeFileSync(path.join(repo,'unique.txt'),'untracked');
  const before=git(['status','--porcelain'],repo);
  assert.equal(housekeeping.gitZeroChaosReadiness(repo).verdict,'FAIL');
  assert.equal(housekeeping.gitZeroChaosReadiness(repo).verdict,'FAIL');
  assert.equal(git(['status','--porcelain'],repo),before);
  git(['add','.'],repo);git(['commit','-qm','new unpushed work'],repo);
  const r=housekeeping.gitZeroChaosReadiness(repo);
  assert.equal(r.verdict,'FAIL');assert.equal(r.worktrees[0].unpublishedCommits,1);
  assert.equal(housekeeping.gitZeroChaosReadiness(path.join(root,'missing')).verdict,'FAIL');
});
test('OpenCode permission refusal with exit zero and blank final text is not PASS',async t=>{
  worker(t,()=>({status:0,stderr:'permission requested: external_directory; auto-rejecting',stdout:JSON.stringify({type:'tool_use',part:{state:{status:'error',error:'The user rejected permission'}}})+'\n'+JSON.stringify({type:'text',part:{text:'\n\n'}})}));
  const r=await mc.invokeOpencode('fixture',{taskId:'refused-tool',push:false});
  assert.equal(r.result,'REFUSED');
  assert.equal(r.ok,false);
  assert.equal(r.stdout,'');
});
test('tools-only output without a completed answer is not PASS',async t=>{
  worker(t,()=>({status:0,stderr:'',stdout:JSON.stringify({type:'step_finish',part:{reason:'tool-calls'}})}));
  const r=await mc.invokeOpencode('fixture',{taskId:'missing-final',push:false});
  assert.equal(r.result,'FAIL');assert.equal(r.ok,false);
});
test('reviewed source mentioning permission errors does not itself count as a refusal',async t=>{
  const stdout=JSON.stringify({type:'tool_use',part:{state:{status:'completed',output:'source handles permission denied and auto-rejecting'}}})+'\n'+JSON.stringify({type:'text',part:{text:'Review complete: no findings.'}});
  worker(t,()=>({status:0,stderr:'',stdout}));
  const r=await mc.invokeOpencode('fixture',{taskId:'source-review',push:false});
  assert.equal(r.result,'PASS');assert.equal(r.stdout,'Review complete: no findings.');
});
test('ownership remains exclusive during a second bounded OpenCode attempt',async t=>{
  let release;
  const initial=Date.now();
  const first=mc.withSubtaskLease(main,'second-attempt',()=>new Promise(r=>{release=r;}));
  await Promise.resolve();
  t.mock.method(Date,'now',()=>initial+16*60*1000);
  const second=await mc.withSubtaskLease(main,'second-attempt',()=> 'duplicate');
  assert.equal(second.result,'SKIPPED_ACTIVE');
  release('complete');assert.equal(await first,'complete');
});
