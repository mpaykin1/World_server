// Universal Voxel Microdetail Runtime v2 — shared browser implementation.
// One policy source: /shared/microdetail-policy.json. No mandatory third-party dependency.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const mix=(a,b,t)=>a+(b-a)*t;

function hash32i(x,y,z,seed=0){
  let h=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,2147483647)^(seed|0))|0;
  h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return h>>>0;
}
function hash01(x,y,z,seed=0){return hash32i(x,y,z,seed)/4294967295;}
function hexRgb(hex){const n=parseInt(String(hex).replace('#',''),16)||0;return[(n>>16)&255,(n>>8)&255,n&255];}
function tierIndex(policy,name){return policy.tierOrder.indexOf(name);}
function profileFor(policy,name){return policy.profiles[name]||policy.profiles.default;}
function tierFor(policy,name){return policy.tiers[name]||policy.tiers.BALANCED;}

function inferSemanticFromName(name=''){
  const s=String(name).toLowerCase();
  if(/face|head|muzzle|snout|nose|lip|cheek|jaw/.test(s))return'face';
  if(/scale|dragon|rept|lizard|snake/.test(s))return'scales';
  if(/armor|plate|helmet|shield/.test(s))return'armor';
  if(/weapon|sword|axe|gun|rifle|blade|knife|bow/.test(s))return'weapon';
  if(/skin|body|hand|foot|paw/.test(s))return'skin';
  if(/fur|hair|wool/.test(s))return'fur';
  if(/bone|horn|tooth|claw/.test(s))return'bone';
  if(/cloth|fabric|shirt|pants|coat|robe/.test(s))return'fabric';
  if(/wood|tree|plank/.test(s))return'wood';
  if(/metal|iron|steel/.test(s))return'metal';
  if(/stone|rock/.test(s))return'stone';
  if(/brick|masonry/.test(s))return'brick';
  return'default';
}
function colorSemantic(policy,rgb){
  const r=clamp(rgb?.[0],0,255),g=clamp(rgb?.[1],0,255),b=clamp(rgb?.[2],0,255);
  if(r>175&&g>105&&g<210&&b>70&&b<185&&r>g&&g>b)return'skin';
  let best='default',bestD=Infinity;
  for(const entry of policy.knownColors||[]){
    const [er,eg,eb]=hexRgb(entry.hex),d=(r-er)**2+(g-eg)**2+(b-eb)**2;
    if(d<bestD){bestD=d;best=entry.semantic;}
  }
  return bestD<65*65?best:'default';
}
function materialRgb(material){
  const c=material?.color;
  return c?[c.r*255,c.g*255,c.b*255]:null;
}
function inferSemanticFromObject(policy,obj){
  const explicit=obj?.userData?.microdetailSemantic;
  if(explicit&&policy.profiles[explicit])return explicit;
  const byName=inferSemanticFromName(`${obj?.name||''} ${obj?.parent?.name||''}`);
  if(byName!=='default')return byName;
  const mat=Array.isArray(obj?.material)?obj.material[0]:obj?.material;
  if(Number(mat?.metalness)>.45)return'metal';
  const rgb=materialRgb(mat),byColor=colorSemantic(policy,rgb);
  if(byColor==='skin'&&obj?.geometry){
    obj.geometry.computeBoundingBox?.();const b=obj.geometry.boundingBox;
    if(b){const sx=b.max.x-b.min.x,sy=b.max.y-b.min.y,sz=b.max.z-b.min.z;
      if(Math.max(sx,sy,sz)<.8)return'face';}
  }
  return byColor;
}

