/** Original deterministic PCM synthesis for a tiny engine-neutral effects library. */
export function synthesizeOriginalEffect({kind='click',seed=1,sampleRate=22050,duration=0.25}={}){
 if(!['click','wind','impact'].includes(kind)||!Number.isSafeInteger(seed)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>48000||!Number.isFinite(duration)||duration<=0||duration>3)throw new RangeError('effect');
 const count=Math.ceil(sampleRate*duration),samples=new Int16Array(count);
 let rng=(seed>>>0)||1;
 const noise=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return (rng>>>0)/4294967296*2-1;};
 let low=0;
 for(let i=0;i<count;i++){
  const t=i/sampleRate,u=i/count,n=noise();let value;
  if(kind==='click')value=(Math.sin(2*Math.PI*(900-500*u)*t)*0.65+n*0.25)*Math.exp(-32*u);
  else if(kind==='impact')value=(Math.sin(2*Math.PI*(170-115*u)*t)*0.7+n*0.3)*Math.exp(-9*u);
  else{low=low*0.985+n*0.015;value=low*3*(0.5-0.5*Math.cos(2*Math.PI*u));}
  samples[i]=Math.max(-32768,Math.min(32767,Math.round(value*26000)));
 }
 const wav=new Uint8Array(44+count*2),view=new DataView(wav.buffer);
 const str=(offset,s)=>{for(let j=0;j<s.length;j++)wav[offset+j]=s.charCodeAt(j);};
 str(0,'RIFF');view.setUint32(4,36+count*2,true);str(8,'WAVE');str(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 str(36,'data');view.setUint32(40,count*2,true);
 for(let i=0;i<count;i++)view.setInt16(44+i*2,samples[i],true);
 return wav;
}
