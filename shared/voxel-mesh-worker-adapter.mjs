import {buildVoxelChunkMesh} from './voxel-worker-mesh.mjs';

/**
 * Optional browser worker entrypoint for original CPU-only voxel meshing.
 * Input: {requestId,size,origin,blocks,neighborBlocks?}
 * blocks: Uint16Array, X fastest, then Y, then Z. Outside-neighbor
 * lookup is sparse [worldX,worldY,worldZ,materialId] tuples.
 * No renderer objects or game state are transferred.
 */
export function meshWorkerRequest(message) {
  const {requestId,size,origin=[0,0,0],blocks,neighborBlocks=[]}=message??{};
  if (!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isSafeInteger(n)||n<1)) throw new RangeError('size');
  if (!Array.isArray(origin)||origin.length!==3||origin.some(n=>!Number.isSafeInteger(n))) throw new TypeError('origin');
  const volume=size[0]*size[1]*size[2];
  if (volume>262144||!(blocks instanceof Uint16Array)||blocks.length!==volume) throw new RangeError('blocks');
  if (!Array.isArray(neighborBlocks)||neighborBlocks.length>100000) throw new RangeError('neighborBlocks');
  const neighbors=new Map();
  for (const entry of neighborBlocks) {
    if(!Array.isArray(entry)||entry.length!==4||entry.some(n=>!Number.isSafeInteger(n))||entry[3]<0||entry[3]>65535) throw new TypeError('neighbor entry');
    neighbors.set(entry.slice(0,3).join(','),entry[3]);
  }
  const getBlock=(x,y,z)=>{
    const lx=x-origin[0],ly=y-origin[1],lz=z-origin[2];
    if(lx>=0&&lx<size[0]&&ly>=0&&ly<size[1]&&lz>=0&&lz<size[2])
      return blocks[(lz*size[1]+ly)*size[0]+lx];
    return neighbors.get([x,y,z].join(','))??0;
  };
  const mesh=buildVoxelChunkMesh({size,origin,getBlock});
  const {positions,normals,uvs,indices,materialIds,faceCount}=mesh;
  return {requestId,faceCount,positions,normals,uvs,indices,materialIds};
}
export function installVoxelMeshWorker(scope) {
  if (!scope||typeof scope.postMessage!=='function'||typeof scope.addEventListener!=='function')
    throw new TypeError('worker scope');
  scope.addEventListener('message',event=>{
    try {
      const result=meshWorkerRequest(event.data);
      const transfers=[result.positions.buffer,result.normals.buffer,result.uvs.buffer,
        result.indices.buffer,result.materialIds.buffer];
      scope.postMessage(result,transfers);
    } catch(error) {
      scope.postMessage({requestId:event.data?.requestId,error:String(error?.message??error)});
    }
  });
}
