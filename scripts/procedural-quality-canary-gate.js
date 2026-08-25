#!/usr/bin/env node
'use strict';const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),prod=process.argv.includes('--production');
function j(n,d={}){try{return JSON.parse(fs.readFileSync(path.join(root,n),'utf8'))}catch(_){return d}}
const r=j('PROCEDURAL_QUALITY_READINESS.json'),c=j('PROCEDURAL_QUALITY_CRITIC.json'),t=j('PROCEDURAL_QUALITY_TOURNAMENT.json'),d=j('PROCEDURAL_QUALITY_DEVICE_CERTIFICATION.json'),g=j('PROCEDURAL_GOLDEN_BASELINES.json'),doc=j('PROCEDURAL_QUALITY_DOCTOR.json');
const reasons=[];if(Number(r.architecturalReadinessPct||0)<98)reasons.push('architecture');if(!c.pass)reasons.push('critic');if(!t.pass)reasons.push('tournament');if(doc.status!=='PASS')reasons.push('doctor');
if(prod){if(!d.certified)reasons.push('physical-device-certification');if(!(Array.isArray(g.rows)&&g.rows.length>0))reasons.push('golden-baseline')}
const out={version:10,production:prod,pass:reasons.length===0,reasons,stage:reasons.length?'hold':(prod?'production':'preview-canary')};fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_CANARY.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(!out.pass)process.exit(prod?2:1);
