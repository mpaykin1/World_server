'use strict';

const DEFAULT_CHUNK = 16;

function floorDiv(v, d) { return Math.floor(v / d); }
function key3(x, y, z) { return `${x},${y},${z}`; }
function chunkKey(x, y, z, size) {
  return `${floorDiv(x,size)},${floorDiv(y,size)},${floorDiv(z,size)}`;
}
function rgbFromHex(n) {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function greedy(mask, W, H, emit) {
  const used = new Uint8Array(W * H);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const i = v * W + u;
      const mat = mask[i];
      if (mat < 0 || used[i]) continue;
      let w = 1;
      while (u + w < W) {
        const j = v * W + u + w;
        if (used[j] || mask[j] !== mat) break;
        w++;
      }
      let h = 1;
      outer: while (v + h < H) {
        for (let du = 0; du < w; du++) {
          const j = (v + h) * W + u + du;
          if (used[j] || mask[j] !== mat) break outer;
        }
        h++;
      }
      for (let dv = 0; dv < h; dv++) {
        for (let du = 0; du < w; du++) used[(v + dv) * W + u + du] = 1;
      }
      emit(u, v, w, h, mat);
    }
  }
}

function buildChunk(chunkVoxels, globalMap, palette, chunkSize, chunkId) {
  const [cx, cy, cz] = chunkId.split(',').map(Number);
  const minX = cx * chunkSize, minY = cy * chunkSize, minZ = cz * chunkSize;
  const maxX = minX + chunkSize - 1, maxY = minY + chunkSize - 1, maxZ = minZ + chunkSize - 1;

  let bx0=Infinity, by0=Infinity, bz0=Infinity, bx1=-Infinity, by1=-Infinity, bz1=-Infinity;
  const counts = new Map();
  for (const [x,y,z,pi] of chunkVoxels) {
    bx0=Math.min(bx0,x); by0=Math.min(by0,y); bz0=Math.min(bz0,z);
    bx1=Math.max(bx1,x); by1=Math.max(by1,y); bz1=Math.max(bz1,z);
    counts.set(pi, (counts.get(pi)||0)+1);
  }

  const pos=[], col=[], idx=[];
  let quads=0;
  const faceShade = { px:.91, nx:.77, py:1.06, ny:.56, pz:1.00, nz:.72 };

  function color(pi, shade) {
    const [r,g,b] = rgbFromHex(palette[pi] ?? 0x777777);
    return [clampByte(r*shade)/255, clampByte(g*shade)/255, clampByte(b*shade)/255];
  }
  function quad(vertices, pi, shade) {
    const base = pos.length / 3;
    const c = color(pi, shade);
    for (const v of vertices) {
      pos.push(v[0],v[1],v[2]);
      col.push(c[0],c[1],c[2]);
    }
    idx.push(base,base+1,base+2, base,base+2,base+3);
    quads++;
  }
  const has=(x,y,z)=>globalMap.has(key3(x,y,z));
  const get=(x,y,z)=>globalMap.get(key3(x,y,z));

  // +X / -X. 2D mask axes: z (u), y (v)
  for(let x=minX;x<=maxX;x++){
    let mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vy=0;vy<chunkSize;vy++)for(let uz=0;uz<chunkSize;uz++){
      const y=minY+vy,z=minZ+uz,pi=get(x,y,z);
      if(pi!==undefined && !has(x+1,y,z))mask[vy*chunkSize+uz]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const z0=minZ+u-.5,z1=z0+w,y0=minY+v-.5,y1=y0+h,px=x+.5;
      quad([[px,y0,z0],[px,y1,z0],[px,y1,z1],[px,y0,z1]],pi,faceShade.px);
    });
    mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vy=0;vy<chunkSize;vy++)for(let uz=0;uz<chunkSize;uz++){
      const y=minY+vy,z=minZ+uz,pi=get(x,y,z);
      if(pi!==undefined && !has(x-1,y,z))mask[vy*chunkSize+uz]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const z0=minZ+u-.5,z1=z0+w,y0=minY+v-.5,y1=y0+h,px=x-.5;
      quad([[px,y0,z1],[px,y1,z1],[px,y1,z0],[px,y0,z0]],pi,faceShade.nx);
    });
  }

  // +Y / -Y. 2D mask axes: x (u), z (v)
  for(let y=minY;y<=maxY;y++){
    let mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vz=0;vz<chunkSize;vz++)for(let ux=0;ux<chunkSize;ux++){
      const x=minX+ux,z=minZ+vz,pi=get(x,y,z);
      if(pi!==undefined && !has(x,y+1,z))mask[vz*chunkSize+ux]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const x0=minX+u-.5,x1=x0+w,z0=minZ+v-.5,z1=z0+h,py=y+.5;
      quad([[x0,py,z0],[x0,py,z1],[x1,py,z1],[x1,py,z0]],pi,faceShade.py);
    });
    mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vz=0;vz<chunkSize;vz++)for(let ux=0;ux<chunkSize;ux++){
      const x=minX+ux,z=minZ+vz,pi=get(x,y,z);
      if(pi!==undefined && !has(x,y-1,z))mask[vz*chunkSize+ux]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const x0=minX+u-.5,x1=x0+w,z0=minZ+v-.5,z1=z0+h,py=y-.5;
      quad([[x1,py,z0],[x1,py,z1],[x0,py,z1],[x0,py,z0]],pi,faceShade.ny);
    });
  }

  // +Z / -Z. 2D mask axes: x (u), y (v)
  for(let z=minZ;z<=maxZ;z++){
    let mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vy=0;vy<chunkSize;vy++)for(let ux=0;ux<chunkSize;ux++){
      const x=minX+ux,y=minY+vy,pi=get(x,y,z);
      if(pi!==undefined && !has(x,y,z+1))mask[vy*chunkSize+ux]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const x0=minX+u-.5,x1=x0+w,y0=minY+v-.5,y1=y0+h,pz=z+.5;
      quad([[x0,y0,pz],[x1,y0,pz],[x1,y1,pz],[x0,y1,pz]],pi,faceShade.pz);
    });
    mask=new Int32Array(chunkSize*chunkSize);mask.fill(-1);
    for(let vy=0;vy<chunkSize;vy++)for(let ux=0;ux<chunkSize;ux++){
      const x=minX+ux,y=minY+vy,pi=get(x,y,z);
      if(pi!==undefined && !has(x,y,z-1))mask[vy*chunkSize+ux]=pi;
    }
    greedy(mask,chunkSize,chunkSize,(u,v,w,h,pi)=>{
      const x0=minX+u-.5,x1=x0+w,y0=minY+v-.5,y1=y0+h,pz=z-.5;
      quad([[x1,y0,pz],[x0,y0,pz],[x0,y1,pz],[x1,y1,pz]],pi,faceShade.nz);
    });
  }

  let avg=[110,110,110], total=0, sr=0,sg=0,sb=0;
  for(const [pi,n] of counts){
    const [r,g,b]=rgbFromHex(palette[pi]??0x777777);
    sr+=r*n;sg+=g*n;sb+=b*n;total+=n;
  }
  if(total)avg=[Math.round(sr/total),Math.round(sg/total),Math.round(sb/total)];

  return {
    id:chunkId,
    positions:new Float32Array(pos),
    colors:new Float32Array(col),
    indices:new Uint32Array(idx),
    quads,
    triangles:quads*2,
    voxels:chunkVoxels.length,
    bounds:[bx0,by0,bz0,bx1,by1,bz1],
    avgColor:avg
  };
}

