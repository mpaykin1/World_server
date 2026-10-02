import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createIllustrationMassModeler} from './illustration-mass-modeler.js';

const DEFAULT_BASE='/assets/characters/kaykit-knight';

function hideSourceMeshes(root){
  root.traverse((node)=>{
    if(node.isMesh||node.isSkinnedMesh){ node.visible=false; node.userData=node.userData||{}; node.userData.watercolorSkipWash=true; node.userData.watercolorOutline=false; }
  });
}

function findNode(root,name){
  let found=null;
  const underscored=String(name).replace(/[.:/]/g,'_');
  const compact=String(name).replace(/[.:/]/g,'');
  root.traverse((node)=>{if(!found&&(node.name===name||node.name===underscored||node.name===compact))found=node;});
  return found;
}

function alignYTo(THREE,object,vector){
  const dir=vector.clone();
  const len=dir.length();
  if(len<1e-6)return len;
  dir.normalize();
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  return len;
}

function makeSimpleMaterial(THREE,color,opacity=1){
  return new THREE.MeshStandardMaterial({
    color,roughness:1,metalness:0,
    transparent:opacity<1,opacity,depthWrite:opacity>.35
  });
}

function addSegment(THREE,modeler,bone,child,{
  seed,width,color,opacity=.88,depthScale=.72,name
}){
  if(!bone||!child)return null;
  bone.updateMatrixWorld(true);child.updateMatrixWorld(true);
  const childWorld=new THREE.Vector3();
  child.getWorldPosition(childWorld);
  const target=bone.worldToLocal(childWorld.clone());
  const length=Math.max(.035,target.length());
  const mass=modeler.mass({
    seed,
    profile:[
      [-width*.46,0],[-width*.52,length*.13],[-width*.44,length*.68],[-width*.36,length],
      [ width*.36,length],[ width*.44,length*.68],[ width*.52,length*.13],[ width*.46,0]
    ],
    width,height:length,topWidth:width*.72,depth:width*depthScale,
    color,opacity,outline:true,name
  });
  alignYTo(THREE,mass,target);
  mass.userData.kaykitDriven=true;
  bone.add(mass);
  return mass;
}

function addBlob(THREE,bone,{
  color='#a7b1bb',scale=[.22,.24,.18],position=[0,0,0],opacity=.9,name='painted-blob'
}={}){
  if(!bone)return null;
  const mesh=new THREE.Mesh(
    new THREE.SphereGeometry(1,12,9),
    makeSimpleMaterial(THREE,color,opacity)
  );
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  mesh.name=name;
  mesh.userData={watercolorOutline:true,illustrationMass:true,kaykitDriven:true};
  bone.add(mesh);
  return mesh;
}

function makeFrontPatch(THREE,points,{color='#8795a5',opacity=.9,depth=.055,name='front-patch',z=.12}={}){
  const shape=new THREE.Shape();
  shape.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][1]);
  shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth,steps:1,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1
  });
  geometry.translate(0,0,-depth*.5);
  const material=makeSimpleMaterial(THREE,color,opacity);
  const m=new THREE.Mesh(geometry,material);
  m.position.z=z;
  m.name=name;
  m.userData={watercolorOutline:true,illustrationMass:true,kaykitDriven:true};
  return m;
}

