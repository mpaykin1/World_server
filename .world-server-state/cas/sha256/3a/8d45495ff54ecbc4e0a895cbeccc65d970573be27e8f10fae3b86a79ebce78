(() => {
'use strict';const G=globalThis;if(G.WorldProceduralHumanoid)return;const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)}),add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:(a.z||0)+(b.z||0)}),mul=(a,s)=>({x:a.x*s,y:a.y*s,z:(a.z||0)*s}),len=a=>Math.hypot(a.x,a.y,a.z||0),norm=a=>{const l=len(a)||1;return mul(a,1/l)};
function centerOfMass(joints,masses={hips:4,chest:5,head:2,leftFoot:1,rightFoot:1,leftHand:.6,rightHand:.6}){let p={x:0,y:0,z:0},w=0;for(const[k,m]of Object.entries(masses)){if(!joints[k])continue;p=add(p,mul(joints[k],m));w+=m}return w?mul(p,1/w):joints.hips||{x:0,y:0,z:0}}
function support(j){const a=j.leftFoot||j.hips,b=j.rightFoot||j.hips;return{minX:Math.min(a.x,b.x)-.08,maxX:Math.max(a.x,b.x)+.08,minZ:Math.min(a.z||0,b.z||0)-.08,maxZ:Math.max(a.z||0,b.z||0)+.08}}
function balance(joints,strength=.72){const c=centerOfMass(joints),s=support(joints),tx=clamp(c.x,s.minX,s.maxX),tz=clamp(c.z||0,s.minZ,s.maxZ),dx=(tx-c.x)*strength,dz=(tz-(c.z||0))*strength;return{offset:{x:dx,y:0,z:dz},stable:Math.abs(dx)<.04&&Math.abs(dz)<.04,com:c,support:s}}
function jointLimit(parent,joint,child,{min=-2.6,max=2.6}={}){const a=sub(parent,joint),b=sub(child,joint),dot=clamp((a.x*b.x+a.y*b.y+(a.z||0)*(b.z||0))/((len(a)||1)*(len(b)||1)),-1,1),ang=Math.acos(dot);return{angle:ang,ok:ang>=min&&ang<=max,clamped:clamp(ang,min,max)}}
function orientFeet(velocity,feet){const v=norm({x:velocity.x||0,y:0,z:velocity.z??velocity.y??0});const yaw=Math.atan2(v.x,v.z||1e-6);return{left:{...feet.left,yaw},right:{...feet.right,yaw},yaw}}
function fingerCurl(grip=0){const g=clamp(grip,0,1);return[.12,.2,.28].map((base,i)=>base+g*(1.15+i*.15))}
function contact(point,surface,{slop=.006}={}){const d=(point.y||0)-(surface.y||0);return{active:d<=slop,correction:d<0?{x:0,y:-d,z:0}:{x:0,y:0,z:0},normal:surface.normal||{x:0,y:1,z:0}}}
function retarget(pose,rigMap){const out={};for(const[k,src]of Object.entries(rigMap||{}))if(pose[src])out[k]={...pose[src]};return out}
G.WorldProceduralHumanoid={version:'5.0.0',centerOfMass,balance,jointLimit,orientFeet,fingerCurl,contact,retarget};})();