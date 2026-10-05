// Lightweight image-space fidelity gate for the approved Living Watercolor sketches.
// Targets are measured from the four user-supplied reference images; the gate is advisory,
// not a substitute for human visual review.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export const WATERCOLOUR_REFERENCE_PROFILES=Object.freeze({
  house:Object.freeze({foregroundCoverage:.290,inkCoverage:.197,midWashCoverage:.261,edgeDensityForeground:.162,lumaMean:162.9,lumaStd:48.4,bboxArea:.471,centerX:.536,centerY:.557}),
  tree:Object.freeze({foregroundCoverage:.328,inkCoverage:.254,midWashCoverage:.305,edgeDensityForeground:.121,lumaMean:158.9,lumaStd:41.8,bboxArea:.568,centerX:.532,centerY:.484}),
  volcano:Object.freeze({foregroundCoverage:.311,inkCoverage:.196,midWashCoverage:.278,edgeDensityForeground:.114,lumaMean:175.4,lumaStd:42.1,bboxArea:.723,centerX:.523,centerY:.556}),
  plant:Object.freeze({foregroundCoverage:.312,inkCoverage:.196,midWashCoverage:.261,edgeDensityForeground:.214,lumaMean:169.4,lumaStd:49.0,bboxArea:.697,centerX:.563,centerY:.573})
});

function luminance(r,g,b){return r*.2126+g*.7152+b*.0722;}
function median(values){
  if(!values.length)return 0;const a=values.slice().sort((x,y)=>x-y),m=a.length>>1;
  return a.length%2?a[m]:(a[m-1]+a[m])*.5;
}
function pixelAt(data,w,x,y){const i=(y*w+x)*4;return[data[i],data[i+1],data[i+2]];}

export function measureWatercolorImageData(imageData,{foregroundThreshold=14,inkDelta=45,midDelta=18,edgeThreshold=10}={}){
  const {data,width:w,height:h}=imageData||{};if(!data||!w||!h)throw new Error('measureWatercolorImageData: valid ImageData required');
  const border=Math.max(2,Math.round(Math.min(w,h)*.06)),rs=[],gs=[],bs=[];
  const push=(x,y)=>{const [r,g,b]=pixelAt(data,w,x,y);rs.push(r);gs.push(g);bs.push(b);};
  for(let y=0;y<border;y++)for(let x=0;x<w;x++)push(x,y);
  for(let y=h-border;y<h;y++)for(let x=0;x<w;x++)push(x,y);
  for(let y=border;y<h-border;y++)for(let x=0;x<border;x++)push(x,y);
  for(let y=border;y<h-border;y++)for(let x=w-border;x<w;x++)push(x,y);
  const bg=[median(rs),median(gs),median(bs)],bgL=luminance(...bg);
  const fg=new Uint8Array(w*h),lum=new Float32Array(w*h);
  let fgCount=0,ink=0,mid=0,sum=0,sum2=0,minX=w,minY=h,maxX=-1,maxY=-1,cx=0,cy=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,j=i*4,r=data[j],g=data[j+1],b=data[j+2],l=luminance(r,g,b);lum[i]=l;
    const d=Math.hypot(r-bg[0],g-bg[1],b-bg[2]);if(d<=foregroundThreshold)continue;
    fg[i]=1;fgCount++;sum+=l;sum2+=l*l;cx+=x;cy+=y;
    if(l<bgL-inkDelta)ink++;if(l<bgL-midDelta)mid++;
    if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
  let edges=0;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(!fg[i])continue;
    const gx=(lum[i+1]-lum[i-1])*.5,gy=(lum[i+w]-lum[i-w])*.5;
    if(Math.hypot(gx,gy)>edgeThreshold)edges++;
  }
  const total=w*h,mean=fgCount?sum/fgCount:0,variance=fgCount?Math.max(0,sum2/fgCount-mean*mean):0;
  const bw=maxX>=minX?(maxX-minX+1)/w:0,bh=maxY>=minY?(maxY-minY+1)/h:0;
  return Object.freeze({
    foregroundCoverage:fgCount/total,inkCoverage:ink/total,midWashCoverage:mid/total,
    edgeDensityForeground:fgCount?edges/fgCount:0,lumaMean:mean,lumaStd:Math.sqrt(variance),
    bboxArea:bw*bh,centerX:fgCount?(cx/fgCount)/w:0,centerY:fgCount?(cy/fgCount)/h:0,
    background:Object.freeze(bg.map(v=>Math.round(v*10)/10))
  });
}

const TOL=Object.freeze({
  foregroundCoverage:.09,inkCoverage:.09,midWashCoverage:.10,edgeDensityForeground:.09,
  lumaMean:38,lumaStd:22,bboxArea:.20,centerX:.14,centerY:.14
});
const WEIGHTS=Object.freeze({
  foregroundCoverage:1.1,inkCoverage:1.5,midWashCoverage:1.35,edgeDensityForeground:1.5,
  lumaMean:1.1,lumaStd:.8,bboxArea:.7,centerX:.45,centerY:.45
});

export function scoreWatercolorMetrics(metrics,profileName,{tolerances=TOL}={}){
  const target=typeof profileName==='string'?WATERCOLOUR_REFERENCE_PROFILES[profileName]:profileName;
  if(!target)throw new Error('scoreWatercolorMetrics: unknown reference profile');
  let earned=0,total=0;const detail={};
  for(const [key,weight] of Object.entries(WEIGHTS)){
    const tol=tolerances[key]??TOL[key],delta=Math.abs((metrics[key]??0)-target[key]);
    const score=clamp(1-delta/Math.max(.0001,tol),0,1);
    detail[key]={score:Math.round(score*1000)/10,value:metrics[key],target:target[key],delta};
    earned+=score*weight;total+=weight;
  }
  const score=Math.round((earned/total)*1000)/10;
  return Object.freeze({score,pass:score>=85,profile:profileName,detail:Object.freeze(detail)});
}

export function readRendererImageData(renderer,{maxSize=512}={}){
  const gl=renderer?.getContext?.();if(!gl)throw new Error('readRendererImageData: renderer WebGL context required');
  const srcW=gl.drawingBufferWidth,srcH=gl.drawingBufferHeight;
  const pixels=new Uint8Array(srcW*srcH*4);gl.readPixels(0,0,srcW,srcH,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  const step=Math.max(1,Math.ceil(Math.max(srcW,srcH)/maxSize)),w=Math.ceil(srcW/step),h=Math.ceil(srcH/step),out=new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sx=Math.min(srcW-1,x*step),sy=Math.min(srcH-1,(h-1-y)*step),si=(sy*srcW+sx)*4,di=(y*w+x)*4;
    out[di]=pixels[si];out[di+1]=pixels[si+1];out[di+2]=pixels[si+2];out[di+3]=255;
  }
  return typeof ImageData!=='undefined'?new ImageData(out,w,h):{data:out,width:w,height:h};
}

export function scoreRendererAgainstReference(renderer,profileName,options={}){
  const imageData=readRendererImageData(renderer,options),metrics=measureWatercolorImageData(imageData,options);
  return Object.freeze({metrics,gate:scoreWatercolorMetrics(metrics,profileName,options)});
}
