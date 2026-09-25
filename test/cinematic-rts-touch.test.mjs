import test from 'node:test';
import assert from 'node:assert/strict';
import {pinchDistance,rtsPinchRadius,bindRtsPinch}
 from '../apps/ai3d-voxel-city/cinematic-rts-touch.mjs';

test('two-finger distances and true inverted pinch scale are bounded',()=>{
 const a={clientX:0,clientY:0},b={clientX:60,clientY:80};
 assert.equal(pinchDistance(a,b),100);
 assert.equal(rtsPinchRadius(200,100,50),400);
 assert.equal(rtsPinchRadius(200,100,200),100);
 assert.equal(rtsPinchRadius(200,100,1),200);
 assert.equal(rtsPinchRadius(200,100,1000),85);
 assert.equal(rtsPinchRadius(200,100,5),600);
});
test('actual canvas touch listeners update the same RTS orbit radius',()=>{
 const listeners=new Map();
 const canvas={style:{touchAction:'auto'},
  addEventListener(name,fn){listeners.set(name,fn);},
  removeEventListener(name){listeners.delete(name);}};
 let radius=200;globalThis.window={};
 const pinch=bindRtsPinch(canvas,{getRadius:()=>radius,
  setRadius:next=>{radius=next;},isEnabled:()=>true});
 assert.equal(canvas.style.touchAction,'none');
 const fingers=n=>[{clientX:20,clientY:20},{clientX:20+n,clientY:20}];
 listeners.get('touchstart')({touches:fingers(100)});
 assert.equal(globalThis.window.__AI3D_RTS_PINCH_ACTIVE__,true);
 let prevented=false;
 listeners.get('touchmove')({touches:fingers(50),cancelable:true,
  preventDefault(){prevented=true;}});
 assert.equal(radius,400);
 assert.equal(pinch.stats().zoomEvents,1);
 assert.equal(prevented,true);
 listeners.get('touchend')({touches:[{clientX:20,clientY:20}]});
 assert.equal(globalThis.window.__AI3D_RTS_PINCH_ACTIVE__,false);
 pinch.dispose();
 assert.equal(canvas.style.touchAction,'auto');
 assert.equal(listeners.size,0);
 delete globalThis.window;
});
