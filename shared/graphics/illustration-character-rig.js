// Illustration Character Rig — childlike animated 3D figures for Living Watercolor.
// The character is assembled from simple illustration masses attached to a joint hierarchy.
// No realistic skinning is required: the visible style stays naive while the rig remains true 3D.
import {createIllustrationMassModeler} from './illustration-mass-modeler.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

function makePivot(THREE,name,position=[0,0,0]){
  const g=new THREE.Group();g.name=name;g.position.set(...position);return g;
}

function naiveProfile(width,height,{top=.76,waist=.68,bottom=.92}={}){
  const hw=width*.5;
  return [
    [-hw*bottom,0],[-hw*.96,height*.10],[-hw*.82,height*.42],
    [-hw*waist,height*.68],[-hw*top,height],
    [ hw*top,height],[ hw*waist,height*.68],[ hw*.82,height*.42],
    [ hw*.96,height*.10],[ hw*bottom,0]
  ];
}
function partMass(modeler,{seed,width,height,depth=.34,color,opacity=1,position=[0,0,0],outline=true,name,profileOptions={}}){
  return modeler.mass({seed,profile:naiveProfile(width,height,profileOptions),width,height,topWidth:width*.72,depth,color,opacity,position,outline,name});
}

function ellipseMesh(THREE,{rx=.35,ry=.42,depth=.28,color='#aab3bd',opacity=1,name='ellipse-part'}={}){
  const g=new THREE.SphereGeometry(1,20,14);
  g.scale(rx,ry,depth);
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,transparent:opacity<1,opacity}));
  m.name=name;m.userData={watercolorOutline:true,illustrationMass:true};return m;
}

function briefcaseMesh(THREE,color='#718197'){
  const g=new THREE.Group();g.name='worker-briefcase';
  const body=new THREE.Mesh(new THREE.BoxGeometry(.48,.34,.16),new THREE.MeshStandardMaterial({color,roughness:1,metalness:0}));
  body.userData={watercolorOutline:true,illustrationMass:true};body.position.y=-.05;g.add(body);
  const h=new THREE.Mesh(new THREE.TorusGeometry(.11,.025,6,14,Math.PI),new THREE.MeshBasicMaterial({color:'#2e425d',transparent:true,opacity:.56}));
  h.rotation.z=Math.PI;h.position.y=.17;h.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true};g.add(h);
  return g;
}

