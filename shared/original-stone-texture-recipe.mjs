import {originalTileableFbm} from './original-tileable-texture-noise.mjs';
/** Independently authored stone albedo + height recipe inspired by Unreal's Mottle/StoneLike. */
export function synthesizeOriginalStone({size=64,seed=1,base=[103,105,108],highlight=[159,158,151],vein=[57,59,65],contrast=1.6}={}){
 if(!Number.isInteger(size)||size<4||size>512||!Number.isInteger(seed)||!Number.isFinite(contrast)||contrast<=0||contrast>5||![base,highlight,vein].every(c=>Array.isArray(c)&&c.length===3&&c.every(v=>Number.isInteger(v)&&v>=0&&v<=255)))throw new RangeError('stone recipe');
 const albedo=new Uint8Array(size*size*4),height=new Uint8Array(size*size);let veinPixels=0;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,i=x+size*y;
  const n=originalTileableFbm(u,v,{cellsX:4,octaves:5,seed});
  const grain=originalTileableFbm(u,v,{cellsX:32,octaves:2,seed:seed+5});
  const t=Math.max(0,Math.min(1,.5+(n-.5)*contrast+(grain-.5)*.18));
  const veins=Math.abs(originalTileableFbm(u,v,{cellsX:3,octaves:4,seed:seed+91})-.5)<.035;
  for(let c=0;c<3;c++){
   const mixed=base[c]+(highlight[c]-base[c])*t;
   albedo[4*i+c]=Math.round(veins?mixed*.45+vein[c]*.55:mixed);
  }
  albedo[4*i+3]=255;
  height[i]=Math.round(Math.max(0,Math.min(1,.5+(n-.5)*.8-(veins?.12:0)))*255);
  if(veins)veinPixels++;
 }
 return {size,albedo,height,veinPixels};
}
