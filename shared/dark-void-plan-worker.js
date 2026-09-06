import {buildWorldShape} from './world-shape-library.mjs';

export function planWorldShape(intent,{origin={x:0,y:0,z:0},yaw=0,palette,maxBlocks=7000}={}){
  return buildWorldShape(intent,{origin,yaw,palette,maxBlocks});
}

if(typeof self!=='undefined'&&'postMessage'in self){
  self.onmessage=e=>{const{id,intent,options}=e.data||{};try{
    const blocks=planWorldShape(intent||{},{...(options||{})});
    self.postMessage({id,ok:true,blocks,meta:{count:blocks.length,type:intent?.type||'wish',seed:(intent?.seed>>>0)||0,scale:Number(intent?.scale)||1}});
  }catch(err){self.postMessage({id,ok:false,error:String(err?.message||err)})}};
}