function isQuadSurfaceGeometry(geometry){
  const pos=geometry?.getAttribute?.('position'),col=geometry?.getAttribute?.('color'),idx=geometry?.index;
  if(!pos||!col||!idx||pos.itemSize!==3||col.itemSize<3||pos.count<16||pos.count%4!==0)return false;
  if(idx.count!==(pos.count/4)*6)return false;
  const checks=Math.min(12,pos.count/4);
  for(let q=0;q<checks;q++){
    const a=q*4,o=q*6,w=[a,a+1,a+2,a,a+2,a+3];
    for(let i=0;i<6;i++)if(idx.getX(o+i)!==w[i])return false;
  }
  return true;
}
function pushQuad(out,a,b,c,d,rgb,shade=1){
  const base=out.pos.length/3;
  for(const p of [a,b,c,d]){
    out.pos.push(p[0],p[1],p[2]);
    out.col.push(clamp(rgb[0]*shade,0,1),clamp(rgb[1]*shade,0,1),clamp(rgb[2]*shade,0,1));
  }
  out.idx.push(base,base+1,base+2,base,base+2,base+3);
}
function vecSub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function vecCross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function vecNorm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];}
function pointOnFace(p0,u,v,n,fu,fv,h){return[
  p0[0]+u[0]*fu+v[0]*fv+n[0]*h,
  p0[1]+u[1]*fu+v[1]*fv+n[1]*h,
  p0[2]+u[2]*fu+v[2]*fv+n[2]*h
];}
function emitSteppedFace(out,quad,rgb,profile,tier,seed){
  const [p0,p1,,p3]=quad,u=vecSub(p1,p0),v=vecSub(p3,p0),n=vecNorm(vecCross(u,v));
  const g=Math.max(3,Math.min(profile.grid,tier.gridCap)),step=1/g;
  const heights=new Float32Array(g*g),at=(i,j)=>heights[j*g+i];
  for(let j=0;j<g;j++)for(let i=0;i<g;i++){
    const border=i===0||j===0||i===g-1||j===g-1;
    if(border)continue;
    const keep=hash01(i,j,seed,seed^0x51f15e);
    if(keep>profile.density)continue;
    const sign=hash01(i+19,j+23,seed,seed^0x9e3779b9)>.48?1:-1;
    const mag=mix(.35,1,hash01(i+43,j+47,seed,seed^0x7f4a7c15));
    heights[j*g+i]=sign*profile.amplitude*mag;
  }
  for(let j=0;j<g;j++)for(let i=0;i<g;i++){
    const h=at(i,j),a=pointOnFace(p0,u,v,n,i*step,j*step,h);
    const b=pointOnFace(p0,u,v,n,(i+1)*step,j*step,h);
    const c=pointOnFace(p0,u,v,n,(i+1)*step,(j+1)*step,h);
    const d=pointOnFace(p0,u,v,n,i*step,(j+1)*step,h);
    pushQuad(out,a,b,c,d,rgb,h>0?1.035:h<0?.91:1);
    const edges=[
      [-1,0,[i,j],[i,j+1]],
      [1,0,[i+1,j+1],[i+1,j]],
      [0,-1,[i+1,j],[i,j]],
      [0,1,[i,j+1],[i+1,j+1]]
    ];
    for(const [di,dj,e0,e1] of edges){
      const ni=i+di,nj=j+dj,nh=(ni<0||nj<0||ni>=g||nj>=g)?0:at(ni,nj);
      if(h<=nh+1e-6)continue;
      const s0=pointOnFace(p0,u,v,n,e0[0]*step,e0[1]*step,h);
      const s1=pointOnFace(p0,u,v,n,e1[0]*step,e1[1]*step,h);
      const s2=pointOnFace(p0,u,v,n,e1[0]*step,e1[1]*step,nh);
      const s3=pointOnFace(p0,u,v,n,e0[0]*step,e0[1]*step,nh);
      pushQuad(out,s0,s1,s2,s3,rgb,.78);
    }
  }
}

