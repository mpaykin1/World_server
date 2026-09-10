// World Server Material Forge v1 — adaptive authored PBR binding for the existing Three.js renderer.
// ArmorPaint is an optional authoring source; gameplay keeps a procedural, zero-download fallback.
const TIER_ORDER=['SAFE','BALANCED','HIGH','ULTRA'];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const mix=(a,b,t)=>a+(b-a)*t;

function tierIndex(name){return Math.max(0,TIER_ORDER.indexOf(name));}
function worldMatches(recipe,worldId){const worlds=recipe?.match?.worlds||[];return worlds.includes('*')||worlds.includes(worldId);}
function semanticMatches(recipe,semantic){return(recipe?.match?.semantics||[]).includes(semantic);}
function extension(uri=''){return String(uri).split(/[?#]/)[0].slice(String(uri).lastIndexOf('.')).toLowerCase();}
function variantPixels(variant){return Math.max(Number(variant?.width)||0,Number(variant?.height)||0);}

export function selectMaterialRecipe(registry,{id=null,semantic='default',worldId='world'}={}){
  const recipes=Object.values(registry?.materials||{});
  if(id){const exact=registry?.materials?.[id];return exact&&worldMatches(exact,worldId)?exact:null;}
  return recipes.filter(recipe=>worldMatches(recipe,worldId)&&semanticMatches(recipe,semantic))
    .sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||String(a.id).localeCompare(String(b.id)))[0]||null;
}

export function selectMapPlan(registry,recipe,tierName='BALANCED',{ktx2=false}={}){
  const tier=registry?.policy?.tiers?.[tierName]||registry?.policy?.tiers?.BALANCED;
  if(!tier||!recipe)return{};
  const allowed=new Set(tier.channels||[]),result={};let bytes=0;
  const channelOrder=['baseColor','orm','normal','emissive','height'];
  for(const channel of channelOrder){
    if(!allowed.has(channel))continue;
    const candidates=(recipe.maps?.[channel]||[]).filter(variant=>{
      if(variantPixels(variant)>Number(tier.maxDimension))return false;
      if(Number(variant.bytes)>Number(tier.maxMaterialBytes))return false;
      if(variant.tier&&tierIndex(variant.tier)>tierIndex(tierName))return false;
      return extension(variant.uri)!=='.ktx2'||ktx2;
    }).sort((a,b)=>variantPixels(b)-variantPixels(a)||String(a.uri).localeCompare(String(b.uri)));
    const selected=candidates[0];
    if(!selected||bytes+Number(selected.bytes)>Number(tier.maxMaterialBytes))continue;
    result[channel]=selected;bytes+=Number(selected.bytes);
  }
  return result;
}

function safeRegistryUri(registry,recipe,uri){
  const prefix=`${registry?.policy?.runtimeUriRoot||'/shared/materials/'}${recipe.id}/`;
  if(typeof uri!=='string'||!uri.startsWith(prefix)||/[\\?#%]/.test(uri))return false;
  const relative=uri.slice(prefix.length),segments=relative.split('/');
  return Boolean(relative)&&segments.every(segment=>Boolean(segment)&&segment!=='.'&&segment!=='..');
}

function profileFromScale(registry,scale){
  const entries=TIER_ORDER.map(name=>[name,Number(registry?.policy?.tiers?.[name]?.scalarBlendScale)||0]);
  return entries.reduce((best,current)=>Math.abs(current[1]-scale)<Math.abs(best[1]-scale)?current:best,entries[0])[0];
}

export function createMaterialForgeRuntime({THREE,registry,initialTier='BALANCED',worldId='world',ktx2Loader=null}={}){
  if(!THREE||registry?.system!=='WORLD_MATERIAL_FORGE'||!registry?.policy?.tiers)throw new Error('MaterialForge: THREE + compiled registry required');
  let activeTier=registry.policy.tiers[initialTier]?initialTier:'BALANCED';
  const states=new Set(),stateByMaterial=new WeakMap(),textureCache=new Map();
  const counters={materials:0,recipes:0,texturePlans:0,texturesLoaded:0,texturesRejected:0,loadFailures:0,proceduralFallbacks:0};

  function tier(){return registry.policy.tiers[activeTier]||registry.policy.tiers.BALANCED;}
  function loadTexture(recipe,variant,channel){
    if(!safeRegistryUri(registry,recipe,variant.uri)){counters.texturesRejected++;return Promise.reject(new Error('unsafe Material Forge texture uri'));}
    if(textureCache.has(variant.uri))return textureCache.get(variant.uri);
    const promise=new Promise((resolve,reject)=>{
      const done=texture=>{
        const width=Number(texture?.image?.width||texture?.source?.data?.width||variant.width),height=Number(texture?.image?.height||texture?.source?.data?.height||variant.height);
        if(width>tier().maxDimension||height>tier().maxDimension){texture?.dispose?.();counters.texturesRejected++;reject(new Error('texture exceeds active device tier'));return;}
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.anisotropy=Math.max(1,Number(tier().anisotropy)||1);
        if(channel==='baseColor'||channel==='emissive')texture.colorSpace=THREE.SRGBColorSpace;
        texture.userData={...(texture.userData||{}),materialForgeOwned:true,sha256:variant.sha256};
        counters.texturesLoaded++;resolve(texture);
      };
      const fail=error=>{counters.loadFailures++;reject(error instanceof Error?error:new Error(String(error||'texture load failed')));};
      if(extension(variant.uri)==='.ktx2'){
        if(!ktx2Loader){fail(new Error('KTX2 loader unavailable'));return;}
        ktx2Loader.load(variant.uri,done,undefined,fail);
      }else new THREE.TextureLoader().load(variant.uri,done,undefined,fail);
    });
    textureCache.set(variant.uri,promise);
    promise.catch(()=>{if(textureCache.get(variant.uri)===promise)textureCache.delete(variant.uri);});
    return promise;
  }

  function applyScalars(state){
    const p=state.recipe.parameters||{},enabled=state.recipe.source?.tool==='ArmorPaint'||state.explicit;
    const factor=enabled?clamp((Number(p.blend)||0)*(Number(tier().scalarBlendScale)||0),0,1):0;
    state.material.roughness=mix(state.original.roughness,Number(p.roughness),factor);
    state.material.metalness=mix(state.original.metalness,Number(p.metalness),factor);
    if(Number.isFinite(state.material.emissiveIntensity))state.material.emissiveIntensity=mix(state.original.emissiveIntensity,Number(p.emissiveIntensity),factor);
    state.material.userData.materialForge={recipeId:state.recipe.id,tier:activeTier,sourceTool:state.recipe.source?.tool||'unknown',authoredMaps:false};
  }

  function resetDirectMaps(state){
    let changed=false;
    for(const property of ['map','normalMap','aoMap','roughnessMap','metalnessMap','emissiveMap','displacementMap']){
      if(state.boundProperties.has(property)){
        if(state.material[property]!==state.original[property])changed=true;
        state.material[property]=state.original[property];
      }
    }
    state.boundProperties.clear();
    if(changed)state.material.needsUpdate=true;
  }

  function resetTriplanar(state){
    if(!state.triplanarBound)return;
    state.material.onBeforeCompile=state.preForgeOnBeforeCompile;
    state.material.customProgramCacheKey=state.preForgeProgramKey;
    state.triplanarBound=false;
    state.material.needsUpdate=true;
  }

  function directBind(state,textures){
    resetTriplanar(state);resetDirectMaps(state);
    const material=state.material,p=state.recipe.parameters||{};
    const bind=(property,texture)=>{if(texture){material[property]=texture;state.boundProperties.add(property);}};
    bind('map',textures.baseColor);bind('normalMap',textures.normal);
    if(textures.orm){bind('aoMap',textures.orm);bind('roughnessMap',textures.orm);bind('metalnessMap',textures.orm);}
    bind('emissiveMap',textures.emissive);
    if(textures.height&&material.userData?.materialForgeAllowDisplacement===true)bind('displacementMap',textures.height);
    if(textures.normal&&material.normalScale?.setScalar)material.normalScale.setScalar(Number(p.normalStrength)||1);
    if(textures.orm)material.aoMapIntensity=Number(p.aoStrength)||1;
    material.needsUpdate=true;
  }

  function triplanarBind(state,textures,planKey){
    const material=state.material,p=state.recipe.parameters||{};
    if(!state.preForgeCaptured){
      state.preForgeCaptured=true;
      state.preForgeOnBeforeCompile=material.onBeforeCompile;
      state.preForgeProgramKey=material.customProgramCacheKey;
    }
    const previous=state.preForgeOnBeforeCompile,previousKey=state.preForgeProgramKey;
    material.onBeforeCompile=(shader,...args)=>{
      previous?.(shader,...args);
      const uniforms={},declarations=[];
      for(const channel of ['baseColor','normal','orm','emissive'])if(textures[channel]){
        const uniformName=`mf${channel[0].toUpperCase()}${channel.slice(1)}`;
        shader.uniforms[uniformName]={value:textures[channel]};uniforms[channel]=uniformName;
        declarations.push(`uniform sampler2D ${uniformName};`);
      }
      shader.uniforms.mfTilingScale={value:Number(p.tilingScale)||4};
      shader.uniforms.mfNormalStrength={value:Number(p.normalStrength)||.5};
      shader.uniforms.mfAoStrength={value:Number(p.aoStrength)||.7};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vMfWorldPos;\nvarying vec3 vMfWorldNormal;');
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvMfWorldNormal=normalize(mat3(modelMatrix)*objectNormal);');
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvMfWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vMfWorldPos;\nvarying vec3 vMfWorldNormal;\nuniform float mfTilingScale;\nuniform float mfNormalStrength;\nuniform float mfAoStrength;\n${declarations.join('\n')}\nvec4 mfTri(sampler2D tex,vec3 p,vec3 n){vec3 w=pow(abs(normalize(n)),vec3(4.));w/=max(w.x+w.y+w.z,0.0001);return texture2D(tex,p.yz*mfTilingScale)*w.x+texture2D(tex,p.xz*mfTilingScale)*w.y+texture2D(tex,p.xy*mfTilingScale)*w.z;}`);
      if(uniforms.baseColor)shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\ndiffuseColor.rgb*=mfTri(${uniforms.baseColor},vMfWorldPos,vMfWorldNormal).rgb;`);
      if(uniforms.orm){
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor*=mfTri(${uniforms.orm},vMfWorldPos,vMfWorldNormal).g;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>\nmetalnessFactor*=mfTri(${uniforms.orm},vMfWorldPos,vMfWorldNormal).b;`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=mix(1.0,mfTri(${uniforms.orm},vMfWorldPos,vMfWorldNormal).r,mfAoStrength);`);
      }
      if(uniforms.normal)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\nvec2 mfN=mfTri(${uniforms.normal},vMfWorldPos,vMfWorldNormal).rg*2.0-1.0;\nvec3 mfT=normalize(dFdx(vMfWorldPos)+vec3(0.000001));\nvec3 mfB=normalize(cross(normalize(vMfWorldNormal),mfT));\nnormal=normalize(normal+mat3(viewMatrix)*(mfT*mfN.x+mfB*mfN.y)*mfNormalStrength*0.28);`);
      if(uniforms.emissive)shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>\ntotalEmissiveRadiance+=mfTri(${uniforms.emissive},vMfWorldPos,vMfWorldNormal).rgb*${clamp(Number(p.emissiveIntensity),0,8).toFixed(4)};`);
    };
    material.customProgramCacheKey=()=>`${previousKey?.call(material)||''}|material-forge-v1:${state.recipe.id}:${activeTier}:${planKey}`;
    state.triplanarBound=true;
    material.needsUpdate=true;
  }

  async function applyMaps(state){
    const plan=selectMapPlan(registry,state.recipe,activeTier,{ktx2:Boolean(ktx2Loader)});
    const hasUv=Boolean(state.object?.geometry?.getAttribute?.('uv'));
    if(!(state.recipe.mapping==='uv'&&hasUv&&state.material.userData?.materialForgeAllowDisplacement===true))delete plan.height;
    const planKey=Object.entries(plan).map(([channel,variant])=>`${channel}:${variant.sha256}`).join('|');
    if(!planKey){
      state.requestId++;
      if(state.planKey!=='procedural')counters.proceduralFallbacks++;
      state.planKey='procedural';resetTriplanar(state);resetDirectMaps(state);
      state.material.userData.materialForge={...state.material.userData.materialForge,authoredMaps:false,mapChannels:[]};return;
    }
    const scopedPlanKey=`${state.recipe.id}:${activeTier}:${planKey}`;
    if(state.planKey===scopedPlanKey)return;
    state.planKey=scopedPlanKey;const requestId=++state.requestId;
    try{
      const entries=await Promise.all(Object.entries(plan).map(async([channel,variant])=>[channel,await loadTexture(state.recipe,variant,channel)]));
      if(requestId!==state.requestId)return;
      const textures=Object.fromEntries(entries);
      if(state.recipe.mapping==='uv'&&hasUv)directBind(state,textures);
      else triplanarBind(state,textures,planKey);
      state.material.userData.materialForge={...state.material.userData.materialForge,authoredMaps:true,mapChannels:Object.keys(textures)};
      counters.texturePlans++;
    }catch(error){
      if(requestId!==state.requestId)return;
      state.planKey='';state.material.userData.materialForge={...state.material.userData.materialForge,authoredMaps:false,lastError:String(error?.message||error)};
    }
  }

  function enhanceMaterial(material,semantic='default',object=null,options={}){
    if(!material||(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial)||material.transparent||Number(material.opacity??1)<.999)return material;
    const requestedId=options.id||object?.userData?.materialForgeId||material.userData?.materialForgeId||null;
    const recipe=selectMaterialRecipe(registry,{id:requestedId,semantic,worldId});
    if(!recipe)return material;
    let state=stateByMaterial.get(material);
    if(!state){
      material.userData=material.userData||{};
      state={material,object,recipe,explicit:Boolean(requestedId),requestId:0,planKey:'',boundProperties:new Set(),preForgeCaptured:false,preForgeOnBeforeCompile:null,preForgeProgramKey:null,triplanarBound:false,original:{
        roughness:Number(material.roughness??.8),metalness:Number(material.metalness??0),emissiveIntensity:Number(material.emissiveIntensity??1),
        map:material.map||null,normalMap:material.normalMap||null,aoMap:material.aoMap||null,roughnessMap:material.roughnessMap||null,
        metalnessMap:material.metalnessMap||null,emissiveMap:material.emissiveMap||null,displacementMap:material.displacementMap||null
      }};
      stateByMaterial.set(material,state);states.add(state);counters.materials++;counters.recipes++;
      if(typeof material.addEventListener==='function'){
        state.disposeHandler=()=>{
          state.requestId++;states.delete(state);stateByMaterial.delete(material);
          material.removeEventListener?.('dispose',state.disposeHandler);
        };
        material.addEventListener('dispose',state.disposeHandler);
      }
    }else{state.object=object||state.object;state.recipe=recipe;state.explicit=state.explicit||Boolean(requestedId);}
    applyScalars(state);void applyMaps(state);return material;
  }

  function enhanceObject(root,options={}){
    root?.traverse?.(object=>{
      if(!object?.isMesh)return;
      const semantic=options.semanticResolver?.(object)||object.userData?.microdetailSemantic||'default';
      for(const material of Array.isArray(object.material)?object.material:[object.material])enhanceMaterial(material,semantic,object,options);
    });return root;
  }

  function setTier(next){
    if(!registry.policy.tiers[next]||next===activeTier)return activeTier;
    activeTier=next;
    for(const state of states){applyScalars(state);state.planKey='';void applyMaps(state);}
    return activeTier;
  }

  const adapter={
    setPbrQuality(value){if(Number(value)<=0&&tierIndex(activeTier)>tierIndex('BALANCED'))setTier('BALANCED');},
    setTextureBudgetScale(value){setTier(profileFromScale(registry,Number(value)||0));},
    setMaterialDetailScale(value){setTier(profileFromScale(registry,Number(value)||0));}
  };
  function stats(){return{schemaVersion:registry.schemaVersion,sourceHash:registry.sourceHash,activeTier,worldId,...counters,activeMaterials:states.size,textureCacheEntries:textureCache.size};}
  return{registry,adapter,enhanceMaterial,enhanceObject,selectRecipe:(options={})=>selectMaterialRecipe(registry,{worldId,...options}),setTier,getTier:()=>activeTier,stats};
}
