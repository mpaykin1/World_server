import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {planMissingChunks,affectedChunkCoords} from '../shared/voxel-chunk-planner.mjs';
const pairs=a=>a.map(p=>[p.x,p.z]);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('near-first chunk loading is deterministic',()=>{
 const got=planMissingChunks({centerX:0,centerZ:0,radius:1,budget:4,
   isLoaded:(x,z)=>x===0&&z===0});
 assert.deepEqual(pairs(got),[[0,-1],[-1,0],[1,0],[0,1]]);
});
test('loading skips occupied slots and respects budget',()=>{
 const seen=new Set(['0:0','0:-1','-1:0']);
 const got=planMissingChunks({centerX:0,centerZ:0,radius:1,budget:2,
   isLoaded:(x,z)=>seen.has(x+':'+z)});
 assert.deepEqual(pairs(got),[[1,0],[0,1]]);
});
test('corner edits invalidate diagonal chunks even across negative coordinates',()=>{
 assert.deepEqual(pairs(affectedChunkCoords(0,-1)),
   [[0,-1],[0,0],[-1,-1],[-1,0]]);
 assert.deepEqual(pairs(affectedChunkCoords(-16,-16)),
   [[-1,-1],[-1,-2],[-2,-1],[-2,-2]]);
 assert.deepEqual(pairs(affectedChunkCoords(1,1)),[[0,0]]);
});
test('both active clients use the same planner contract',()=>{
 const web=fs.readFileSync(path.join(root,'apps/voxel-world/client.js'),'utf8');
 const native=fs.readFileSync(path.join(root,'godot/world-client/Main.gd'),'utf8');
 assert.match(web,/planMissingChunks\(/);
 assert.match(web,/affectedChunkCoords\(/);
 assert.match(native,/NativeChunkPlanner/);
 assert.match(native,/NativeStreamedTerrain/);
});

import {spawnSync} from 'node:child_process';
const godotBin=process.env.GODOT_BIN;
test('Godot planner outputs match browser for negative border and priority',
  {skip:!godotBin||!fs.existsSync(godotBin)},()=>{
    const r=spawnSync(godotBin,['--headless','--path',
      path.join(root,'godot/world-client'),'--','--chunk-plan-test'],
      {encoding:'utf8',timeout:30000});
    assert.equal(r.status,0,r.stderr||r.stdout);
    const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith('{')&&x.includes('"plan"'));
    assert.ok(line,'Godot did not return chunk planner JSON');
    const data=JSON.parse(line);
    assert.deepEqual(data.plan,pairs(planMissingChunks({centerX:0,centerZ:0,
      radius:1,budget:4,isLoaded:(x,z)=>x===0&&z===0})));
    assert.deepEqual(data.dirty,pairs(affectedChunkCoords(0,-1)));
    assert.equal(data.zero,0);
  });
