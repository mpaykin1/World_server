'use strict';
/** Verify actual decoded normal pixels, not just PNG dimensions or checksums.
 * Prevent Blender color-space resets from silently publishing flat black maps.
 * Node core only: suitable for independent CI without npm installs.
 */
const zlib=require('node:zlib');
const PNG_SIGNATURE=Buffer.from('89504e470d0a1a0a','hex');
function decodeNormalQuality(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<33||
      !bytes.subarray(0,8).equals(PNG_SIGNATURE))throw Error('invalid normal PNG signature');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),
        depth=bytes[24],colorType=bytes[25],compression=bytes[26],filter=bytes[27],
        interlace=bytes[28];
  const bpp=colorType===6?4:colorType===2?3:0;
  if(width<64||width>1024||height<64||height>1024||
    depth!==8||!bpp||compression!==0||filter!==0||interlace!==0)
    throw Error('unsupported normal PNG encoding');
  const chunks=[];
  let offset=8,seenIDAT=false,seenIEND=false;
  while(offset+12<=bytes.length){
    const len=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    const end=offset+12+len;
    if(end>bytes.length)throw Error('normal PNG truncated');
    if(type==='IDAT'){chunks.push(bytes.subarray(offset+8,offset+8+len));seenIDAT=true;}
    if(type==='IEND'){seenIEND=true;break;}
    offset=end;
  }
  if(!seenIDAT||!seenIEND)throw Error('normal PNG missing image data');
  const raw=zlib.inflateSync(Buffer.concat(chunks),{maxOutputLength:height*(1+width*bpp)});
  const stride=width*bpp;
  if(raw.length!==height*(stride+1))throw Error('normal PNG size mismatch');
  let src=0,prev=Buffer.alloc(stride),min=[255,255,255],max=[0,0,0],sumBlue=0;
  for(let y=0;y<height;y++){
    const kind=raw[src++],row=Buffer.allocUnsafe(stride);
    if(kind>4)throw Error('unsupported normal PNG filter');
    for(let i=0;i<stride;i++){
      const a=i>=bpp?row[i-bpp]:0,b=prev[i],c=i>=bpp?prev[i-bpp]:0;
      let prediction=0;
      if(kind===1)prediction=a;
      else if(kind===2)prediction=b;
      else if(kind===3)prediction=Math.floor((a+b)/2);
      else if(kind===4){
        const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);
        prediction=da<=db&&da<=dc?a:db<=dc?b:c;
      }
      row[i]=(raw[src++]+prediction)&255;
    }
    for(let x=0;x<stride;x+=bpp){
      for(let channel=0;channel<3;channel++){
        const value=row[x+channel];
        min[channel]=Math.min(min[channel],value);
        max[channel]=Math.max(max[channel],value);
      }
      sumBlue+=row[x+2];
    }
    prev=row;
  }
  const blueMean=sumBlue/(width*height);
  const variation=[0,1,2].map(i=>max[i]-min[i]);
  if(variation[0]<3||variation[1]<3||blueMean<100)
    throw Error('flat or black normal texture');
  return{width,height,variation,blueMean:+blueMean.toFixed(2)};
}
module.exports={decodeNormalQuality};
