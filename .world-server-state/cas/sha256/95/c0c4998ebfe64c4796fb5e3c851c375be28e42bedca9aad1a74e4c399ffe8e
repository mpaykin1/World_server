async function sha256Hex(buffer){if(!globalThis.crypto?.subtle)return null;const d=await crypto.subtle.digest('SHA-256',buffer);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');}

/** Parallel HTTP Range fetcher that reconstructs the original GLB byte-for-byte. This is safe for
 * skins, animations and morph targets because no glTF structure is split or rewritten. */
export async function fetchLosslessGlbByRanges(url,plan,{concurrency=4}={}){
  if(!plan?.byteConservation||plan?.mode!=='byte-identical-parallel-range-glb-v1')throw new Error('invalid GLB range plan');
  const segments=[...plan.segments].sort((a,b)=>(a.priority-b.priority)||(a.start-b.start));const result=new Uint8Array(plan.sourceBytes);let cursor=0,full=null;
  async function worker(){
    while(true){const i=cursor++;if(i>=segments.length||full)return;const s=segments[i];const r=await fetch(url,{headers:{Range:`bytes=${s.start}-${s.end}`},cache:'force-cache'});
      if(r.status===200){const ab=await r.arrayBuffer();if(ab.byteLength===plan.sourceBytes){full=new Uint8Array(ab);return;}throw new Error(`server ignored range with unexpected size ${ab.byteLength}`);}
      if(r.status!==206)throw new Error(`range HTTP ${r.status}`);const ab=await r.arrayBuffer();if(ab.byteLength!==s.bytes)throw new Error(`range size mismatch ${ab.byteLength} != ${s.bytes}`);
      if(s.sha256){const h=await sha256Hex(ab);if(h&&h!==s.sha256)throw new Error(`range hash mismatch segment ${s.id}`);}result.set(new Uint8Array(ab),s.start);
    }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(8,concurrency))},()=>worker()));const out=full||result;
  const h=await sha256Hex(out.buffer);if(h&&plan.sourceSha256&&h!==plan.sourceSha256)throw new Error('reassembled GLB SHA mismatch');
  return{buffer:out.buffer,report:{mode:plan.mode,segments:segments.length,parallelism:concurrency,byteConservation:true,sourceSha256:plan.sourceSha256,actualSha256:h,sourceAssetModified:false}};
}
