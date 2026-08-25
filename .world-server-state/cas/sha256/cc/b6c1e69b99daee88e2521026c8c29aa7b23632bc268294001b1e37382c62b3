(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAnimationRegionRig=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';const VERSION='3.0.0';
const PRESETS=Object.freeze({
  generic:{head:[0,0.28],torso:[0.28,0.68],legs:[0.68,1],headAmp:0.15,torsoAmp:0.08,legAmp:0.04},
  character:{head:[0,0.26],torso:[0.26,0.66],legs:[0.66,1],headAmp:0.12,torsoAmp:0.07,legAmp:0.035},
  monster:{head:[0,0.3],torso:[0.3,0.7],legs:[0.7,1],headAmp:0.18,torsoAmp:0.11,legAmp:0.055},
  bird:{head:[0,0.22],torso:[0.22,0.7],legs:[0.7,1],headAmp:0.08,torsoAmp:0.13,legAmp:0.03}
});
function normalize(input,kind){const p={...(PRESETS[kind]||PRESETS.generic),...(input||{})};const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));return{head:[clamp(p.head&&p.head[0]),clamp(p.head&&p.head[1])],torso:[clamp(p.torso&&p.torso[0]),clamp(p.torso&&p.torso[1])],legs:[clamp(p.legs&&p.legs[0]),clamp(p.legs&&p.legs[1])],headAmp:Number(p.headAmp)||0,torsoAmp:Number(p.torsoAmp)||0,legAmp:Number(p.legAmp)||0,phase:Number(p.phase)||0};}
function regionWeight(v,range,softness){const s=Math.max(0.001,Number(softness)||0.03),a=range[0],b=range[1];const smooth=(e0,e1,x)=>{const t=Math.max(0,Math.min(1,(x-e0)/(e1-e0)));return t*t*(3-2*t);};return smooth(a-s,a+s,v)*(1-smooth(b-s,b+s,v));}
function deformLocal(local,uv,time,rigInput,kind){const r=normalize(rigInput,kind),v=uv.y,h=regionWeight(v,r.head),t=regionWeight(v,r.torso),l=regionWeight(v,r.legs);const phase=time+r.phase;return{x:local.x+Math.sin(phase*0.9)*r.headAmp*h+Math.sin(phase*0.72)*r.torsoAmp*t+Math.sin(phase*1.1)*r.legAmp*l,y:local.y+Math.cos(phase*0.62)*r.torsoAmp*0.25*t};}
function pack(rigInput,kind){const r=normalize(rigInput,kind);return[new Float32Array([r.head[1],r.torso[1],r.legs[0],r.phase]),new Float32Array([r.headAmp,r.torsoAmp,r.legAmp,1])];}
return Object.freeze({VERSION,PRESETS,normalize,regionWeight,deformLocal,pack});
});
