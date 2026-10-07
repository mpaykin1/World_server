'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/science-run072.js');
const commands=require('../data/collective-brain/remote-task-commands.json');
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v},end(v){this.body=v}}}
test('RUN_072 production access is wired to existing safe bridge',async()=>{
  const r=res();
  await handler({method:'GET'},r);
  assert.equal(r.statusCode,200);
  const b=JSON.parse(r.body);
  assert.equal(b.evidence.pass,true);
  assert.equal(b.cloudAccess.verify.args.scriptId,'science-run-072');
  assert.equal(commands.commands.run_existing_script.allowedScripts['science-run-072'],'scripts/science-h2-repeated-damage-regrowth.cjs');
  assert.ok(commands.commands.inspect_logs.allowedFiles.includes('SCIENCE_RUN_072_H2.json'));
});
