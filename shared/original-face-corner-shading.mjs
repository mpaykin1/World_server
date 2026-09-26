/** Original engine-independent voxel face corner shading, inspired by padded Godot meshing. */
export function sampleOriginalFaceCorners({position,normal,sample,faceShade=1}){
 if(!Array.isArray(position)||position.length!==3||!position.every(Number.isInteger)||!Array.isArray(normal)||normal.length!==3||normal.filter(v=>v!==0).length!==1||normal.some(v=>![-1,0,1].includes(v))||typeof sample!=='function'||!Number.isFinite(faceShade)||faceShade<0)throw new TypeError('face');
 const axis=normal.findIndex(v=>v!==0),tangent=[0,1,2].filter(v=>v!==0&&[0,1,2].indexOf(v)!==axis);
 const [a,b]=tangent,corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
 const get=offset=>{const p=position.map((v,i)=>v+normal[i]+offset[i]);const v=sample(...p)??{};return {solid:!!v.solid,sky:Math.max(0,Math.min(15,v.sky??0)),block:Math.max(0,Math.min(15,v.block??0))};};
 const light=v=>Math.max(v.sky,v.block),base=get([0,0,0]);
 const result=corners.map(([sa,sb])=>{
  const u=[0,0,0],v=[0,0,0],d=[0,0,0];u[a]=sa;v[b]=sb;d[a]=sa;d[b]=sb;
  const s1=get(u),s2=get(v),di=get(d),occlusion=s1.solid&&s2.solid?3:Number(s1.solid)+Number(s2.solid)+Number(di.solid);
  const brightness=faceShade*[1,0.8,0.62,0.45][occlusion];
  const center=light(base),average=(center+light(s1)+light(s2)+light(di))/4;
  return {occlusion,brightness,light:average};
 });
 return {corners:result,flipDiagonal:result[0].brightness+result[2].brightness>result[1].brightness+result[3].brightness};
}
