import {buildOriginalVoxelLight} from './original-voxel-flood-light.mjs';
/** Original correctness-first edit relighting; bounded rebuild, not incremental BFS. */
export function applyOriginalLightEdit(world,{x,y,z,opacity,emission}){
 const {size,minY=0}=world;
 if(!Array.isArray(size)||size.length!==3||!(world.opacity instanceof Uint8Array)||!(world.emission instanceof Uint8Array))throw new TypeError('world');
 const [w,h,d]=size;
 if(![x,y,z,opacity,emission].every(Number.isInteger)||x<0||x>=w||z<0||z>=d||y<minY||y>=minY+h||opacity<0||opacity>15||emission<0||emission>15)throw new RangeError('edit');
 const i=x+w*(z+d*(y-minY));
 if(world.opacity.length!==w*h*d||world.emission.length!==w*h*d)throw new RangeError('arrays');
 const before=world.light??buildOriginalVoxelLight({size,opacity:world.opacity,emission:world.emission,sky:world.skyEnabled!==false});
 const op=world.opacity.slice(),em=world.emission.slice();op[i]=opacity;em[i]=emission;
 const after=buildOriginalVoxelLight({size,opacity:op,emission:em,sky:world.skyEnabled!==false});
 const changed=new Set();
 for(let j=0;j<after.packed.length;j++)if(before.packed[j]!==after.packed[j]){
  const yy=Math.floor(j/(w*d));
  changed.add(Math.floor((minY+yy-minY)/16));
 }
 return {world:{...world,opacity:op,emission:em,light:after},changedSections:[...changed].sort((a,b)=>a-b)};
}
