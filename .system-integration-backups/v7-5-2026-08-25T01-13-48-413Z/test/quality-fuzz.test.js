'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('fs'),path=require('path');

const source=fs.readFileSync(path.join(__dirname,'../shared/golden-physics.js'),'utf8');
const context={window:{GameGoldenStandard:{basisFromForward(fx,fz){
  const l=Math.hypot(fx,fz)||1;fx/=l;fz/=l;
  return {forward:{x:fx,z:fz},right:{x:-fz,z:fx}};
}}},Math};
vm.createContext(context);vm.runInContext(source,context);
const P=context.window.GameGoldenPhysics;

function rng(seed=0x5eed1234){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
}
const random=rng();

test('fuzz controls: canonical movement preserves magnitude and orthogonality',()=>{
  for(let i=0;i<5000;i++){
    const yaw=(random()*2-1)*Math.PI;
    let f=random()*2-1,s=random()*2-1;
    const len=Math.hypot(f,s);
    if(len>1){f/=len;s/=len}
    const speed=.1+random()*20;
    const v=P.canonicalXZ(yaw,f,s,speed);
    assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.z));
    assert.ok(Math.hypot(v.x,v.z)<=speed+1e-9);
    // W-only must align with camera forward.
    const w=P.canonicalXZ(yaw,1,0,1);
    const d=P.canonicalXZ(yaw,0,1,1);
    assert.ok(Math.abs(w.x*d.x+w.z*d.z)<1e-9);
    assert.ok(Math.abs(Math.hypot(w.x,w.z)-1)<1e-9);
    assert.ok(Math.abs(Math.hypot(d.x,d.z)-1)<1e-9);
  }
});

test('fuzz collisions: swept motion never crosses an impenetrable vertical wall',()=>{
  for(let i=0;i<1200;i++){
    const wall=.4+random()*3;
    const thickness=.05+random()*.5;
    const distance=wall+thickness+random()*8;
    const can=pt=>!(pt.x>=wall && pt.x<=wall+thickness);
    const r=P.moveSwept({x:0,y:0,z:0},{x:distance,y:0,z:0},can,{allowStep:false,maxSubstep:.025});
    assert.ok(r.position.x<wall+1e-7,`crossed wall: ${JSON.stringify({wall,thickness,distance,r})}`);
  }
});

test('fuzz collisions: step-up never exceeds configured maximum',()=>{
  const heights=[.25,.5,.75,1,1.05];
  for(let i=0;i<1000;i++){
    const obstacle=.05+random()*1.5;
    const can=pt=>!(pt.x>.2 && pt.y<obstacle);
    const r=P.stepAxis({x:0,y:0,z:0},'x',.5,can,true,heights);
    if(r.stepped)assert.ok(r.stepHeight<=1.05+1e-9);
    if(obstacle>1.05)assert.equal(r.blocked,true);
  }
});

test('fuzz collision determinism: same input gives same output',()=>{
  for(let i=0;i<500;i++){
    const d={x:(random()*2-1)*4,y:0,z:(random()*2-1)*4};
    const can=pt=>!(pt.x>1&&pt.x<2&&pt.z>-3&&pt.z<3);
    const a=P.moveSwept({x:0,y:0,z:0},d,can,{allowStep:false,maxSubstep:.1});
    const b=P.moveSwept({x:0,y:0,z:0},d,can,{allowStep:false,maxSubstep:.1});
    assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
  }
});