function addSuitTorso(THREE,bone){
  if(!bone)return null;
  const g=new THREE.Group();g.name='worker-suit-torso';

  const jacket=makeFrontPatch(THREE,[
    [-.24,-.29],[-.30,-.12],[-.28,.16],[-.18,.30],[0,.34],
    [.18,.30],[.28,.16],[.30,-.12],[.24,-.29]
  ],{color:'#718195',opacity:.96,depth:.16,name:'worker-jacket',z:0});
  jacket.userData.watercolorOutline=true;g.add(jacket);

  const shirt=makeFrontPatch(THREE,[
    [-.085,-.25],[-.105,.23],[0,.30],[.105,.23],[.085,-.25]
  ],{color:'#e1e0da',opacity:.94,depth:.018,name:'worker-shirt-front',z:.105});
  shirt.userData.watercolorOutline=false;shirt.userData.watercolorSkipWash=true;g.add(shirt);

  const leftLap=makeFrontPatch(THREE,[
    [-.225,.245],[-.075,.235],[-.005,.105],[-.105,.155],[-.20,.05]
  ],{color:'#596b80',opacity:.98,depth:.014,name:'worker-lapel-left',z:.135});
  leftLap.userData.watercolorOutline=true;leftLap.userData.watercolorSkipWash=true;g.add(leftLap);
  const rightLap=makeFrontPatch(THREE,[
    [.225,.245],[.075,.235],[.005,.105],[.105,.155],[.20,.05]
  ],{color:'#596b80',opacity:.98,depth:.014,name:'worker-lapel-right',z:.135});
  rightLap.userData.watercolorOutline=true;rightLap.userData.watercolorSkipWash=true;g.add(rightLap);

  const collarL=makeFrontPatch(THREE,[[-.075,.235],[-.005,.105],[-.125,.18]],{
    color:'#eef0ed',opacity:.94,depth:.01,name:'worker-collar-left',z:.155
  });
  collarL.userData.watercolorOutline=false;collarL.userData.watercolorSkipWash=true;g.add(collarL);
  const collarR=makeFrontPatch(THREE,[[.075,.235],[.005,.105],[.125,.18]],{
    color:'#eef0ed',opacity:.94,depth:.01,name:'worker-collar-right',z:.155
  });
  collarR.userData.watercolorOutline=false;collarR.userData.watercolorSkipWash=true;g.add(collarR);

  const pocketMat=new THREE.MeshBasicMaterial({color:'#34465e',transparent:true,opacity:.30,depthWrite:false});
  for(const x of [-.17,.17]){
    const pocket=new THREE.Mesh(new THREE.BoxGeometry(.105,.012,.018),pocketMat.clone());
    pocket.position.set(x,-.12,.175);pocket.name='worker-jacket-pocket';
    pocket.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
    g.add(pocket);
  }
  bone.add(g);
  return g;
}

function addBriefcase(THREE,parent){
  if(!parent)return null;
  const g=new THREE.Group();g.name='kaykit-worker-briefcase';
  const body=new THREE.Mesh(
    new THREE.BoxGeometry(.30,.225,.09),
    makeSimpleMaterial(THREE,'#3f4d60',.99)
  );
  body.userData={watercolorOutline:true,illustrationMass:true,kaykitDriven:true};
  body.position.set(.02,.00,.14);g.add(body);

  const flap=new THREE.Mesh(
    new THREE.BoxGeometry(.27,.085,.012),
    new THREE.MeshBasicMaterial({color:'#344255',transparent:true,opacity:.92})
  );
  flap.position.set(.02,.035,.193);
  flap.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
  g.add(flap);

  const clasp=new THREE.Mesh(
    new THREE.BoxGeometry(.055,.042,.018),
    new THREE.MeshBasicMaterial({color:'#a9b1ba',transparent:true,opacity:.86})
  );
  clasp.position.set(.02,.005,.202);
  clasp.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
  g.add(clasp);

  const handle=new THREE.Mesh(
    new THREE.TorusGeometry(.075,.014,6,16,Math.PI),
    new THREE.MeshBasicMaterial({color:'#25354a',transparent:true,opacity:.92})
  );
  handle.position.set(.02,.145,.14);handle.rotation.z=Math.PI;
  handle.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
  g.add(handle);

  g.rotation.z=.04;
  g.position.set(0,0,0);
  parent.add(g);
  return g;
}

function addTie(THREE,bone){
  if(!bone)return null;
  const g=new THREE.Group();g.name='kaykit-worker-tie';

  const knot=makeFrontPatch(THREE,[[-.047,.065],[0,.105],[.047,.065],[.028,.012],[-.028,.012]],{
    color:'#111214',opacity:1,depth:.012,name:'worker-tie-knot',z:.184
  });
  knot.userData.watercolorOutline=false;knot.userData.watercolorSkipWash=true;g.add(knot);

  const tie=makeFrontPatch(THREE,[[-.033,.01],[-.044,-.205],[0,-.255],[.044,-.205],[.033,.01]],{
    color:'#111214',opacity:1,depth:.014,name:'worker-tie-body',z:.183
  });
  tie.userData.watercolorOutline=false;tie.userData.watercolorSkipWash=true;g.add(tie);

  bone.add(g);return g;
}

function dedupeClips(gltfs){
  const byName=new Map();
  for(const gltf of gltfs){
    for(const clip of gltf.animations||[]){
      if(!byName.has(clip.name))byName.set(clip.name,clip);
    }
  }
  return [...byName.values()];
}

function buildLoopClipSet(semantics,clipByName){
  const loops=new Set();
  for(const semantic of semantics.looping||[]){
    for(const candidate of semantics.actions?.[semantic]||[]){
      if(clipByName.has(candidate))loops.add(candidate);
    }
  }
  for(const name of clipByName.keys()){
    if(/(Idle|Walking|Running|Aiming|Blocking|Spellcasting|T-Pose)/i.test(name))loops.add(name);
  }
  return loops;
}

