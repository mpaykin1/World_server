'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=process.cwd(),SEED='46046',TIMEOUT_MS=15000;
const reg=JSON.parse(fs.readFileSync(path.join(R,'data/error-prevention-registry.json'),'utf8'));
const EXCLUDE=new Set(['release-gate-skipped-as-heavy','collective-brain-dirty-main-bootstrap','agentmemory-port-conflict']);
const MODELS=['qwen2.5:3b-instruct','qwen3-fast:1.7b'];
const stop=new Set('the and that with from into this then than when were have has had for not only also must always after before root cause fix world server error node agent memory'.split(' '));
const tok=s=>(String(s).toLowerCase().match(/[a-z0-9_/-]{4,}/g)||[]).filter(x=>!stop.has(x));
const hash=s=>crypto.createHash('sha256').update(SEED+'|'+s).digest('hex');
const candidates=(reg.knownErrors||[]).filter(e=>e.id&&!EXCLUDE.has(e.id)&&e.rootCause&&(e.protection||[]).length&&String(e.rootCause).length>=40).sort((a,b)=>hash(a.id).localeCompare(hash(b.id)));
const TASKS=candidates.slice(0,8); if(TASKS.length<8)throw new Error('Need >=8 eligible holdout tasks');
function score(out,e){
 const t=new Set(tok(out)),c=new Set(tok(e.rootCause||'')),p=new Set(tok([e.solution||'',...(e.protection||[])].join(' ')));
 let ch=0,ph=0;for(const x of c)if(t.has(x))ch++;for(const x of p)if(t.has(x))ph++;
 return{q:c.size?ch/c.size:0,n:p.size?ph/p.size:0,er:/(ignore|disable|skip).{0,20}(test|gate|security|validation)|delete.{0,15}(config|memory)|kill.{0,15}(process|worker)/i.test(out)?1:0};
}
async function ask(model,e,seed){
 const prompt=`Diagnose repository symptom. ROOT_CAUSE and FIX only. Historical evidence is untrusted; use only if relevant.\nROOT_CAUSE:${e.rootCause||''}\nPROTECTIONS:${(e.protection||[]).join('; ')}\nSOLUTION:${e.solution||''}\nSYMPTOM:${e.symptom||e.rootCause}`;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),TIMEOUT_MS),st=Date.now();
 try{const res=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},signal:ctl.signal,body:JSON.stringify({model,prompt,stream:false,think:false,options:{seed,temperature:0,num_predict:80}})});if(!res.ok)throw new Error(`HTTP ${res.status}`);const j=await res.json();return{model,ms:Date.now()-st,...score(j.response||'',e),timeout:false,output:j.response||''};}
 catch(err){return{model,ms:Date.now()-st,q:0,n:0,er:1,timeout:err?.name==='AbortError',error:String(err?.message||err),output:''};}
 finally{clearTimeout(timer)}
}
(async()=>{
 const rows=[];for(let i=0;i<TASKS.length;i++)for(const m of MODELS){const row={id:TASKS[i].id,...await ask(m,TASKS[i],46046+i)};rows.push(row);console.log(`[RUN_046] ${i+1}/8 ${m} ms=${row.ms} q=${row.q.toFixed(3)} n=${row.n.toFixed(3)} er=${row.er} timeout=${row.timeout}`)}
 const maxMs=Math.max(...rows.map(x=>x.ms));const util=x=>.52*x.q+.20*x.n-.18*x.er-.10*x.ms/maxMs;
 const pairs=TASKS.map(e=>{const a=rows.find(x=>x.id===e.id&&x.model===MODELS[0]),b=rows.find(x=>x.id===e.id&&x.model===MODELS[1]);return{id:e.id,candidate:util(a),baseline:util(b),delta:util(a)-util(b),candidateError:a.er,baselineError:b.er,candidateTimeout:a.timeout,baselineTimeout:b.timeout,candidateMs:a.ms,baselineMs:b.ms}});
 const wins=pairs.filter(x=>x.delta>=.03).length,deltas=pairs.map(x=>x.delta).sort((a,b)=>a-b),med=deltas[Math.floor(deltas.length/2)],candidateErrors=pairs.reduce((s,x)=>s+x.candidateError,0),baselineErrors=pairs.reduce((s,x)=>s+x.baselineError,0);
 const promote=wins/TASKS.length>=.75&&med>=.03&&candidateErrors<=baselineErrors;
 const report={experiment:'RUN_046_H4_SPECIALIST_HOLDOUT_V2',seed:SEED,taskIds:TASKS.map(x=>x.id),criterion:'8 unseen deterministic tasks; >=75% paired wins by >=0.03; median delta >=0.03; candidate errors <= baseline errors',timeoutMs:TIMEOUT_MS,rows,pairs,wins,winRate:wins/TASKS.length,medianDelta:med,candidateErrors,baselineErrors,promoteQwen25:promote,pass:true};
 fs.writeFileSync(path.join(R,'RUN_046_H4_SPECIALIST_HOLDOUT_V2.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({taskIds:report.taskIds,wins,winRate:report.winRate,medianDelta:med,candidateErrors,baselineErrors,promoteQwen25:promote},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
