import { meshPaddedVolume } from './voxel-greedy-mesher-core.mjs';
self.onmessage=(event)=>{
  const {id,blocks,dims,colors,kinds}=event.data||{};
  try{
    const result=meshPaddedVolume({blocks:new Uint8Array(blocks),dims,colors:new Uint32Array(colors),kinds:new Uint8Array(kinds)});
    const transfer=[];
    for(const key of ['solid','translucent','water']) for(const field of ['positions','colors','indices']) transfer.push(result[key][field].buffer);
    self.postMessage({id,ok:true,result},transfer);
  }catch(error){self.postMessage({id,ok:false,error:String(error?.stack||error)});}
};
