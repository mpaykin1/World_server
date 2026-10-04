'use strict';

const LANES=[
  {id:'voxel-3d',available:true,dimensions:['3d'],styles:['voxel','gothic-voxel'],systems:['services/ai3d-worker/ai3d/plugins/voxel_city.py','lib/world-quality-voxel-enhancer.js','lib/world-quality-pbr-synthesizer.js']},
  {id:'mesh-3d',available:true,dimensions:['3d'],styles:['mesh-3d','realistic-3d','stylized-3d'],systems:['api/ai3d.js','shared/ai3d-playable-runtime.js']},
  {id:'sprite-2d',available:true,dimensions:['2d'],styles:['pixel-art','sprite','illustrative-2d'],systems:['services/ai3d-worker/ai3d/plugins/reference_sprite.py','scripts/world-sprite-cpu.js']},
  {id:'light-contour-3d',available:true,auxiliary:true,dimensions:['3d'],styles:['luminous-outline'],systems:['shared/light/index.mjs']},
  {id:'silhouette-3d',available:true,auxiliary:true,dimensions:['3d'],styles:['luminous-outline','silhouette'],systems:['shared/silhouette-3d/index.mjs']},
  {id:'watercolor-3d',available:true,dimensions:['3d'],styles:['watercolor'],systems:['shared/graphics/living-watercolor-3d.mjs','shared/graphics/living-watercolor-generators.mjs','shared/graphics/living-watercolor-reference-gate.mjs']}
];

const list=v=>Array.isArray(v)?v.filter(Boolean):(v===undefined||v===null||v===''?[]:[v]);
const lower=v=>list(v).map(x=>String(x).trim().toLowerCase()).filter(Boolean);
const unique=(v,n=24)=>[...new Set(v.filter(Boolean))].slice(0,n);
function mode(values){const c=new Map();for(const v of values.filter(Boolean))c.set(v,(c.get(v)||0)+1);const ranked=[...c].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])));if(!ranked.length)return null;if(ranked[1]&&ranked[1][1]===ranked[0][1])return null;return ranked[0][0];}
function average(values){const n=values.map(Number).filter(Number.isFinite);return n.length?Number((n.reduce((a,b)=>a+b,0)/n.length).toFixed(4)):null;}

function analyzeVideoFrames(frames=[]){
  const v=frames.filter(x=>x&&typeof x==='object'),s=[],t=[],o=[],p=[],d=[],c=[],m=[],co=[],f=[],e=[],ma=[];
  for(const x of v){s.push(...lower(x.style||x.styles));t.push(...lower(x.tags));o.push(...lower(x.objects||x.objectKinds));p.push(...list(x.palette));
    d.push(String(x.dimension||'').toLowerCase());c.push(String(x.camera?.mode||x.cameraMode||'').toLowerCase());m.push(...lower(x.motion?.types||x.motionTypes));
    co.push(x.lighting?.contrast);f.push(x.lighting?.fog);e.push(x.lighting?.emissive);ma.push(x.motion?.amount);}
  const dominantStyle=mode(s),share=dominantStyle&&s.length?s.filter(x=>x===dominantStyle).length/s.length:0;
  return{frameCount:v.length,styles:unique(s),dominantStyle,styleStability:Number(share.toFixed(4)),tags:unique(t),objects:unique(o),palette:unique(p,32),
    dimension:mode(d),cameraMode:mode(c),motionTypes:unique(m),lighting:{contrast:average(co),fog:average(f),emissive:average(e)},motionAmount:average(ma)};
}

function evidence(reference={}){
  const x=analyzeVideoFrames(reference.frames||[]);
  return{sourceType:String(reference.sourceType||(x.frameCount>1?'video':'image')).toLowerCase(),frameCount:x.frameCount||Number(reference.frameCount)||1,
    styles:unique([...lower(reference.style||reference.styles),...x.styles]),tags:unique([...lower(reference.tags),...x.tags]),
    objects:unique([...lower(reference.objects||reference.objectKinds),...x.objects]),palette:unique([...list(reference.palette),...x.palette],32),
    dimension:String(reference.dimension||x.dimension||'').toLowerCase()||null,cameraMode:String(reference.camera?.mode||reference.cameraMode||x.cameraMode||'').toLowerCase()||null,
    lighting:{...x.lighting,...(reference.lighting||{})},motionTypes:unique([...lower(reference.motion?.types||reference.motionTypes),...x.motionTypes]),
    motionAmount:(()=>{const amount=Number(reference.motion?.amount);return Number.isFinite(amount)?amount:x.motionAmount;})(),temporal:x};
}
function has(e,words){const h=[...e.styles,...e.tags,...e.objects].join(' ');return words.some(w=>h.includes(w));}
function buildVisualGrammar(reference={}){
  const e=evidence(reference),dimension=e.dimension==='2d'||e.dimension==='3d'?e.dimension:(has(e,['pixel','sprite','2d'])?'2d':'3d');
  const style=has(e,['watercolor','аквар'])?'watercolor':has(e,['living light','luminous','neon'])?'luminous-outline':
    has(e,['gothic','гот'])&&has(e,['voxel','вокс'])?'gothic-voxel':has(e,['voxel','вокс'])?'voxel':
    has(e,['pixel','пиксел'])?'pixel-art':has(e,['sprite','спрайт'])?'sprite':dimension==='2d'?'illustrative-2d':'mesh-3d';
  const dark=has(e,['dark','night','gothic','тём','ноч']),warm=has(e,['warm','amber','gold','тёп','золот']),wet=has(e,['wet','rain','мокр']);
  const materials=style==='pixel-art'?[{class:'pixel-palette',shadingBands:3}]:[{class:has(e,['stone','gothic','cathedral','кам'])?'stone':'generic',wet,roughness:wet?0.38:0.82}];
  const cameraMode=e.cameraMode||(has(e,['isometric','изометр'])?'isometric':dimension==='2d'?'orthographic':'perspective');
  return{schemaVersion:'1.0.0',source:{type:e.sourceType,frameCount:e.frameCount},dimension,style,tags:e.tags,objects:e.objects,palette:e.palette,materials,
    lighting:{contrast:e.lighting.contrast!==null&&e.lighting.contrast!==undefined&&Number.isFinite(Number(e.lighting.contrast))?Number(e.lighting.contrast):(dark?0.88:0.55),ambientLevel:dark?0.18:0.52,
      fog:has(e,['fog','mist','дым','туман'])||Number(e.lighting.fog)>0.25,emissive:warm||Number(e.lighting.emissive)>0.25,temperature:warm?'warm-local-over-cool-ambient':'reference-derived'},
    camera:{mode:cameraMode,fov:cameraMode==='perspective'?58:null},detail:{silhouette:'highest',largeMasses:'highest',microdetail:has(e,['detailed','ornate','dense','детал','гот'])?'high':'medium'},
    motion:{types:e.motionTypes,amount:e.motionAmount??0,temporalReference:e.frameCount>1},temporal:e.temporal};
}

