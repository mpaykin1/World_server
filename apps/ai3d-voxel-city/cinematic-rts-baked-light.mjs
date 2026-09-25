/**
 * CPU-baked contact shadow and emissive terrain decals for volcanic RTS.
 * Three batched textured meshes, zero dynamic shadow maps or point lights.
 * Visual-only: authoritative game state still lives in the existing engine.
 */
const QUALITY=Object.freeze({
 low:{resolution:64,bankGlows:10,crystalHalos:12},
 balanced:{resolution:96,bankGlows:24,crystalHalos:42},
 high:{resolution:128,bankGlows:36,crystalHalos:62},
 ultra:{resolution:128,bankGlows:48,crystalHalos:80}
});
export function lightingBudget(tier){return QUALITY[tier]||QUALITY.balanced;}
const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
export function paintRtsLightDecal(kind,size=96){
 if(!['contact','lava','mineral'].includes(kind)||
    !Number.isInteger(size)||size<32||size>256)
   throw Error('unsafe terrain decal budget');
 const pixels=new Uint8ClampedArray(size*size*4);
 const rgb=kind==='contact'?[2,6,12]:
   kind==='lava'?[255,108,22]:[73,178,255];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1;
  const distance=Math.sqrt(u*u+v*v);
  const softness=kind==='contact'?1.32:1.0;
  const falloff=Math.pow(clamp(1-distance/softness),kind==='contact'?2.0:2.6);
  const intensity=(kind==='contact'?.72:kind==='lava'?.67:.54)*falloff;
  const at=(y*size+x)*4;
  pixels[at]=rgb[0];pixels[at+1]=rgb[1];pixels[at+2]=rgb[2];
  pixels[at+3]=Math.round(intensity*255);
 }
 return {kind,size,pixels};
}
const key=(x,z)=>Math.round(x*100)+':'+Math.round(z*100);
export function layoutRtsLighting(layout,tier='balanced'){
 if(!layout?.tiles||!layout?.lava||!layout?.structures)
  throw Error('missing battlefield lighting layout');
 const {bankGlows,crystalHalos}=lightingBudget(tier),lava=new Set(
  layout.lava.map(t=>key(t.x,t.z)));
 const contact=layout.structures.map(s=>({
  x:s.x,y:-1.82,z:s.z,sx:s.width*1.65,sz:s.depth*1.65
 }));
 const banks=[];
 for(const tile of layout.tiles){
  if(banks.length>=bankGlows)break;
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   if(!lava.has(key(tile.x+layout.step*dx,tile.z+layout.step*dz)))continue;
   banks.push({x:tile.x+dx*layout.step*.45,y:-1.875,
    z:tile.z+dz*layout.step*.45,
    sx:dx?layout.step*.52:layout.step*1.1,
    sz:dz?layout.step*.52:layout.step*1.1});
   break;
  }
 }
 const minerals=layout.resources.slice(0,crystalHalos).map(r=>({
  x:r.x,y:-1.84,z:r.z,sx:r.size*3.5,sz:r.size*3.5
 }));
 return{contact,banks,minerals,visualOnly:true};
}
export function mountRtsBakedLighting(THREE,parent,layout,tier='balanced'){
 if(!THREE?.CanvasTexture||!parent?.add)throw Error('Three.js scene required');
 const budget=lightingBudget(tier),plan=layoutRtsLighting(layout,tier);
 const group=new THREE.Group();group.name='RTSBakedContactAndLavaGlow';
 parent.add(group);
 const textures=[],geometries=[],materials=[],meshes=[];
 const canvasTexture=kind=>{
  const baked=paintRtsLightDecal(kind,budget.resolution);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=budget.resolution;
  const ctx=canvas.getContext('2d');
  const img=ctx.createImageData(budget.resolution,budget.resolution);
  img.data.set(baked.pixels);ctx.putImageData(img,0,0);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  textures.push(texture);return texture;
 };
 const build=(kind,items)=>{
  if(!items.length)return;
  const geom=new THREE.PlaneGeometry(1,1),tex=canvasTexture(kind);
  const material=new THREE.MeshBasicMaterial({
   map:tex,transparent:true,depthWrite:false,depthTest:true,
   blending:kind==='contact'?THREE.NormalBlending:THREE.AdditiveBlending,
   polygonOffset:true,polygonOffsetFactor:-1,
   side:THREE.DoubleSide,toneMapped:false,fog:true
  });
  geometries.push(geom);materials.push(material);
  const mesh=new THREE.InstancedMesh(geom,material,items.length);
  const dummy=new THREE.Object3D();
  for(let i=0;i<items.length;i++){
   const item=items[i];dummy.position.set(item.x,item.y,item.z);
   dummy.rotation.set(-Math.PI/2,0,0);
   dummy.scale.set(item.sx,item.sz,1);
   dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
  mesh.name='RtsBaked_'+kind;
  mesh.castShadow=false;mesh.receiveShadow=false;
  group.add(mesh);meshes.push(mesh);
 };
 build('contact',plan.contact);build('lava',plan.banks);
 build('mineral',plan.minerals);
 return{
  group,plan,
  stats(){return{drawBatches:meshes.length,
   contactShadows:plan.contact.length,lavaBankGlows:plan.banks.length,
   crystalHalos:plan.minerals.length,
   textureBytes:budget.resolution**2*4*textures.length,
   realtimePointLights:0,dynamicShadowMaps:0,visualOnly:true};},
  dispose(){group.parent?.remove(group);
   meshes.forEach(mesh=>mesh.dispose?.());
   geometries.forEach(geo=>geo.dispose());
   materials.forEach(material=>material.dispose());
   textures.forEach(texture=>texture.dispose());
  }
 };
}
