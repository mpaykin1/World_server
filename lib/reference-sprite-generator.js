'use strict';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const byte=v=>Math.max(0,Math.min(255,Math.round(v)));
const rgb=color=>Array.isArray(color)?color.slice(0,3):[(color>>>16)&255,(color>>>8)&255,color&255];

function inside(part,nx,ny){
  const x=Number(part.x)||0,y=Number(part.y)||0,w=Math.max(0.001,Number(part.w)||0.1),h=Math.max(0.001,Number(part.h)||0.1);
  const u=(nx-x)/w,v=(ny-y)/h;
  if(part.shape==='ellipse')return((u-0.5)/0.5)**2+((v-0.5)/0.5)**2<=1;
  if(part.shape==='triangle')return u>=0&&u<=1&&v>=0&&v<=1&&v>=Math.abs(u-0.5)*1.65-0.05;
  return u>=0&&u<=1&&v>=0&&v<=1;
}

function shadeColor(color,nx,ny,part,bands,light){
  const base=rgb(color),cx=(Number(part.x)||0)+(Number(part.w)||0.1)/2,cy=(Number(part.y)||0)+(Number(part.h)||0.1)/2;
  const dx=nx-cx,dy=ny-cy,len=Math.hypot(dx,dy)||1;
  const dot=(dx/len)*light[0]+(dy/len)*light[1];
  const raw=clamp(0.78+dot*0.18,0.56,1.08);
  const steps=Math.max(1,Math.trunc(bands)||2),q=Math.round(raw*(steps-1))/(steps-1||1);
  const factor=steps===1?0.9:clamp(q,0.58,1.08);
  return base.map(v=>byte(v*factor));
}

function generateSpriteFrame(spec={}){
  const width=Math.max(4,Math.min(256,Math.trunc(spec.width)||32));
  const height=Math.max(4,Math.min(256,Math.trunc(spec.height)||32));
  const parts=Array.isArray(spec.parts)?spec.parts:[];
  const palette=(spec.palette||[0xd8c080,0x5a4650,0x28242c]).map(rgb);
  const pixels=new Uint8Array(width*height*4),bands=clamp(spec.shadingBands||3,1,5);
  const light=Array.isArray(spec.lightDirection)?spec.lightDirection:[-0.6,-0.8];

  for(const part of parts){
    const color=part.color!=null?rgb(part.color):palette[Math.max(0,Math.min(palette.length-1,Math.trunc(part.colorIndex)||0))];
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
      const nx=(px+0.5)/width,ny=(py+0.5)/height;
      if(!inside(part,nx,ny))continue;
      const [r,g,b]=shadeColor(color,nx,ny,part,bands,light),i=(py*width+px)*4;
      pixels[i]=r;pixels[i+1]=g;pixels[i+2]=b;pixels[i+3]=255;
    }
  }

  const outlineWidth=spec.outline==='strong'?2:spec.outline===false?0:1;
  if(outlineWidth){
    const source=pixels.slice(),outline=rgb(spec.outlineColor==null?0x17151c:spec.outlineColor);
    for(let py=0;py<height;py++)for(let px=0;px<width;px++){
      const i=(py*width+px)*4;if(source[i+3])continue;
      let near=false;
      for(let dy=-outlineWidth;dy<=outlineWidth&&!near;dy++)for(let dx=-outlineWidth;dx<=outlineWidth;dx++){
        const x=px+dx,y=py+dy;if(x<0||x>=width||y<0||y>=height)continue;
        if(source[(y*width+x)*4+3]){near=true;break;}
      }
      if(near){pixels[i]=outline[0];pixels[i+1]=outline[1];pixels[i+2]=outline[2];pixels[i+3]=255;}
    }
  }
  return{width,height,pixels};
}

function generateSpriteAtlas(spec={},poses=[]){
  const list=poses.length?poses:[{}],frames=list.map(pose=>generateSpriteFrame({...spec,...pose,parts:pose.parts||spec.parts}));
  const width=frames[0].width*frames.length,height=frames[0].height,pixels=new Uint8Array(width*height*4);
  frames.forEach((frame,index)=>{
    for(let y=0;y<height;y++){
      const src=y*frame.width*4,dst=(y*width+index*frame.width)*4;
      pixels.set(frame.pixels.subarray(src,src+frame.width*4),dst);
    }
  });
  return{width,height,frameWidth:frames[0].width,frameHeight:height,frames:frames.length,pixels};
}

module.exports={generateSpriteFrame,generateSpriteAtlas};