function routeVisualGrammar(g={}){
  const dimension=g.dimension==='2d'?'2d':'3d',style=String(g.style||'mesh-3d'),lighting=g.lighting||{};
  const score=l=>!l.dimensions.includes(dimension)?-100:(l.styles.includes(style)?5:(dimension==='2d'&&l.id==='sprite-2d'?3:dimension==='3d'&&l.id==='mesh-3d'?1:0))+(l.available?2:-6)-(l.auxiliary?1:0);
  const ranked=LANES.map(l=>({...l,score:score(l)})).filter(l=>l.score>-100).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const primary=ranked.find(l=>l.available&&!l.auxiliary)||ranked.find(l=>l.available)||null,aux=[];
  if(style==='luminous-outline')aux.push(...LANES.filter(l=>['light-contour-3d','silhouette-3d'].includes(l.id)));
  else if(lighting.emissive&&dimension==='3d')aux.push(LANES.find(l=>l.id==='light-contour-3d'));
  const auxiliary=unique(aux.map(x=>x?.id)).map(id=>LANES.find(l=>l.id===id)),exact=LANES.find(l=>l.styles.includes(style));
  const compositeSupports=Boolean(exact?.available)||(auxiliary.some(l=>l?.styles?.includes(style)));
  const degraded=Boolean(primary)&&!compositeSupports,blockers=exact&&!exact.available?(exact.limitations||[]):[];
  return{primary,auxiliary,ranked:ranked.map(({id,available,score})=>({id,available,score})),requestedStyle:style,effectiveStyle:degraded?(primary?.styles?.[0]||null):style,degraded,blockers};
}

function compileReferenceVisual(reference={}){
  const grammar=buildVisualGrammar(reference),route=routeVisualGrammar(grammar),lane=route.primary?.id;
  const geometry=lane==='voxel-3d'?{representation:'voxel-occupancy',walkable:true}:lane==='sprite-2d'?{representation:'sprite-regions',walkable:false}:{representation:'multi-object-scene',walkable:grammar.dimension==='3d'};
  const materials=grammar.materials.map((m,i)=>({id:'material-'+(i+1),...m,targetNormalStrength:m.class==='stone'?0.62:0.45,targetAoStrength:m.class==='pixel-palette'?0:0.72}));
  return{schemaVersion:'1.0.0',status:!route.primary?'BLOCKED':route.degraded?'DEGRADED':'PLANNED',grammar,route,plans:{geometry,materials,
    lighting:{...grammar.lighting,volumetricFog:grammar.lighting.fog,useLightSystem:grammar.style==='luminous-outline'},camera:grammar.camera,detail:grammar.detail,motion:grammar.motion,
    verification:{targetFidelity:0.85,dimensions:['silhouette','composition','palette','lighting','material-readability','semantic-detail','camera'],temporal:grammar.motion.temporalReference},autotune:{enabled:true,maxIterations:5,targetFidelity:0.85}},
    executableSystems:[...(route.primary?.systems||[]),...route.auxiliary.flatMap(l=>l.systems||[])],blockers:route.blockers};
}
function planVisualCorrections(t,o={}){
  const f=[];if(o.style&&o.style!==t.style)f.push({priority:100,axis:'style'});if(o.silhouetteFidelity!==undefined&&o.silhouetteFidelity<0.85)f.push({priority:95,axis:'silhouette'});
  if(Number.isFinite(o.contrast)&&Math.abs(o.contrast-t.lighting.contrast)>0.12)f.push({priority:90,axis:'lighting'});if(o.cameraMode&&o.cameraMode!==t.camera.mode)f.push({priority:85,axis:'camera'});
  if(o.materialReadability!==undefined&&o.materialReadability<0.85)f.push({priority:70,axis:'materials'});return f.sort((a,b)=>b.priority-a.priority);
}
module.exports={analyzeVideoFrames,buildVisualGrammar,routeVisualGrammar,compileReferenceVisual,planVisualCorrections};
