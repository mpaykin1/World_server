/** Original small-volume reference flood-light algorithm. No upstream source copied. */
export function buildOriginalVoxelLight({size,opacity,emission,sky=true}){
 if(!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isInteger(n)||n<1||n>128))throw new RangeError('size');
 const [w,h,d]=size,n=w*h*d;
 if(n>262144)throw new RangeError('volume');
 if(!(opacity instanceof Uint8Array)||opacity.length!==n||!(emission instanceof Uint8Array)||emission.length!==n)throw new TypeError('voxel arrays');
 if(opacity.some(v=>v>15)||emission.some(v=>v>15))throw new RangeError('light levels');
 const block=new Uint8Array(n),sun=new Uint8Array(n);
 const index=(x,y,z)=>x+w*(z+d*y);
 const neighbors=(i,visit)=>{
  const y=Math.floor(i/(w*d)),r=i-y*w*d,z=Math.floor(r/w),x=r-z*w;
  if(x>0)visit(i-1,0);if(x+1<w)visit(i+1,0);
  if(z>0)visit(i-w,0);if(z+1<d)visit(i+w,0);
  if(y>0)visit(i-w*d,-1);if(y+1<h)visit(i+w*d,1);
 };
 function flood(light,queue,skyRule){
  let head=0;
  while(head<queue.length){
   const i=queue[head++],level=light[i];if(level<2)continue;
   neighbors(i,(j,dy)=>{
    const o=opacity[j];if(o===15)return;
    const next=skyRule&&dy===-1&&level===15&&o===0?15:level-Math.max(1,o);
    if(next>light[j]){light[j]=next;queue.push(j);}
   });
  }
 }
 const blockSeeds=[];
 for(let i=0;i<n;i++)if(emission[i]>0){block[i]=emission[i];blockSeeds.push(i);}
 flood(block,blockSeeds,false);
 if(sky){
  const skySeeds=[];
  for(let z=0;z<d;z++)for(let x=0;x<w;x++){
   let level=15;
   for(let y=h-1;y>=0;y--){
    const i=index(x,y,z),o=opacity[i];
    if(o===15)break;
    level-=o;if(level<=0)break;
    sun[i]=level;skySeeds.push(i);
   }
  }
  flood(sun,skySeeds,true);
 }
 const packed=new Uint8Array(n);
 for(let i=0;i<n;i++)packed[i]=(sun[i]<<4)|block[i];
 return {size:[...size],sky:sun,block,packed};
}
