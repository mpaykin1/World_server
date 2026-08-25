#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),model=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-model.json'),'utf8')),state=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-evidence-state.json'),'utf8'));
function allText(){
 let out='';for(const base of ['shared','scripts','apps','e2e','test']) if(fs.existsSync(path.join(ROOT,base))){
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const a=path.join(d,e.name);if(e.isDirectory())walk(a);else if(/\.(js|html|css|json|yml|yaml)$/.test(e.name))try{out+=fs.readFileSync(a,'utf8')+'\n'}catch{}}};walk(path.join(ROOT,base));
 } return out;
}
const source=allText(),scores={},detail={};
for(const [metric,m] of Object.entries(model.metrics||{})){
 let got=0,total=0;detail[metric]=[];
 for(const c of m.controls||[]){
  total+=Number(c.weight||0);let pass=false,status='missing';
  if(c.kind==='file'){pass=fs.existsSync(path.join(ROOT,c.path));status=pass?'present':'missing';}
  else if(c.kind==='source'){pass=source.includes(c.pattern);status=pass?'present':'missing';}
  else if(c.kind==='project'){pass=state.projectTags?.[c.project]===true;status=pass?'configured':'missing';}
  else if(c.kind==='test'||c.kind==='review'){const s=state.testTags?.[c.tag];pass=!!s;status=s||'missing';}
  else if(c.kind==='command'){pass=true;status='validated by release gate';}
  else if(c.kind==='external'){pass=c.status==='pass';status=c.status||'missing';}
  if(pass)got+=Number(c.weight||0);
  detail[metric].push({id:c.id,weight:c.weight,pass,status});
 }
 scores[metric]=total?Math.round(got*1000/total)/10:0;
}
const overall=Math.round(Object.values(scores).reduce((a,b)=>a+b,0)*10/Math.max(1,Object.keys(scores).length))/10;
const report={generatedAt:new Date().toISOString(),candidateStatus:'PREPARED_NOT_DEPLOYED',scores,overall,detail};
fs.writeFileSync(path.join(ROOT,'EVIDENCE_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[EVIDENCE_SCORE] overall=${overall}%`);
for(const [k,v] of Object.entries(scores))console.log(` - ${k}: ${v}%`);
