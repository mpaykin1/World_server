#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=process.cwd();
const mem=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-improvement-memory.json'),'utf8')),failP=path.join(ROOT,'data/failure-knowledge-base.json'),succP=path.join(ROOT,'data/success-knowledge-base.json'),fail=JSON.parse(fs.readFileSync(failP,'utf8')),succ=JSON.parse(fs.readFileSync(succP,'utf8'));
function id(x){return crypto.createHash('sha1').update(JSON.stringify([x.actionKind,x.systemArea])).digest('hex').slice(0,12)}
for(const m of mem.items||[]){const rec={id:id(m),actionKind:m.actionKind,systemArea:m.systemArea,attempts:m.attempts,successes:m.successes,failures:m.failures,averageDelta:m.averageDelta,successProbability:m.successProbability,updatedAt:new Date().toISOString()};
 if(m.neverRetry||m.failures>m.successes){fail.patterns=fail.patterns.filter(x=>x.id!==rec.id);fail.patterns.push({...rec,avoid:true})}
 if(m.successes>0&&Number(m.averageDelta||0)>0){succ.patterns=succ.patterns.filter(x=>x.id!==rec.id);succ.patterns.push({...rec,reusable:true})}
}
fail.patterns.sort((a,b)=>b.failures-a.failures);succ.patterns.sort((a,b)=>(b.averageDelta||0)*(b.successProbability||0)-(a.averageDelta||0)*(a.successProbability||0));
fs.writeFileSync(failP,JSON.stringify(fail,null,2)+'\n');fs.writeFileSync(succP,JSON.stringify(succ,null,2)+'\n');
const report={generatedAt:new Date().toISOString(),failurePatterns:fail.patterns.length,successPatterns:succ.patterns.length};fs.writeFileSync(path.join(ROOT,'QUALITY_KNOWLEDGE_LEARNING_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[KNOWLEDGE_LEARN] failures=${report.failurePatterns} successes=${report.successPatterns}`);
