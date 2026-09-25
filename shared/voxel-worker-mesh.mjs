/**
 * Original worker-safe voxel surface builder for Three.js/Godot adapters.
 * No GPU, DOM, Three.js, external assets or copied upstream code.
 * Coordinates: X east, Y up, Z south. Opaque positive integer material IDs.
 */
const FACES = [
  {normal:[1,0,0], corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},
  {normal:[-1,0,0],corners:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]]},
  {normal:[0,1,0], corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]]},
  {normal:[0,-1,0],corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]]},
  {normal:[0,0,1], corners:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]]},
  {normal:[0,0,-1],corners:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]]}
];
const UV = [[0,0],[0,1],[1,1],[1,0]];
/** getBlock receives world coordinates, including outside chunk boundaries.
 * Solid voxel IDs are 1..65535, empty is 0. Optional isOpaque allows glass.
 */
export function buildVoxelChunkMesh({size,origin=[0,0,0],getBlock,isOpaque=id=>id!==0,maxVoxels=262144}) {
  if (!Array.isArray(size)||size.length!==3||size.some(v=>!Number.isSafeInteger(v)||v<1))
    throw new RangeError('size');
  if (size.reduce((a,b)=>a*b,1)>maxVoxels) throw new RangeError('chunk too large');
  if (!Array.isArray(origin)||origin.length!==3||origin.some(v=>!Number.isSafeInteger(v)))
    throw new TypeError('origin');
  if (typeof getBlock!=='function'||typeof isOpaque!=='function') throw new TypeError('callbacks');
  const pos=[],normals=[],uvs=[],indices=[],materialIds=[];
  let faceCount=0;
  const block=(x,y,z)=>getBlock(x+origin[0],y+origin[1],z+origin[2]);
  for(let z=0;z<size[2];z++) for(let y=0;y<size[1];y++) for(let x=0;x<size[0];x++) {
    const id=block(x,y,z);
    if(!Number.isSafeInteger(id)||id<0||id>65535) throw new RangeError('material id');
    if(!id) continue;
    for(const face of FACES) {
      const [nx,ny,nz]=face.normal,neighbor=block(x+nx,y+ny,z+nz);
      if(!Number.isSafeInteger(neighbor)||neighbor<0||neighbor>65535) throw new RangeError('neighbor id');
      if(isOpaque(neighbor)) continue;
      const base=faceCount*4;
      for(let i=0;i<4;i++) {
        const corner=face.corners[i];
        pos.push(x+origin[0]+corner[0],y+origin[1]+corner[1],z+origin[2]+corner[2]);
        normals.push(nx,ny,nz);
        uvs.push(...UV[i]);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
      materialIds.push(id);
      faceCount++;
    }
  }
  return {
    positions:new Float32Array(pos),normals:new Float32Array(normals),
    uvs:new Float32Array(uvs),indices:new Uint32Array(indices),
    materialIds:new Uint16Array(materialIds),faceCount,
    // Transfer these buffers from a worker; never upload GPU objects off-thread.
    transferables:[] // caller may use Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer)
  };
}
