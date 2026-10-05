const EXPECTED_UPSTREAM_COMMIT="3bf0ff017372e640e966c2785a4d95a998cec242";
const UPSTREAM=Object.freeze({
  repository:"MasonDye/kkrieger-wasm",
  commit:EXPECTED_UPSTREAM_COMMIT,
});

function assertPinnedUpstream(){
  if(!/^[0-9a-f]{40}$/.test(UPSTREAM.commit)||UPSTREAM.commit!==EXPECTED_UPSTREAM_COMMIT)
    throw new Error("Krieger upstream pin drift");
}

export const KRIEGER_NATIVE_AUTHORING_VERSION=1;

const BASE_GEOMETRY={
  cube:{handler:"Mesh_Cube",operatorId:0x81,classId:"KC_MESH",family:"geometry"},
  cylinder:{handler:"Mesh_Cylinder",operatorId:0x82,classId:"KC_MESH",family:"geometry"},
  grid:{handler:"Mesh_Grid",operatorId:0x9d,classId:"KC_MESH",family:"geometry"},
  singleVert:{handler:"Mesh_SingleVert",operatorId:0xb3,classId:"KC_MESH",family:"geometry"},
};

const MESH_MODIFIERS={
  subdivide:{handler:"Mesh_Subdivide",operatorId:0x87,classId:"KC_MESH",family:"geometry"},
  transform:{handler:"Mesh_Transform",operatorId:0x88,classId:"KC_MESH",family:"geometry"},
  transformEx:{handler:"Mesh_TransformEx",operatorId:0x89,classId:"KC_MESH",family:"geometry"},
  crease:{handler:"Mesh_Crease",operatorId:0x8a,classId:"KC_MESH",family:"geometry"},
  triangulate:{handler:"Mesh_Triangulate",operatorId:0x8c,classId:"KC_MESH",family:"geometry"},
  displace:{handler:"Mesh_Displace",operatorId:0x8f,classId:"KC_MESH",family:"geometry"},
  bevel:{handler:"Mesh_Bevel",operatorId:0x90,classId:"KC_MESH",family:"geometry"},
  extrude:{handler:"Mesh_Extrude",operatorId:0x9a,classId:"KC_MESH",family:"geometry"},
  uvProjection:{handler:"Mesh_UVProjection",operatorId:0xa5,classId:"KC_MESH",family:"geometry"},
  center:{handler:"Mesh_Center",operatorId:0xa6,classId:"KC_MESH",family:"geometry"},
};

const FIXED={
  material:{handler:"Init_Material_Material",operatorId:0xd0,classId:"KC_MATERIAL",family:"material"},
  materialAdd:{handler:"Material_Add",operatorId:0xd1,classId:"KC_MATERIAL",family:"material"},
  meshMatLink:{handler:"Mesh_MatLink",operatorId:0x96,classId:"KC_MESH",family:"material"},
  scene:{handler:"Init_Scene_Scene",operatorId:0xc0,classId:"KC_SCENE",family:"scene"},
  sceneTransform:{handler:"Init_Scene_Transform",operatorId:0xc3,classId:"KC_SCENE",family:"scene"},
  partEmitter:{handler:"Init_Effect_PartEmitter",operatorId:0x63,classId:"KC_EFFECT",family:"effects"},
  partSystem:{handler:"Init_Effect_PartSystem",operatorId:0x64,classId:"KC_EFFECT",family:"effects"},
  portal:{handler:"Init_Scene_Portal",operatorId:0xcd,classId:"KC_SCENE",family:"scene"},
  sector:{handler:"Init_Scene_Sector",operatorId:0xcb,classId:"KC_SCENE",family:"scene"},
  collider:{handler:"Mesh_CollisionCube",operatorId:0x9c,classId:"KC_MESH",family:"collision"},
  physics:{handler:"Init_Scene_Physic",operatorId:0xce,classId:"KC_SCENE",family:"collision"},
  creature:{handler:"Init_KKrieger_Monster",operatorId:0x11,classId:"KC_KKRIEGER",family:"creature"},
  trigger:{handler:"Init_Misc_Trigger",operatorId:0x07,classId:"KC_ANY",family:"logic"},
  audio:{handler:"Exec_Misc_PlaySample",operatorId:0x0c,classId:"KC_ANY",family:"audio"},
};

