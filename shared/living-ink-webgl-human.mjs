import * as THREE from '../vendor/three-r160/three.module.min.js';
import {STYLE,seeded} from './living-ink-webgl-npr.mjs';

export function createOfficeHuman(ctx,opt={}){
  const seed=opt.seed||1,height=opt.height||1.72,build=opt.build||1;
  const root=new THREE.Group();root.position.set(opt.x||0,0,opt.z||0);
  root.userData.kind='human';root.userData.seed=seed;root.userData.state=opt.state||'idle';

  ctx.softPlane(root,[0,.012,.02],.58,.22,.115,'shadow',seed);
  const pelvis=new THREE.Group();pelvis.position.y=.72*height;root.add(pelvis);
  const spine=new THREE.Group();spine.position.y=.25*height;pelvis.add(spine);

  const suit=STYLE.suit[Math.floor(seeded(seed,4)*STYLE.suit.length)];
  const shirt=[0xf1f2ef,0xeee9e2,0xe7ecee,0xf2eee8][Math.floor(seeded(seed,5)*4)];

  const torso=ctx.addInkMesh(
    spine,
    new THREE.CylinderGeometry(.18*build,.145*build,.52*height,8,1,false),
    {color:suit,opacity:.27,semantic:'human',importance:1,edgeOpacity:.48,edgeThreshold:28,
      position:new THREE.Vector3(0,.06,0)}
  );
  torso.scale.z=.68+(seeded(seed,7)-.5)*.08;
  const shoulderLine=ctx.box(spine,[.39*build,.035,.14],[0,.285*height,-.01],{
    color:suit,opacity:.18,semantic:'human',importance:.85,edgeOpacity:.24
  });
  shoulderLine.userData.nearOnly=true;

  const shirtMesh=ctx.box(spine,[.18*build,.29*height,.018],[0,.105,-.126],{
    color:shirt,opacity:.26,semantic:'human',importance:1,edgeOpacity:.20,edgeThreshold:40
  });
  shirtMesh.userData.nearOnly=true;
  const tie=ctx.box(spine,[.035,.24*height,.022],[0,.07,-.142],{
    color:STYLE.ink,opacity:.36,semantic:'human',importance:1,edgeOpacity:.18,edges:false
  });
  tie.userData.nearOnly=true;

  const neck=ctx.cyl(spine,.055,.10*height,[0,.39*height,0],{
    color:0x9a9995,opacity:.21,semantic:'human',importance:.8,edgeOpacity:.18,segments:8
  });
  neck.userData.nearOnly=true;
  ctx.sphere(spine,.115*height,[0,.50*height,0],{
    color:STYLE.inkSoft,opacity:.36,semantic:'human',importance:1,edgeOpacity:.42,w:10,h:7
  });
  const hair=ctx.sphere(spine,.10*height,[(seeded(seed,8)-.5)*.025,.565*height,-.015],{
    color:STYLE.ink,opacity:.42,semantic:'human',importance:.95,edgeOpacity:.30,w:8,h:6
  });
  hair.scale.set(1.05,.58+(seeded(seed,9)*.28),1.02);

  function limb(parent,x,y,len,radius,side,kind){
    const joint=new THREE.Group();joint.position.set(x,y,0);parent.add(joint);
    const upper=ctx.cyl(joint,radius,len,[0,-len*.50,0],{
      color:suit,opacity:.24,semantic:'human',importance:.85,edgeOpacity:.38,segments:7
    });
    const lowerJoint=new THREE.Group();lowerJoint.position.y=-len; joint.add(lowerJoint);
    const lower=ctx.cyl(lowerJoint,radius*.88,len*.92,[0,-len*.46,0],{
      color:suit,opacity:.23,semantic:'human',importance:.82,edgeOpacity:.36,segments:7
    });
    if(kind==='arm'){
      ctx.sphere(lowerJoint,radius*.95,[0,-len*.94,0],{
        color:0x989795,opacity:.23,semantic:'human',importance:.75,edgeOpacity:.22,w:7,h:5
      });
    }
    return {joint,lowerJoint,upper,lower,side};
  }

  const armLen=.205*height;
  const leftArm=limb(spine,-.245*build,.25*height,armLen,.043*build,-1,'arm');
  const rightArm=limb(spine,.245*build,.25*height,armLen,.043*build,1,'arm');

  const legLen=.245*height;
  const leftLeg=limb(pelvis,-.105*build,-.02*height,legLen,.055*build,-1,'leg');
  const rightLeg=limb(pelvis,.105*build,-.02*height,legLen,.055*build,1,'leg');

  for(const [leg,side] of [[leftLeg,-1],[rightLeg,1]]){
    const shoe=ctx.box(leg.lowerJoint,[.13,.055,.24],[side*.018,-legLen*.96,-.055],{
      color:STYLE.ink,opacity:.30,semantic:'human',importance:.78,edgeOpacity:.28
    });
    shoe.userData.nearOnly=true;
  }

  const badge=ctx.box(spine,[.075,.055,.012],[.115,.22*height,-.142],{
    color:STYLE.screen,opacity:.30,semantic:'human',importance:.65,edgeOpacity:.20
  });
  badge.userData.nearOnly=true;

  root.userData.rig={pelvis,spine,leftArm,rightArm,leftLeg,rightLeg};
  root.userData.base={height,build};
  return root;
}

