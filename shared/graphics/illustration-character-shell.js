// Illustration-first character shell for rig-driven stylized people.
// Motion comes from the hidden humanoid rig; visible form comes from a pose-aware painted shell.

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const DEFAULT_WORKER_VISUAL_PROFILE=Object.freeze({
  headScale:1.28,
  shoulderWidth:.78,
  torsoWidth:.86,
  torsoDepth:.72,
  armThickness:.72,
  forearmThickness:.68,
  legThickness:.82,
  lowerLegThickness:.76,
  handScale:1.12,
  footScale:1.10,
  jacketLength:1.04,
  outlineOpacity:.56,
  internalInkOpacity:.34,
  propScale:1
});

export function createSketchProportionController(profile={}){
  const state={...DEFAULT_WORKER_VISUAL_PROFILE,...profile};
  return Object.freeze({
    get:(key)=>state[key],
    profile:()=>({...state}),
    scaled:(value,key)=>value*(Number(state[key])||1),
    merge:(next={})=>createSketchProportionController({...state,...next})
  });
}

function simpleMaterial(THREE,color,opacity=1,{basic=false}={}){
  const Ctor=basic?THREE.MeshBasicMaterial:THREE.MeshStandardMaterial;
  return new Ctor({
    color,
    ...(basic?{}:{roughness:1,metalness:0}),
    transparent:opacity<1,
    opacity,
    depthWrite:opacity>.4
  });
}

function tag(mesh,{layer='mass',role='internal',semantic=null}={}){
  mesh.userData=mesh.userData||{};
  mesh.userData.illustrationCharacterShell=true;
  mesh.userData.paintLayer=layer;
  mesh.userData.outlineRole=role;
  mesh.userData.watercolorOutline=false;
  if(layer==='ink'||layer==='detail')mesh.userData.watercolorSkipWash=true;
  if(semantic)mesh.userData.semanticRole=semantic;
  return mesh;
}

function makeShape(THREE,points){
  const s=new THREE.Shape();
  s.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);
  s.closePath();
  return s;
}

function frontPatch(THREE,points,{color,opacity=.9,depth=.02,z=.12,name='patch',layer='detail'}={}){
  const g=new THREE.ExtrudeGeometry(makeShape(THREE,points),{
    depth,steps:1,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:1
  });
  g.translate(0,0,-depth*.5);
  const m=new THREE.Mesh(g,simpleMaterial(THREE,color,opacity,{basic:layer==='ink'}));
  m.position.z=z;
  m.name=name;
  return tag(m,{layer,role:'internal',semantic:name});
}

function ellipse(THREE,{scale=[.2,.2,.15],color='#aab3bd',opacity=.9,name='blob',layer='mass'}={}){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,11),simpleMaterial(THREE,color,opacity));
  m.scale.set(...scale);m.name=name;
  return tag(m,{layer,role:'internal',semantic:name});
}

function findLocalVector(THREE,bone,child){
  bone.updateMatrixWorld(true);child.updateMatrixWorld(true);
  const world=new THREE.Vector3();child.getWorldPosition(world);
  return bone.worldToLocal(world);
}

function alignY(THREE,obj,vector){
  const d=vector.clone();const len=d.length();
  if(len<1e-6)return 0;
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return len;
}

function segmentEnvelope(THREE,modeler,bone,child,{
  seed,width,color,opacity=.9,name='segment',depth=.72,layer='mass'
}={}){
  const target=findLocalVector(THREE,bone,child);
  const length=Math.max(.025,target.length());
  const mass=modeler.mass({
    seed,
    profile:[
      [-width*.44,0],[-width*.50,length*.18],[-width*.43,length*.72],[-width*.34,length],
      [ width*.34,length],[ width*.43,length*.72],[ width*.50,length*.18],[ width*.44,0]
    ],
    width,height:length,topWidth:width*.7,depth:width*depth,
    color,opacity,outline:false,name
  });
  alignY(THREE,mass,target);
  tag(mass,{layer,role:'internal',semantic:name});
  bone.add(mass);
  return mass;
}