const RUNTIME_BINDINGS={
  weapon:{symbol:"KKriegerGame::FireShot",family:"weapon"},
  creatureAI:{symbol:"KKriegerGame::MonsterAI",family:"creature"},
};

const LIMITS={objects:512,materials:128,effects:128,weapons:16,portals:256,creatures:128,colliders:512,triggers:512,audio:128,totalOps:4096};

function assertArray(value,name,limit){
  if(value==null)return[];
  if(!Array.isArray(value))throw new TypeError(`${name} must be an array`);
  if(value.length>limit)throw new RangeError(`${name} exceeds ${limit}`);
  return value;
}

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  }
  return value;
}

function stableString(value){return JSON.stringify(canonical(value));}

function fnv1a(input){
  let hash=0x811c9dc5;
  for(let i=0;i<input.length;i++){
    hash^=input.charCodeAt(i);
    hash=Math.imul(hash,0x01000193);
  }
  return (hash>>>0).toString(16).padStart(8,"0");
}

function vec3(v,fallback=[0,0,0]){
  if(v==null)return[...fallback];
  if(!Array.isArray(v)||v.length!==3||v.some(x=>!Number.isFinite(Number(x))))
    throw new TypeError("vec3 must contain three finite numbers");
  return v.map(Number);
}

function normalizeMaterial(m,index){
  if(!m||typeof m!=="object")throw new TypeError("material must be an object");
  return{
    id:String(m.id??`material-${index}`),
    usage:Number(m.usage??0),
    program:Number(m.program??0),
    pass:Number(m.pass??0),
    texture:m.texture??null,
    blend:m.blend??"opaque",
  };
}

function normalizeObject(o,index){
  if(!o||typeof o!=="object")throw new TypeError("object must be an object");
  const primitive=String(o.primitive??"cube");
  if(!BASE_GEOMETRY[primitive])throw new Error(`unsupported Krieger base primitive: ${primitive}`);
  const modifiers=assertArray(o.modifiers,"object.modifiers",32).map((m,i)=>{
    if(!m||typeof m!=="object")throw new TypeError("modifier must be an object");
    const kind=String(m.kind??"");
    if(!MESH_MODIFIERS[kind])throw new Error(`unsupported Krieger mesh modifier: ${kind}`);
    return{id:String(m.id??`${kind}-${i}`),kind,params:canonical(m.params??{})};
  });
  return{
    id:String(o.id??`object-${index}`),
    primitive,modifiers,
    material:o.material==null?null:String(o.material),
    position:vec3(o.position),
    rotation:vec3(o.rotation),
    scale:vec3(o.scale,[1,1,1]),
    params:canonical(o.params??{}),
    sector:o.sector==null?null:String(o.sector),
  };
}

function normalizeRecipe(recipe){
  if(!recipe||typeof recipe!=="object")throw new TypeError("recipe must be an object");
  const materials=assertArray(recipe.materials,"materials",LIMITS.materials).map(normalizeMaterial);
  const objects=assertArray(recipe.objects,"objects",LIMITS.objects).map(normalizeObject);
  const effects=assertArray(recipe.effects,"effects",LIMITS.effects).map((x,i)=>({...canonical(x),id:String(x.id??`effect-${i}`)}));
  const weapons=assertArray(recipe.weapons,"weapons",LIMITS.weapons).map((x,i)=>({...canonical(x),id:String(x.id??`weapon-${i}`)}));
  const portals=assertArray(recipe.portals,"portals",LIMITS.portals).map((x,i)=>({...canonical(x),id:String(x.id??`portal-${i}`)}));
  const creatures=assertArray(recipe.creatures,"creatures",LIMITS.creatures).map((x,i)=>({...canonical(x),id:String(x.id??`creature-${i}`)}));
  const colliders=assertArray(recipe.colliders,"colliders",LIMITS.colliders).map((x,i)=>({...canonical(x),id:String(x.id??`collider-${i}`)}));
  const triggers=assertArray(recipe.triggers,"triggers",LIMITS.triggers).map((x,i)=>({...canonical(x),id:String(x.id??`trigger-${i}`)}));
  const audio=assertArray(recipe.audio,"audio",LIMITS.audio).map((x,i)=>({...canonical(x),id:String(x.id??`audio-${i}`)}));
  return{
    id:String(recipe.id??"world"),
    seed:String(recipe.seed??0),
    materials,objects,effects,weapons,portals,creatures,colliders,triggers,audio,
    player:canonical(recipe.player??null),
    metadata:canonical(recipe.metadata??{}),
  };
}

