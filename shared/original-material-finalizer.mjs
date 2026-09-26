/** Standalone material finalization for original procedural recipes.
 * RGBA albedo, 8-bit height, optional 8-bit roughness/metal/emission -> normal and ORME.
 */
export function finalizeOriginalMaterial({size,albedo,height,roughness,metallic,emission,cutout=false,normalStrength=2,bakeAO=.5}={}){
 const n=size*size;
 if(!Number.isInteger(size)||size<2||size>512||!(albedo instanceof Uint8Array)||albedo.length!==n*4||!(height instanceof Uint8Array)||height.length!==n||![roughness,metallic,emission].every(a=>a===undefined||(a instanceof Uint8Array&&a.length===n))||![normalStrength,bakeAO].every(Number.isFinite)||normalStrength<0||normalStrength>16||bakeAO<0||bakeAO>1)throw new RangeError('material');
 const color=albedo.slice(),normal=new Uint8Array(n*4),orme=new Uint8Array(n*4);
 const wrap=(a)=>((a%size)+size)%size,at=(x,y)=>wrap(x)+size*wrap(y),clamp=v=>Math.max(0,Math.min(255,Math.round(v)));
 if(cutout)for(let pass=0;pass<3;pass++){
  const src=color.slice();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const i=x+size*y;if(src[4*i+3]>=128)continue;
   let count=0,r=0,g=0,b=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=size||yy>=size)continue;
    const j=xx+size*yy;if(src[4*j+3]<128)continue;
    r+=src[4*j];g+=src[4*j+1];b+=src[4*j+2];count++;
   }
   if(count){color[4*i]=clamp(r/count);color[4*i+1]=clamp(g/count);color[4*i+2]=clamp(b/count);}
  }
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=x+size*y,k=i*4,h=(dx,dy)=>height[at(x+dx,y+dy)]/255;
  let avg=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)avg+=h(dx,dy);avg/=25;
  const cavity=Math.max(0,Math.min(1,(avg-h(0,0))*3.5)),ao=1-cavity*.75;
  for(let ch=0;ch<3;ch++)color[k+ch]=clamp(color[k+ch]*(1-cavity*bakeAO));
  const gx=((h(1,-1)+2*h(1,0)+h(1,1))-(h(-1,-1)+2*h(-1,0)+h(-1,1)))*.25;
  const gy=((h(-1,1)+2*h(0,1)+h(1,1))-(h(-1,-1)+2*h(0,-1)+h(1,-1)))*.25;
  const len=Math.hypot(gx*normalStrength,gy*normalStrength,1);
  normal[k]=clamp((1-gx*normalStrength/len)*127.5);
  normal[k+1]=clamp((1-gy*normalStrength/len)*127.5);
  normal[k+2]=clamp((1+1/len)*127.5);normal[k+3]=255;
  orme[k]=clamp(ao*255);orme[k+1]=Math.max(5,roughness?.[i]??217);
  orme[k+2]=metallic?.[i]??0;orme[k+3]=emission?.[i]??0;
 }
 return {size,albedo:color,normal,orme};
}
