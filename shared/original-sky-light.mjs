/** Independent sky-light initializer and six-neighbor flood for small voxel volumes. */
export function buildOriginalSkyLight({size,opacity,maxWork=1000000}={}){
 if(!Array.isArray(size)||size.length!==3||!size.every(n=>Number.isInteger(n)&&n>0&&n<=128))throw new RangeError('size');
 const [w,h,d]=size,n=w*h*d;
 if(!(opacity instanceof Uint8Array)||opacity.length!==n||!Number.isInteger(maxWork)||maxWork<n||maxWork>10000000)throw new RangeError('opacity/work');
 const at=(x,y,z)=>x+w*(z+d*y),sky=new Uint8Array(n),exposure=new Int16Array(w*d).fill(h),queue=[];
 for(let z=0;z<d;z++)for(let x=0;x<w;x++){
  let level=15,exposed=h;
  for(let y=h-1;y>=0;y--){
   const i=at(x,y,z),o=opacity[i];if(o>=15)break;
   if(o>0)level-=o;if(level<=0)break;
   sky[i]=level;if(level===15)exposed=y;
  }
  exposure[x+w*z]=exposed;
 }
 for(let y=0;y<h;y++)for(let z=0;z<d;z++)for(let x=0;x<w;x++)if(sky[at(x,y,z)]>1)queue.push([x,y,z]);
 let head=0;
 for(;head<queue.length&&head<maxWork;head++){
  const [x,y,z]=queue[head],i=at(x,y,z),level=sky[i];if(level<=1)continue;
  for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
   const nx=x+dx,ny=y+dy,nz=z+dz;if(nx<0||nx>=w||ny<0||ny>=h||nz<0||nz>=d)continue;
   const ni=at(nx,ny,nz),o=opacity[ni];if(o>=15)continue;
   const next=dy===-1&&level===15&&o===0?15:level-Math.max(1,o);
   if(next>sky[ni]){sky[ni]=next;queue.push([nx,ny,nz]);}
  }
 }
 if(head>=maxWork&&head<queue.length)throw new RangeError('skylight work budget exceeded');
 return {sky,exposure,processed:head};
}