function createDetailedGeometry(THREE,policy,baseGeometry,{tierName='BALANCED',worldOffset={x:0,y:0,z:0},seed=0}={}){
  if(!isQuadSurfaceGeometry(baseGeometry))return null;
  const pos=baseGeometry.getAttribute('position'),col=baseGeometry.getAttribute('color');
  const tier=tierFor(policy,tierName),out={pos:[],col:[],idx:[]};
  const faceCount=pos.count/4;let detailedFaces=0,baseFaces=0;
  for(let q=0;q<faceCount;q++){
    const a=q*4,quad=[];
    for(let k=0;k<4;k++)quad.push([pos.getX(a+k),pos.getY(a+k),pos.getZ(a+k)]);
    const rgb=[col.getX(a),col.getY(a),col.getZ(a)];
    const semantic=colorSemantic(policy,rgb.map(v=>v*255)),profile=profileFor(policy,semantic);
    const center=[
      (quad[0][0]+quad[2][0])*.5+worldOffset.x,
      (quad[0][1]+quad[2][1])*.5+worldOffset.y,
      (quad[0][2]+quad[2][2])*.5+worldOffset.z
    ];
    const faceSeed=hash32i(Math.floor(center[0]*17),Math.floor(center[1]*19),Math.floor(center[2]*23),seed^q);
    const chance=profile.density*tier.faceProbability*clamp(.62+profile.priority*.46,0,1.15);
    const useDetail=profile.amplitude>0&&detailedFaces<tier.maxDetailedFacesPerMesh&&hash01(q,faceSeed,seed,faceSeed)<chance;
    if(useDetail){
      emitSteppedFace(out,quad,rgb,profile,tier,faceSeed);detailedFaces++;
    }else{
      pushQuad(out,quad[0],quad[1],quad[2],quad[3],rgb,1);baseFaces++;
    }
  }
  if(!detailedFaces)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(out.pos,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(out.col,3));
  g.setIndex(out.idx);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  g.userData.microdetail={schemaVersion:policy.schemaVersion,tier:tierName,detailedFaces,baseFaces,triangles:out.idx.length/3};
  return g;
}