function makeNode(recipeHash,semanticId,kind,target,params){
  return{
    id:`kx-${fnv1a(`${recipeHash}|${semanticId}|${kind}`)}`,
    semanticId,
    kind,
    family:target.family,
    classId:target.classId,
    handler:target.handler,
    operatorId:target.operatorId,
    params:canonical(params??{}),
  };
}

function makeBinding(recipeHash,semanticId,kind,target,params){
  return{
    id:`bind-${fnv1a(`${recipeHash}|${semanticId}|${kind}`)}`,
    semanticId,kind,family:target.family,
    runtimeSymbol:target.symbol,
    params:canonical(params??{}),
  };
}

function compileMaterials(recipe,hash,nodes,index){
  for(const m of recipe.materials){
    const n=makeNode(hash,m.id,"material",FIXED.material,m);
    nodes.push(n);index.material.set(m.id,n.id);
  }
}

function compileObjects(recipe,hash,nodes,edges,index){
  for(const o of recipe.objects){
    let current=makeNode(hash,o.id,"geometry-base",BASE_GEOMETRY[o.primitive],{
      primitive:o.primitive,params:o.params,
    });
    nodes.push(current);
    const baseId=current.id;
    for(const modifier of o.modifiers){
      const next=makeNode(hash,`${o.id}:modifier:${modifier.id}`,"geometry-modifier",MESH_MODIFIERS[modifier.kind],{
        kind:modifier.kind,params:modifier.params,
      });
      nodes.push(next);
      edges.push({from:current.id,to:next.id,port:"mesh-input"});
      current=next;
    }
    const transform=makeNode(hash,`${o.id}:transform`,"scene-transform",FIXED.sceneTransform,{
      position:o.position,rotation:o.rotation,scale:o.scale,
    });
    const scene=makeNode(hash,`${o.id}:scene`,"scene",FIXED.scene,{sector:o.sector});
    nodes.push(transform,scene);
    edges.push({from:transform.id,to:scene.id,port:"input"});
    if(o.material){
      const mat=index.material.get(o.material);
      if(!mat)throw new Error(`unknown material ${o.material} for ${o.id}`);
      const matLink=makeNode(hash,`${o.id}:material`,"mesh-material-link",FIXED.meshMatLink,{material:o.material});
      nodes.push(matLink);
      edges.push({from:current.id,to:matLink.id,port:"mesh-input"});
      edges.push({from:mat,to:matLink.id,port:"material-link"});
      current=matLink;
      edges.push({from:current.id,to:transform.id,port:"input"});
    }else{
      edges.push({from:current.id,to:transform.id,port:"input"});
    }
    index.object.set(o.id,{geometry:baseId,finalMesh:current.id,transform:transform.id,scene:scene.id});
  }
}

function compileEffects(recipe,hash,nodes,edges,index){
  for(const e of recipe.effects){
    const effectKind=String(e.kind??"");
    if(effectKind!=="partSystem"&&effectKind!=="partEmitter")
      throw new Error(`unsupported Krieger effect kind: ${effectKind}`);
    const target=effectKind==="partSystem"?FIXED.partSystem:FIXED.partEmitter;
    const n=makeNode(hash,e.id,"effect",target,e);
    nodes.push(n);index.effect.set(e.id,n.id);
    if(e.attachTo){
      const obj=index.object.get(String(e.attachTo));
      if(!obj)throw new Error(`unknown effect attachment ${e.attachTo}`);
      edges.push({from:n.id,to:obj.scene,port:"effect"});
    }
  }
}

function compilePortals(recipe,hash,nodes,edges,index){
  for(const p of recipe.portals){
    if(!p.from||!p.to)throw new Error(`portal ${p.id} requires both from and to endpoints`);
    if(String(p.from)===String(p.to))throw new Error(`portal ${p.id} endpoints must differ`);
    const n=makeNode(hash,p.id,"portal",FIXED.portal,p);
    nodes.push(n);index.portal.set(p.id,n.id);
    for(const endpoint of [p.from,p.to]){
      const obj=index.object.get(String(endpoint));
      if(!obj)throw new Error(`unknown portal endpoint ${endpoint}`);
      edges.push({from:n.id,to:obj.scene,port:"portal"});
    }
  }
}

