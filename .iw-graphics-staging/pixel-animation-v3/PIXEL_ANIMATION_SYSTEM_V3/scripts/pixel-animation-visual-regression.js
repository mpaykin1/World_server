'use strict';
const VR=require('../shared/pixel-animation-visual-regression.js');const Rig=require('../shared/pixel-animation-region-rig.js');
function syntheticFrame(t){const bytes=new Uint8Array(4096);for(let i=0;i<bytes.length;i++){const u=(i%64)/63,v=Math.floor(i/64)/63,p=Rig.deformLocal({x:u-.5,y:v-.5},{x:u,y:v},t,{},'character');bytes[i]=Math.max(0,Math.min(255,Math.round((Math.sin((p.x+p.y+t)*7)*.5+.5)*255)));}return VR.signature(bytes);}
const baseline=[0,.083,.166,.249,.332,.415,.498,.581].map(syntheticFrame);const current=[0,.083,.166,.249,.332,.415,.498,.581].map(syntheticFrame);const result=VR.compareSequence(current,baseline,0.000001);console.log(JSON.stringify({pass:result.pass,maxError:result.maxError,frames:current.length},null,2));if(!result.pass)process.exit(1);