self.onmessage = (event) => {
  const data=event.data||{};
  if(data.type!=='build')return;
  const voxels=data.voxels||[],palette=data.palette||[],chunkSize=data.chunkSize||DEFAULT_CHUNK;
  const globalMap=new Map(),chunks=new Map();
  for(const v of voxels){
    const [x,y,z,pi]=v;
    globalMap.set(key3(x,y,z),pi);
    const ck=chunkKey(x,y,z,chunkSize);
    if(!chunks.has(ck))chunks.set(ck,[]);
    chunks.get(ck).push(v);
  }
  const out=[],transfer=[];
  let totalQuads=0,totalTriangles=0;
  for(const [ck,vs] of chunks){
    const c=buildChunk(vs,globalMap,palette,chunkSize,ck);
    totalQuads+=c.quads;totalTriangles+=c.triangles;
    transfer.push(c.positions.buffer,c.colors.buffer,c.indices.buffer);
    out.push({
      id:c.id,positions:c.positions.buffer,colors:c.colors.buffer,indices:c.indices.buffer,
      quads:c.quads,triangles:c.triangles,voxels:c.voxels,bounds:c.bounds,avgColor:c.avgColor
    });
  }
  self.postMessage({
    type:'result',
    chunks:out,
    stats:{
      chunkSize,chunkCount:out.length,logicalVoxels:voxels.length,
      naiveCubeTriangles:voxels.length*12,
      surfaceQuads:totalQuads,surfaceTriangles:totalTriangles,
      triangleReductionPercent:voxels.length?+(100-(totalTriangles/(voxels.length*12))*100).toFixed(2):0,
      bakedLighting:'static_face_vertex_colors',
      internalFaces:'culled',
      meshing:'chunked_greedy'
    }
  },transfer);
};
