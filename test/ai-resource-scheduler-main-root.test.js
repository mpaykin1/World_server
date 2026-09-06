'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('path');
const cp=require('child_process');

test('scheduler derives shared main root from git common-dir without a machine-specific path',()=>{
  const root=path.resolve(__dirname,'..');
  const common=cp.execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim();
  const expectedRoot=path.dirname(path.resolve(common));
  const code="delete process.env.WORLD_SERVER_MAIN_TREE; delete process.env.WORLD_SERVER_QUEUE_DB; console.log(require('./lib/ai-resource-scheduler').QUEUE_DB)";
  const env={...process.env};
  delete env.WORLD_SERVER_MAIN_TREE;
  delete env.WORLD_SERVER_QUEUE_DB;
  const queueDb=cp.execFileSync(process.execPath,['-e',code],{cwd:root,env,encoding:'utf8'}).trim();
  assert.equal(path.dirname(path.dirname(path.resolve(queueDb))),expectedRoot);
  assert.equal(path.isAbsolute(queueDb),true);
});