function compileWeapons(recipe,hash,nodes,index){
  for(const w of recipe.weapons){
    const n=makeBinding(hash,w.id,"weapon-runtime-binding",RUNTIME_BINDINGS.weapon,{
      slot:Number(w.slot??0),damage:Number(w.damage??1),
      cadence:Number(w.cadence??1),effect:w.effect??null,
    });
    nodes.push(n);index.weapon.set(w.id,n.id);
  }
}

function compileCreatures(recipe,hash,nodes,edges,index){
  for(const c of recipe.creatures){
    const actor=makeNode(hash,c.id,"creature",FIXED.creature,c);
    const ai=makeBinding(hash,`${c.id}:ai`,"creature-ai-runtime-binding",RUNTIME_BINDINGS.creatureAI,{
      behavior:c.behavior??"default",weapon:c.weapon??null,
    });
    nodes.push(actor,ai);edges.push({from:ai.id,to:actor.id,port:"ai"});
    if(c.attachTo){
      const obj=index.object.get(String(c.attachTo));
      if(!obj)throw new Error(`unknown creature attachment ${c.attachTo}`);
      edges.push({from:actor.id,to:obj.scene,port:"scene"});
    }
    index.creature.set(c.id,actor.id);
  }
}

function compileColliders(recipe,hash,nodes,edges,index){
  for(const c of recipe.colliders){
    const n=makeNode(hash,c.id,"collider",FIXED.collider,c);
    nodes.push(n);index.collider.set(c.id,n.id);
    if(c.attachTo){
      const obj=index.object.get(String(c.attachTo));
      if(!obj)throw new Error(`unknown collider attachment ${c.attachTo}`);
      edges.push({from:n.id,to:obj.scene,port:"collision"});
    }
  }
}

function compileTriggers(recipe,hash,nodes,edges,index){
  for(const t of recipe.triggers){
    const n=makeNode(hash,t.id,"logic-trigger",FIXED.trigger,t);
    nodes.push(n);index.trigger.set(t.id,n.id);
    if(t.target){
      const target=index.object.get(String(t.target))?.scene||index.creature.get(String(t.target));
      if(!target)throw new Error(`unknown trigger target ${t.target}`);
      edges.push({from:n.id,to:target,port:"logic"});
    }
  }
}

function compileAudio(recipe,hash,nodes,index){
  for(const a of recipe.audio){
    const n=makeNode(hash,a.id,"audio",FIXED.audio,a);
    nodes.push(n);index.audio.set(a.id,n.id);
  }
}

function coverage(nodes,recipe){
  const families=new Set(nodes.map(x=>x.family));
  const requested=[];
  if(recipe.objects.length)requested.push("geometry","scene");
  if(recipe.materials.length||recipe.objects.some(x=>x.material))requested.push("material");
  if(recipe.effects.length)requested.push("effects");
  if(recipe.weapons.length)requested.push("weapon");
  if(recipe.creatures.length)requested.push("creature");
  if(recipe.colliders.length)requested.push("collision");
  if(recipe.triggers.length)requested.push("logic");
  if(recipe.audio.length)requested.push("audio");
  const requestedFamilies=[...new Set(requested)];
  const realizedFamilies=requestedFamilies.filter(x=>families.has(x));
  const nativeNodes=nodes.filter(x=>Number.isInteger(x.operatorId)&&x.handler);
  const runtimeBindings=nodes.filter(x=>x.runtimeSymbol);
  return{
    requestedFamilies,
    realizedFamilies,
    requestedRatio:requestedFamilies.length?realizedFamilies.length/requestedFamilies.length:1,
    nativeOperatorRatio:nodes.length?nativeNodes.length/nodes.length:0,
    runtimeBindingRatio:nodes.length?runtimeBindings.length/nodes.length:0,
    evidenceAnchoredRatio:nodes.length?(nativeNodes.length+runtimeBindings.length)/nodes.length:0,
  };
}

