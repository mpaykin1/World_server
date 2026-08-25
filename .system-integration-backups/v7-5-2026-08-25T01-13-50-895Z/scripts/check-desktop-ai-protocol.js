#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/desktop-ai-policy.json'),'utf8'));
const errors=[],warnings=[];
for(const f of policy.requiredFiles||[])if(!fs.existsSync(path.join(ROOT,f)))errors.push(`missing ${f}`);
if(!errors.length){
  const wip=fs.readFileSync(path.join(ROOT,policy.workFile),'utf8');
  for(const section of policy.requiredSections||[]){
    if(!new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`,'mi').test(wip))errors.push(`WORK_IN_PROGRESS missing section: ${section}`);
  }
  let changed=[];
  if(process.env.DESKTOP_AI_CHANGED_FILES){
    changed=process.env.DESKTOP_AI_CHANGED_FILES.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  }else{
    const base=process.env.QUALITY_BASE_SHA||process.env.GITHUB_BASE_REF||'master';
    const r=cp.spawnSync('git',['diff','--name-only',base,'HEAD'],{cwd:ROOT,encoding:'utf8'});
    if(r.status===0)changed=r.stdout.trim().split(/\r?\n/).filter(Boolean);
  }
  const meaningful=changed.filter(f=>![
    'WORK_IN_PROGRESS.md','DESKTOP_AI_INSTALL_AND_VERIFY.md',
    'QUALITY_MASTER_REPORT.json','QUALITY_DIFF.md','QUALITY_DIFF.json'
  ].includes(f));
  const hasUnset=/\bUNSET\b/.test(wip);
  if(meaningful.length&&hasUnset)errors.push(`WORK_IN_PROGRESS still contains UNSET while ${meaningful.length} project files changed`);
  if(meaningful.length&&!changed.includes('WORK_IN_PROGRESS.md'))errors.push('project files changed but WORK_IN_PROGRESS.md was not updated');
  if(!meaningful.length&&hasUnset)warnings.push('WORK_IN_PROGRESS is still the install template; update it before the next task');
  const final=/## Final evidence\s*\n([\s\S]*)$/i.exec(wip)?.[1]||'';
  if(process.env.DESKTOP_AI_REQUIRE_COMPLETE==='1'&&/Not completed\.|UNSET/i.test(final))errors.push('completion requested but Final evidence is not completed');
}
const report={generatedAt:new Date().toISOString(),pass:errors.length===0,errors,warnings};
fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_PROTOCOL_REPORT.json'),JSON.stringify(report,null,2)+'\n');
for(const w of warnings)console.warn('[DESKTOP_AI_PROTOCOL] warning:',w);
for(const e of errors)console.error('[DESKTOP_AI_PROTOCOL] error:',e);
if(errors.length)process.exit(61);
console.log('[DESKTOP_AI_PROTOCOL] PASS');