export function animateOfficeHuman(human,time,state=human.userData.state||'idle'){
  const rig=human.userData.rig;if(!rig)return;
  const seed=human.userData.seed||1,t=time*.001*(.90+seeded(seed,13)*.28);
  rig.spine.rotation.z=0;rig.spine.rotation.x=0;
  rig.leftArm.joint.rotation.z=.06;rig.rightArm.joint.rotation.z=-.06;
  rig.leftArm.joint.rotation.x=0;rig.rightArm.joint.rotation.x=0;
  rig.leftLeg.joint.rotation.z=0;rig.rightLeg.joint.rotation.z=0;
  rig.leftLeg.joint.rotation.x=0;rig.rightLeg.joint.rotation.x=0;

  if(state==='walk'){
    const s=Math.sin(t*4.2);
    rig.leftArm.joint.rotation.x=s*.52;rig.rightArm.joint.rotation.x=-s*.52;
    rig.leftLeg.joint.rotation.x=-s*.48;rig.rightLeg.joint.rotation.x=s*.48;
    rig.spine.rotation.z=Math.sin(t*2.1)*.018;
    human.position.y=Math.abs(Math.sin(t*4.2))*.012;
  }else if(state==='type'){
    rig.spine.rotation.x=.08;
    rig.leftArm.joint.rotation.x=-1.10;rig.rightArm.joint.rotation.x=-1.10;
    rig.leftArm.joint.rotation.z=.35;rig.rightArm.joint.rotation.z=-.35;
    rig.leftArm.lowerJoint.rotation.x=-.72;rig.rightArm.lowerJoint.rotation.x=-.72;
  }else if(state==='coffee'){
    rig.rightArm.joint.rotation.x=-.82;rig.rightArm.joint.rotation.z=-.28;
    rig.rightArm.lowerJoint.rotation.x=-1.0;
  }else if(state==='talk'||state==='meeting'){
    rig.leftArm.joint.rotation.z=-.28+Math.sin(t*1.6)*.16;
    rig.rightArm.joint.rotation.z=.26-Math.sin(t*1.3)*.12;
    rig.spine.rotation.z=Math.sin(t*.9)*.025;
  }else if(state==='sit'){
    rig.leftLeg.joint.rotation.x=-1.25;rig.rightLeg.joint.rotation.x=-1.25;
    rig.leftLeg.lowerJoint.rotation.x=1.15;rig.rightLeg.lowerJoint.rotation.x=1.15;
    human.position.y=-.34;
  }else{
    rig.spine.rotation.z=Math.sin(t*.65)*.008;
  }
}

export function updateHumanLod(human,camera){
  const d=human.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position);
  human.traverse(o=>{
    if(o.userData.nearOnly)o.visible=d<10;
    if(o.userData.midOnly)o.visible=d<20;
  });
  human.userData.lod=d<10?'near':d<20?'medium':'far';
}