export function createIllustrationOfficeWorker(THREE,{
  seed='office-worker',ink='#2e425d',wash='#aab3bd'
}={}){
  const modeler=createIllustrationMassModeler(THREE,{ink,wash});
  const root=makePivot(THREE,'illustration-office-worker',[0,0,0]);
  const hips=makePivot(THREE,'worker-hips',[0,1.62,0]);root.add(hips);
  const torso=makePivot(THREE,'worker-torso',[0,.10,0]);hips.add(torso);
  const headPivot=makePivot(THREE,'worker-head-pivot',[0,1.42,0]);torso.add(headPivot);
  const shoulderL=makePivot(THREE,'worker-left-shoulder',[-.62,1.08,0]);torso.add(shoulderL);
  const shoulderR=makePivot(THREE,'worker-right-shoulder',[.62,1.08,0]);torso.add(shoulderR);
  const hipL=makePivot(THREE,'worker-left-hip',[-.26,-.02,0]);hips.add(hipL);
  const hipR=makePivot(THREE,'worker-right-hip',[.26,-.02,0]);hips.add(hipR);

  const body=partMass(modeler,{seed:seed+':body',width:1.18,height:1.38,depth:.48,color:'#98a5b3',position:[0,-.10,0],name:'worker-body',profileOptions:{top:.72,waist:.60,bottom:.80}});
  torso.add(body);
  const shirt=partMass(modeler,{seed:seed+':shirt',width:.48,height:.82,depth:.08,color:'#c0c7ce',opacity:.48,position:[0,.22,.28],outline:false,name:'worker-shirt-wash',profileOptions:{top:.66,waist:.58,bottom:.66}});
  torso.add(shirt);

  const head=ellipseMesh(THREE,{rx:.38,ry:.40,depth:.31,color:'#a7b1bb',name:'worker-head'});
  headPivot.add(head);
  const hair=ellipseMesh(THREE,{rx:.34,ry:.16,depth:.33,color:'#65758b',opacity:.62,name:'worker-hair'});
  hair.position.set(0,.23,.03);hair.scale.z=.9;headPivot.add(hair);

  const tie=modeler.stroke([[0,.88,.34],[0,.42,.35],[-.03,.10,.34]],{seed:seed+':tie',radius:.045,opacity:.68,name:'worker-tie'});
  torso.add(tie);

  function makeArm(side,pivot){
    const s=side==='left'?-1:1;
    const upper=partMass(modeler,{seed:seed+':'+side+'-upper-arm',width:.34,height:.82,depth:.30,color:'#8f9cab',position:[0,-.80,0],name:'worker-'+side+'-upper-arm',profileOptions:{top:.72,waist:.68,bottom:.62}});
    const elbow=makePivot(THREE,'worker-'+side+'-elbow',[0,-.76,0]);pivot.add(upper,elbow);
    const fore=partMass(modeler,{seed:seed+':'+side+'-forearm',width:.30,height:.76,depth:.27,color:'#9ba7b4',position:[0,-.72,0],name:'worker-'+side+'-forearm',profileOptions:{top:.66,waist:.62,bottom:.54}});
    elbow.add(fore);
    const hand=ellipseMesh(THREE,{rx:.13,ry:.15,depth:.12,color:'#a8b2bb',name:'worker-'+side+'-hand'});hand.position.set(0,-.78,0);elbow.add(hand);
    pivot.position.x=Math.abs(pivot.position.x)*s;
    return {pivot,elbow,upper,fore,hand};
  }
  const leftArm=makeArm('left',shoulderL),rightArm=makeArm('right',shoulderR);

  function makeLeg(side,pivot){
    const s=side==='left'?-1:1;
    const upper=partMass(modeler,{seed:seed+':'+side+'-upper-leg',width:.38,height:1.00,depth:.34,color:'#8795a5',position:[0,-.96,0],name:'worker-'+side+'-upper-leg',profileOptions:{top:.72,waist:.62,bottom:.58}});
    const knee=makePivot(THREE,'worker-'+side+'-knee',[0,-.94,0]);pivot.add(upper,knee);
    const lower=partMass(modeler,{seed:seed+':'+side+'-lower-leg',width:.32,height:.94,depth:.30,color:'#8997a7',position:[0,-.90,0],name:'worker-'+side+'-lower-leg',profileOptions:{top:.62,waist:.58,bottom:.52}});
    knee.add(lower);
    const shoe=ellipseMesh(THREE,{rx:.23,ry:.12,depth:.22,color:'#5b6d83',name:'worker-'+side+'-shoe'});shoe.position.set(.06*s,-.98,.09);shoe.scale.x=1.28;knee.add(shoe);
    pivot.position.x=Math.abs(pivot.position.x)*s;
    return {pivot,knee,upper,lower,shoe};
  }
  const leftLeg=makeLeg('left',hipL),rightLeg=makeLeg('right',hipR);

  const briefcase=briefcaseMesh(THREE);
  briefcase.position.set(.18,-.92,.05);
  rightArm.elbow.add(briefcase);

  // Naive dark jacket edges: sparse semantic lines, not technical topology.
  torso.add(modeler.stroke([[-.47,1.02,.30],[-.18,.42,.32],[0,.08,.34]],{seed:seed+':lapel-l',radius:.022,opacity:.34,name:'worker-lapel-l'}));
  torso.add(modeler.stroke([[.47,1.02,.30],[.18,.42,.32],[0,.08,.34]],{seed:seed+':lapel-r',radius:.022,opacity:.34,name:'worker-lapel-r'}));

  root.userData.illustrationCharacter=true;
  root.userData.rig={hips,torso,headPivot,leftArm,rightArm,leftLeg,rightLeg,briefcase};
  root.userData.action='idle';
  return root;
}

