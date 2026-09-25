/** Original renderer-neutral voxel face helpers. No third-party code or assets. */
export function vertexOcclusion(sideA, sideB, diagonal) {
  for (const n of [sideA,sideB,diagonal]) if (typeof n!=='boolean') throw new TypeError('occlusion inputs must be boolean');
  return sideA && sideB ? 0 : 3-Number(sideA)-Number(sideB)-Number(diagonal);
}
/** Four corner light levels [0..3]; coordinate system is the face's local UV. */
export function faceOcclusion(isSolid, origin, uAxis, vAxis) {
  if (typeof isSolid!=='function') throw new TypeError('isSolid');
  for (const axis of [origin,uAxis,vAxis]) if (!Array.isArray(axis)||axis.length!==3||!axis.every(Number.isSafeInteger)) throw new TypeError('axis');
  const sample=(u,v)=>isSolid(...origin.map((n,i)=>n+u*uAxis[i]+v*vAxis[i]));
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>
    vertexOcclusion(Boolean(sample(u,0)),Boolean(sample(0,v)),Boolean(sample(u,v))));
}
/** Merge equal face descriptors into rectangles without crossing material or AO boundaries.
 * Cells are indexed [y][x]. null = empty. key(cell) must be stable and include material, AO and lighting.
 */
export function greedyFaceRectangles(cells, key = cell => JSON.stringify(cell)) {
  if (!Array.isArray(cells)||cells.some(row=>!Array.isArray(row))) throw new TypeError('cells');
  if (typeof key!=='function') throw new TypeError('key');
  const height=cells.length,width=cells[0]?.length??0;
  if (cells.some(row=>row.length!==width)) throw new RangeError('ragged cells');
  const seen=Array.from({length:height},()=>Array(width).fill(false)),rects=[];
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    if(seen[y][x]||cells[y][x]==null) continue;
    const materialKey=key(cells[y][x]);
    if(typeof materialKey!=='string') throw new TypeError('key must return string');
    let w=1,h=1;
    while(x+w<width&&!seen[y][x+w]&&cells[y][x+w]!=null&&key(cells[y][x+w])===materialKey) w++;
    outer:while(y+h<height) {
      for(let dx=0;dx<w;dx++) if(seen[y+h][x+dx]||cells[y+h][x+dx]==null||key(cells[y+h][x+dx])!==materialKey) break outer;
      h++;
    }
    for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) seen[y+dy][x+dx]=true;
    rects.push({x,y,width:w,height:h,key:materialKey,cell:cells[y][x]});
  }
  return rects;
}
/** Face light levels packed into a 2-bit-per-corner unsigned integer. */
export function packFaceOcclusion(levels) {
  if(!Array.isArray(levels)||levels.length!==4||levels.some(v=>!Number.isInteger(v)||v<0||v>3)) throw new RangeError('levels');
  return levels.reduce((bits,v,i)=>bits|(v<<(i*2)),0);
}
