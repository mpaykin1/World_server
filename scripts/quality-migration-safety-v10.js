#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');const {analyzeMigration}=require('../lib/quality/migration-safety-v10');
const root=path.resolve(process.argv[2]||process.cwd()),dir=path.join(root,'supabase/migrations');
let files=[];
try{const base=process.env.QUALITY_BASE_REF||'master';const out=cp.execFileSync('git',['-C',root,'diff','--name-only','--diff-filter=ACMR',`${base}...HEAD`,'--','supabase/migrations'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});files=out.trim().split(/\r?\n/).filter(x=>x.endsWith('.sql')).map(x=>path.basename(x));}catch{}
if(!files.length&&fs.existsSync(dir))files=fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort();
files=[...new Set(files)];const results=files.map(f=>({file:f,...analyzeMigration(fs.readFileSync(path.join(dir,f),'utf8'),{allowDestructive:false})}));const bad=results.filter(x=>!x.ok);const out={ok:bad.length===0,status:bad.length?'HOLD':'PASS',checked:results.length,scope:files,bad};console.log(JSON.stringify(out,null,2));if(!out.ok)process.exitCode=2;
