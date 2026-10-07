import * as THREE from 'three';
import {updateTailGeometry} from '../living-light-cat-3d-v2/cat-rig.js';

const curve=new THREE.CatmullRomCurve3([],false,'catmullrom',0.42);
const BASE={
  idle:[[-.91,.04,0],[-1.18,.02,.02],[-1.48,.02,.05],[-1.77,.10,.08],[-1.98,.25,.10],[-2.05,.43,.11],[-1.95,.61,.10],[-1.72,.76,.08],[-1.44,.82,.05],[-1.18,.75,.02],[-.96,.61,-.02]],
  walk:[[-.91,.04,0],[-1.22,-.01,.02],[-1.56,-.02,.05],[-1.87,.03,.08],[-2.12,.13,.11],[-2.24,.28,.13],[-2.19,.43,.12],[-2.02,.56,.09],[-1.78,.61,.05],[-1.53,.55,.01],[-1.31,.42,-.03]],
  run:[[-.91,.04,0],[-1.15,.12,.03],[-1.39,.28,.07],[-1.56,.51,.11],[-1.58,.76,.14],[-1.44,.98,.15],[-1.18,1.13,.13],[-.88,1.15,.10],[-.61,1.03,.06],[-.43,.83,.02],[-.38,.61,-.03]],
  sit:[[-.91,-.07,0],[-1.05,-.34,.02],[-.92,-.60,.05],[-.55,-.78,.08],[-.02,-.86,.09],[.56,-.83,.08],[1.05,-.70,.05],[1.38,-.50,.01],[1.48,-.29,-.03],[1.34,-.13,-.07],[1.08,-.08,-.09]],
  jump:[[-.91,.03,0],[-1.25,.02,.03],[-1.62,.01,.07],[-1.98,.00,.10],[-2.31,.02,.12],[-2.58,.07,.13],[-2.78,.15,.12],[-2.90,.25,.10],[-2.94,.36,.07],[-2.90,.48,.03],[-2.80,.58,-.01]],
  stretch:[[-.91,.02,0],[-1.18,.12,.02],[-1.42,.30,.06],[-1.59,.51,.10],[-1.63,.71,.12],[-1.53,.88,.12],[-1.34,.97,.10],[-1.12,.96,.07],[-.94,.85,.04],[-.82,.68,.01],[-.78,.52,-.02]],
  sleep:[[-.91,-.10,0],[-1.02,-.32,.02],[-.88,-.55,.04],[-.53,-.72,.06],[-.08,-.79,.07],[.39,-.76,.06],[.78,-.65,.04],[1.04,-.50,.01],[1.12,-.34,-.03],[1.05,-.22,-.06],[.88,-.18,-.08]]
};

const clamp01=v=>Math.max(0,Math.min(1,v));

function actionFamily(action){
  if(action==='walk')return'walk';
  if(action==='run')return'run';
  if(action==='jump')return'jump';
  if(action==='stretch')return'stretch';
  if(action==='sit'||action==='sitDown'||action==='standUp'||action==='groom')return'sit';
  if(action==='sleep'||action==='lieDown'||action==='rise')return'sleep';
  return'idle';
}

function targetControls(action,t){
  const family=actionFamily(action);
  const base=BASE[family]||BASE.idle;
  const speed=family==='run'?2.4:family==='walk'?1.45:family==='jump'?1.9:.75;
  const lateral=family==='sit'||family==='sleep'?.055:family==='run'?.20:.12;
  const vertical=family==='run'?.10:family==='walk'?.055:.035;
  const phase=t*speed;

  return base.map((v,i)=>{
    const u=i/(base.length-1);
    const lag=phase-u*2.65;
    const tip=Math.pow(u,1.35);
    return new THREE.Vector3(
      v[0]+Math.sin(lag*.65)*vertical*tip,
      v[1]+Math.sin(lag)*vertical*tip,
      v[2]+Math.sin(lag*.9+0.4)*lateral*tip
    );
  });
}

function sampleControls(controls){
  curve.points=controls;
  return curve.getPoints(24);
}

export function bindTailToSpine(rig){
  const nodes=[...rig.tail.segments,...rig.tail.joints];
  for(const node of nodes)rig.spine.add(node);
  rig.tail.followsSpine=true;
}

export function createTailFollower(){
  let current=null;
  return {
    update(rig,action,t,dt){
      const target=sampleControls(targetControls(action,t));
      if(!current)current=target.map(p=>p.clone());

      const responsiveness=action==='run'?9.0:action==='jump'?10.5:action==='walk'?7.5:5.3;
      const alpha=1-Math.exp(-Math.max(0,dt)*responsiveness);
      for(let i=0;i<current.length;i++)current[i].lerp(target[i],alpha);

      updateTailGeometry(rig,current);
      const first=current[0],last=current[current.length-1];
      return{
        actionFamily:actionFamily(action),
        base:[first.x,first.y,first.z],
        tip:[last.x,last.y,last.z],
        bendDepth:last.z-first.z
      };
    },
    reset(){current=null;}
  };
}
