/** Standalone six-face visibility for a padded 18x18x18 voxel section. */
export function originalFaceVisible(block,neighbor,full=value=>value!==0,cullSame=()=>false){
 return block!==0&&!full(neighbor)&&!(block===neighbor&&cullSame(block));
}
export function buildOriginalSectionVisibility({blocks,full=value=>value!==0,cullSame=()=>false}={}){
 if(!(blocks instanceof Uint16Array)||blocks.length!==5832)throw new RangeError('18 cubed padded blocks required');
 const mask=new Uint8Array(4096),offsets=[1,-1,324,-324,18,-18];
 let visibleFaces=0,hiddenBlocks=0;
 for(let y=0;y<16;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++){
  const i=x+16*(z+16*y),p=(x+1)+18*((z+1)+18*(y+1)),block=blocks[p];
  if(block===0)continue;
  let bits=0;
  for(let f=0;f<6;f++)if(originalFaceVisible(block,blocks[p+offsets[f]],full,cullSame)){bits|=1<<f;visibleFaces++;}
  mask[i]=bits;if(bits===0)hiddenBlocks++;
 }
 return {mask,visibleFaces,hiddenBlocks};
}
