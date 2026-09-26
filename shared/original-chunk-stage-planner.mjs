/** Original pure chunk scheduling planner; does not dispatch jobs or touch a renderer. */
export const ORIGINAL_CHUNK_STAGE=Object.freeze({missing:0,terrain:1,decorated:2,lit:3,meshed:4});
const key=(x,z)=>x+','+z;
export function planOriginalChunkStages({center=[0,0],radius=4,chunks=new Map(),maxJobs=8}={}){
 if(!Array.isArray(center)||center.length!==2||center.some(v=>!Number.isSafeInteger(v)))throw new TypeError('center');
 if(!Number.isInteger(radius)||radius<0||radius>32||!Number.isInteger(maxJobs)||maxJobs<0||maxJobs>128)throw new RangeError('budget');
 const candidates=[];
 for(let dz=-radius-2;dz<=radius+2;dz++)for(let dx=-radius-2;dx<=radius+2;dx++){
  const dist=Math.max(Math.abs(dx),Math.abs(dz));if(dist>radius+2)continue;
  const x=center[0]+dx,z=center[1]+dz,c=chunks.get(key(x,z));
  const stage=c?.stage??0,revision=c?.revision??0;
  if(!Number.isSafeInteger(revision)||revision<0||!Number.isInteger(stage)||stage<0||stage>4)throw new TypeError('chunk state');
  const neighborsAt=needed=>{
   for(let nz=-1;nz<=1;nz++)for(let nx=-1;nx<=1;nx++){
    if((chunks.get(key(x+nx,z+nz))?.stage??0)<needed)return false;
   }
   return true;
  };
  let action=null;
  if(stage===0)action='terrain';
  else if(stage===1&&dist<=radius+1&&neighborsAt(1))action='decorate';
  else if(stage===2&&dist<=radius&&neighborsAt(2))action='light';
  else if(stage===3&&dist<=radius&&neighborsAt(3))action='mesh';
  if(action)candidates.push({x,z,action,revision,distance:dx*dx+dz*dz});
 }
 const order={mesh:0,light:1,decorate:2,terrain:3};
 candidates.sort((a,b)=>a.distance-b.distance||order[a.action]-order[b.action]||a.x-b.x||a.z-b.z);
 return candidates.slice(0,maxJobs);
}
export function acceptOriginalChunkResult(current,result){
 if(!current||!result||!Number.isSafeInteger(current.revision)||!Number.isSafeInteger(result.revision))return false;
 return current.revision===result.revision&&current.stage===result.expectedStage;
}
