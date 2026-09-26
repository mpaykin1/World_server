import {originalTileableFbm} from './original-tileable-texture-noise.mjs';
/** Original bark recipe with anisotropic ridges and optional birch lenticels. */
export function synthesizeOriginalBark({size=64,seed=1,kind='oak'}={}){
 if(!Number.isInteger(size)||size<16||size>512||!Number.isInteger(seed)||!['oak','birch'].includes(kind))throw new RangeError('bark options');
 const albedo=new Uint8Array(size*size*4),height=new Uint8Array(size*size),roughness=new Uint8Array(size*size);
 const light=kind==='birch'?[218,213,196]:[120,85,54],dark=kind==='birch'?[153,145,132]:[61,42,31];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,i=x+size*y;
  const n=originalTileableFbm(u,v,{cellsX:10,cellsY:2,octaves:4,seed});
  const ridge=Math.abs(((n*3)%1+1)%1-.5)*2;
  const grain=originalTileableFbm(u,v,{cellsX:16,cellsY:16,octaves:2,seed:seed+1});
  const mix=Math.max(0,Math.min(1,ridge*1.3-.1)),shade=.9+grain*.2;
  for(let k=0;k<3;k++)albedo[i*4+k]=Math.round(Math.min(255,(dark[k]+(light[k]-dark[k])*mix)*shade));
  albedo[i*4+3]=255;height[i]=Math.round((.3+ridge*.6)*255);roughness[i]=230;
 }
 let lenticels=0;
 if(kind==='birch'){
  // Horizontal short dark lenticels; independent seeded placement.
  const rand=n=>{let v=(Math.imul(seed^n,1664525)+1013904223)|0;v=Math.imul(v^(v>>>16),2246822519);return ((v^(v>>>13))>>>0)/4294967296;};
  for(let j=0;j<9;j++){
   const x=Math.floor(rand(j*4+1)*size),y=Math.floor(rand(j*4+2)*size),length=Math.max(2,Math.round((1.5+rand(j*4+3)*3)*size/16));
   for(let dx=0;dx<length;dx++)for(let dy=0;dy<Math.max(1,Math.round(size/40));dy++){
    const px=(x+dx)%size,py=(y+dy)%size,i=px+size*py;
    albedo.set([45,43,40,255],i*4);height[i]=51;lenticels++;
   }
  }
 }
 return {size,albedo,height,roughness,lenticels};
}
