'use strict';
const fs=require('fs'),path=require('path'),root=process.cwd(),file=path.join(root,'data','error-prevention-registry.json');
const j=JSON.parse(fs.readFileSync(file,'utf8')),id='H4-SPECIALIST-PROMOTION-CALIBRATION-OVERFIT',e=(j.knownErrors||[]).find(x=>x.id===id);
if(!e)throw new Error(`missing existing root cause ${id}`);
e.protection=e.protection||[];for(const v of ['scripts/science-h4-specialist-holdout-v2.cjs','RUN_046_H4_SPECIALIST_HOLDOUT_V2.json','test/science-h4-specialist-promotion-integrity.test.js','scientific holdouts must fail closed on per-call timeout'])if(!e.protection.includes(v))e.protection.push(v);
fs.writeFileSync(file,JSON.stringify(j,null,2)+'\n');
const cb=require('../lib/collective-brain');cb.appendEvent(root,'SCIENCE_EVIDENCE',{run:'RUN_046',hypothesis:'H4',status:'SPECIALIST_PROMOTION_REJECTED_ON_8_TASK_HOLDOUT',rootCause:id,seed:46046,evidence:['RUN_046_H4_SPECIALIST_HOLDOUT_V2.json'],metrics:{tasks:8,wins:3,winRate:.375,medianDelta:-0.0000066617813603842,candidateErrors:3,baselineErrors:2},guard:'no specialist promotion unless preregistered holdout criteria pass; per-call timeout is fail-closed'});console.log('[RUN_046] evidence + existing root cause updated');
