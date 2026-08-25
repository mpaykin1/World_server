'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../shared/golden-physics.js'),'utf8');
const context={window:{GameGoldenStandard:{basisFromForward(fx,fz){const l=Math.hypot(fx,fz)||1;fx/=l;fz/=l;return {forward:{x:fx,z:fz},right:{x:-fz,z:fx}}}}},Math};
vm.createContext(context);vm.runInContext(source,context);
const P=context.window.GameGoldenPhysics;
test('yaw0 forward is -Z and D is +X',()=>{const a=P.canonicalXZ(0,1,0,1),b=P.canonicalXZ(0,0,1,1);assert.ok(Math.abs(a.x)<1e-12);assert.equal(a.z,-1);assert.equal(b.x,1);assert.ok(Math.abs(b.z)<1e-12)});
test('yaw90 forward is -X and D is -Z',()=>{const a=P.canonicalXZ(Math.PI/2,1,0,1),b=P.canonicalXZ(Math.PI/2,0,1,1);assert.ok(Math.abs(a.x+1)<1e-9);assert.ok(Math.abs(a.z)<1e-9);assert.ok(Math.abs(b.x)<1e-9);assert.ok(Math.abs(b.z+1)<1e-9)});
test('wall blocks without teleport',()=>{const r=P.stepAxis({x:0,y:0,z:0},'x',1,pt=>pt.x<.5,false);assert.equal(r.blocked,true);assert.equal(r.position.x,0)});
test('one-unit stair can step',()=>{const can=pt=>!(pt.x>.5&&pt.y<.75);const r=P.stepAxis({x:0,y:0,z:0},'x',1,can,true);assert.equal(r.moved,true);assert.equal(r.stepped,true);assert.ok(r.position.y>=.75)});
test('too-high wall still blocks',()=>{const can=pt=>!(pt.x>.5&&pt.y<1.2);const r=P.stepAxis({x:0,y:0,z:0},'x',1,can,true);assert.equal(r.blocked,true)});

test('diagonal movement is normalized by caller vector magnitude contract',()=>{const a=P.canonicalXZ(0,Math.SQRT1_2,Math.SQRT1_2,1);assert.ok(Math.abs(Math.hypot(a.x,a.z)-1)<1e-9)});
test('swept movement cannot tunnel through one-unit wall',()=>{const can=pt=>!(pt.x>=.5&&pt.x<=1.5&&pt.y<1.1);const r=P.moveSwept({x:0,y:0,z:0},{x:3,y:0,z:0},can,{allowStep:false,maxSubstep:.1});assert.ok(r.position.x<.5);assert.equal(r.blocked,true);assert.ok(r.substeps>=30)});
