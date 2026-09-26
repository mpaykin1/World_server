/** Original deterministic tileable 2D noise primitives; no upstream code or assets. */
const fract=x=>x-Math.floor(x),smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
function hash(x,y,seed){let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,2246822519))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;}
export function originalTileableValueNoise(u,v,{periodX=4,periodY=periodX,seed=1}={}){
 if(![u,v,periodX,periodY,seed].every(Number.isFinite)||![periodX,periodY].every(n=>Number.isInteger(n)&&n>=1&&n<=1024))throw new RangeError('noise arguments');
 const x=u*periodX,y=v*periodY,ix=Math.floor(x),iy=Math.floor(y),tx=smooth(fract(x)),ty=smooth(fract(y)),wrap=(a,p)=>((a%p)+p)%p;
 const h=(a,b)=>hash(wrap(a,periodX),wrap(b,periodY),seed);
 return mix(mix(h(ix,iy),h(ix+1,iy),tx),mix(h(ix,iy+1),h(ix+1,iy+1),tx),ty);
}
export function originalTileableFbm(u,v,{cellsX=4,cellsY=cellsX,octaves=4,seed=1,gain=.5}={}){
 if(!Number.isInteger(octaves)||octaves<1||octaves>12||!Number.isFinite(gain)||gain<=0||gain>1)throw new RangeError('fBm arguments');
 let sum=0,weight=0,amplitude=1;
 for(let octave=0;octave<octaves;octave++){
  sum+=originalTileableValueNoise(u,v,{periodX:cellsX*2**octave,periodY:cellsY*2**octave,seed:seed+octave*1013})*amplitude;
  weight+=amplitude;amplitude*=gain;
 }
 return sum/weight;
}
export function originalTileableWorley(u,v,{cells=5,seed=1,jitter=.8}={}){
 if(!Number.isInteger(cells)||cells<1||cells>128||!Number.isFinite(jitter)||jitter<0||jitter>1)throw new RangeError('Worley arguments');
 const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y),wrap=a=>((a%cells)+cells)%cells;
 let f1=Infinity,f2=Infinity,id=0;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const cx=ix+dx,cy=iy+dy,wx=wrap(cx),wy=wrap(cy);
  const px=cx+.5+(hash(wx,wy,seed)-.5)*jitter,py=cy+.5+(hash(wx,wy,seed+1)-.5)*jitter;
  const distance=Math.hypot(px-x,py-y);
  if(distance<f1){f2=f1;f1=distance;id=(hash(wx,wy,seed+2)*4294967296)>>>0;}
  else if(distance<f2)f2=distance;
 }
 return {f1,f2,id,edge:f2-f1};
}
