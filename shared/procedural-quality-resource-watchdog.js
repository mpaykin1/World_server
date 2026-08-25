(() => {
'use strict';const G=globalThis;if(G.WorldProceduralResourceWatchdog?.version==='10.0.0')return;
function create(){
 const start={heap:performance.memory?.usedJSHeapSize||0,canvases:document.querySelectorAll('canvas').length,workers:0},samples=[],resources=new Set();let peakHeap=start.heap;
 function track(resource,label='resource'){if(resource)resources.add({resource,label,ts:performance.now()});return resource}
 function untrack(resource){for(const x of resources)if(x.resource===resource)resources.delete(x)}
 function sample(){const heap=performance.memory?.usedJSHeapSize||0;peakHeap=Math.max(peakHeap,heap);const row={ts:performance.now(),heap,canvases:document.querySelectorAll('canvas').length,resources:resources.size};samples.push(row);if(samples.length>120)samples.shift();return row}
 function report(){const cur=sample(),age=(samples.at(-1)?.ts||0)-(samples[0]?.ts||0),heapGrowth=start.heap&&cur.heap?(cur.heap-start.heap)/start.heap:0,canvasGrowth=cur.canvases-start.canvases;
  return{version:10,heapGrowth:+heapGrowth.toFixed(4),peakHeap,canvasGrowth,trackedResources:resources.size,windowMs:age,possibleLeak:(heapGrowth>.45&&age>10000)||canvasGrowth>3,pass:!((heapGrowth>.45&&age>10000)||canvasGrowth>3)}}
 return{track,untrack,sample,report}
}
G.WorldProceduralResourceWatchdog={version:'10.0.0',create};
})();