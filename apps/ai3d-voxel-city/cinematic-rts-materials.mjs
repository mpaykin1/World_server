/**
 * Deterministic CPU-baked, genuinely mapped RTS terrain materials.
 * No image API, GPU generator, paid dependencies or render-loop texture writes.
 * Albedo, tangent normal and ORM (AO R, roughness G, metallic B) share UVs.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function hash(x,y,seed){
  let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2246822519))|0;
  n=Math.imul(n^(n>>>13),1274126177);
  return((n^(n>>>16))>>>0)/4294967295;
}
function smooth(t){return t*t*(3-2*t);}
function noise(x,y,seed){
  const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);
  const a=hash(i,j,seed)*(1-u)+hash(i+1,j,seed)*u;
  const b=hash(i,j+1,seed)*(1-u)+hash(i+1,j+1,seed)*u;
  return a*(1-v)+b*v;
}
export function bakeRtsMaterial(kind,size=256,seed=20260925){
  if(!['basalt','industrial'].includes(kind)||!Number.isInteger(size)||
    size<64||size>512)throw Error('unbounded RTS material');
  const heights=new Float32Array(size*size);
  const albedo=new Uint8ClampedArray(size*size*4);
  const normal=new Uint8ClampedArray(size*size*4);
  const orm=new Uint8ClampedArray(size*size*4);
  const idx=(x,y)=>((y+size)%size)*size+((x+size)%size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,i=idx(x,y);
    const coarse=noise(u*5.3,v*6.9,seed),grain=noise(u*42,v*45,seed+17);
    const s=noise(u*14,v*16,seed+93);
    let h,ao,rough,metal,r,g,b;
    if(kind==='basalt'){
      const faults=Math.pow(1-Math.abs(Math.sin((u*24+v*7+coarse*4.3)*Math.PI)),11);
      const grit=(grain-.5)*.29;
      h=clamp(.42+grit+(coarse-.5)*.44-faults*.28);
      ao=clamp(.74+(coarse-.5)*.17-faults*.49);
      rough=clamp(.82+grain*.13);metal=0;
      const dust=coarse*.19+grain*.09;
      r=clamp(.14+dust-faults*.07);
      g=clamp(.139+dust-faults*.07);
      b=clamp(.15+dust*.98-faults*.07);
    }else{
      const seam=Math.max(
        Math.exp(-Math.pow(((u*4)%1-.5)/.024,2)),
        Math.exp(-Math.pow(((v*4)%1-.5)/.024,2)));
      const hatch=Math.abs(Math.sin((u+v)*size*.48))>.94?.16:0;
      const rust=clamp((s-.56)*3+grain*.2)*.42;
      h=clamp(.56+(grain-.5)*.19-seam*.23+hatch*.19);
      ao=clamp(.81-seam*.44-rust*.2);
      rough=clamp(.45+rust*.5+grain*.12);
      metal=clamp(.69-rust*.56);
      r=clamp(.23+coarse*.15+rust*.28-seam*.09);
      g=clamp(.27+coarse*.14-rust*.09-seam*.11);
      b=clamp(.32+coarse*.15-rust*.15-seam*.1);
      if(hatch){r*=.72;g*=.74;b*=.69;}
    }
    heights[i]=h;
    const p=i*4;
    albedo[p]=r*255;albedo[p+1]=g*255;albedo[p+2]=b*255;albedo[p+3]=255;
    orm[p]=ao*255;orm[p+1]=rough*255;orm[p+2]=metal*255;orm[p+3]=255;
  }
  // Periodic derivatives avoid visible normal-map seams on adjacent tiles.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(heights[idx(x-1,y)]-heights[idx(x+1,y)])*2.3;
    const dy=(heights[idx(x,y-1)]-heights[idx(x,y+1)])*2.3;
    const len=Math.hypot(dx,dy,1),p=idx(x,y)*4;
    normal[p]=255*(dx/len*.5+.5);
    normal[p+1]=255*(dy/len*.5+.5);
    normal[p+2]=255*(1/len*.5+.5);normal[p+3]=255;
  }
  return {kind,seed,size,albedo,normal,orm};
}
export function mountRtsSurfaceMaterials(THREE,tier='balanced',seed=20260925){
  const size=tier==='low'?128:tier==='balanced'?192:256;
  const textures=[],materials=[];
  const canvasTexture=(bytes,srgb)=>{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');
    const image=ctx.createImageData(size,size);
    image.data.set(bytes);ctx.putImageData(image,0,0);
    const t=new THREE.CanvasTexture(canvas);
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.anisotropy=2;
    textures.push(t);
    return t;
  };
  const result={};
  for(const kind of ['basalt','industrial']){
    const baked=bakeRtsMaterial(kind,size,seed+(kind==='industrial'?79:0));
    const map=canvasTexture(baked.albedo,true);
    const norm=canvasTexture(baked.normal,false);
    const packed=canvasTexture(baked.orm,false);
    const material=new THREE.MeshStandardMaterial({
      color:0xffffff,map,normalMap:norm,
      roughnessMap:packed,metalnessMap:packed,aoMap:packed,
      aoMapIntensity:.85,normalScale:new THREE.Vector2(.45,.45),
      roughness:1,metalness:1});
    materials.push(material);result[kind]=material;
  }
  return {...result,textureBytes:size*size*4*6,
    dispose(){materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
