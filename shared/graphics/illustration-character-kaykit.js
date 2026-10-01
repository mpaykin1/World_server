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

function addBriefcase(THREE,bone){
  if(!bone)return null;
  const g=new THREE.Group();g.name='kaykit-worker-briefcase';
  const body=new THREE.Mesh(
    new THREE.BoxGeometry(.23,.17,.07),
    makeSimpleMaterial(THREE,'#718197',.92)
  );
  body.userData={watercolorOutline:true,illustrationMass:true,kaykitDriven:true};
  body.position.set(.03,.06,.12);g.add(body);
  const handle=new THREE.Mesh(
    new THREE.TorusGeometry(.055,.012,5,12,Math.PI),
    new THREE.MeshBasicMaterial({color:'#2e425d',transparent:true,opacity:.48})
  );
  handle.position.set(.03,.155,.12);handle.rotation.z=Math.PI;
  handle.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
  g.add(handle);
  bone.add(g);
  return g;
}

function addTie(THREE,bone){
  if(!bone)return null;
  const g=new THREE.Mesh(
    new THREE.BoxGeometry(.055,.23,.025),
    new THREE.MeshBasicMaterial({color:'#53657d',transparent:true,opacity:.72})
  );
  g.position.set(0,.05,.16);
  g.rotation.z=.02;
  g.name='kaykit-worker-tie';
  g.userData={watercolorOutline:false,watercolorSkipWash:true,watercolorSemantic:true,kaykitDriven:true};
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

  // Childlike painted body: sparse masses, but driven by the full KayKit skeleton.
  addSegment(THREE,modeler,bones.hips,bones.chest,{seed:'worker:coat',width:.44,color:'#98a5b3',opacity:.78,depthScale:.68,name:'worker-coat'});
  addSegment(THREE,modeler,bones.spine,bones.chest,{seed:'worker:shirt',width:.25,color:'#c3c9cf',opacity:.38,depthScale:.48,name:'worker-shirt'});
  addSegment(THREE,modeler,bones['upperarm.l'],bones['lowerarm.l'],{seed:'worker:ual',width:.13,color:'#8f9cab',name:'worker-upperarm-l'});
  addSegment(THREE,modeler,bones['lowerarm.l'],bones['wrist.l'],{seed:'worker:lal',width:.11,color:'#9ba7b4',name:'worker-lowerarm-l'});
  addSegment(THREE,modeler,bones['upperarm.r'],bones['lowerarm.r'],{seed:'worker:uar',width:.13,color:'#8f9cab',name:'worker-upperarm-r'});
  addSegment(THREE,modeler,bones['lowerarm.r'],bones['wrist.r'],{seed:'worker:lar',width:.11,color:'#9ba7b4',name:'worker-lowerarm-r'});
  addSegment(THREE,modeler,bones['upperleg.l'],bones['lowerleg.l'],{seed:'worker:utl',width:.15,color:'#8795a5',name:'worker-upperleg-l'});
  addSegment(THREE,modeler,bones['lowerleg.l'],bones['foot.l'],{seed:'worker:ltl',width:.13,color:'#8997a7',name:'worker-lowerleg-l'});
  addSegment(THREE,modeler,bones['upperleg.r'],bones['lowerleg.r'],{seed:'worker:utr',width:.15,color:'#8795a5',name:'worker-upperleg-r'});
  addSegment(THREE,modeler,bones['lowerleg.r'],bones['foot.r'],{seed:'worker:ltr',width:.13,color:'#8997a7',name:'worker-lowerleg-r'});

  addBlob(THREE,bones.head,{color:'#a7b1bb',scale:[.14,.16,.12],position:[0,.09,0],name:'worker-head'});
  addBlob(THREE,bones.head,{color:'#65758b',scale:[.13,.06,.125],position:[0,.20,.005],opacity:.58,name:'worker-hair'});
  addBlob(THREE,bones['hand.l'],{color:'#a8b2bb',scale:[.055,.065,.05],position:[0,.025,0],name:'worker-hand-l'});
  addBlob(THREE,bones['hand.r'],{color:'#a8b2bb',scale:[.055,.065,.05],position:[0,.025,0],name:'worker-hand-r'});
  addBlob(THREE,bones['foot.l'],{color:'#5b6d83',scale:[.08,.045,.13],position:[0,.06,.045],name:'worker-shoe-l'});
  addBlob(THREE,bones['foot.r'],{color:'#5b6d83',scale:[.08,.045,.13],position:[0,.06,.045],name:'worker-shoe-r'});
  addTie(THREE,bones.chest);
  const briefcase=addBriefcase(THREE,bones['hand.r']);
  if(briefcase)briefcase.visible=false;

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
    if(briefcase)briefcase.visible=/PickUp|Use_Item|Interact|Walking_C/i.test(name);
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

  function update(deltaSeconds){
    mixer.update(Math.max(0,Number(deltaSeconds)||0));
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

