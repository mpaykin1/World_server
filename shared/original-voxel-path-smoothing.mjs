/** Original path postprocessor. World callbacks describe passable headroom and safe floor. */
export function smoothOriginalVoxelPath(path,{canStand,width=0.6,height=2,maxSamples=256}={}){
 if(!Array.isArray(path)||path.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)))||typeof canStand!=='function'||!Number.isFinite(width)||width<=0||width>8||!Number.isInteger(height)||height<1||height>8||!Number.isInteger(maxSamples)||maxSamples<1)throw new TypeError('path');
 if(path.length<3)return path.map(p=>[...p]);
 const visible=(a,b)=>{
  if(Math.floor(a[1])!==Math.floor(b[1]))return false;
  const length=Math.hypot(b[0]-a[0],b[2]-a[2]),count=Math.ceil(length*5);
  if(count>maxSamples)return false;
  const radius=width/2+0.001;
  for(let i=0;i<=count;i++){
   const t=count===0?0:i/count,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=Math.floor(a[1]);
   for(const sx of [-1,1])for(const sz of [-1,1]){
    if(!canStand(Math.floor(x+sx*radius),y,Math.floor(z+sz*radius),height))return false;
   }
  }
  return true;
 };
 const out=[[...path[0]]];let i=0;
 while(i<path.length-1){
  let far=i+1;
  for(let j=i+2;j<path.length;j++)if(visible(path[i],path[j]))far=j;
  out.push([...path[far]]);i=far;
 }
 return out;
}
