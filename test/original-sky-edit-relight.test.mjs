import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalSkyLight} from '../shared/original-sky-light.mjs';
import {editOriginalSkyLight} from '../shared/original-sky-edit-relight.mjs';
const init=(size,opacity)=>({size,opacity,sky:buildOriginalSkyLight({size,opacity}).sky});
test('placing and removing a roof updates skylight and dirty sections',()=>{
 const size=[3,5,3],state=init(size,new Uint8Array(45));
 const blocked=editOriginalSkyLight(state,{x:1,y:3,z:1,newOpacity:15});
 assert.equal(blocked.state.sky[1+3*(1+3*3)],0);assert.ok(blocked.changed>0);assert.deepEqual(blocked.dirtySections,['0,0,0']);
 const reopened=editOriginalSkyLight(blocked.state,{x:1,y:3,z:1,newOpacity:0});
 assert.deepEqual(reopened.state.sky,state.sky);assert.deepEqual(state.opacity,new Uint8Array(45));
});
test('unchanged edit avoids recomputation',()=>{
 const s=init([1,2,1],new Uint8Array(2)),r=editOriginalSkyLight(s,{x:0,y:0,z:0,newOpacity:0});
 assert.equal(r.recomputed,false);assert.equal(r.state,s);
});
test('deterministic mixed opacity edits match fresh skylight on every step',()=>{
 const size=[4,5,3],opacity=new Uint8Array(60);let state=init(size,opacity);
 for(let step=0;step<80;step++){
  const x=(step*7)%4,y=(step*11)%5,z=(step*13)%3,newOpacity=[0,1,2,15][step%4];
  const r=editOriginalSkyLight(state,{x,y,z,newOpacity});state=r.state;
  assert.deepEqual(state.sky,buildOriginalSkyLight({size,opacity:state.opacity}).sky);
 }
});
