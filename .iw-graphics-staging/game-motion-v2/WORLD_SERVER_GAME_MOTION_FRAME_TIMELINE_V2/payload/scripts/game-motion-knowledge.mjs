#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const ROOT=process.cwd(),kp=path.join(ROOT,'data/game-motion-knowledge.json'),ep=path.join(ROOT,'GAME_MOTION_RUNTIME_EVIDENCE.json');
const kb=fs.existsSync(kp)?JSON.parse(fs.readFileSync(kp,'utf8')):{schemaVersion:'1.0.0',patterns:{},fixes:{}};
if(!fs.existsSync(ep)){console.log('[GAME_MOTION_KNOWLEDGE] no runtime evidence yet');process.exit(0)}
const ev=JSON.parse(fs.readFileSync(ep,'utf8'));let added=0;
const fp=o=>crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0,16);
for(const e of ev.samples||[]){
  if(e.pass===true&&e.pattern){
    const k=fp({pattern:e.pattern,platform:e.platform||'',category:e.category||''});
    if(!kb.patterns[k]){kb.patterns[k]={pattern:e.pattern,platform:e.platform||null,category:e.category||null,metrics:e.metrics||{},source:e.source||null,firstSeen:new Date().toISOString()};added++}
  }
  if(e.rootCause&&e.fix&&e.pass===true){
    const k=fp({rootCause:e.rootCause,fix:e.fix});
    if(!kb.fixes[k]){kb.fixes[k]={rootCause:e.rootCause,fix:e.fix,regressionTest:e.regressionTest||null,firstSeen:new Date().toISOString()};added++}
  }
}
kb.updatedAt=new Date().toISOString();fs.writeFileSync(kp,JSON.stringify(kb,null,2)+'\n');
console.log(`[GAME_MOTION_KNOWLEDGE] added=${added} patterns=${Object.keys(kb.patterns).length} fixes=${Object.keys(kb.fixes).length}`);
