'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const GPU=require('../shared/pixel-animation-gpu-culling.js');
const Multi=require('../shared/pixel-animation-multi-atlas.js');
const Rig=require('../shared/pixel-animation-region-rig.js');
const Cache=require('../shared/pixel-animation-pipeline-cache.js');
const VR=require('../shared/pixel-animation-visual-regression.js');
const Learn=require('../shared/pixel-animation-device-learning.js');
const Auto=require('../shared/pixel-animation-auto-integrator.js');

test('GPU culling has true compute + indirect-draw building blocks',()=>{assert.match(GPU.WGSL,/@compute/);assert.match(GPU.WGSL,/atomicCompareExchangeWeak/);assert.match(GPU.WGSL,/visible/);const out=GPU.cpuReference([{x:10,y:10,w:4,h:4},{x:999,y:999,w:2,h:2}],{x:0,y:0,w:100,h:100},{maxVisible:10});assert.equal(out.length,1);});
test('multi-atlas manifest is deterministic and rejects duplicate pages',()=>{const m=Multi.normalizeManifest({width:1024,height:1024,pages:[{key:'a',url:'a.png'},{key:'b',url:'b.png'}],sprites:{hero:{page:'b',uv:[0,0,.1,.1]}}});assert.equal(m.pages[1].index,1);assert.throws(()=>Multi.normalizeManifest({pages:[{key:'a'},{key:'a'}]}));});
test('region rig creates bounded region deformation',()=>{const r=Rig.normalize({},'character');assert.ok(r.head[1]<r.torso[1]);const p=Rig.deformLocal({x:0,y:0},{x:.5,y:.1},1,{},'character');assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));});
test('pipeline cache fingerprint is stable',()=>{assert.equal(Cache.hash('abc'),Cache.hash('abc'));assert.notEqual(Cache.hash('abc'),Cache.hash('abd'));});
test('visual regression detects equal and changed sequences',()=>{const a=VR.signature(Uint8Array.from([0,1,2,3,4]));const b=VR.signature(Uint8Array.from([0,1,2,3,4]));const c=VR.signature(Uint8Array.from([100,1,2,3,4]));assert.equal(VR.compare(a,b).pass,true);assert.equal(VR.compare(a,c,0.00001).pass,false);});
test('device learning only makes bounded policy changes',()=>{const tracker=new Learn.DeviceBaselineTracker();for(let i=0;i<20;i++)tracker.add({fps:40,visible:5000,tier:'medium',backend:'webgl2'});const base={tiers:{medium:{maxVisible:8000,resolutionScale:.85,farUpdateHz:12}}};const p=tracker.recommend(base);assert.ok(p.tiers.medium.maxVisible<8000);assert.ok(p.tiers.medium.resolutionScale>=.6);});
test('auto integrator exports discovery/install',()=>{assert.equal(typeof Auto.discover,'function');assert.equal(typeof Auto.install,'function');});

const fs=require('node:fs');const path=require('node:path');
test('telemetry handles modern Supabase secret keys without JWT Bearer misuse',()=>{const src=fs.readFileSync(path.join(__dirname,'../supabase/functions/pixel-animation-telemetry/index.ts'),'utf8');assert.match(src,/SUPABASE_SECRET_KEYS/);assert.match(src,/if\(!credential\.modern\)headers\.Authorization/);assert.doesNotMatch(src,/Authorization:`Bearer \${secret}`/);});
