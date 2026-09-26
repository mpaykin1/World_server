/** Original engine-independent derived chunk metadata. Layout x + width*(z + depth*y). */
export function buildOriginalChunkMetadata({size,blocks,opacity,emission,minY=0}){
 if(!Array.isArray(size)||size.length!==3||size.some(v=>!Number.isInteger(v)||v<1||v>256)||!Number.isSafeInteger(minY))throw new TypeError('size');
 const [w,h,d]=size,volume=w*h*d;
 if(volume>262144||!(blocks instanceof Uint16Array)||blocks.length!==volume||typeof opacity!=='function'||typeof emission!=='function')throw new TypeError('chunk');
 const heights=new Int32Array(w*d).fill(minY-1),emitters=[],nonAirSections=new Uint32Array(Math.ceil(h/16));
 for(let y=0;y<h;y++)for(let z=0;z<d;z++)for(let x=0;x<w;x++){
  const i=x+w*(z+d*y),block=blocks[i];if(!block)continue;
  nonAirSections[Math.floor(y/16)]++;
  if(opacity(block)>0)heights[x+w*z]=minY+y;
  if(emission(block)>0)emitters.push(i);
 }
 return {heights,emitters:Uint32Array.from(emitters),nonAirSections};
}
export function updateOriginalHeightColumn({size,blocks,opacity,minY=0,heights,x,z}){
 const [w,h,d]=size;
 if(!Number.isInteger(x)||!Number.isInteger(z)||x<0||x>=w||z<0||z>=d||!(heights instanceof Int32Array)||heights.length!==w*d||!(blocks instanceof Uint16Array)||blocks.length!==w*h*d||typeof opacity!=='function')throw new TypeError('column');
 const result=heights.slice(),column=x+w*z;result[column]=minY-1;
 for(let y=h-1;y>=0;y--)if(opacity(blocks[x+w*(z+d*y)])>0){result[column]=minY+y;break;}
 return result;
}
