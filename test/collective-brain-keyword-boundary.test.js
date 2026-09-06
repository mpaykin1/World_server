'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {routeTask}=require('../lib/collective-brain');
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ws-route-'));
  const dir=path.join(root,'data','collective-brain');fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'..','data','collective-brain','agent-capabilities.json'),path.join(dir,'agent-capabilities.json'));
  return root;
}
test('embedded keyword substrings do not hijack routing',()=>{
  const root=fixture();
  try{for(const text of ['judge a contest winner','analyze political treason','compare capital allocation','study reagent stability','watch a documentary'])assert.equal(routeTask(root,text).primary.id,'opencode');}
  finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('intended specialist keywords still route correctly',()=>{
  const root=fixture();
  const cases=[['add regression test for api bug','codex'],['architecture review and design','claude-code'],['install windows runtime on desktop','desktop-ai'],['parallel automation cleanup tool','opencode'],['orchestrate agent workflow memory','openhuman'],['retrieve knowledge document','anythingllm']];
  try{for(const [text,id] of cases)assert.equal(routeTask(root,text).primary.id,id);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
});
