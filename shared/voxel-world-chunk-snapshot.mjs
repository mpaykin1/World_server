/** Bridge existing voxel-world ChunkData layout to opt-in worker mesher.
 * Existing ChunkData idx: (y*CHUNK+z)*CHUNK+x.
 * Worker layout: (z*height+y)*width+x.
 * No mutation, DOM, rendering, or change to Golden voxel material IDs.
 */
export function snapshotVoxelWorldChunk(chunk,{chunkSize=16,height=96,neighborAt}={}) {
 if(!chunk||!Number.isSafeInteger(chunk.cx)||!Number.isSafeInteger(chunk.cz)||
   !(chunk.blocks instanceof Uint8Array)) throw new TypeError('chunk');
 if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>64||
   !Number.isSafeInteger(height)||height<1||height>256||
   chunk.blocks.length!==chunkSize*chunkSize*height) throw new RangeError('dimensions');
 if(neighborAt!==undefined&&typeof neighborAt!=='function') throw new TypeError('neighborAt');
 const blocks=new Uint16Array(chunk.blocks.length),origin=[chunk.cx*chunkSize,0,chunk.cz*chunkSize];
 for(let z=0;z<chunkSize;z++)for(let y=0;y<height;y++)for(let x=0;x<chunkSize;x++)
   blocks[(z*height+y)*chunkSize+x]=chunk.blocks[(y*chunkSize+z)*chunkSize+x];
 const neighborBlocks=[];
 if(neighborAt) {
   const add=(x,y,z)=>{
     const id=neighborAt(x,y,z);
     if(!Number.isSafeInteger(id)||id<0||id>65535) throw new RangeError('neighbor id');
     if(id) neighborBlocks.push([x,y,z,id]);
   };
   for(let z=0;z<chunkSize;z++)for(let y=0;y<height;y++) {
     add(origin[0]-1,y,origin[2]+z);
     add(origin[0]+chunkSize,y,origin[2]+z);
   }
   for(let x=0;x<chunkSize;x++)for(let y=0;y<height;y++) {
     add(origin[0]+x,y,origin[2]-1);
     add(origin[0]+x,y,origin[2]+chunkSize);
   }
 }
 return {requestId:`${chunk.cx},${chunk.cz}`,size:[chunkSize,height,chunkSize],origin,blocks,neighborBlocks};
}
