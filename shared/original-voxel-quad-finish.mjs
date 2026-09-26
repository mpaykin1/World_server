/** Original engine-neutral voxel quad finishing: two-channel corner light and AO-aware diagonal. */
export function finishOriginalVoxelQuad(corners){
 if(!Array.isArray(corners)||corners.length!==4||corners.some(c=>!c||![c.ao,c.sky,c.block].every(Number.isFinite)||c.ao<0||c.ao>1||c.sky<0||c.sky>15||c.block<0||c.block>15))throw new RangeError('corners');
 const packed=new Uint8Array(16);
 for(let i=0;i<4;i++){
  const c=corners[i],j=i*4;
  packed[j]=Math.round(c.sky*17);packed[j+1]=Math.round(c.block*17);
  packed[j+2]=0;packed[j+3]=255;
 }
 const a=corners[0].ao+corners[2].ao, b=corners[1].ao+corners[3].ao;
 const la=corners[0].sky+corners[0].block+corners[2].sky+corners[2].block;
 const lb=corners[1].sky+corners[1].block+corners[3].sky+corners[3].block;
 const flip=a<b||(a===b&&la<lb);
 return {indices:Uint16Array.from(flip?[1,2,3,1,3,0]:[0,1,2,0,2,3]),packedLight:packed,flipDiagonal:flip};
}
