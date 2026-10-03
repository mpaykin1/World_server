import * as THREE from 'three';
import {updateTailGeometry} from './cat-rig.js';

const curve=new THREE.CatmullRomCurve3([],false,'catmullrom',0.42);
const TAU=Math.PI*2;
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp01(v);return v*v*(3-2*v);};
const lerp=(a,b,t)=>a+(b-a)*t;

export const MOTION_NAMES=['idle','walk','run','sitDown','sit','groom','standUp','jump','stretch','lieDown','sleep','rise'];

export const AUTO_TIMELINE=[
  ['idle',2.3],['walk',4.2],['idle',1.2],['sitDown',1.5],['sit',2.5],['groom',2.8],
  ['standUp',1.5],['run',3.2],['jump',1.5],['stretch',2.6],['lieDown',1.5],['sleep',3.2],['rise',1.5]
];

function legPose(leg,hip=0,knee=0,paw=0){
  leg.hip.rotation.z=hip; leg.knee.rotation.z=knee; leg.paw.rotation.z=paw;
}
function base(rig){
  rig.root.position.set(0,0,0); rig.root.rotation.set(0,0,0);
  rig.spine.position.set(0,0,0); rig.spine.rotation.set(0,0,0); rig.spine.scale.set(1,1,1);
  rig.neck.rotation.set(0,0,0); rig.head.rotation.set(0,0,0);
  legPose(rig.legs.frontNear,0.03,-0.05,0.02); legPose(rig.legs.frontFar,-0.02,-0.02,0);
  legPose(rig.legs.hindNear,-0.22,0.42,-0.08); legPose(rig.legs.hindFar,-0.18,0.38,-0.06);
}
function tailPoints(mode,t,amount=1){
  let p;
  if(mode==='sit'||mode==='sleep'){
    p=[[-.92,-.15,0],[-1.02,-.55,.03],[-.75,-.86,.06],[-.15,-.98,.07],[.55,-.96,.08],[1.18,-.84,.04],[1.55,-.61,-.03],[1.56,-.36,-.08],[1.28,-.23,-.10],[.93,-.26,-.07],[.67,-.38,-.03]];
  }else{
    p=[[-.92,.03,0],[-1.24,.08,.02],[-1.58,.18,.04],[-1.88,.34,.07],[-2.05,.54,.10],[-2.02,.73,.11],[-1.82,.90,.10],[-1.52,1.00,.08],[-1.21,.96,.05],[-.94,.82,.01],[-.78,.60,-.03]];
  }
  const phase=Math.sin(t*.85),lag=Math.sin(t*1.25);
  return p.map((v,i)=>{const u=i/(p.length-1);return new THREE.Vector3(v[0],v[1]+Math.sin(t*.8-u*2.4)*.035*amount,v[2]+(phase*.18+lag*.05)*u*amount);});
}
function applyTail(rig,mode,t,amount=1){curve.points=tailPoints(mode,t,amount);updateTailGeometry(rig,curve.getPoints(24));}