export function validateNativeAuthoringPlan(plan){
  const errors=[];
  try{assertPinnedUpstream();}catch(error){errors.push(error.message);}
  if(plan?.schema!=="world-server.krieger-native-authoring/v1")errors.push("bad schema");
  if(plan?.upstream?.commit!==UPSTREAM.commit)errors.push("wrong upstream pin");
  if(!Array.isArray(plan?.nodes)||!plan.nodes.length)errors.push("no operator nodes");
  if(plan?.nodes?.length>LIMITS.totalOps)errors.push("operator budget exceeded");
  const ids=new Set();
  for(const n of plan?.nodes??[]){
    if(ids.has(n.id))errors.push(`duplicate node ${n.id}`);
    ids.add(n.id);
    const native=Number.isInteger(n.operatorId)&&n.handler&&n.classId;
    const runtime=Boolean(n.runtimeSymbol);
    if(!native&&!runtime)errors.push(`unanchored node ${n.id}`);
  }
  for(const e of plan?.edges??[]){
    if(!ids.has(e.from)||!ids.has(e.to))errors.push(`dangling edge ${e.from}->${e.to}`);
  }
  return{pass:errors.length===0,errors};
}

export function compileKriegerNativeAuthoring(recipeInput){
  assertPinnedUpstream();
  const recipe=normalizeRecipe(recipeInput);
  const recipeHash=fnv1a(stableString(recipe));
  const nodes=[],edges=[];
  const index={material:new Map(),object:new Map(),effect:new Map(),portal:new Map(),weapon:new Map(),creature:new Map(),collider:new Map(),trigger:new Map(),audio:new Map()};
  compileMaterials(recipe,recipeHash,nodes,index);
  compileObjects(recipe,recipeHash,nodes,edges,index);
  compileEffects(recipe,recipeHash,nodes,edges,index);
  compilePortals(recipe,recipeHash,nodes,edges,index);
  compileWeapons(recipe,recipeHash,nodes,index);
  compileCreatures(recipe,recipeHash,nodes,edges,index);
  compileColliders(recipe,recipeHash,nodes,edges,index);
  compileTriggers(recipe,recipeHash,nodes,edges,index);
  compileAudio(recipe,recipeHash,nodes,index);
  if(nodes.length>LIMITS.totalOps)throw new RangeError("operator budget exceeded");
  const plan={
    schema:"world-server.krieger-native-authoring/v1",
    compilerVersion:KRIEGER_NATIVE_AUTHORING_VERSION,
    upstream:UPSTREAM,
    recipeHash,
    recipe,
    nodes,
    edges,
    applyOrder:nodes.map(x=>x.id),
    coverage:coverage(nodes,recipe),
    boundary:{
      emitsNativeKxBinary:false,
      emitsSourceAnchoredOperatorPlan:true,
      embedsKnownKkriegerOperatorIds:true,
      requiresPinnedClassConventionResolver:true,
    },
  };
  const verdict=validateNativeAuthoringPlan(plan);
  if(!verdict.pass)throw new Error(verdict.errors.join("; "));
  return plan;
}

export function roundTripRecipe(plan){
  const verdict=validateNativeAuthoringPlan(plan);
  if(!verdict.pass)throw new Error(verdict.errors.join("; "));
  return canonical(plan.recipe);
}

export function applyAuthoringPlan(baseGraph,plan){
  const verdict=validateNativeAuthoringPlan(plan);
  if(!verdict.pass)throw new Error(verdict.errors.join("; "));
  const base=baseGraph&&typeof baseGraph==="object"?baseGraph:{};
  const nodes=[...(base.nodes??[])],edges=[...(base.edges??[])];
  const known=new Set(nodes.map(x=>x.id));
  for(const n of plan.nodes)if(!known.has(n.id)){nodes.push(n);known.add(n.id);}
  const edgeKeys=new Set(edges.map(e=>`${e.from}|${e.to}|${e.port}`));
  for(const e of plan.edges){
    const key=`${e.from}|${e.to}|${e.port}`;
    if(!edgeKeys.has(key)){edges.push(e);edgeKeys.add(key);}
  }
  return{...base,nodes,edges,kriegerAuthoring:{recipeHash:plan.recipeHash,upstream:plan.upstream}};
}
