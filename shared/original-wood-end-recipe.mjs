import {originalTileableFbm} from './original-tileable-texture-noise.mjs';
/** Original wood end-grain material; no borrowed textures or code. */
export function synthesizeOriginalWoodEnd({size=64,seed=1,light=[185,143,91],dark=[104,71,45],bark=[67,50,37],rim=.16}={}){
 if(!Number.isInteger(size)||size<8||size>512||!Number.isInteger(seed)||!Number.isFinite(rim)||rim<0||rim>.5||![light,dark,bark].every(c=>Array.isArray(c)&&c.length===3&&c.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw new RangeError('wood parameters');
 const albedo=new Uint8Array(size*size*4),height=new Uint8Array(size*size),roughness=new Uint8Array(size*size);
 let ringPixels=0,barkPixels=0;
 const clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,t)=>a+(b-a)*t;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size,v=(y+.5)/size,dx=x+.5-size/2,dy=y+.5-size/2;
  const radial=Math.hypot(dx,dy),square=Math.max(Math.abs(dx),Math.abs(dy));
  const wobble=(originalTileableFbm(u,v,{cellsX:4,octaves:3,seed})-.5)*size/16*1.2;
  const phase=((mix(radial,square,.55)+wobble)/(size/16*1.35)%1+1)%1;
  const ring=phase<.28,edge=Math.min(x,y,size-1-x,size-1-y),onBark=edge<rim*size;
  const grain=originalTileableFbm(u,v,{cellsX:2,cellsY:16,octaves:3,seed:seed+5});
  const i=x+size*y;ringPixels+=ring&&!onBark?1:0;barkPixels+=onBark?1:0;
  for(let k=0;k<3;k++){
   const inner=mix(light[k],dark[k],ring?.85:.1);
   albedo[i*4+k]=Math.round(onBark?bark[k]*(1-.3*grain):inner);
  }
  albedo[i*4+3]=255;
  height[i]=Math.round(255*clamp(onBark?.7+.2*grain:ring?.45:.6));
  roughness[i]=onBark?230:191;
 }
 return {size,albedo,height,roughness,ringPixels,barkPixels};
}
