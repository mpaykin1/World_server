(function (root, factory) {
  'use strict';
  const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PixelAtlasBuilder=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const VERSION='2.0.0';
  function nextPow2(v){let n=1;while(n<v)n<<=1;return n;}
  function normalizeItems(items){return (items||[]).map((item,index)=>({key:String(item.key||item.name||index),source:item.source||item.url||item.image,width:Number(item.width)||0,height:Number(item.height)||0,pivot:item.pivot||[0.5,0.5],profile:item.profile||null,tags:Array.isArray(item.tags)?item.tags:[]}));}
  function packRects(items,options){
    const opts=options||{},padding=Math.max(0,Number(opts.padding??2)),maxSize=Math.max(64,Number(opts.maxSize)||4096),powerOfTwo=Boolean(opts.powerOfTwo);const input=normalizeItems(items).map(i=>({...i,w:i.width+padding*2,h:i.height+padding*2})).sort((a,b)=>b.h-a.h||b.w-a.w);let width=Math.max(64,Math.min(maxSize,Number(opts.width)||512));let shelves=[],height=padding;
    function attempt(w){shelves=[];height=padding;const placed=[];for(const item of input){if(item.w>w) return null;let shelf=null;for(const s of shelves){if(item.h<=s.h&&s.x+item.w<=w){shelf=s;break;}}if(!shelf){shelf={x:padding,y:height,h:item.h};shelves.push(shelf);height+=item.h;if(height>maxSize)return null;}placed.push({...item,x:shelf.x+padding,y:shelf.y+padding});shelf.x+=item.w;}return placed;}
    let placed=attempt(width);while(!placed&&width<maxSize){width=Math.min(maxSize,width*2);placed=attempt(width);}if(!placed)throw new Error('Atlas exceeds maxSize');let h=Math.max(1,height+padding);if(powerOfTwo){width=nextPow2(width);h=nextPow2(h);}if(h>maxSize)throw new Error('Atlas height exceeds maxSize');return {width,height:h,padding,items:placed.map(({w,h,...x})=>x)};
  }
  async function loadImage(source){if(source&&typeof source!=='string')return source;const res=await fetch(source,{mode:'cors',credentials:'omit',cache:'force-cache'});if(!res.ok)throw new Error(`Asset load failed: ${res.status}`);const blob=await res.blob();if(root.createImageBitmap)return await root.createImageBitmap(blob,{premultiplyAlpha:'premultiply'});return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=URL.createObjectURL(blob);});}
  async function build(items,options){
    const normalized=normalizeItems(items);for(const item of normalized){if(!item.width||!item.height){const img=await loadImage(item.source);item.image=img;item.width=img.width;item.height=img.height;}}
    const packed=packRects(normalized,options);const canvas=(options&&options.canvas)||((typeof OffscreenCanvas!=='undefined')?new OffscreenCanvas(packed.width,packed.height):root.document&&root.document.createElement('canvas'));if(!canvas)throw new Error('Canvas unavailable for atlas build');canvas.width=packed.width;canvas.height=packed.height;const ctx=canvas.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,packed.width,packed.height);const manifest={schema:'pixel-atlas/v2',version:2,width:packed.width,height:packed.height,padding:packed.padding,frames:{}};
    for(const p of packed.items){const src=normalized.find(x=>x.key===p.key);const img=src.image||await loadImage(src.source);ctx.drawImage(img,p.x,p.y,src.width,src.height);manifest.frames[p.key]={x:p.x,y:p.y,w:src.width,h:src.height,uv:[p.x/packed.width,p.y/packed.height,src.width/packed.width,src.height/packed.height],pivot:src.pivot,profile:src.profile,tags:src.tags};}
    return {canvas,manifest,toBlob:async(type='image/png',quality)=>{if(canvas.convertToBlob)return canvas.convertToBlob({type,quality});return new Promise(resolve=>canvas.toBlob(resolve,type,quality));}};
  }
  return Object.freeze({VERSION,nextPow2,normalizeItems,packRects,build});
});