export function createIllustrationCharacterAnimator(worker){
  const rig=worker?.userData?.rig;
  if(!rig)throw new Error('Illustration character rig is missing');
  const {hips,torso,headPivot,leftArm,rightArm,leftLeg,rightLeg,briefcase}=rig;
  let action='idle',actionStart=0,manual=false;
  const actions=['idle','walk','wave','carry'];
  const cycleMs=4200;

  function setAction(next,timeMs=performance.now(),isManual=true){
    if(!actions.includes(next))next='idle';
    action=next;actionStart=timeMs;manual=isManual;worker.userData.action=action;return action;
  }
  function reset(){
    hips.position.x=0;hips.position.y=1.62;hips.rotation.set(0,0,0);
    torso.rotation.set(0,0,0);headPivot.rotation.set(0,0,0);
    leftArm.pivot.rotation.set(0,0,.08);rightArm.pivot.rotation.set(0,0,-.08);
    leftArm.elbow.rotation.set(0,0,0);rightArm.elbow.rotation.set(0,0,0);
    leftLeg.pivot.rotation.set(0,0,0);rightLeg.pivot.rotation.set(0,0,0);
    leftLeg.knee.rotation.set(0,0,0);rightLeg.knee.rotation.set(0,0,0);
    briefcase.rotation.set(0,0,0);
  }
  function tick(timeMs){
    if(!manual){
      const index=Math.floor(timeMs/cycleMs)%actions.length;
      const desired=actions[index];
      if(desired!==action){action=desired;actionStart=timeMs;worker.userData.action=action;}
    }
    reset();
    const local=(timeMs-actionStart)/1000;
    const breathe=Math.sin(timeMs*.0021);
    torso.rotation.z=breathe*.018;headPivot.rotation.z=-breathe*.014;
    hips.position.y=1.62+Math.sin(timeMs*.0031)*.025;

    if(action==='walk'){
      const p=timeMs*.0065,s=Math.sin(p),c=Math.cos(p);
      leftLeg.pivot.rotation.x=s*.58;rightLeg.pivot.rotation.x=-s*.58;
      leftLeg.knee.rotation.x=Math.max(0,-s)*.52;rightLeg.knee.rotation.x=Math.max(0,s)*.52;
      leftArm.pivot.rotation.x=-s*.42;rightArm.pivot.rotation.x=s*.30;
      hips.position.y=1.62+Math.abs(c)*.055;torso.rotation.y=s*.035;
    }else if(action==='wave'){
      rightArm.pivot.rotation.z=-1.42;rightArm.pivot.rotation.x=-.16;
      rightArm.elbow.rotation.z=-1.05+Math.sin(timeMs*.008)*.28;
      leftArm.pivot.rotation.z=.10;
    }else if(action==='carry'){
      rightArm.pivot.rotation.z=-.20;rightArm.elbow.rotation.z=-.14;
      briefcase.rotation.z=Math.sin(timeMs*.003)*.035;
      leftArm.pivot.rotation.z=.10+Math.sin(timeMs*.002)*.03;
    }else{
      leftArm.pivot.rotation.z=.08+Math.sin(timeMs*.0019)*.025;
      rightArm.pivot.rotation.z=-.08-Math.sin(timeMs*.0017)*.025;
      leftLeg.pivot.rotation.z=Math.sin(timeMs*.0013)*.008;
      rightLeg.pivot.rotation.z=-Math.sin(timeMs*.0013)*.008;
    }
    // Slight watercolor wobble at the whole-character level without breaking the rig.
    worker.rotation.z=Math.sin(timeMs*.00073)*.006;
  }
  function next(timeMs=performance.now()){
    const i=(actions.indexOf(action)+1)%actions.length;manual=true;return setAction(actions[i],timeMs,true);
  }
  function auto(){manual=false;}
  return {tick,setAction,next,auto,get action(){return action;},actions:[...actions]};
}
