/**
 * CPU-painted atmospheric backplate and bounded lighting budget.
 * An optional view-only addition to the EXISTING AI3D renderer, not another engine.
 * Canvas work runs ONCE at startup; per-frame update touches no pixels.
 */
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const lerp=(a,b,t)=>a+(b-a)*t;
export const PROFILE=Object.freeze({
  low:{width:384,height:256,cloudOctaves:2,steamCount:4, fog:.0035,far:295,glow:false},
  balanced:{width:768,height:512,cloudOctaves:4,steamCount:8,fog:.0030,far:360,glow:true},
  high:{width:1024,height:640,cloudOctaves:5,steamCount:12,fog:.0027,far:415,glow:true},
  ultra:{width:1280,height:768,cloudOctaves:5,steamCount:16,fog:.0025,far:450,glow:true},
});
export function budgetFor(tier){return PROFILE[tier]||PROFILE.balanced;}
function hash(x,y,s){
  let v=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,2246822519))|0;
  v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967295;
}
function smooth(t){return t*t*(3-2*t);}
export function valueNoise(x,y,seed){
  const ix=Math.floor(x),iy=Math.floor(y),a=smooth(x-ix),b=smooth(y-iy);
  const n00=hash(ix,iy,seed),n10=hash(ix+1,iy,seed),
        n01=hash(ix,iy+1,seed),n11=hash(ix+1,iy+1,seed);
  return lerp(lerp(n00,n10,a),lerp(n01,n11,a),b);
}
export function fBm(x,y,seed,octaves){
  let amplitude=.56,weight=0,sum=0;
  for(let i=0;i<octaves;i++){
    sum+=amplitude*valueNoise(x,y,seed+i*29);
    weight+=amplitude;x*=2.07;y*=2.07;amplitude*=.49;
  }
  return sum/weight;
}
export function paintSky(ctx,width,height,{seed=20260925,octaves=4}={}){
  if(!Number.isInteger(width)||width<64||width>2048||
     !Number.isInteger(height)||height<64||height>1024)throw Error('sky budget exceeded');
  const img=ctx.createImageData(width,height),data=img.data;
  const glowX=.52,glowY=.76;
  for(let y=0;y<height;y++){
    const v=y/height,cloudBand=Math.exp(-Math.pow((v-.37)/.28,2));
    for(let x=0;x<width;x++){
      const u=x/width,n=fBm(u*6.4,v*5.2,seed,octaves),
            sm=fBm(u*14.1+9,v*10.2+3,seed+11,Math.max(2,octaves-1));
      const cloud=clamp((n*.84+sm*.16-.36)*2.1,0,.9)*cloudBand;
      const horizon=clamp((v-.52)*1.05,0,.36);
      const glow=Math.exp(-(((u-glowX)/.155)**2+((v-glowY)/.24)**2)*2.2);
      const haze=clamp((v-.65)*1.35,0,.45);
      const i=(y*width+x)*4;
      data[i]=clamp(7+cloud*38+horizon*27+glow*64+haze*26,0,255);
      data[i+1]=clamp(13+cloud*39+horizon*34+glow*23+haze*23,0,255);
      data[i+2]=clamp(23+cloud*47+horizon*44+glow*8+haze*24,0,255);
      data[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  // Low-opacity layered distant cloud banks: no real-time per-pixel volumes.
  for(let i=0;i<8;i++){
    const y=height*(.55+i*.046),offset=20+valueNoise(i,0,seed)*90;
    const g=ctx.createLinearGradient(0,y-38,0,y+offset);
    g.addColorStop(0,'rgba(28,41,53,0)');
    g.addColorStop(.5,'rgba(42,55,66,0.19)');
    g.addColorStop(1,'rgba(13,20,30,0)');
    ctx.fillStyle=g;ctx.fillRect(0,y-38,width,offset+40);
  }
  return {width,height,seed};
}
export function createPaintedSky(THREE,renderer,tier='balanced'){
  const budget=budgetFor(tier),canvas=document.createElement('canvas');
  canvas.width=budget.width;canvas.height=budget.height;
  paintSky(canvas.getContext('2d',{alpha:false,willReadFrequently:false}),
      canvas.width,canvas.height,{octaves:budget.cloudOctaves});
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.generateMipmaps=false;tex.minFilter=THREE.LinearFilter;
  const maxAnisotropy=renderer?.capabilities?.getMaxAnisotropy?.()||1;
  tex.anisotropy=Math.min(2,maxAnisotropy);
  return{texture:tex,pixelBytes:canvas.width*canvas.height*4,
    dispose(){tex.dispose();canvas.width=canvas.height=0;}};
}
export function shouldCullWithHysteresis(distance,visible,tier){
  const {far}=budgetFor(tier),band=11;
  return visible?distance<far+band:distance<far-band;
}
export function fogVisibility(distance,density){return Math.exp(-Math.pow(Math.max(0,distance)*density,2));}
