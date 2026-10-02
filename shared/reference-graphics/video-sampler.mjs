function clampCount(value){return Math.max(1,Math.min(24,Math.trunc(Number(value)||8));}

export function sampleTimes(duration,count=8){
  const n=clampCount(count),d=Math.max(0,Number(duration)||0);
  if(d<=0)return Array.from({length:n},()=>0);
  if(n===1)return[d*0.5];
  const start=d*0.03,end=d*0.97,span=Math.max(0,end-start);
  return Array.from({length:n},(_,i)=>start+span*(i/(n-1)));
}

function waitFor(video,event){
  return new Promise((resolve,reject)=>{
    const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Video sampling failed'));};
    const cleanup=()=>{video.removeEventListener(event,done);video.removeEventListener('error',fail);};
    video.addEventListener(event,done,{once:true});video.addEventListener('error',fail,{once:true});
  });
}

export async function sampleVideoFrames(video,{count=8,maxWidth=160}={}){
  if(!video||typeof document==='undefined')throw new TypeError('HTMLVideoElement in a browser is required');
  if(!Number.isFinite(video.duration)||video.duration<=0){
    if(video.readyState<1)await waitFor(video,'loadedmetadata');
  }
  const scale=Math.min(1,Math.max(16,Number(maxWidth)||160)/Math.max(1,video.videoWidth));
  const width=Math.max(16,Math.round(video.videoWidth*scale));
  const height=Math.max(16,Math.round(video.videoHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('2D canvas unavailable');
  const frames=[];
  for(const time of sampleTimes(video.duration,count)){
    if(Math.abs(video.currentTime-time)>0.001){
      video.currentTime=time;
      await waitFor(video,'seeked');
    }
    ctx.drawImage(video,0,0,width,height);
    const image=ctx.getImageData(0,0,width,height);
    frames.push({width,height,time,pixels:new Uint8Array(image.data)});
  }
  return frames;
}