function idle(rig,t){
  base(rig); const breath=Math.sin(t*1.7);
  rig.spine.position.y=breath*.012; rig.spine.rotation.z=breath*.006;
  rig.head.rotation.y=Math.sin(t*.53)*.22; rig.head.rotation.x=Math.sin(t*.37+.8)*.055;
  applyTail(rig,'stand',t,.55);
}
function locomotion(rig,t,run=false){
  base(rig); const hz=run?3.15:1.75,p=t*hz*TAU;
  const amp=run?.52:.28,bob=run?.055:.026;
  rig.spine.position.y=Math.abs(Math.sin(p))*bob; rig.spine.rotation.z=Math.sin(p*2)*(run?.035:.015);
  const frontA=Math.sin(p),frontB=Math.sin(p+Math.PI);
  const hindA=run?Math.sin(p+Math.PI*.12):Math.sin(p+Math.PI);
  const hindB=run?Math.sin(p+Math.PI*.12):Math.sin(p);
  const swing=(leg,s,kind)=>{const a=s*amp*(kind==='hind'?1.00:1);const lift=Math.max(0,s);legPose(leg,a,(kind==='hind'?.46:.28)+lift*(run?.72:.42),-lift*.22);};
  swing(rig.legs.frontNear,frontA,'front'); swing(rig.legs.frontFar,frontB,'front');
  swing(rig.legs.hindNear,hindA,'hind'); swing(rig.legs.hindFar,hindB,'hind');
  rig.neck.rotation.z=-rig.spine.rotation.z*.55; rig.head.rotation.x=Math.sin(p+Math.PI)*(.035+(run?.03:0));
  rig.head.rotation.y=Math.sin(t*.7)*.055; applyTail(rig,'stand',t,run?1:.75);
}
function sitPose(rig,t,a=1){
  base(rig); const s=smooth(a);
  rig.spine.position.set(lerp(0,-.07,s),lerp(0,-.20,s),0); rig.spine.rotation.z=lerp(0,.42,s);
  rig.neck.rotation.z=lerp(0,-.25,s); rig.head.rotation.z=lerp(0,-.10,s);
  legPose(rig.legs.frontNear,lerp(.03,-.40,s),lerp(-.05,.24,s),0);
  legPose(rig.legs.frontFar,lerp(-.02,-.36,s),lerp(-.02,.22,s),0);
  legPose(rig.legs.hindNear,lerp(-.22,-1.18,s),lerp(.42,1.28,s),lerp(-.08,-.38,s));
  legPose(rig.legs.hindFar,lerp(-.18,-1.10,s),lerp(.38,1.20,s),lerp(-.06,-.34,s));
  rig.head.rotation.y=Math.sin(t*.55)*.16*s; applyTail(rig,s>.45?'sit':'stand',t,.45+.35*s);
}
function liePose(rig,t,a=1){
  base(rig); const s=smooth(a);
  rig.spine.position.y=lerp(0,-.61,s); rig.spine.rotation.z=lerp(0,-.07,s); rig.spine.scale.y=lerp(1,.82,s);
  rig.neck.rotation.z=lerp(0,-.28,s); rig.head.rotation.z=lerp(0,-.38,s); rig.head.rotation.x=Math.sin(t*.4)*.025*s;
  for(const leg of Object.values(rig.legs))legPose(leg,lerp(0,.92,s),lerp(0,-1.22,s),lerp(0,.28,s));
  applyTail(rig,'sleep',t,.30);
}
function jump(rig,t){
  base(rig); const u=(t%1.5)/1.5;
  const crouch=smooth(Math.min(u/.20,1))*(u<.20?1:0);
  const air=clamp01((u-.18)/.62); const arc=Math.sin(Math.PI*air)*(u<.80?1:0);
  const land=u>.78?smooth((u-.78)/.22):0;
  rig.root.position.y=arc*1.10-land*.04;
  rig.spine.scale.y=1-crouch*.10+arc*.08; rig.spine.rotation.z=arc*-.08;
  const tuck=Math.max(crouch,arc*.75);
  legPose(rig.legs.frontNear,.42*tuck,.72*tuck,-.22*tuck); legPose(rig.legs.frontFar,.38*tuck,.68*tuck,-.20*tuck);
  legPose(rig.legs.hindNear,-.72*tuck,1.15*tuck,-.32*tuck); legPose(rig.legs.hindFar,-.68*tuck,1.10*tuck,-.30*tuck);
  rig.head.rotation.x=-arc*.10; applyTail(rig,'stand',t,1);
}
function stretch(rig,t){
  base(rig); const s=.5-.5*Math.cos(Math.min(1,(t%2.6)/.65)*Math.PI);
  rig.spine.position.y=-.10*s; rig.spine.rotation.z=-.26*s; rig.neck.rotation.z=.18*s; rig.head.rotation.z=.12*s;
  legPose(rig.legs.frontNear,.92*s,-.18*s,.10*s); legPose(rig.legs.frontFar,.86*s,-.14*s,.08*s);
  legPose(rig.legs.hindNear,-.30*s,.30*s,-.06*s); legPose(rig.legs.hindFar,-.26*s,.28*s,-.05*s);
  applyTail(rig,'stand',t,.65);
}
function groom(rig,t){
  sitPose(rig,t,1); const p=(t%2.8)/2.8,lift=smooth(Math.min(p/.22,1))*smooth(Math.min((1-p)/.18,1));
  legPose(rig.legs.frontNear,lerp(-.40,1.42,lift),lerp(.24,-1.10,lift),lerp(0,.22,lift));
  rig.head.rotation.z=-.10+lift*.34; rig.head.rotation.x=-lift*.18; rig.head.rotation.y=.15+Math.sin(t*5.3)*.08*lift;
}
function sleep(rig,t){liePose(rig,t,1);rig.spine.scale.y=.82+Math.sin(t*1.2)*.012;rig.head.rotation.y=Math.sin(t*.20)*.025;}
function rise(rig,t){liePose(rig,t,1-smooth((t%1.5)/1.5));}

export function resolveAutoAction(t){
  const total=AUTO_TIMELINE.reduce((n,x)=>n+x[1],0); let cursor=t%total;
  for(const [name,d] of AUTO_TIMELINE){if(cursor<d)return{name,local:cursor,duration:d};cursor-=d;}
  return{name:'idle',local:0,duration:1};
}
export function applyMotion(rig,name,t){
  switch(name){
    case'walk':return locomotion(rig,t,false); case'run':return locomotion(rig,t,true);
    case'sitDown':return sitPose(rig,t,(t%1.5)/1.5); case'sit':return sitPose(rig,t,1);
    case'groom':return groom(rig,t); case'standUp':return sitPose(rig,t,1-(t%1.5)/1.5);
    case'jump':return jump(rig,t); case'stretch':return stretch(rig,t);
    case'lieDown':return liePose(rig,t,(t%1.5)/1.5); case'sleep':return sleep(rig,t);
    case'rise':return rise(rig,t); default:return idle(rig,t);
  }
}