function addGarmentGrammar(THREE,bones,profile,palette){
  const g=new THREE.Group();g.name='worker-garment-grammar';
  const w=.30*profile.get('torsoWidth'), h=.34*profile.get('jacketLength');

  const jacket=frontPatch(THREE,[
    [-w*.80,-h*.88],[-w,-h*.35],[-w*.91,h*.42],[-w*.58,h*.88],[0,h],
    [w*.58,h*.88],[w*.91,h*.42],[w,-h*.35],[w*.80,-h*.88]
  ],{color:palette.jacket,opacity:.90,depth:.13,name:'worker-jacket-mass',z:0,layer:'mass'});
  g.add(jacket);

  const shirt=frontPatch(THREE,[
    [-w*.27,-h*.72],[-w*.34,h*.62],[0,h*.88],[w*.34,h*.62],[w*.27,-h*.72]
  ],{color:palette.shirt,opacity:.88,depth:.015,name:'worker-shirt-wash',z:.10,layer:'detail'});
  g.add(shirt);

  const lapelL=frontPatch(THREE,[
    [-w*.72,h*.72],[-w*.26,h*.67],[-w*.03,h*.24],[-w*.34,h*.38],[-w*.62,h*.10]
  ],{color:palette.lapel,opacity:.72,depth:.01,name:'worker-lapel-left',z:.13,layer:'detail'});
  const lapelR=frontPatch(THREE,[
    [w*.72,h*.72],[w*.26,h*.67],[w*.03,h*.24],[w*.34,h*.38],[w*.62,h*.10]
  ],{color:palette.lapel,opacity:.72,depth:.01,name:'worker-lapel-right',z:.13,layer:'detail'});
  g.add(lapelL,lapelR);

  const collarL=frontPatch(THREE,[[-w*.26,h*.67],[-w*.03,h*.24],[-w*.42,h*.50]],{
    color:palette.collar,opacity:.92,depth:.009,name:'worker-collar-left',z:.145,layer:'detail'
  });
  const collarR=frontPatch(THREE,[[w*.26,h*.67],[w*.03,h*.24],[w*.42,h*.50]],{
    color:palette.collar,opacity:.92,depth:.009,name:'worker-collar-right',z:.145,layer:'detail'
  });
  g.add(collarL,collarR);

  const tie=frontPatch(THREE,[
    [-w*.15,h*.30],[0,h*.45],[w*.15,h*.30],[w*.11,-h*.52],[0,-h*.76],[-w*.11,-h*.52]
  ],{color:palette.tie,opacity:1,depth:.012,name:'worker-black-tie',z:.16,layer:'ink'});
  g.add(tie);

  for(const x of [-w*.54,w*.54]){
    const pocket=new THREE.Mesh(new THREE.BoxGeometry(w*.28,.010,.012),
      simpleMaterial(THREE,palette.ink,.28,{basic:true}));
    pocket.position.set(x,-h*.34,.17);pocket.name='worker-pocket-stroke';
    tag(pocket,{layer:'ink',role:'internal',semantic:'jacket-pocket'});g.add(pocket);
  }
  bones.chest.add(g);
  return g;
}

function addBriefcase(THREE,root,palette,profile){
  const s=profile.get('propScale');
  const g=new THREE.Group();g.name='worker-briefcase';
  const body=new THREE.Mesh(new THREE.BoxGeometry(.30*s,.22*s,.085*s),simpleMaterial(THREE,palette.briefcase,.96));
  tag(body,{layer:'mass',role:'internal',semantic:'briefcase'});g.add(body);
  const flap=new THREE.Mesh(new THREE.BoxGeometry(.27*s,.07*s,.012*s),simpleMaterial(THREE,palette.ink,.72,{basic:true}));
  flap.position.set(0,.03*s,.052*s);tag(flap,{layer:'ink',role:'internal',semantic:'briefcase-flap'});g.add(flap);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.07*s,.012*s,6,16,Math.PI),simpleMaterial(THREE,palette.ink,.9,{basic:true}));
  handle.position.set(0,.14*s,0);handle.rotation.z=Math.PI;
  tag(handle,{layer:'ink',role:'internal',semantic:'briefcase-handle'});g.add(handle);
  root.add(g);
  return g;
}

export function createPropGripConstraint(THREE,{root,hand,prop,offset=[.02,-.16,.12],yaw=.04}={}){
  const world=new THREE.Vector3(),local=new THREE.Vector3();
  return Object.freeze({
    update(){
      if(!root||!hand||!prop)return;
      root.updateMatrixWorld(true);hand.getWorldPosition(world);local.copy(world);root.worldToLocal(local);
      prop.position.copy(local);
      prop.position.x+=offset[0];prop.position.y+=offset[1];prop.position.z+=offset[2];
      // Keep a readable briefcase orientation instead of inheriting arbitrary wrist twist.
      prop.rotation.set(0,0,yaw);
    }
  });
}

