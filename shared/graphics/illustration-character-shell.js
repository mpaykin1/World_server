// WORKER VISUAL SHELL V2
// KayKit owns motion. This module owns the visible illustration.
export const DEFAULT_WORKER_VISUAL_PROFILE=Object.freeze({
  headScale:1.42,
  torsoWidth:1.04,
  jacketLength:1.10,
  armThickness:.90,
  forearmThickness:.84,
  legThickness:.96,
  lowerLegThickness:.90,
  handScale:1.18,
  footScale:1.18,
  propScale:1.16,
  outlineOpacity:.62
});
export function createSketchProportionController(profile={}){
  const state={...DEFAULT_WORKER_VISUAL_PROFILE,...profile};
  return Object.freeze({
    get:key=>state[key],
    profile:()=>({...state}),
    scaled:(value,key)=>value*(Number(state[key])||1),
    merge:next=>createSketchProportionController({...state,...next})
  });
}
function material(THREE,color,opacity=1,basic=false){
  const Ctor=basic?THREE.MeshBasicMaterial:THREE.MeshStandardMaterial;
  return new Ctor({
    color,
    ...(basic?{}:{roughness:1,metalness:0}),
    transparent:opacity<1,
    opacity,
    depthWrite:opacity>.35
  });
}
function tag(node,{layer='mass',role='internal',semantic=null}={}){
  node.userData=node.userData||{};
  node.userData.illustrationCharacterShell=true;
  node.userData.paintLayer=layer;
  node.userData.outlineRole=role;
  node.userData.watercolorOutline=false;
  if(layer==='detail'||layer==='ink')node.userData.watercolorSkipWash=true;
  if(semantic)node.userData.semanticRole=semantic;
  return node;
}
function shape(THREE,points){
  const s=new THREE.Shape();
  s.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)s.lineTo(points[i][0],points[i][1]);
  s.closePath();
  return s;
}
function patch(THREE,points,{color,opacity=.9,depth=.02,z=.12,name='patch',layer='detail'}={}){
  const g=new THREE.ExtrudeGeometry(shape(THREE,points),{
    depth,steps:1,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:1
  });
  g.translate(0,0,-depth*.5);
  const m=new THREE.Mesh(g,material(THREE,color,opacity,layer==='ink'));
  m.position.z=z;
  m.name=name;
  return tag(m,{layer,semantic:name});
}
function blob(THREE,{scale,color,opacity=.92,name='blob',layer='mass'}){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),material(THREE,color,opacity));
  m.scale.set(...scale);
  m.name=name;
  return tag(m,{layer,semantic:name});
}
function localVector(THREE,bone,child){
  bone.updateMatrixWorld(true); child.updateMatrixWorld(true);
  const world=new THREE.Vector3(); child.getWorldPosition(world);
  return bone.worldToLocal(world);
}
function alignY(THREE,obj,v){
  const d=v.clone(); const len=d.length();
  if(len<1e-6)return 0;
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());
  return len;
}
function envelope(THREE,modeler,bone,child,{
  seed,width,color,name,opacity=.94,overlapStart=.045,overlapEnd=.055,depth=.72
}){
  const target=localVector(THREE,bone,child);
  const base=Math.max(.025,target.length());
  const length=base+overlapStart+overlapEnd;
  const mass=modeler.mass({
    seed,
    profile:[
      [-width*.46,-overlapStart],[-width*.52,length*.16],[-width*.46,length*.70],[-width*.36,length],
      [ width*.36,length],[ width*.46,length*.70],[ width*.52,length*.16],[ width*.46,-overlapStart]
    ],
    width,height:length,topWidth:width*.72,depth:width*depth,
    color,opacity,outline:false,name
  });
  alignY(THREE,mass,target);
  tag(mass,{layer:'mass',semantic:name});
  bone.add(mass);
  return mass;
}
function addJointBlend(THREE,bone,{scale,color,name}){
  const m=blob(THREE,{scale,color,opacity:.94,name});
  m.position.set(0,0,0);
  bone.add(m);
  return m;
}
function addSemanticStroke(modeler,parent,points,{name,radius=.012,opacity=.48,color='#34465e'}){
  const stroke=modeler.stroke(points,{seed:name,name,radius,opacity,color});
  tag(stroke,{layer:'ink',semantic:name});
  parent.add(stroke);
  return stroke;
}
function addGarmentGrammar(THREE,modeler,bones,p,colors){
  const g=new THREE.Group(); g.name='worker-garment-grammar';
  const w=.34*p.get('torsoWidth'), h=.42*p.get('jacketLength');
  const jacket=patch(THREE,[
    [-w*.78,-h*.94],[-w*.98,-h*.42],[-w*.94,h*.38],[-w*.62,h*.84],[0,h],
    [w*.62,h*.84],[w*.94,h*.38],[w*.98,-h*.42],[w*.78,-h*.94]
  ],{color:colors.jacket,opacity:.96,depth:.16,name:'worker-jacket-mass',z:0,layer:'mass'});
  g.add(jacket);
  const shirt=patch(THREE,[
    [-w*.24,-h*.72],[-w*.28,h*.54],[0,h*.80],[w*.28,h*.54],[w*.24,-h*.72]
  ],{color:colors.shirt,opacity:.94,depth:.012,name:'worker-shirt-wash',z:.118,layer:'detail'});
  g.add(shirt);
  const collarL=patch(THREE,[[-w*.22,h*.58],[-w*.02,h*.22],[-w*.38,h*.48]],{
    color:colors.shirt,opacity:.98,depth:.009,name:'worker-collar-left',z:.145,layer:'detail'
  });
  const collarR=patch(THREE,[[w*.22,h*.58],[w*.02,h*.22],[w*.38,h*.48]],{
    color:colors.shirt,opacity:.98,depth:.009,name:'worker-collar-right',z:.145,layer:'detail'
  });
  g.add(collarL,collarR);
  const tie=patch(THREE,[
    [-w*.15,h*.26],[0,h*.42],[w*.15,h*.26],[w*.10,-h*.52],[0,-h*.76],[-w*.10,-h*.52]
  ],{color:colors.tie,opacity:1,depth:.012,name:'worker-black-tie',z:.162,layer:'ink'});
  g.add(tie);
  addSemanticStroke(modeler,g,[[-w*.70,h*.70,.17],[-w*.28,h*.52,.17],[-w*.04,h*.18,.17]],{
    name:'worker-lapel-left-stroke',radius:.014,opacity:.50,color:colors.ink
  });
  addSemanticStroke(modeler,g,[[w*.70,h*.70,.17],[w*.28,h*.52,.17],[w*.04,h*.18,.17]],{
    name:'worker-lapel-right-stroke',radius:.014,opacity:.50,color:colors.ink
  });
  addSemanticStroke(modeler,g,[[-w*.62,-h*.34,.17],[-w*.36,-h*.34,.17]],{
    name:'worker-pocket-left-stroke',radius:.009,opacity:.32,color:colors.ink
  });
  addSemanticStroke(modeler,g,[[w*.36,-h*.34,.17],[w*.62,-h*.34,.17]],{
    name:'worker-pocket-right-stroke',radius:.009,opacity:.32,color:colors.ink
  });
  bones.chest.add(g);
  return g;
}
function addPelvisBridge(THREE,bones,p,colors){
  const bridge=blob(THREE,{
    scale:[.19*p.get('torsoWidth'),.105,.115],
    color:colors.trousers,opacity:.96,name:'worker-pelvis-bridge'
  });
  bridge.position.set(0,.075,.005);
  bones.hips.add(bridge);
  return bridge;
}
function addHeadShell(THREE,modeler,bones,p,colors){
  const g=new THREE.Group(); g.name='worker-head-shell';
  g.position.set(0,.045,.005);
  g.rotation.z=.11;
  bones.head.add(g);
  const head=blob(THREE,{
    scale:[.150*p.get('headScale'),.205*p.get('headScale'),.122],
    color:colors.skin,opacity:.95,name:'worker-head-oval'
  });
  g.add(head);
  const hair=patch(THREE,[
    [-.125,.105],[-.100,.165],[-.035,.205],[.045,.202],[.115,.150],[.130,.105],
    [.070,.125],[0,.135],[-.065,.125]
  ],{color:colors.hair,opacity:.52,depth:.006,name:'worker-hair-wash',z:.126,layer:'detail'});
  g.add(hair);
  addSemanticStroke(modeler,g,[[-.115,.110,.132],[-.065,.165,.132],[0,.188,.132],[.070,.165,.132],[.115,.115,.132]],{
    name:'worker-hair-edge',radius:.008,opacity:.32,color:colors.ink
  });
  return g;
}
function addBriefcase(THREE,root,p,colors){
  const s=p.get('propScale');
  const g=new THREE.Group(); g.name='worker-briefcase';
  const body=new THREE.Mesh(new THREE.BoxGeometry(.31*s,.225*s,.085*s),material(THREE,colors.briefcase,.98));
  tag(body,{layer:'mass',semantic:'briefcase'}); g.add(body);
  const flap=new THREE.Mesh(new THREE.BoxGeometry(.285*s,.072*s,.012*s),material(THREE,colors.ink,.78,true));
  flap.position.set(0,.032*s,.050*s); tag(flap,{layer:'ink',semantic:'briefcase-flap'}); g.add(flap);
  const clasp=new THREE.Mesh(new THREE.BoxGeometry(.052*s,.040*s,.015*s),material(THREE,'#9ca6b1',.90,true));
  clasp.position.set(0,-.010*s,.059*s); tag(clasp,{layer:'detail',semantic:'briefcase-clasp'}); g.add(clasp);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.072*s,.012*s,6,18,Math.PI),material(THREE,colors.ink,.94,true));
  handle.position.set(0,.145*s,0); handle.rotation.z=Math.PI;
  tag(handle,{layer:'ink',semantic:'briefcase-handle'}); g.add(handle);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({color:colors.ink,transparent:true,opacity:.42,depthWrite:false}));
  tag(edge,{layer:'ink',semantic:'briefcase-edge'}); g.add(edge);
  root.add(g);
  return g;
}
export function createPropGripConstraint(THREE,{root,hand,prop,offset=[.02,-.17,.12],yaw=.03}={}){
  const world=new THREE.Vector3(),local=new THREE.Vector3();
  return Object.freeze({
    update(){
      if(!root||!hand||!prop)return;
      root.updateMatrixWorld(true);
      hand.getWorldPosition(world);
      local.copy(world);
      root.worldToLocal(local);
      prop.position.copy(local);
      prop.position.x+=offset[0];
      prop.position.y+=offset[1];
      prop.position.z+=offset[2];
      prop.rotation.set(0,0,yaw);
    }
  });
}
function createOuterContour(THREE,{root,bones,p,colors}){
  const maxPoints=320;
  const data=new Float32Array(maxPoints*3);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.BufferAttribute(data,3));
  const mat=new THREE.LineBasicMaterial({
    color:colors.ink,transparent:true,opacity:p.get('outlineOpacity'),depthWrite:false
  });
  const line=new THREE.LineSegments(geom,mat);
  line.name='worker-single-outer-contour';
  tag(line,{layer:'ink',role:'outer',semantic:'single-outer-contour'});
  line.userData.watercolorSkipWash=true;
  root.add(line);
  const tmpW=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3();
  const side=new THREE.Vector3(),dir=new THREE.Vector3(),camAxis=new THREE.Vector3(0,0,1);
  let cursor=0;
  function put(v){
    if(cursor>=maxPoints)return;
    data[cursor*3]=v.x; data[cursor*3+1]=v.y; data[cursor*3+2]=v.z; cursor++;
  }
  function toRoot(bone,v){
    const q=v.clone();
    bone.localToWorld(q);
    root.worldToLocal(q);
    return q;
  }
  function seg(v1,v2){put(v1);put(v2);}
  function sidePair(aName,bName,width){
    const ba=bones[aName],bb=bones[bName]; if(!ba||!bb)return;
    ba.getWorldPosition(tmpW); a.copy(tmpW); root.worldToLocal(a);
    bb.getWorldPosition(tmpW); b.copy(tmpW); root.worldToLocal(b);
    dir.copy(b).sub(a).normalize();
    side.crossVectors(dir,camAxis);
    if(side.lengthSq()<1e-6)side.set(1,0,0); else side.normalize();
    side.multiplyScalar(width);
    seg(a.clone().add(side),b.clone().add(side));
    seg(a.clone().sub(side),b.clone().sub(side));
  }
  function loop(bone,points,z){
    for(let i=0;i<points.length;i++){
      const aP=toRoot(bone,new THREE.Vector3(points[i][0],points[i][1],z));
      const bP=toRoot(bone,new THREE.Vector3(points[(i+1)%points.length][0],points[(i+1)%points.length][1],z));
      seg(aP,bP);
    }
  }
  function update(){
    cursor=0;
    root.updateMatrixWorld(true);
    sidePair('upperarm.l','lowerarm.l',.058*p.get('armThickness'));
    sidePair('lowerarm.l','wrist.l',.053*p.get('forearmThickness'));
    sidePair('upperarm.r','lowerarm.r',.058*p.get('armThickness'));
    sidePair('lowerarm.r','wrist.r',.053*p.get('forearmThickness'));
    sidePair('upperleg.l','lowerleg.l',.072*p.get('legThickness'));
    sidePair('lowerleg.l','foot.l',.068*p.get('lowerLegThickness'));
    sidePair('upperleg.r','lowerleg.r',.072*p.get('legThickness'));
    sidePair('lowerleg.r','foot.r',.068*p.get('lowerLegThickness'));
    const hr=.150*p.get('headScale'), hv=.205*p.get('headScale');
    const headPts=[];
    for(let i=0;i<18;i++){
      const t=i/18*Math.PI*2;
      headPts.push([Math.cos(t)*hr,Math.sin(t)*hv+.045]);
    }
    loop(bones.head,headPts,.130);
    const tw=.34*p.get('torsoWidth'), th=.42*p.get('jacketLength');
    loop(bones.chest,[
      [-tw*.78,-th*.94],[-tw*.98,-th*.42],[-tw*.94,th*.38],[-tw*.62,th*.84],[0,th],
      [tw*.62,th*.84],[tw*.94,th*.38],[tw*.98,-th*.42],[tw*.78,-th*.94]
    ],.175);
    geom.attributes.position.needsUpdate=true;
    geom.setDrawRange(0,cursor);
    geom.computeBoundingSphere();
  }
  return {line,update};
}
export function createCharacterIllustrationShell(THREE,{root,bones,modeler,profile={},palette={}}={}){
  const p=createSketchProportionController(profile);
  const colors={
    jacket:'#5f7085',
    shirt:'#e5e2db',
    trousers:'#7f8d9c',
    tie:'#111317',
    shoe:'#4e6074',
    skin:'#b8bec4',
    hair:'#65758a',
    briefcase:'#39485d',
    ink:'#34465e',
    ...palette
  };
  const shell=new THREE.Group(); shell.name='worker-character-illustration-shell'; root.add(shell);
  const garment=addGarmentGrammar(THREE,modeler,bones,p,colors);
  const pelvisBridge=addPelvisBridge(THREE,bones,p,colors);
  const headShell=addHeadShell(THREE,modeler,bones,p,colors);
  const armW=.145*p.get('armThickness');
  const foreW=.132*p.get('forearmThickness');
  const legW=.168*p.get('legThickness');
  const lowLegW=.155*p.get('lowerLegThickness');
  envelope(THREE,modeler,bones['upperarm.l'],bones['lowerarm.l'],{seed:'shell:ual',width:armW,color:colors.jacket,name:'worker-sleeve-upper-l'});
  envelope(THREE,modeler,bones['lowerarm.l'],bones['wrist.l'],{seed:'shell:lal',width:foreW,color:colors.jacket,name:'worker-sleeve-lower-l'});
  envelope(THREE,modeler,bones['upperarm.r'],bones['lowerarm.r'],{seed:'shell:uar',width:armW,color:colors.jacket,name:'worker-sleeve-upper-r'});
  envelope(THREE,modeler,bones['lowerarm.r'],bones['wrist.r'],{seed:'shell:lar',width:foreW,color:colors.jacket,name:'worker-sleeve-lower-r'});
  addJointBlend(THREE,bones['lowerarm.l'],{scale:[armW*.55,armW*.58,armW*.50],color:colors.jacket,name:'worker-elbow-blend-l'});
  addJointBlend(THREE,bones['lowerarm.r'],{scale:[armW*.55,armW*.58,armW*.50],color:colors.jacket,name:'worker-elbow-blend-r'});
  envelope(THREE,modeler,bones['upperleg.l'],bones['lowerleg.l'],{seed:'shell:utl',width:legW,color:colors.trousers,name:'worker-trouser-upper-l',overlapStart:.075,overlapEnd:.075});
  envelope(THREE,modeler,bones['lowerleg.l'],bones['foot.l'],{seed:'shell:ltl',width:lowLegW,color:colors.trousers,name:'worker-trouser-lower-l',overlapStart:.080,overlapEnd:.075});
  envelope(THREE,modeler,bones['upperleg.r'],bones['lowerleg.r'],{seed:'shell:utr',width:legW,color:colors.trousers,name:'worker-trouser-upper-r',overlapStart:.075,overlapEnd:.075});
  envelope(THREE,modeler,bones['lowerleg.r'],bones['foot.r'],{seed:'shell:ltr',width:lowLegW,color:colors.trousers,name:'worker-trouser-lower-r',overlapStart:.080,overlapEnd:.075});
  addJointBlend(THREE,bones['lowerleg.l'],{scale:[legW*.58,legW*.62,legW*.52],color:colors.trousers,name:'worker-knee-blend-l'});
  addJointBlend(THREE,bones['lowerleg.r'],{scale:[legW*.58,legW*.62,legW*.52],color:colors.trousers,name:'worker-knee-blend-r'});
  for(const side of ['l','r']){
    const hand=blob(THREE,{scale:[.062*p.get('handScale'),.078*p.get('handScale'),.054],color:colors.skin,name:`worker-hand-${side}`});
    hand.position.set(0,.022,0);
    bones[`hand.${side}`].add(hand);
    const shoe=blob(THREE,{scale:[.105*p.get('footScale'),.052,.158*p.get('footScale')],color:colors.shoe,opacity:.97,name:`worker-shoe-${side}`});
    shoe.position.set(0,.065,.055);
    bones[`foot.${side}`].add(shoe);
  }
  const briefcase=addBriefcase(THREE,root,p,colors);
  const grip=createPropGripConstraint(THREE,{root,hand:bones['hand.r'],prop:briefcase});
  const contour=createOuterContour(THREE,{root,bones,p,colors});
  function update(){
    grip.update();
    contour.update();
  }
  Object.assign(root.userData,{
    characterIllustrationShell:true,
    workerVisualShellVersion:2,
    paintLayerOrder:['mass','detail','ink'],
    singleOuterContour:true,
    visualEnvelopeMapper:true,
    poseAwareSilhouette:true,
    garmentGrammar:true,
    pelvisBridge:true,
    propGripConstraint:true,
    sketchProportions:p.profile()
  });
  return Object.freeze({
    root,shell,garment,pelvisBridge,headShell,briefcase,contour:contour.line,proportions:p,
    update,
    capabilities:Object.freeze([
      'character-illustration-shell-v2','pose-aware-silhouette','garment-grammar',
      'pelvis-bridge','semantic-paint-layers','single-outer-contour',
      'sketch-proportion-controller','bone-visual-envelope-mapper','prop-grip-constraint'
    ])
  });
}
