/** Original 18^3 halo sampling for a 16^3 section. Chunks use y-major x+16*(z+16*y). */
export function sampleOriginalPaddedSection({chunks,sectionY=0,worldHeight=256,bedrock=1,isFull=v=>v!==0}={}){
 if(!(chunks instanceof Map)||!Number.isInteger(sectionY)||!Number.isInteger(worldHeight)||worldHeight<1||worldHeight>4096||!Number.isInteger(bedrock)||bedrock<0||bedrock>65535||typeof isFull!=='function')throw new RangeError('halo input');
 const side=18,plane=324,n=5832,blocks=new Uint16Array(n),light=new Uint8Array(n),rowFull=new Uint8Array(324);let fullCount=0;
 for(let py=0;py<side;py++){
  const y=sectionY*16+py-1;
  for(let pz=0;pz<side;pz++){
   let rowCount=0;const z=pz-1,cz=z<0?-1:z>15?1:0,lz=(z+16)%16;
   for(let px=0;px<side;px++){
    const x=px-1,cx=x<0?-1:x>15?1:0,lx=(x+16)%16,i=px+side*(pz+side*py);
    if(y<0){blocks[i]=bedrock;light[i]=0;}
    else if(y>=worldHeight){blocks[i]=0;light[i]=240;}
    else{
     const chunk=chunks.get(`${cx},${cz}`),idx=lx+16*(lz+16*y);
     blocks[i]=chunk?.blocks?.[idx]??0;
     light[i]=chunk?.light?.[idx]??240;
    }
    if(isFull(blocks[i])){rowCount++;fullCount++;}
   }
   rowFull[py*side+pz]=Number(rowCount===side);
  }
 }
 return {blocks,light,rowFull,fullCount,side};
}