function createDynamicContour(THREE,{root,bones,profile,palette}){
  const pairs=[
    ['upperarm.l','lowerarm.l','armThickness'],['lowerarm.l','wrist.l','forearmThickness'],
    ['upperarm.r','lowerarm.r','armThickness'],['lowerarm.r','wrist.r','forearmThickness'],
    ['upperleg.l','lowerleg.l','legThickness'],['lowerleg.l','foot.l','lowerLegThickness'],
    ['upperleg.r','lowerleg.r','legThickness'],['lowerleg.r','foot.r','lowerLegThickness']
  ];
  const points=new Float32Array(pairs.length*4*3 + 8*3);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.BufferAttribute(points,3));
  const mat=new THREE.LineBasicMaterial({color:palette.ink,transparent:true,opacity:profile.get('outlineOpacity'),depthWrite:false});
  const line=new THREE.LineSegments(geom,mat);
  line.name='worker-single-outer-contour';
  tag(line,{layer:'ink',role:'outer',semantic:'single-outer-contour'});
  line.userData.watercolorSkipWash=true;
  root.add(line);

  const aW=new THREE.Vector3(),bW=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const side=new THREE.Vector3(),dir=new THREE.Vector3();
  const camAxis=new THREE.Vector3(0,0,1);
  function put(i,v){points[i*3]=v.x;points[i*3+1]=v.y;points[i*3+2]=v.z;}
  function update(){
    let pi=0;
    root.updateMatrixWorld(true);
    for(const [aName,bName,widthKey] of pairs){
      const ba=bones[aName],bb=bones[bName];if(!ba||!bb)continue;
      ba.getWorldPosition(aW);bb.getWorldPosition(bW);
      a.copy(aW);b.copy(bW);root.worldToLocal(a);root.worldToLocal(b);
      dir.copy(b).sub(a).normalize();
      side.crossVectors(dir,camAxis);
      if(side.lengthSq()<1e-6)side.set(1,0,0);else side.normalize();
      const base=/leg/i.test(aName)?0.055:0.045;
      const half=base*profile.get(widthKey);
      const s=side.multiplyScalar(half);
      put(pi++,a.clone().add(s));put(pi++,b.clone().add(s));
      put(pi++,a.clone().sub(s));put(pi++,b.clone().sub(s));
    }
    // Head/shoulder/torso simplified contour segments.
    const head=bones.head,chest=bones.chest,hips=bones.hips;
    if(head&&chest&&hips){
      head.getWorldPosition(aW);chest.getWorldPosition(bW);a.copy(aW);b.copy(bW);root.worldToLocal(a);root.worldToLocal(b);
      const hr=.13*profile.get('headScale'), tw=.24*profile.get('torsoWidth');
      put(pi++,new THREE.Vector3(a.x-hr,a.y+.12,a.z));put(pi++,new THREE.Vector3(a.x+hr,a.y+.12,a.z));
      put(pi++,new THREE.Vector3(a.x-hr,a.y-.12,a.z));put(pi++,new THREE.Vector3(a.x+hr,a.y-.12,a.z));
      hips.getWorldPosition(aW);const h= root.worldToLocal(aW.clone());
      put(pi++,new THREE.Vector3(b.x-tw,b.y+.18,b.z));put(pi++,new THREE.Vector3(h.x-tw,h.y,h.z));
      put(pi++,new THREE.Vector3(b.x+tw,b.y+.18,b.z));put(pi++,new THREE.Vector3(h.x+tw,h.y,h.z));
    }
    geom.attributes.position.needsUpdate=true;
    geom.setDrawRange(0,pi);
    geom.computeBoundingSphere();
  }
  return {line,update};
}