export function createUniversalVoxelMicrodetail({THREE,policy,initialTier='BALANCED',worldSeed=73194217}={}){
  if(!THREE||!policy?.profiles||!policy?.tiers)throw new Error('UniversalVoxelMicrodetail: THREE + policy required');
  let ceilingTier=policy.tiers[initialTier]?initialTier:'BALANCED';
  let activeTier=ceilingTier,exactMode=false,emaFps=tierFor(policy,activeTier).targetFps;
  let lastNow=0,lowSince=0,highSince=0;
  const shaderStates=new Set();
  const counters={geometryBuilds:0,detailedFaces:0,shaderMaterials:0};
  function effectiveShaderScale(){return exactMode?0:tierFor(policy,activeTier).shaderScale;}
  function updateShaderStates(){
    const scale=effectiveShaderScale();
    for(const s of shaderStates)if(s.uniforms){
      s.uniforms.uMicroStrength.value=s.baseStrength*scale;
      s.uniforms.uMicroRoughJitter.value=s.baseJitter*scale;
    }
  }
  function setCeiling(next){
    if(!policy.tiers[next])return activeTier;
    ceilingTier=next;
    if(tierIndex(policy,activeTier)>tierIndex(policy,ceilingTier))activeTier=ceilingTier;
    updateShaderStates();return activeTier;
  }
  function setPresentationMode(exact){exactMode=Boolean(exact);updateShaderStates();}
  function setTier(next){
    if(!policy.tiers[next])return activeTier;
    const ni=tierIndex(policy,next),ci=tierIndex(policy,ceilingTier);
    activeTier=ni>ci?ceilingTier:next;updateShaderStates();return activeTier;
  }
  function tick(now=performance.now()){
    if(lastNow){
      const dt=clamp((now-lastNow)/1000,.001,.2),fps=1/dt;
      emaFps=emaFps*.94+fps*.06;
      const t=tierFor(policy,activeTier),downMs=policy.guards.localEmergencyDownshiftMs,upMs=policy.guards.localRecoveryUpshiftMs;
      if(emaFps<t.targetFps-7){
        highSince=0;if(!lowSince)lowSince=now;
        if(now-lowSince>downMs){const i=tierIndex(policy,activeTier);if(i>0)setTier(policy.tierOrder[i-1]);lowSince=now;}
      }else if(emaFps>t.targetFps+9&&tierIndex(policy,activeTier)<tierIndex(policy,ceilingTier)){
        lowSince=0;if(!highSince)highSince=now;
        if(now-highSince>upMs){setTier(policy.tierOrder[tierIndex(policy,activeTier)+1]);highSince=now;}
      }else{lowSince=0;highSince=0;}
    }
    lastNow=now;return emaFps;
  }
  function patchMaterial(material,semantic='default',opts={}){
    if(!material||material.transparent||Number(material.opacity)<.999)return material;
    if(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial)return material;
    if(material.userData?.microdetailDisabled)return material;
    if(material.userData?.__uvmState)return material;
    const p=profileFor(policy,semantic),baseStrength=(opts.strength??1)*p.shaderStrength;
    if(baseStrength<=0)return material;
    const state={material,semantic,baseStrength,baseJitter:p.roughnessJitter,uniforms:null};
    material.userData=material.userData||{};material.userData.__uvmState=state;shaderStates.add(state);counters.shaderMaterials++;
    const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile=(shader,...rest)=>{
      previous?.(shader,...rest);
      shader.uniforms.uMicroStrength={value:baseStrength*effectiveShaderScale()};
      shader.uniforms.uMicroScale={value:opts.scale||Math.max(4,p.grid*2.1)};
      shader.uniforms.uMicroRoughJitter={value:p.roughnessJitter*effectiveShaderScale()};
      state.uniforms=shader.uniforms;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMicroWorldPos;');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMicroWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vMicroWorldPos;\nuniform float uMicroStrength;\nuniform float uMicroScale;\nuniform float uMicroRoughJitter;\nfloat uvmHash(vec3 p){p=fract(p*0.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}`);
      const normalNeedle='#include <normal_fragment_maps>';
      if(shader.fragmentShader.includes(normalNeedle))shader.fragmentShader=shader.fragmentShader.replace(normalNeedle,`${normalNeedle}\nvec3 uvmCell=floor(vMicroWorldPos*uMicroScale);\nfloat uvmH=uvmHash(uvmCell)-0.5;\nfloat uvmX=uvmHash(uvmCell+vec3(1.,0.,0.))-0.5;\nfloat uvmY=uvmHash(uvmCell+vec3(0.,1.,0.))-0.5;\nvec3 uvmDx=dFdx(vMicroWorldPos),uvmDy=dFdy(vMicroWorldPos);\nvec3 uvmT=normalize(uvmDx+vec3(1e-6)),uvmWN=normalize(cross(uvmDx,uvmDy));\nvec3 uvmB=normalize(cross(uvmWN,uvmT));\nvec3 uvmTV=normalize(mat3(viewMatrix)*uvmT),uvmBV=normalize(mat3(viewMatrix)*uvmB);\nnormal=normalize(normal+(uvmTV*(uvmX-uvmH)+uvmBV*(uvmY-uvmH))*uMicroStrength*.22);`);
      const roughNeedle='#include <roughnessmap_fragment>';
      if(shader.fragmentShader.includes(roughNeedle))shader.fragmentShader=shader.fragmentShader.replace(roughNeedle,`${roughNeedle}\nroughnessFactor=clamp(roughnessFactor+(uvmHash(floor(vMicroWorldPos*uMicroScale))-0.5)*uMicroRoughJitter,0.04,1.0);`);
    };
    material.customProgramCacheKey=()=>`${previousKey?.()||''}|uvm2:${semantic}:${baseStrength}`;
    material.needsUpdate=true;return material;
  }
  function enhanceObject(root,opts={}){
    root?.traverse?.(obj=>{
      if(!obj?.isMesh)return;
      const semantic=opts.semanticResolver?.(obj)||inferSemanticFromObject(policy,obj);
      obj.userData=obj.userData||{};obj.userData.microdetailSemantic=semantic;
      const mats=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const material of mats)patchMaterial(material,semantic,opts);
    });
    return root;
  }
  function buildDetailedGeometry(baseGeometry,opts={}){
    const geometry=createDetailedGeometry(THREE,policy,baseGeometry,{...opts,tierName:opts.tierName||activeTier,seed:opts.seed??worldSeed});
    if(geometry){counters.geometryBuilds++;counters.detailedFaces+=geometry.userData.microdetail?.detailedFaces||0;}
    return geometry;
  }
  function stats(){return{
    schemaVersion:policy.schemaVersion,activeTier,ceilingTier,exactMode,emaFps:+emaFps.toFixed(1),
    geometryBuilds:counters.geometryBuilds,detailedFaces:counters.detailedFaces,shaderMaterials:counters.shaderMaterials,
    tier:tierFor(policy,activeTier)
  };}
  return{
    policy,profileFor:s=>profileFor(policy,s),tierFor:n=>tierFor(policy,n),
    inferSemantic:obj=>inferSemanticFromObject(policy,obj),isQuadSurfaceGeometry,
    buildDetailedGeometry,patchMaterial,enhanceObject,tick,setCeiling,setTier,setPresentationMode,
    getTier:()=>activeTier,getCeiling:()=>ceilingTier,stats
  };
}

export{isQuadSurfaceGeometry,inferSemanticFromName};
