/** Original engine-neutral PBR map synthesis from a deterministic height field. */
export function synthesizeOriginalPBR({width,height,heights,roughness=0.75,metallic=0,emissive=0,occlusionStrength=0.65,normalStrength=2,wrap=true}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height>1048576||!(heights instanceof Uint8Array)||heights.length!==width*height||[roughness,metallic,emissive,occlusionStrength,normalStrength].some(x=>!Number.isFinite(x))||[roughness,metallic,emissive,occlusionStrength].some(x=>x<0||x>1)||normalStrength<0||normalStrength>16)throw new RangeError('PBR input');
 const normal=new Uint8Array(width*height*4),orme=new Uint8Array(width*height*4);
 const at=(x,y)=>heights[(wrap?(y+height)%height:Math.max(0,Math.min(height-1,y)))*width+(wrap?(x+width)%width:Math.max(0,Math.min(width-1,x)))];
 const byte=v=>Math.round(Math.max(0,Math.min(1,v))*255);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dx=(at(x+1,y)-at(x-1,y))/510*normalStrength,dy=(at(x,y+1)-at(x,y-1))/510*normalStrength;
  const len=Math.hypot(dx,dy,1),i=(y*width+x)*4;
  normal[i]=byte((-dx/len+1)/2);normal[i+1]=byte((-dy/len+1)/2);normal[i+2]=byte((1/len+1)/2);normal[i+3]=255;
  const local=at(x,y)/255,neighbors=(at(x-1,y)+at(x+1,y)+at(x,y-1)+at(x,y+1))/1020;
  const cavity=Math.max(0,neighbors-local),ao=1-occlusionStrength*cavity;
  orme[i]=byte(ao);orme[i+1]=byte(roughness);orme[i+2]=byte(metallic);orme[i+3]=byte(emissive);
 }
 return {normal,orme,width,height,channels:{normal:'RGBA xyz alpha',orme:'RGBA occlusion roughness metallic emissive'}};
}
