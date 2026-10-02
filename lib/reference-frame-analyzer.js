'use strict';

const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
const round=(value,digits=4)=>Number((Number(value)||0).toFixed(digits));

function normalizeFrame(frame){
  const width=Math.max(1,Math.trunc(Number(frame?.width)||0));
  const height=Math.max(1,Math.trunc(Number(frame?.height)||0));
  const pixels=frame?.pixels;
  if(!pixels||pixels.length!==width*height*4)throw new TypeError('RGBA frame evidence required');
  return{width,height,pixels};
}

function quantizedKey(r,g,b){return `${r>>5}:${g>>5}:${b>>5}`;}
function luminance(r,g,b){return(0.2126*r+0.7152*g+0.0722*b)/255;}
function saturation(r,g,b){
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  return max===0?0:(max-min)/max;
}

function analyzeFrame(input,previousInput=null){
  const frame=normalizeFrame(input);
  const previous=previousInput?normalizeFrame(previousInput):null;
  const sameSize=previous&&previous.width===frame.width&&previous.height===frame.height;
  const palette=new Set();
  let sumL=0,sumL2=0,sumSat=0,warm=0,cool=0,dark=0,highlight=0,warmHighlight=0;
  let edges=0,neighbors=0,flat=0,motion=0,motionSamples=0;
  const {width,height,pixels}=frame;

  for(let y=0;y<height;y+=1){
    for(let x=0;x<width;x+=1){
      const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3]/255;
      if(a<0.05)continue;
      const l=luminance(r,g,b),sat=saturation(r,g,b);
      sumL+=l;sumL2+=l*l;sumSat+=sat;
      if(r>b+18)warm++;if(b>r+18)cool++;if(l<0.22)dark++;if(l>0.78)highlight++;
      if(l>0.66&&r>b+22&&r>g*0.92)warmHighlight++;
      palette.add(quantizedKey(r,g,b));

      if(x>0){
        const j=i-4,other=luminance(pixels[j],pixels[j+1],pixels[j+2]);
        const delta=Math.abs(l-other);neighbors++;if(delta>0.14)edges++;if(delta<0.015)flat++;
      }
      if(y>0){
        const j=i-width*4,other=luminance(pixels[j],pixels[j+1],pixels[j+2]);
        const delta=Math.abs(l-other);neighbors++;if(delta>0.14)edges++;if(delta<0.015)flat++;
      }
      if(sameSize){
        motion+=(Math.abs(r-previous.pixels[i])+Math.abs(g-previous.pixels[i+1])+Math.abs(b-previous.pixels[i+2]))/(255*3);
        motionSamples++;
      }
    }
  }
  const count=Math.max(1,width*height);
  const meanL=sumL/count,variance=Math.max(0,sumL2/count-meanL*meanL);
  const contrast=Math.sqrt(variance),edgeDensity=edges/Math.max(1,neighbors),flatNeighborRatio=flat/Math.max(1,neighbors);
  const paletteComplexity=clamp01(palette.size/64);
  const pixelArtSignal=clamp01((1-paletteComplexity)*0.45+edgeDensity*0.35+flatNeighborRatio*0.20);
  const glowSignal=clamp01((warmHighlight/count)*3.4+(highlight/count)*1.7+contrast*0.65);

  return{
    width,height,aspect:round(width/height),meanLuma:round(meanL),contrast:round(contrast),
    meanSaturation:round(sumSat/count),warmRatio:round(warm/count),coolRatio:round(cool/count),
    darkRatio:round(dark/count),highlightRatio:round(highlight/count),warmHighlightRatio:round(warmHighlight/count),
    quantizedColors:palette.size,paletteComplexity:round(paletteComplexity),edgeDensity:round(edgeDensity),
    flatNeighborRatio:round(flatNeighborRatio),pixelArtSignal:round(pixelArtSignal),glowSignal:round(glowSignal),
    motionEnergy:round(motion/Math.max(1,motionSamples))
  };
}

function average(items,key){
  if(!items.length)return 0;
  return items.reduce((sum,item)=>sum+(Number(item[key])||0),0)/items.length;
}

function analyzeReferenceFrames(frames=[]){
  if(!Array.isArray(frames)||frames.length===0)throw new TypeError('At least one RGBA frame is required');
  const analyzed=[];
  for(let i=0;i<frames.length;i+=1)analyzed.push(analyzeFrame(frames[i],i?frames[i-1]:null));
  const motionFrames=analyzed.slice(1);
  const meanLumas=analyzed.map(x=>x.meanLuma);
  const lumaMean=average(analyzed,'meanLuma');
  const lumaVariance=meanLumas.reduce((sum,v)=>sum+(v-lumaMean)**2,0)/Math.max(1,meanLumas.length);
  return{
    frameCount:analyzed.length,
    width:analyzed[0].width,height:analyzed[0].height,aspect:analyzed[0].aspect,
    meanLuma:round(lumaMean),contrast:round(average(analyzed,'contrast')),
    meanSaturation:round(average(analyzed,'meanSaturation')),warmRatio:round(average(analyzed,'warmRatio')),
    coolRatio:round(average(analyzed,'coolRatio')),darkRatio:round(average(analyzed,'darkRatio')),
    highlightRatio:round(average(analyzed,'highlightRatio')),warmHighlightRatio:round(average(analyzed,'warmHighlightRatio')),
    paletteComplexity:round(average(analyzed,'paletteComplexity')),
    quantizedColors:Math.round(average(analyzed,'quantizedColors')),edgeDensity:round(average(analyzed,'edgeDensity')),
    flatNeighborRatio:round(average(analyzed,'flatNeighborRatio')),pixelArtSignal:round(average(analyzed,'pixelArtSignal')),
    glowSignal:round(average(analyzed,'glowSignal')),motionEnergy:round(average(motionFrames,'motionEnergy')),
    temporalLumaFlicker:round(Math.sqrt(lumaVariance)),frames:analyzed
  };
}

module.exports={analyzeFrame,analyzeReferenceFrames};
