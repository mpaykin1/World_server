"use strict";
function dist(a,b){return Math.hypot((a?.[0]||0)-(b?.[0]||0),(a?.[1]||0)-(b?.[1]||0),(a?.[2]||0)-(b?.[2]||0));}
function filterWorldVfxForSubscriber(events,{position=[0,0,0],radius=64,maxEvents=64,priorityAlways=50}={}){return [...(events||[])].filter(e=>(Number(e?.priority)||0)>=priorityAlways||dist(e?.position,position)<=radius).sort((a,b)=>(Number(b?.priority)||0)-(Number(a?.priority)||0)||dist(a?.position,position)-dist(b?.position,position)).slice(0,maxEvents);}
function makeWorldVfxBatch(events,opts){return {schemaVersion:3,kind:'world_vfx_batch',events:filterWorldVfxForSubscriber(events,opts)};}
module.exports={filterWorldVfxForSubscriber,makeWorldVfxBatch};
