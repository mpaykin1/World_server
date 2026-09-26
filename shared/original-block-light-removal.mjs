import {buildOriginalVoxelLight} from './original-voxel-flood-light.mjs';
/** Independent two-phase block-light removal; caller supplies a valid prior light field. */
export function removeOriginalBlockLight(state,{x,y,z,newOpacity=0,newEmission=0},maxWork=100000){
 const {size,opacity,emission,block}=state??{};
 if(!Array.isArray(size)||size.length!==3||size.some(v=>!Number.isInteger(v)||v<1||v>256)||!(opacity instanceof Uint8Array)||!(emission instanceof Uint8Array)||!(block instanceof Uint8Array)||!Number.isInteger(maxWork)||maxWork<1)throw new TypeError('state');
 const [w,h,d]=size,n=w*h*d;
 if(n>262144||opacity.length!==n||emission.length!==n||block.length!==n||![x,y,z,newOpacity,newEmission].every(Number.isInteger)||x<0||x>=w||y<0||y>=h||z<0||z>=d||newOpacity<0||newOpacity>15||newEmission<0||newEmission>15)throw new RangeError('edit');
 const index=(a,b,c)=>a+w*(c+d*b),start=index(x,y,z);
 const op=opacity.slice(),em=emission.slice(),light=block.slice(),old=light[start];
 op[start]=newOpacity;em[start]=newEmission;
 const fallback=()=>({state:{size:[...size],opacity:op,emission:em,block:buildOriginalVoxelLight({size,opacity:op,emission:em,sky:false}).block},mode:'rebuild'});
 if(newOpacity<opacity[start]||newEmission>emission[start])return fallback();
 const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 const neighbors=i=>{
  const yy=Math.floor(i/(w*d)),r=i-yy*w*d,zz=Math.floor(r/w),xx=r-zz*w;
  const out=[];for(const [dx,dy,dz] of dirs){const a=xx+dx,b=yy+dy,c=zz+dz;if(a>=0&&a<w&&b>=0&&b<h&&c>=0&&c<d)out.push(index(a,b,c));}
  return out;
 };
 const removed=[[start,old]],seeds=new Set(),removedSet=new Set([start]);light[start]=newEmission;let work=0;
 for(let head=0;head<removed.length;head++){
  if(++work>maxWork)return fallback();
  const [i,level]=removed[head];
  for(const j of neighbors(i)){
   const l=light[j];if(l===0)continue;
   if(l<level&&!removedSet.has(j)){
    removedSet.add(j);light[j]=em[j];removed.push([j,l]);if(em[j])seeds.add(j);
   }else seeds.add(j);
  }
 }
 if(newEmission)seeds.add(start);
 for(const i of removedSet)for(const j of neighbors(i))if(light[j]>0)seeds.add(j);
 const queue=[...seeds];for(let head=0;head<queue.length;head++){
  if(++work>maxWork)return fallback();
  const i=queue[head],level=light[i];if(level<2)continue;
  for(const j of neighbors(i)){
   if(op[j]===15)continue;
   const candidate=level-Math.max(1,op[j]);
   if(candidate>light[j]){light[j]=candidate;queue.push(j);}
  }
 }
 return {state:{size:[...size],opacity:op,emission:em,block:light},mode:'incremental',work};
}