export function createCharacterIllustrationShell(THREE,{
  root,bones,modeler,profile={},palette={}
}={}){
  const proportions=createSketchProportionController(profile);
  const colors={
    jacket:'#718195',shirt:'#e1e0da',lapel:'#596b80',collar:'#eef0ed',
    tie:'#111214',trousers:'#7f8e9e',shoe:'#4e6074',skin:'#b6bdc4',
    hair:'#65758b',briefcase:'#3f4d60',ink:'#34465e',...palette
  };

  const shell=new THREE.Group();shell.name='worker-character-illustration-shell';root.add(shell);

  // Garment is one dominant visual mass; limbs are internal paint envelopes with no per-part outline.
  const garment=addGarmentGrammar(THREE,bones,proportions,colors);

  const armW=.115*proportions.get('armThickness'), foreW=.102*proportions.get('forearmThickness');
  const legW=.145*proportions.get('legThickness'), lowerW=.13*proportions.get('lowerLegThickness');
  segmentEnvelope(THREE,modeler,bones['upperarm.l'],bones['lowerarm.l'],{seed:'shell:ual',width:armW,color:colors.jacket,name:'shell-upperarm-l'});
  segmentEnvelope(THREE,modeler,bones['lowerarm.l'],bones['wrist.l'],{seed:'shell:lal',width:foreW,color:colors.jacket,name:'shell-lowerarm-l'});
  segmentEnvelope(THREE,modeler,bones['upperarm.r'],bones['lowerarm.r'],{seed:'shell:uar',width:armW,color:colors.jacket,name:'shell-upperarm-r'});
  segmentEnvelope(THREE,modeler,bones['lowerarm.r'],bones['wrist.r'],{seed:'shell:lar',width:foreW,color:colors.jacket,name:'shell-lowerarm-r'});
  segmentEnvelope(THREE,modeler,bones['upperleg.l'],bones['lowerleg.l'],{seed:'shell:utl',width:legW,color:colors.trousers,name:'shell-upperleg-l'});
  segmentEnvelope(THREE,modeler,bones['lowerleg.l'],bones['foot.l'],{seed:'shell:ltl',width:lowerW,color:colors.trousers,name:'shell-lowerleg-l'});
  segmentEnvelope(THREE,modeler,bones['upperleg.r'],bones['lowerleg.r'],{seed:'shell:utr',width:legW,color:colors.trousers,name:'shell-upperleg-r'});
  segmentEnvelope(THREE,modeler,bones['lowerleg.r'],bones['foot.r'],{seed:'shell:ltr',width:lowerW,color:colors.trousers,name:'shell-lowerleg-r'});

  const head=ellipse(THREE,{scale:[.145*proportions.get('headScale'),.19*proportions.get('headScale'),.12],color:colors.skin,opacity:.92,name:'worker-head'});
  head.position.set(0,.085,.005);bones.head.add(head);
  const hair=ellipse(THREE,{scale:[.14*proportions.get('headScale'),.055,.126],color:colors.hair,opacity:.68,name:'worker-hair'});
  hair.position.set(0,.222,.008);bones.head.add(hair);
  for(const side of ['l','r']){
    const hand=ellipse(THREE,{scale:[.06*proportions.get('handScale'),.072*proportions.get('handScale'),.052],color:colors.skin,opacity:.93,name:`worker-hand-${side}`});
    hand.position.set(0,.025,0);bones[`hand.${side}`].add(hand);
    const foot=ellipse(THREE,{scale:[.09*proportions.get('footScale'),.048,.145*proportions.get('footScale')],color:colors.shoe,opacity:.95,name:`worker-shoe-${side}`});
    foot.position.set(0,.06,.05);bones[`foot.${side}`].add(foot);
  }

  const briefcase=addBriefcase(THREE,root,colors,proportions);
  const grip=createPropGripConstraint(THREE,{root,hand:bones['hand.r'],prop:briefcase});
  const contour=createDynamicContour(THREE,{root,bones,profile:proportions,palette:colors});

  function update(){
    grip.update();
    contour.update();
  }

  root.userData.characterIllustrationShell=true;
  root.userData.paintLayerOrder=['mass','detail','ink'];
  root.userData.singleOuterContour=true;
  root.userData.visualEnvelopeMapper=true;
  root.userData.poseAwareSilhouette=true;
  root.userData.garmentGrammar=true;
  root.userData.propGripConstraint=true;
  root.userData.sketchProportions=proportions.profile();

  return Object.freeze({
    root,shell,garment,briefcase,contour:contour.line,proportions,
    update,
    capabilities:Object.freeze([
      'character-illustration-shell','pose-aware-silhouette','garment-grammar',
      'semantic-paint-layers','single-outer-contour','sketch-proportion-controller',
      'bone-visual-envelope-mapper','prop-grip-constraint'
    ])
  });
}