import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout} from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';
import {planRtsHeroBuildings,heroBudget}
 from '../apps/ai3d-voxel-city/cinematic-rts-hero.mjs';

test('hero CPU layout differentiates four structures and turrets',()=>{
 const map=buildVolcanicRtsLayout({tier:'balanced'});
 const plan=planRtsHeroBuildings(map,'balanced');
 const c=plan.counts;
 assert.equal(map.structures.length,6);
 assert.ok(c.hull===4&&c.foundation===6&&c.roof>=6);
 assert.ok(c.reactorCore>=2);
 assert.ok(c.distiller>=3);
 assert.ok(c.exhaustStack>=5);
 assert.ok(c.turretBody===2);
 assert.ok(c.turretBarrel===2);
 assert.ok(c.antenna>=4);
 assert.ok(c.radarDish>=2);
 assert.ok(c.guardPost>=32);
 assert.ok(c.neonGreen>=5);
 assert.ok(c.neonOrange>=3);
});
test('hero assets are deterministic and more detailed on high than mobile',()=>{
 const layout=buildVolcanicRtsLayout({tier:'balanced',seed:983});
 const mobile=planRtsHeroBuildings(layout,'low');
 const medium=planRtsHeroBuildings(layout,'balanced');
 const high=planRtsHeroBuildings(layout,'high');
 assert.deepEqual(medium,planRtsHeroBuildings(layout,'balanced'));
 const total=p=>Object.values(p.counts).reduce((a,b)=>a+b,0);
 assert.ok(total(high)>total(medium));
 assert.ok(total(medium)>total(mobile));
 assert.equal(mobile.counts.guardPost,0);
 assert.ok(medium.counts.guardPost>0);
 assert.ok(heroBudget('low').roof<heroBudget('high').roof);
});
test('every generated detail transform has finite bounded world coordinates',()=>{
 const layout=buildVolcanicRtsLayout();
 const plan=planRtsHeroBuildings(layout,'ultra');
 for(const [part,instances] of Object.entries(plan.parts))
  for(const transform of instances){
   for(const [name,value] of Object.entries(transform)){
    assert.ok(Number.isFinite(value),part+':'+name);
    if(['sx','sy','sz'].includes(name))assert.ok(value>0&&value<100);
    if(['x','z'].includes(name))assert.ok(Math.abs(value)<300);
    if(name==='y')assert.ok(value>-20&&value<60);
   }
  }
 assert.throws(()=>planRtsHeroBuildings({}),/missing RTS layout/);
});
