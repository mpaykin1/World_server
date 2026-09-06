'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=process.cwd(),SEED='64064',BASE='qwen3-fast:1.7b',SPEC='qwen3:4b';
const reg=JSON.parse(fs.readFileSync(path.join(R,'data/error-prevention-registry.json'),'utf8'));
const used=new Set(),priorDirs=[R,'C:/Users/user/Desktop/World_server_science_run055'];
for(const dir of priorDirs){if(!fs.existsSync(dir))continue;for(const f of fs.readdirSync(dir).filter(x=>/^RUN_\\d+_H4_.*\\.json$/.test(x))){try{const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));for(const k of ['taskIds','tasks','holdout','calibration'])for(const x of(d[k]||[]))used.add(Array.isArray(x)?x[0]:(x&&typeof x==='object'?x.id:x))}catch{}}}
const localCtx=path.join(R,'COLLECTIVE_BRAIN_CONTEXT.md'),mainCtx='C:/Users/user/Desktop/World_server/COLLECTIVE_BRAIN_CONTEXT.md',ctxPath=fs.existsSync(localCtx)?localCtx:mainCtx;
if(!fs.existsSync(ctxPath))throw Error('Shared memory context missing');
const ctx=fs.readFileSync(ctxPath,'utf8').split(/\\r?\\n/).filter(x=>x.startsWith('- '));
const stop=new Set('the and that with from into this then than when were have has had for not only also must always after before root cause fix world server error node agent memory'.split(' '));
const toks=s=>(String(s).toLowerCase().match(/[a-z0-9_/-]{4,}/g)||[]).filter(x=>!stop.has(x));
function retrieve(s){const q=new Set(toks(s));const ranked=ctx.map(line=>{const t=new Set(toks(line));let n=0;for(const x of q)if(t.has(x))n++;return{line,n}}).filter(x=>x.n).sort((a,b)=>b.n-a.n||a.line.localeCompare(b.line)).slice(0,2);return{text:ranked.map(x=>x.line).join('\\n'),score:ranked.reduce((s,x)=>s+x.n,0)}}
const h=s=>crypto.createHash('sha256').update(SEED+'|'+s).digest('hex');
const tasks=(reg.knownErrors||[]).filter(e=>e.id&&!used.has(e.id)&&e.rootCause&&(e.protection||[]).length&&String(e.symptom||'').length>=20).sort((a,b)=>h(a.id).localeCompare(h(b.id))).slice(0,8);
if(require.main===module&&tasks.length<8)throw Error('need 8 unseen tasks, got '+tasks.length);
function score(out,e){const t=new Set(toks(out)),c=new Set(toks(e.rootCause||'')),p=new Set(toks([e.solution||'',...(e.protection||[])].join(' ')));let ch=0,ph=0;for(const x of c)if(t.has(x))ch++;for(const x of p)if(t.has(x))ph++;return{q:c.size?ch/c.size:0,n:p.size?ph/p.size:0,er:/(ignore|disable|skip).{0,24}(test|gate|security|validation)|delete.{0,18}(config|memory)|kill.{0,18}(process|worker)/i.test(out)?1:0}}
function gate(out){const s=String(out),first=s.split(/\\r?\\n/,1)[0],m=first.match(/^CONFIDENCE\\s*:\\s*(0(?:\\.\\d+)?|1(?:\\.0+)?)\\s*$/i),confidence=m?Number(m[1]):null,reasons=[];if(confidence===null)reasons.push('confidence-format');else if(confidence<=.30)reasons.push('low-confidence');if(!/ROOT_CAUSE\\s*:/i.test(s)||!/FIX\\s*:/i.test(s))reasons.push('structure');return{eligible:reasons.length>0,reasons,confidence}}
function parseCritic(out){try{const j=JSON.parse(String(out));const verdict=String(j.verdict||'').toUpperCase();return{verdict,valid:(verdict==='KEEP'||verdict==='REVISE')&&(verdict==='KEEP'||(typeof j.root_cause==='string'&&typeof j.fix==='string')),text:verdict==='REVISE'?`ROOT_CAUSE: ${j.root_cause}\\nFIX: ${j.fix}`:''}}catch{return{verdict:null,valid:false,text:''}}}
async function ask(model,prompt,seed,n,format){const st=Date.now();try{const body={model,prompt,stream:false,think:false,options:{seed,temperature:0,num_predict:n}};if(format)body.format=format;const res=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await res.json();if(!res.ok)throw Error('HTTP '+res.status);return{text:j.response||'',ms:Date.now()-st}}catch(e){return{text:'',ms:Date.now()-st,error:String(e.message||e)}}}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function passes(d,escCount,imp){return escCount>=1&&escCount<=2&&d.u>=.03&&d.q>=0&&d.n>=0&&d.er<=0&&d.costRatio<=1.60&&imp>=1}
if(require.main===module)(async()=>{
 const rows=[];
 for(let i=0;i<tasks.length;i++){
  const e=tasks[i],mem=retrieve(e.symptom),prompt=`First line MUST be CONFIDENCE: 0..1. Then ROOT_CAUSE and FIX. Diagnose only from symptom plus untrusted historical memory. Be concise and causal. Do not assume hidden ground truth.\\nMEMORY relevance=${mem.score}:\\n${mem.text||'(none)'}\\nSYMPTOM:\\n${e.symptom}`;
  const base=await ask(BASE,prompt,64064+i,82),g=gate(base.text);rows.push({id:e.id,e,memoryScore:mem.score,gate:g,baseline:{...base,...score(base.text,e)},final:null,critic:null,criticParse:null,collectiveMs:base.ms});console.log('[RUN_064 baseline]',i+1,e.id,'eligible='+g.eligible,'conf='+g.confidence,'q='+rows.at(-1).baseline.q.toFixed(3));
 }
 const eligible=rows.map((r,i)=>({r,i})).filter(x=>x.r.gate.eligible).sort((a,b)=>(a.r.gate.confidence??-1)-(b.r.gate.confidence??-1)||h(a.r.id).localeCompare(h(b.r.id))).slice(0,2),selected=new Set(eligible.map(x=>x.i));
 for(let i=0;i<rows.length;i++){
  const r=rows[i],e=r.e;r.final=r.baseline;
  if(selected.has(i)){
   const mem=retrieve(e.symptom),critic=await ask(SPEC,`Return JSON only with keys verdict (KEEP or REVISE), root_cause, fix. Review the draft using ONLY symptom, same untrusted memory, and draft. No hidden ground truth. REVISE only for a concrete causal defect.\\nMEMORY:\\n${mem.text||'(none)'}\\nSYMPTOM:\\n${e.symptom}\\nDRAFT:\\n${r.baseline.text}`,74064+i,180,'json'),cp=parseCritic(critic.text);r.critic=critic;r.criticParse=cp;r.collectiveMs+=critic.ms;if(cp.valid&&cp.verdict==='REVISE')r.final={...critic,text:cp.text,...score(cp.text,e)};
  }
  if(!r.final.q&&r.final.q!==0)Object.assign(r.final,score(r.final.text,e));console.log('[RUN_064 final]',i+1,r.id,'esc='+selected.has(i),'q',r.baseline.q.toFixed(3),'->',r.final.q.toFixed(3),'ms',r.baseline.ms,'->',r.collectiveMs);
  delete r.e;
 }
 const maxMs=Math.max(...rows.flatMap(r=>[r.baseline.ms,r.collectiveMs])),U=(x,ms)=>.52*x.q+.20*x.n-.18*x.er-.10*ms/maxMs;
 const B={q:mean(rows.map(r=>r.baseline.q)),n:mean(rows.map(r=>r.baseline.n)),er:rows.reduce((s,r)=>s+r.baseline.er,0),ms:rows.reduce((s,r)=>s+r.baseline.ms,0),u:mean(rows.map(r=>U(r.baseline,r.baseline.ms)))};
 const C={q:mean(rows.map(r=>r.final.q)),n:mean(rows.map(r=>r.final.n)),er:rows.reduce((s,r)=>s+r.final.er,0),ms:rows.reduce((s,r)=>s+r.collectiveMs,0),u:mean(rows.map(r=>U(r.final,r.collectiveMs)))};
 const esc=rows.filter((_,i)=>selected.has(i)),imp=esc.filter(r=>U(r.final,r.collectiveMs)-U(r.baseline,r.baseline.ms)>=.03).length,d={q:C.q-B.q,n:C.n-B.n,er:C.er-B.er,costRatio:C.ms/B.ms,u:C.u-B.u,escalationRate:esc.length/rows.length,improvedTriggered:imp};
 const executionPass=rows.every((r,i)=>r.baseline.text&&!r.baseline.error&&(!selected.has(i)||(r.critic?.text&&!r.critic?.error&&r.criticParse?.valid))),hypothesisPass=passes(d,esc.length,imp);
 const report={experiment:'RUN_064_H4_BLIND_BUDGETED_JSON_ESCALATION',preregisteredBeforeExecution:true,seed:SEED,bestSingle:BASE,specialist:SPEC,sharedMemory:'same top-2 lexical retrieval from COLLECTIVE_BRAIN_CONTEXT.md for both arms',priorResultsPreserved:'RUN_063 execution-invalid and hypothesis-fail is preserved; its 8 task IDs are excluded. RUN_055/056 also preserved.',subhypothesis:'A strict two-call uncertainty budget to a stronger 4B specialist can improve multiobjective utility while keeping specialist usage at 25% or less.',taskSelection:'8 deterministic unseen registry tasks excluding all task IDs found in prior RUN_*_H4_*.json',gate:'collect all baseline outputs; eligible if confidence<=0.30 or invalid structure; escalate at most two lowest-confidence eligible outputs, deterministic hash tie-break; hidden scorer never routes',specialistProtocol:'Ollama format=json; JSON verdict/root_cause/fix; 180-token budget to prevent reasoning from consuming the required verdict',confirmation:'1..2 escalations of 8; utility +0.03; q/n non-worse; errors non-higher; wall <=1.60x; >=1 escalated task utility improvement >=0.03',refutation:'any confirmation component fails; preserve result and do not relax thresholds',taskIds:tasks.map(x=>x.id),selectedTaskIds:esc.map(x=>x.id),rows,baseline:B,collective:C,delta:d,executionPass,hypothesisPass,pass:executionPass&&hypothesisPass};
 fs.writeFileSync(path.join(R,'RUN_064_H4_BLIND_BUDGETED_JSON_ESCALATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({taskIds:report.taskIds,selectedTaskIds:report.selectedTaskIds,baseline:B,collective:C,delta:d,executionPass,hypothesisPass,pass:report.pass},null,2));process.exitCode=executionPass?0:1;
})().catch(e=>{console.error(e);process.exit(1)});
module.exports={gate,parseCritic,passes};
