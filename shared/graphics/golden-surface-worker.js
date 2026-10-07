'use strict';
(function(){
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function seed(label='default'){let h=2166136261;for(const ch of String(label)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function noise(x,y,s){let h=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^s)>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return((h^(h>>>16))>>>0)/4294967295;}
  self.onmessage=(event)=>{
    const m=event.data||{},id=m.id,size=Math.max(8,Math.min(128,Number(m.size)||32));
    try{
      if(typeof OffscreenCanvas==='undefined')throw new Error('OffscreenCanvas unavailable');
      const canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('2d context unavailable');
      const image=ctx.createImageData(size,size),s=seed(m.semantic),j=Math.max(0,Number(m.roughJitter)||.1);
      for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        const i=(y*size+x)*4,n=noise(x,y,s);
        if(m.kind==='normal'){
          const nx=(noise((x+1)%size,y,s)-n)*.55,ny=(noise(x,(y+1)%size,s)-n)*.55,iz=1/Math.hypot(nx,ny,1);
          image.data[i]=Math.round((-.5*nx*iz+.5)*255);image.data[i+1]=Math.round((-.5*ny*iz+.5)*255);image.data[i+2]=Math.round((.5*iz+.5)*255);
        }else{const v=clamp(.90+(n-.5)*j*1.8,.72,1);image.data[i]=image.data[i+1]=image.data[i+2]=Math.round(v*255);}
        image.data[i+3]=255;
      }
      ctx.putImageData(image,0,0);const out=ctx.getImageData(0,0,size,size).data;
      self.postMessage({id,size,buffer:out.buffer},[out.buffer]);
    }catch(error){self.postMessage({id,error:String(error?.message||error)});}
  };
})();