async function readJson(url,fetchFn){
  const r=await fetchFn(url,{cache:'force-cache'});
  if(!r.ok)throw new Error(`KayKit worker asset fetch failed: ${r.status} ${url}`);
  return r.json();
}

export async function createKayKitIllustrationWorker(THREE,{
  parent=null,
  baseUrl=DEFAULT_BASE,
  fetchFn=globalThis.fetch?.bind(globalThis),
  loader=null,
  ink='#2e425d',
  wash='#aab3bd',
  scale=3.0,
  initialSemantic='idle'
}={}){
  if(!fetchFn)throw new Error('KayKit illustration worker requires fetch');
  const gltfLoader=loader||new GLTFLoader();
  const base=String(baseUrl).replace(/\/$/,'');
  const [manifest,semantics]=await Promise.all([
    readJson(`${base}/manifest.json`,fetchFn),
    readJson(`${base}/semantic-actions.json`,fetchFn)
  ]);

  const animationGltfs=await Promise.all(
    manifest.animationGroups.map((path)=>gltfLoader.loadAsync(`${base}/${path}`))
  );
  if(!animationGltfs.length)throw new Error('KayKit animation groups are empty');

  // The first animation GLB already carries the complete Rig_Medium skeleton.
  const source=animationGltfs[0].scene;
  hideSourceMeshes(source);

  const root=new THREE.Group();
  root.name='kaykit-driven-illustration-worker';
  root.scale.setScalar(scale);
  root.add(source);
  parent?.add?.(root);

  const bones={};
  for(const name of [
    'root','hips','spine','chest','head',
    'upperarm.l','lowerarm.l','wrist.l','hand.l','handslot.l',
    'upperarm.r','lowerarm.r','wrist.r','hand.r','handslot.r',
    'upperleg.l','lowerleg.l','foot.l','toes.l',
    'upperleg.r','lowerleg.r','foot.r','toes.r'
  ])bones[name]=findNode(source,name);

  const missing=Object.entries(bones).filter(([,node])=>!node).map(([name])=>name);
  if(missing.length)throw new Error(`KayKit skeleton missing: ${missing.join(', ')}`);

  const modeler=createIllustrationMassModeler(THREE,{ink,wash});
  source.updateMatrixWorld(true);

  // Target visual grammar: clear jacket, white shirt, black tie and visible briefcase,
  // while all movement still comes from the full KayKit Rig_Medium skeleton.
  addSuitTorso(THREE,bones.chest);

  addSegment(THREE,modeler,bones['upperarm.l'],bones['lowerarm.l'],{seed:'worker:ual',width:.115,color:'#718195',opacity:.96,name:'worker-upperarm-l'});
  addSegment(THREE,modeler,bones['lowerarm.l'],bones['wrist.l'],{seed:'worker:lal',width:.102,color:'#78889a',opacity:.95,name:'worker-lowerarm-l'});
  addSegment(THREE,modeler,bones['upperarm.r'],bones['lowerarm.r'],{seed:'worker:uar',width:.115,color:'#718195',opacity:.96,name:'worker-upperarm-r'});
  addSegment(THREE,modeler,bones['lowerarm.r'],bones['wrist.r'],{seed:'worker:lar',width:.102,color:'#78889a',opacity:.95,name:'worker-lowerarm-r'});
  addSegment(THREE,modeler,bones['upperleg.l'],bones['lowerleg.l'],{seed:'worker:utl',width:.145,color:'#7f8e9e',opacity:.95,name:'worker-upperleg-l'});
  addSegment(THREE,modeler,bones['lowerleg.l'],bones['foot.l'],{seed:'worker:ltl',width:.13,color:'#7f8e9e',opacity:.95,name:'worker-lowerleg-l'});
  addSegment(THREE,modeler,bones['upperleg.r'],bones['lowerleg.r'],{seed:'worker:utr',width:.145,color:'#7f8e9e',opacity:.95,name:'worker-upperleg-r'});
  addSegment(THREE,modeler,bones['lowerleg.r'],bones['foot.r'],{seed:'worker:ltr',width:.13,color:'#7f8e9e',opacity:.95,name:'worker-lowerleg-r'});

  addBlob(THREE,bones.head,{color:'#b6bdc4',scale:[.145,.19,.12],position:[0,.085,.005],opacity:.93,name:'worker-head'});
  addBlob(THREE,bones.head,{color:'#65758b',scale:[.14,.055,.126],position:[0,.222,.008],opacity:.72,name:'worker-hair'});
  addBlob(THREE,bones['hand.l'],{color:'#b6bdc4',scale:[.06,.072,.052],position:[0,.025,0],opacity:.94,name:'worker-hand-l'});
  addBlob(THREE,bones['hand.r'],{color:'#b6bdc4',scale:[.06,.072,.052],position:[0,.025,0],opacity:.94,name:'worker-hand-r'});
  addBlob(THREE,bones['foot.l'],{color:'#4e6074',scale:[.09,.048,.145],position:[0,.06,.05],opacity:.96,name:'worker-shoe-l'});
  addBlob(THREE,bones['foot.r'],{color:'#4e6074',scale:[.09,.048,.145],position:[0,.06,.05],opacity:.96,name:'worker-shoe-r'});

  addTie(THREE,bones.chest);
  const briefcase=addBriefcase(THREE,root);
  if(briefcase)briefcase.visible=true;

  const sourceClipCount=animationGltfs.reduce((sum,gltf)=>sum+(gltf.animations?.length||0),0);
  const clips=dedupeClips(animationGltfs);
  const clipByName=new Map(clips.map((clip)=>[clip.name,clip]));
  const loopClips=buildLoopClipSet(semantics,clipByName);
  const mixer=new THREE.AnimationMixer(source);
  const actions=new Map();
  let activeAction=null,activeClip=null,activeSemantic=null;

  function actionFor(name){
    const clip=clipByName.get(name);
    if(!clip)return null;
    if(!actions.has(name))actions.set(name,mixer.clipAction(clip));
    return actions.get(name);
  }

  function playClip(name,{fade=.14,loop=null,timeScale=1}={}){
    const action=actionFor(name);
    if(!action)return null;
    const shouldLoop=loop??loopClips.has(name);
    if(activeAction&&activeAction!==action)activeAction.fadeOut(Math.max(0,fade));
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale);
    action.clampWhenFinished=!shouldLoop;
    action.setLoop(shouldLoop?THREE.LoopRepeat:THREE.LoopOnce,shouldLoop?Infinity:1);
    action.fadeIn(Math.max(0,fade)).play();
    activeAction=action;activeClip=name;activeSemantic=null;
    if(briefcase)briefcase.visible=true;
    return action;
  }

  function semanticClipName(name){
    return (semantics.actions?.[name]||[]).find((candidate)=>clipByName.has(candidate))||null;
  }

  function playSemantic(name,options={}){
    const clip=semanticClipName(name);
    if(!clip)return null;
    const action=playClip(clip,{...options,loop:options.loop??(semantics.looping||[]).includes(name)});
    if(action)activeSemantic=name;
    return action;
  }

  const handWorld=new THREE.Vector3();
  const handLocal=new THREE.Vector3();
  function update(deltaSeconds){
    mixer.update(Math.max(0,Number(deltaSeconds)||0));
    if(briefcase){
      root.updateMatrixWorld(true);
      bones['hand.r'].getWorldPosition(handWorld);
      handLocal.copy(handWorld);
      root.worldToLocal(handLocal);
      briefcase.position.copy(handLocal);
      briefcase.position.y-=.16;
      briefcase.position.z+=.12;
      briefcase.rotation.set(0,0,.04);
    }
  }

  function listClips(){
    return clips.map((clip)=>clip.name);
  }

  function listSemantics(){
    return Object.keys(semantics.actions||{}).map((name)=>({
      name,clip:semanticClipName(name),supported:Boolean(semanticClipName(name))
    }));
  }

  function dispose(){
    mixer.stopAllAction();
    root.parent?.remove?.(root);
    root.traverse((node)=>{
      node.geometry?.dispose?.();
      const mats=Array.isArray(node.material)?node.material:node.material?[node.material]:[];
      mats.forEach((m)=>m.dispose?.());
    });
  }

  if(initialSemantic)playSemantic(initialSemantic,{fade:0});

  root.userData.illustrationCharacter=true;
  root.userData.kaykitDriven=true;
  root.userData.clipCount=clips.length;
  root.userData.sourceClipCount=sourceClipCount;
  root.userData.baseScale=scale;

  return Object.freeze({
    id:'kaykit-driven-illustration-worker',
    root,source,bones,mixer,manifest,semantics,clips,
    get clipCount(){return clips.length;},
    get sourceClipCount(){return sourceClipCount;},
    get activeClip(){return activeClip;},
    get activeSemantic(){return activeSemantic;},
    playClip,playSemantic,semanticClipName,listClips,listSemantics,update,dispose
  });
}

