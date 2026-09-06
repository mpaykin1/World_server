import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorldShape} from '../shared/world-shape-library.mjs';
import {planWorldShape} from '../shared/dark-void-plan-worker.js';
import {WorkerPlanAdvisor} from '../shared/dark-void-worker-advisor.mjs';

const types=['eye','beacon','tower','tree','bridge','stairs','house','portal','wall','sphere','monolith','wish'];
const seeds=[1,7,123,0xdecafbad];
const scales=[.45,.8,1,1.35,2];
const options=[
  {origin:{x:0,y:10,z:0},yaw:0,maxBlocks:7000},
  {origin:{x:37,y:-4,z:-91},yaw:.73,maxBlocks:7000},
  {origin:{x:-15,y:22,z:48},yaw:-1.2,maxBlocks:50000}
];

test('WorkerShapePlanner imports and exactly matches existing world-shape-library across types/seeds/scales',()=>{
  let cases=0;
  for(const type of types)for(const seed of seeds)for(const scale of scales)for(const opt of options){
    const intent={action:'create',type,seed,scale};
    const sync=buildWorldShape(intent,opt);
    const worker=planWorldShape(intent,opt);
    assert.deepEqual(worker,sync,`${type} seed=${seed} scale=${scale} yaw=${opt.yaw}`);
    cases++;
  }
  assert.equal(cases,720);
});

test('WorkerPlanAdvisor deterministic fallback reuses the same library when Worker is unavailable',async()=>{
  const old=globalThis.Worker;
  try{
    globalThis.Worker=undefined;
    const advisor=new WorkerPlanAdvisor();
    const intent={action:'create',type:'tree',seed:77,scale:1.4};
    const opt={origin:{x:9,y:3,z:-12},yaw:.4,maxBlocks:7000};
    const result=await advisor.advise(intent,opt);
    assert.equal(result.ok,true);
    assert.equal(result.fallback,true);
    assert.deepEqual(result.blocks,buildWorldShape(intent,opt));
    assert.equal(result.meta.count,result.blocks.length);
    advisor.dispose();
  }finally{globalThis.Worker=old}
});
