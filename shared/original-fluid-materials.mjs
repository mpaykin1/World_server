import {originalTileableFbm,originalTileableWorley} from './original-tileable-texture-noise.mjs';
/** Independent water/lava material synthesis; all channels RGBA8 or grayscale8. */
export function synthesizeOriginalFluid({kind='water',size=64,seed=1,flow=false}={}){
 if(!['water','lava'].includes(kind)||!Number.isInteger(size)||size<8||size>256||!Number.isInteger(seed)||typeof flow!=='boolean')throw new RangeError('fluid options');
 const albedo=new Uint8Array(size*size*4),height=new Uint8Array(size*size),roughness=new Uint8Array(size*size),emission=new Uint8Array(size*size);
 const clamp=n=>Math.max(0,Math.min(1,n)),lerp=(a,b,t)=>a+(b-a)*t;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,i=x+size*y;
  const w=originalTileableWorley(u,kind==='lava'&&flow?v*.5:v,{cells:kind==='water'?5:4,seed});
  const n=originalTileableFbm(u,v,{cellsX:flow?3:4,cellsY:flow?12:4,octaves:kind==='water'?3:4,seed:seed+1});
  if(kind==='water'){
   const caustic=clamp(1-(w.f2-w.f1)*4),value=clamp(.62+n*.25+caustic*.18);
   const rgb=[Math.round(value*77),Math.round(value*165),Math.round(value*245)];
   albedo.set([...rgb,205],i*4);height[i]=Math.round(clamp(n*.6+caustic*.2)*255);roughness[i]=10;
  }else{
   const hot=clamp(1-w.f1*1.1+(n-.5)*.6),cold=[45,20,14],warm=[226,68,14],bright=[255,222,65];
   const a=hot>.55?warm:cold,b=hot>.55?bright:warm,t=hot>.55?(hot-.55)/.45:hot/.55;
   for(let k=0;k<3;k++)albedo[4*i+k]=Math.round(lerp(a[k],b[k],t));
   albedo[4*i+3]=255;emission[i]=Math.round(clamp(hot*1.2)*255);height[i]=Math.round((1-hot*.6)*255);roughness[i]=140;
  }
 }
 return {size,kind,flow,albedo,height,roughness,emission};
}
