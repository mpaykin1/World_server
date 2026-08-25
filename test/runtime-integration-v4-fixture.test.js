'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const os=require('os');
const cp=require('child_process');

const SCRIPT=path.join(__dirname,'..','scripts','integrate-runtime-adapters.js');
function run(cwd){cp.execFileSync(process.execPath,[SCRIPT,'--apply'],{cwd,stdio:'pipe'});return JSON.parse(fs.readFileSync(path.join(cwd,'PWA_RUNTIME_ADAPTER_REPORT.json'),'utf8'));}

test('V4 applies renderer, shader, predictive voxel center and rig scan idempotently',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ws-v4-adapter-'));
  fs.mkdirSync(path.join(dir,'data'),{recursive:true});
  fs.mkdirSync(path.join(dir,'apps','voxel-world'),{recursive:true});
  fs.writeFileSync(path.join(dir,'data','app-release-registry.json'),JSON.stringify({apps:{'voxel-world':{status:'certified',kind:'game'}}}));
  const source=`import * as THREE from 'three';\nconst CHUNK=16,VIEW=2; const player={pos:{x:0,z:0}}; let streamBusy=false; const floorDiv=(v,d)=>Math.floor(v/d);\nconst scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(); const renderer=new THREE.WebGLRenderer(); renderer.setSize(innerWidth,innerHeight);\nasync function loadNeededChunks(){ if(streamBusy) return; const pcx=floorDiv(player.pos.x,CHUNK),pcz=floorDiv(player.pos.z,CHUNK),need=[]; return {pcx,pcz,need}; }\n`;
  const file=path.join(dir,'apps','voxel-world','client.js'); fs.writeFileSync(file,source);
  const first=run(dir); const once=fs.readFileSync(file,'utf8');
  assert.equal(first.coverage,100); assert.equal(first.changes.length,1);
  assert.match(once,/WorldServerStutterProfiler/); assert.match(once,/WorldServerPredictiveStreaming/); assert.match(once,/WorldServerRigAdapters\?\.scanScene/); assert.match(once,/WORLD_SERVER_PREDICTIVE_CHUNK_CENTER/);
  const second=run(dir); const twice=fs.readFileSync(file,'utf8');
  assert.equal(second.changes.length,0); assert.equal(twice,once);
});
