import {buildOriginalSkyLight} from './original-sky-light.mjs';
/** Correctness-first independent sky edit: bounded full relight plus exact dirty-section diff.
 * Unlike Unity's incremental removal/addition queues, this rebuilds a bounded local volume.
 */
export function editOriginalSkyLight(state,{x,y,z,newOpacity},options={}){
 if(!state||!Array.isArray(state.size)||!(state.opacity instanceof Uint8Array)||!(state.sky instanceof Uint8Array))throw new TypeError('state');
 const [w,h,d]=state.size;
 if(![x,y,z].every(Number.isInteger)||x<0||x>=w||y<0||y>=h||z<0||z>=d||!Number.isInteger(newOpacity)||newOpacity<0||newOpacity>15)throw new RangeError('edit');
 const index=x+w*(z+d*y);
 if(state.opacity.length!==w*h*d||state.sky.length!==w*h*d)throw new RangeError('volume');
 const opacity=state.opacity.slice(),oldOpacity=opacity[index];opacity[index]=newOpacity;
 if(oldOpacity===newOpacity)return {state,changed:0,dirtySections:[],recomputed:false};
 const result=buildOriginalSkyLight({size:state.size,opacity,...options});
 const dirty=new Set();let changed=0;
 for(let i=0;i<state.sky.length;i++)if(result.sky[i]!==state.sky[i]){
  changed++;const cy=Math.floor(i/(w*d)),rem=i%(w*d),cz=Math.floor(rem/w),cx=rem%w;
  dirty.add(`${Math.floor(cx/16)},${Math.floor(cy/16)},${Math.floor(cz/16)}`);
 }
 return {state:{size:state.size,opacity,sky:result.sky},changed,dirtySections:[...dirty].sort(),recomputed:true};
}
