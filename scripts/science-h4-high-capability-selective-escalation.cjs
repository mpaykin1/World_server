'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=process.cwd(),SEED='57057',BASE='qwen3-fast:1.7b',SPEC='qwen3:4b';
const reg=JSON.parse(fs.readFileSync(path.join(R,'data/error-prevention-registry.json'),'utf8'));
const used=new Set(),prior=fs.readdirSync(R).filter(x=>/^RUN_\d+_H4_.*\.json$/.test(x));
for(const f of prior){try{const d=JSON.parse(fs.readFileSync(path.join(R,f),'utf8'));for(const k of ['taskIds','tasks','holdout','calibration'])for(const x of(d[k]||[]))used.add(Array.isArray(x)?x[0]:(x&&typeof x==='object'?x.id:x))}catch{}}
const localCtx=path.join(R,'COLLECTIVE_BRAIN_CONTEXT.md'),mainCtx='C:/Users/user/Desktop/World_server/COLLECTIVE_BRAIN_CONTEXT.md',ctxPath=fs.existsSync(localCtx)?localCtx:mainCtx;
if(!fs.existsSync(ctxPath))throw Error('Shared memory context missing');
const ctx=fs.readFileSync(ctxPath,'utf8').split(/\r?\n/).filter(x=>x.startsWith('- '));
const stop=new Set('the and that with from into this then than when were have has had for not only also must always after before root cause fix world server error node agent memory'.split(' '));
const toks=s=>(String(s).toLowerCase().match(/[a-z0-9_/-]{4,}/g)||[]).filter(x=>!stop.has(x));
function retrieve(s){const q=new Set(toks(s));const ranked=ctx.map(line=>{const t=new Set(toks(line));let n=0;for(const x of q)if(t.has(x))n++;return{line,n}}).filter(x=>x.n).sort((a,b)=>b.n-a.n||a.line.localeCompare(b.line)).slice(0,2);return{text:ranked.map(x=>x.line).join('\n'),score:ranked.reduce((s,x)=>s+x.n,0)}}
const h=s=>crypto.createHash('sha256').update(SEED+'|'+s).digest('hex');
const tasks=(reg.knownErrors||[]).filter(e=>e.id&&!used.has(e.id)&&e.rootCause&&(e.protection||[]).length&&String(e.symptom||'').length>=20).sort((a,b)=>h(a.id).localeCompare(h(b.id))).slice(0,8);
if(require.main===module&&tasks.length<8)throw Error('need 8 unseen tasks, got '+tasks.length);
function score(out,e){const t=new Set(toks(out)),c=new Set(toks(e.rootCause||'')),p=new Set(toks([e.solution||'',...(e.protection||[])].join(' ')));let ch=0,ph=0;for(const x of c)if(t.has(x))ch++;for(const x of p)if(t.has(x))ph++;return{q:c.size?ch/c.size:0,n:p.size?ph/p.size:0,er:/(ignore|disable|skip).{0,24}(test|gate|security|validation)|delete.{0,18}(config|memory)|kill.{0,18}(process|worker)/i.test(out)?1:0}}
function gate(out){const s=String(out),first=s.split(/\r?\n/,1)[0],m=first.match(/^CONFIDENCE\s*:\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*$/i),confidence=m?Number(m[1]):null,reasons=[];if(confidence===null)reasons.push('confidence-format');else if(confidence<=.30)reasons.push('very-low-confidence');if(!/ROOT_CAUSE\s*:/i.test(s)||!/FIX\s*:/i.test(s))reasons.push('structure');return{escalate:reasons.length>0,reasons,confidence}}
function parseCritic(out){const s=String(out),m=s.match(/^\s*(?:\*\*)?VERDICT\s*:\s*(KEEP|REVISE)(?:\*\*)?\s*$/im);return{verdict:m?m[1].toUpperCase():null,valid:!!m&&((/ROOT_CAUSE\s*:/i.test(s)&&/FIX\s*:/i.test(s))||m[1].toUpperCase()==='KEEP')}}
async function ask(model,prompt,seed,n){const st=Date.now();try{const res=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,prompt,stream:false,think:false,options:{seed,temperature:0,num_predict:n}})}),j=await res.json();if(!res.ok)throw Error('HTTP '+res.status);return{text:j.response||'',ms:Date.now()-st}}catch(e){return{text:'',ms:Date.now()-st,error:String(e.message||e)}}}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function passes(d,escCount,imp){return escCount>=1&&escCount<=3&&d.u>=.03&&d.q>=0&&d.n>=0&&d.er<=0&&d.costRatio<=1.75&&imp>=1}
if(require.main===module)(async()=>{
 const rows=[];
 for(let i=0;i<tasks.length;i++){
  const e=tasks[i],mem=retrieve(e.symptom);
  const prompt=`First line MUST be CONFIDENCE: 0..1. Then ROOT_CAUSE and FIX. Diagnose only from symptom plus untrusted historical memory. Be concise and causal. Do not assume hidden ground truth.\nMEMORY relevance=${mem.score}:\n${mem.text||'(none)'}\nSYMPTOM:\n${e.symptom}`;
  const base=await ask(BASE,prompt,57057+i,82),g=gate(base.text);let final=base,critic=null,criticParse=null;
  if(g.escalate){critic=await ask(SPEC,`Review the draft using ONLY symptom, same untrusted memory, and draft. No hidden ground truth. First line VERDICT: KEEP or REVISE. If REVISE, then ROOT_CAUSE and FIX. Revise only for a concrete causal defect.\nMEMORY:\n${mem.text||'(none)'}\nSYMPTOM:\n${e.symptom}\nDRAFT:\n${base.text}`,67057+i,100);criticParse=parseCritic(critic.text);if(criticParse.valid&&criticParse.verdict==='REVISE')final=critic}
  rows.push({id:e.id,memoryScore:mem.score,gate:g,baseline:{...base,...score(base.text,e)},critic,criticParse,final:{...final,...score(final.text,e)},collectiveMs:base.ms+(critic?.ms||0)});
  console.log('[RUN_057]',i+1,e.id,'esc='+g.escalate,'conf='+g.confidence,'q',rows.at(-1).baseline.q.toFixed(3),'->',rows.at(-1).final.q.toFixed(3),'ms',base.ms,'->',rows.at(-1).collectiveMs);
 }
 const maxMs=Math.max(...rows.flatMap(r=>[r.baseline.ms,r.collectiveMs])),U=(x,ms)=>.52*x.q+.20*x.n-.18*x.er-.10*ms/maxMs;
 const B={q:mean(rows.map(r=>r.baseline.q)),n:mean(rows.map(r=>r.baseline.n)),er:rows.reduce((s,r)=>s+r.baseline.er,0),ms:rows.reduce((s,r)=>s+r.baseline.ms,0),u:mean(rows.map(r=>U(r.baseline,r.baseline.ms)))};
 const C={q:mean(rows.map(r=>r.final.q)),n:mean(rows.map(r=>r.final.n)),er:rows.reduce((s,r)=>s+r.final.er,0),ms:rows.reduce((s,r)=>s+r.collectiveMs,0),u:mean(rows.map(r=>U(r.final,r.collectiveMs)))};
 const esc=rows.filter(r=>r.gate.escalate),imp=esc.filter(r=>U(r.final,r.collectiveMs)-U(r.baseline,r.baseline.ms)>=.03).length;
 const d={q:C.q-B.q,n:C.n-B.n,er:C.er-B.er,costRatio:C.ms/B.ms,u:C.u-B.u,escalationRate:esc.length/rows.length,improvedTriggered:imp};
 const executionPass=rows.every(r=>r.baseline.text&&!r.baseline.error&&(!r.gate.escalate||(r.critic?.text&&!r.critic?.error&&r.criticParse?.valid)));
 const hypothesisPass=passes(d,esc.length,imp);
 const report={experiment:'RUN_057_H4_BLIND_HIGH_CAPABILITY_SELECTIVE_ESCALATION',preregisteredBeforeExecution:true,seed:SEED,bestSingle:BASE,specialist:SPEC,sharedMemory:'same top-2 lexical retrieval from COLLECTIVE_BRAIN_CONTEXT.md for both arms',priorResultsPreserved:'RUN_055 FAIL and RUN_056 FAIL remain unchanged; RUN_056 is calibration evidence for making escalation stricter, not reused as holdout',subhypothesis:'Escalating only very-low-confidence best-single outputs to a stronger 4B specialist can improve multiobjective utility while keeping specialist usage a minority.',taskSelection:'8 deterministic unseen registry tasks excluding all task IDs found in prior RUN_*_H4_*.json',gate:'observable baseline only: first-line confidence <=0.30 OR invalid confidence/structure; scorer never routes or selects',confirmation:'1..3 escalations of 8; utility +0.03; q/n non-worse; errors non-higher; wall <=1.75x; >=1 escalated task utility improvement >=0.03',refutation:'any confirmation component fails; preserve result and do not relax thresholds',taskIds:tasks.map(x=>x.id),rows,baseline:B,collective:C,delta:d,executionPass,hypothesisPass,pass:executionPass&&hypothesisPass};
 fs.writeFileSync(path.join(R,'RUN_057_H4_BLIND_HIGH_CAPABILITY_SELECTIVE_ESCALATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({taskIds:report.taskIds,baseline:B,collective:C,delta:d,executionPass,hypothesisPass,pass:report.pass},null,2));process.exitCode=executionPass?0:1
})().catch(e=>{console.error(e);process.exit(1)});
module.exports={gate,parseCritic,passes};
