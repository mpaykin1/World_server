/** Original engine-neutral completed chunk-job admission, without runtime dependencies. */
export function applyOriginalChunkResults({pending,current,maxResults=64,maxMilliseconds=6,now=()=>performance.now(),apply}={}){
 if(!Array.isArray(pending)||!(current instanceof Map)||typeof apply!=='function'||typeof now!=='function'||!Number.isInteger(maxResults)||maxResults<1||!Number.isFinite(maxMilliseconds)||maxMilliseconds<0)throw new TypeError('arguments');
 const start=now();let applied=0,stale=0,examined=0;
 while(pending.length&&examined<maxResults&&now()-start<maxMilliseconds){
  const job=pending.shift();examined++;
  if(!job||!Number.isInteger(job.version)||!Number.isInteger(job.chunkRevision)||typeof job.key!=='string'||typeof job.group!=='string'){stale++;continue;}
  const live=current.get(job.key);
  if(!live||live.identity!==job.identity||live.chunkRevision!==job.chunkRevision||live.groupVersions?.get(job.group)!==job.version){stale++;continue;}
  apply(job);applied++;
 }
 return {applied,stale,examined,remaining:pending.length,elapsedMilliseconds:Math.max(0,now()-start)};
}
