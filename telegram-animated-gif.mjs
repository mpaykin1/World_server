// Indexed GIF89a encoder. Streaming-compatible, deterministic and dependency-free.
// Every GIF frame is the current saved world; animation only changes weather,
// smoke, water and construction machinery, never the game arithmetic.
import {PALETTE,WIDTH,HEIGHT,renderWorldFrame,animateWorldFrame} from './telegram-animated-scene.mjs';
function words(n){return [n&255,(n>>>8)&255];}
function lzw(pixels,minSize=5){
  const clear=1<<minSize,end=clear+1,bytes=[];
  const dict=new Uint16Array(4096*32);
  let next,size,acc=0,bits=0;
  const emit=code=>{
    acc|=code<<bits;bits+=size;
    while(bits>=8){bytes.push(acc&255);acc>>>=8;bits-=8;}
  };
  const reset=()=>{dict.fill(0);next=end+1;size=minSize+1;};
  reset();emit(clear);
  let prefix=pixels[0]||0;
  for(let i=1;i<pixels.length;i++){
    const value=pixels[i],key=prefix*32+value,found=dict[key];
    if(found!==0){prefix=found;continue;}
    emit(prefix);
    if(next<4096){
      dict[key]=next++;
      if(next>(1<<size)&&size<12)size++;
    }else{emit(clear);reset();}
    prefix=value;
  }
  emit(prefix);emit(end);
  if(bits)bytes.push(acc&255);
  const blocks=[];
  for(let i=0;i<bytes.length;i+=255){const size=Math.min(255,bytes.length-i);blocks.push(size,...bytes.slice(i,i+size));}
  blocks.push(0);
  return blocks;
}
export function encodeGif(frames,{width=WIDTH,height=HEIGHT,delay=45,regions=null}={}){
  if(!frames.length||frames.length>12)throw Error('Invalid GIF frame count');
  const areas=regions||frames.map(()=>({left:0,top:0,width,height}));
  if(areas.length!==frames.length||frames.some((p,i)=>p.length!==areas[i].width*areas[i].height||
    areas[i].left<0||areas[i].top<0||areas[i].left+areas[i].width>width||
    areas[i].top+areas[i].height>height))throw Error('Invalid GIF frame area');
  const out=[...new TextEncoder().encode('GIF89a'),...words(width),...words(height),0xf4,0,0,...PALETTE];
  out.push(0x21,0xff,11,...new TextEncoder().encode('NETSCAPE2.0'),3,1,0,0,0);
  for(let i=0;i<frames.length;i++){
    const p=frames[i],a=areas[i];
    out.push(0x21,0xf9,4,0x04,...words(delay),0,0);
    out.push(0x2c,...words(a.left),...words(a.top),...words(a.width),...words(a.height),0,5,...lzw(p),0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}
function cropPixels(full,{left,top,width,height}){
  const part=new Uint8Array(width*height);
  for(let row=0;row<height;row++)part.set(
    full.subarray((top+row)*WIDTH+left,(top+row)*WIDTH+left+width),row*width);
  return part;
}
export function animatedWorldGif(world){
  const base=renderWorldFrame(world,0),overlay=animateWorldFrame(world,base);
  const shown=world.projects?.slice(-12)||[];
  let area={left:0,top:0,width:180,height:36};
  if(shown.length){area={left:151,top:54,width:105,height:106};}
  else if(world.land?.coast){area={left:0,top:140,width:WIDTH,height:20};}
  return encodeGif([base,cropPixels(overlay,area)],{
    regions:[{left:0,top:0,width:WIDTH,height:HEIGHT},area]
  });
}
