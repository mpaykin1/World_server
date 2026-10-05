const UPSTREAM={
  repository:"MasonDye/kkrieger-wasm",
  commit:"3bf0ff017372e640e966c2785a4d95a998cec242",
};

export const KRIEGER_NATIVE_AUTHORING_VERSION=1;

const GEOMETRY={
  cube:{symbol:"GenSimpleMesh::Cube",classId:"KC_MESH",family:"geometry"},
  ring:{symbol:"GenMesh::Ring",classId:"KC_MESH",family:"geometry"},
  extrude:{symbol:"GenMesh::Extrude",classId:"KC_MESH",family:"geometry"},
  subdivide:{symbol:"GenMesh::Subdivide",classId:"KC_MESH",family:"geometry"},
  bevel:{symbol:"GenMesh::Bevel",classId:"KC_MESH",family:"geometry"},
  displace:{symbol:"GenMesh::Displace",classId:"KC_MESH",family:"geometry"},
};

const FIXED={
  material:{symbol:"GenMaterial::AddPass",classId:"KC_MATERIAL",family:"material"},
  scene:{symbol:"ExecSceneInput",classId:"KC_SCENE",family:"scene"},
  particles:{symbol:"Init_Effect_Particles",classId:"KC_EFFECT",family:"effects"},
  partSystem:{symbol:"Init_Effect_PartSystem",classId:"KC_EFFECT",family:"effects"},
  portal:{symbol:"Engine_::AddPortalJob",classId:"KC_SCENE",family:"scene"},
  sector:{symbol:"Engine_::AddSectorJob",classId:"KC_SCENE",family:"scene"},
  collider:{symbol:"KKriegerCell",classId:"KC_KKRIEGER",family:"collision"},
  weapon:{symbol:"KKriegerGame::FireShot",classId:"KC_KKRIEGER",family:"weapon"},
};

const LIMITS={objects:512,materials:128,effects:128,weapons:16,portals:256,totalOps:4096};

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
  if(!GEOMETRY[primitive])throw new Error(`unsupported Krieger geometry primitive: ${primitive}`);
  return{
    id:String(o.id??`object-${index}`),
    primitive,
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
  return{
    id:String(recipe.id??"world"),
    seed:String(recipe.seed??0),
    materials,objects,effects,weapons,portals,
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
    sourceSymbol:target.symbol,
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
    const g=makeNode(hash,o.id,"geometry",GEOMETRY[o.primitive],{
      primitive:o.primitive,params:o.params,
    });
    const s=makeNode(hash,`${o.id}:scene`,"scene",FIXED.scene,{
      position:o.position,rotation:o.rotation,scale:o.scale,sector:o.sector,
    });
    nodes.push(g,s);
    edges.push({from:g.id,to:s.id,port:"input"});
    if(o.material){
      const mat=index.material.get(o.material);
      if(!mat)throw new Error(`unknown material ${o.material} for ${o.id}`);
      edges.push({from:mat,to:g.id,port:"material"});
    }
    index.object.set(o.id,{geometry:g.id,scene:s.id});
  }
}

function compileEffects(recipe,hash,nodes,edges,index){
  for(const e of recipe.effects){
    const target=e.kind==="partSystem"?FIXED.partSystem:FIXED.particles;
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
    const n=makeNode(hash,p.id,"portal",FIXED.portal,p);
    nodes.push(n);index.portal.set(p.id,n.id);
    for(const endpoint of [p.from,p.to].filter(Boolean)){
      const obj=index.object.get(String(endpoint));
      if(!obj)throw new Error(`unknown portal endpoint ${endpoint}`);
      edges.push({from:n.id,to:obj.scene,port:"portal"});
    }
  }
}

function compileWeapons(recipe,hash,nodes,index){
  for(const w of recipe.weapons){
    const n=makeNode(hash,w.id,"weapon-binding",FIXED.weapon,{
      slot:Number(w.slot??0),damage:Number(w.damage??1),
      cadence:Number(w.cadence??1),effect:w.effect??null,
    });
    nodes.push(n);index.weapon.set(w.id,n.id);
  }
}

function coverage(nodes){
  const families=new Set(nodes.map(x=>x.family));
  const required=["geometry","material","scene"];
  const direct=required.filter(x=>families.has(x));
  const optional=["effects","weapon"].filter(x=>families.has(x));
  return{
    required,
    direct,
    optional,
    requiredRatio:direct.length/required.length,
    sourceAnchoredRatio:nodes.length?nodes.filter(x=>x.sourceSymbol).length/nodes.length:0,
  };
}

export function validateNativeAuthoringPlan(plan){
  const errors=[];
  if(plan?.schema!=="world-server.krieger-native-authoring/v1")errors.push("bad schema");
  if(plan?.upstream?.commit!==UPSTREAM.commit)errors.push("wrong upstream pin");
  if(!Array.isArray(plan?.nodes)||!plan.nodes.length)errors.push("no operator nodes");
  if(plan?.nodes?.length>LIMITS.totalOps)errors.push("operator budget exceeded");
  const ids=new Set();
  for(const n of plan?.nodes??[]){
    if(ids.has(n.id))errors.push(`duplicate node ${n.id}`);
    ids.add(n.id);
    if(!n.sourceSymbol||!n.classId)errors.push(`unanchored node ${n.id}`);
  }
  for(const e of plan?.edges??[]){
    if(!ids.has(e.from)||!ids.has(e.to))errors.push(`dangling edge ${e.from}->${e.to}`);
  }
  return{pass:errors.length===0,errors};
}

export function compileKriegerNativeAuthoring(recipeInput){
  const recipe=normalizeRecipe(recipeInput);
  const recipeHash=fnv1a(stableString(recipe));
  const nodes=[],edges=[];
  const index={material:new Map(),object:new Map(),effect:new Map(),portal:new Map(),weapon:new Map()};
  compileMaterials(recipe,recipeHash,nodes,index);
  compileObjects(recipe,recipeHash,nodes,edges,index);
  compileEffects(recipe,recipeHash,nodes,edges,index);
  compilePortals(recipe,recipeHash,nodes,edges,index);
  compileWeapons(recipe,recipeHash,nodes,index);
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
    coverage:coverage(nodes),
    boundary:{
      emitsNativeKxBinary:false,
      emitsSourceAnchoredOperatorPlan:true,
      requiresPinnedOperatorResolver:true,
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
