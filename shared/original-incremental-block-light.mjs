import {buildOriginalVoxelLight} from './original-voxel-flood-light.mjs';
/** Original incremental addition for block light; removals use correctness-first rebuild. */
export function updateOriginalBlockLight(state,edit){
 const {size,opacity,emission}=state;
 if(!Array.isArray(size)||size.length!==3||!(opacity instanceof Uint8Array)||!(emission instanceof Uint8Array))throw new TypeError('state');
 const [w,h,d]=size,n=w*h*d;
 if(n<1||n>262144||opacity.length!==n||emission.length!==n)throw new RangeError('volume');
 const {x,y,z,newOpacity,newEmission}=edit??{};
 if(![x,y,z,newOpacity,newEmission].every(Number.isInteger)||x<0||x>=w||y<0||y>=h||z<0||z>=d||newOpacity<0||newOpacity>15||newEmission<0||newEmission>15)throw new RangeError('edit');
 const idx=(x,y,z)=>x+w*(z+d*y),i=idx(x,y,z),op=opacity.slice(),em=emission.slice(),oldOpacity=op[i],oldEmission=em[i];
 op[i]=newOpacity;em[i]=newEmission;
 if(!state.block||state.block.length!==n||newOpacity>oldOpacity||newEmission<oldEmission){
  const full=buildOriginalVoxelLight({size,opacity:op,emission:em,sky:false});
  return {state:{size:[...size],opacity:op,emission:em,block:full.block},mode:'rebuild'};
 }
 const light=state.block.slice(),queue=[];
 if(newEmission>light[i]){light[i]=newEmission;queue.push(i);}
 if(newOpacity<oldOpacity){
  for(const j of [i-1,i+1,i-w,i+w,i-w*d,i+w*d]){
   if(j>=0&&j<n)queue.push(j);
  }
 }
 let head=0;
 while(head<queue.length){
  const cur=queue[head++],level=light[cur],cy=Math.floor(cur/(w*d)),rem=cur-cy*w*d,cz=Math.floor(rem/w),cx=rem-cz*w;
  if(level<2)continue;
  for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
   const nx=cx+dx,ny=cy+dy,nz=cz+dz;if(nx<0||nx>=w||ny<0||ny>=h||nz<0||nz>=d)continue;
   const j=idx(nx,ny,nz);if(op[j]===15)continue;
   const next=level-Math.max(1,op[j]);if(next>light[j]){light[j]=next;queue.push(j);}
  }
 }
 return {state:{size:[...size],opacity:op,emission:em,block:light},mode:'incremental'};
}
