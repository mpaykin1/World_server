'use strict';
const clamp=v=>Math.max(0,Math.min(1,Number(v)||0));
function image(i){const width=Math.max(1,Math.trunc(Number(i?.width)||0)),height=Math.max(1,Math.trunc(Number(i?.height)||0)),pixels=i?.pixels;if(!pixels||pixels.length!==width*height*4)throw new TypeError('RGBA image evidence required');return{width,height,pixels};}
function luma(r,g,b){return(.2126*r+.7152*g+.0722*b)/255;}
function features(input,{maxSide=128,foregroundThreshold=.09}={}){
  const im=image(input),step=Math.max(1,Math.ceil(Math.max(im.width,im.height)/maxSide)),samples=[],border=[];
  for(let y=0;y<im.height;y+=step)for(let x=0;x<im.width;x+=step){const o=(y*im.width+x)*4,r=im.pixels[o],g=im.pixels[o+1],b=im.pixels[o+2],a=im.pixels[o+3]/255;if(a<=.02)continue;const p={x:x/im.width,y:y/im.height,r,g,b,l:luma(r,g,b)};samples.push(p);if(x<step||y<step||x>=im.width-step||y>=im.height-step)border.push(p);}
  if(!samples.length)return{lumaMean:0,lumaStd:0,saturation:0,edgeDensity:0,foregroundCoverage:0,centerX:.5,centerY:.5,histogram:Array(64).fill(0)};
  const bg=(border.length?border:samples).reduce((a,p)=>([a[0]+p.r,a[1]+p.g,a[2]+p.b]),[0,0,0]).map(v=>v/Math.max(1,border.length||samples.length));
  let sum=0,sum2=0,sat=0,edges=0,edgeN=0,fg=0,cx=0,cy=0;const hist=Array(64).fill(0),grid=new Map();
  for(const p of samples){sum+=p.l;sum2+=p.l*p.l;sat+=(Math.max(p.r,p.g,p.b)-Math.min(p.r,p.g,p.b))/255;const bin=(Math.min(3,p.r>>6)<<4)|(Math.min(3,p.g>>6)<<2)|Math.min(3,p.b>>6);hist[bin]++;const d=Math.hypot(p.r-bg[0],p.g-bg[1],p.b-bg[2])/441.673;if(d>foregroundThreshold){fg++;cx+=p.x;cy+=p.y;}grid.set(Math.round(p.x*im.width/step)+','+Math.round(p.y*im.height/step),p.l);}
  for(const [k,v] of grid){const [x,y]=k.split(',').map(Number);for(const q of [[x+1,y],[x,y+1]]){const n=grid.get(q[0]+','+q[1]);if(n===undefined)continue;edgeN++;if(Math.abs(v-n)>.08)edges++;}}
  const n=samples.length,mean=sum/n,variance=Math.max(0,sum2/n-mean*mean),hn=hist.reduce((a,b)=>a+b,0)||1;
  return{lumaMean:+mean.toFixed(4),lumaStd:+Math.sqrt(variance).toFixed(4),saturation:+(sat/n).toFixed(4),edgeDensity:+(edgeN?edges/edgeN:0).toFixed(4),foregroundCoverage:+(fg/n).toFixed(4),centerX:+(fg?cx/fg:.5).toFixed(4),centerY:+(fg?cy/fg:.5).toFixed(4),histogram:hist.map(v=>v/hn)};
}
function near(a,b,scale=1){return clamp(1-Math.abs((a??0)-(b??0))*scale);}
function histogramFidelity(a,b){let d=0;for(let i=0;i<Math.max(a.length,b.length);i++)d+=Math.abs((a[i]||0)-(b[i]||0));return clamp(1-d/2);}
function comparePerceptual(reference,runtime,options={}){
  const a=features(reference,options),b=features(runtime,options);
  const palette=histogramFidelity(a.histogram,b.histogram);
  const lighting=clamp(near(a.lumaMean,b.lumaMean,1.4)*.55+near(a.lumaStd,b.lumaStd,2)*.45);
  const detail=near(a.edgeDensity,b.edgeDensity,2.4);
  const centerDistance=Math.hypot(a.centerX-b.centerX,a.centerY-b.centerY);
  const composition=clamp(near(a.foregroundCoverage,b.foregroundCoverage,1.6)*.55+clamp(1-centerDistance*1.8)*.45);
  const materialReadability=clamp(near(a.saturation,b.saturation,1.5)*.45+near(a.lumaStd,b.lumaStd,2)*.55);
  const score=clamp(composition*.28+lighting*.24+palette*.2+detail*.16+materialReadability*.12);
  return{compositionFidelity:+composition.toFixed(4),lightingFidelity:+lighting.toFixed(4),paletteFidelity:+palette.toFixed(4),detailFidelity:+detail.toFixed(4),materialReadability:+materialReadability.toFixed(4),score:+score.toFixed(4),referenceFeatures:a,runtimeFeatures:b,method:'cpu-perceptual-grammar-v1'};
}
module.exports={measurePerceptualFeatures:features,comparePerceptual};
