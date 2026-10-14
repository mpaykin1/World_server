#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/desktop-ai-policy.json'),'utf8'));
const errors=[],warnings=[];
// Task notes live in one file per branch (work-notes/<branch>.md): parallel PRs never edit the same lines.
// WORK_IN_PROGRESS.md stays the legacy shared log and is still accepted.
const notesDir=String(policy.taskNotesDir||'work-notes').replace(/\/+$/,'');
const isNotes=f=>f.startsWith(notesDir+'/')&&f.endsWith('.md');
for(const f of policy.requiredFiles||[])if(!fs.existsSync(path.join(ROOT,f)))errors.push(`missing ${f}`);
if(!errors.length){
  let changed=[];
  if(process.env.DESKTOP_AI_CHANGED_FILES){
    changed=process.env.DESKTOP_AI_CHANGED_FILES.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  }else{
    const base=process.env.QUALITY_BASE_SHA||process.env.GITHUB_BASE_REF||'master';
    const r=cp.spawnSync('git',['diff','--name-only',base,'HEAD'],{cwd:ROOT,encoding:'utf8'});
    if(r.status===0)changed=r.stdout.trim().split(/\r?\n/).filter(Boolean);
  }
  const meaningful=changed.filter(f=>!isNotes(f)&&![
    'WORK_IN_PROGRESS.md','DESKTOP_AI_INSTALL_AND_VERIFY.md',
    'QUALITY_MASTER_REPORT.json','QUALITY_DIFF.md','QUALITY_DIFF.json'
  ].includes(f));
  const notes=changed.filter(f=>isNotes(f)&&fs.existsSync(path.join(ROOT,f)));
  for(const file of notes.length?notes:[policy.workFile]){
    const label=file===policy.workFile?'WORK_IN_PROGRESS':file;
    const text=fs.readFileSync(path.join(ROOT,file),'utf8');
    for(const section of policy.requiredSections||[]){
      if(!new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*$`,'mi').test(text))errors.push(`${label} missing section: ${section}`);
    }
    const taskMarkers=[...text.matchAll(/^##\s+Task\s*$/gmi)];
    const currentTask=taskMarkers.length?text.slice(taskMarkers.at(-1).index):text;
    const hasUnset=/\bUNSET\b/.test(currentTask);
    if(meaningful.length&&hasUnset)errors.push(`${label} current task still contains UNSET while ${meaningful.length} project files changed`);
    if(!meaningful.length&&hasUnset)warnings.push(`${label} current task is still the install template; update it before the next task`);
    const finalMarker=/^##\s+Final evidence\s*$/mi.exec(currentTask);
    const final=finalMarker?currentTask.slice(finalMarker.index+finalMarker[0].length):'';
    if(process.env.DESKTOP_AI_REQUIRE_COMPLETE==='1'&&/Not completed\.|UNSET/i.test(final))errors.push(`completion requested but Final evidence in ${label} is not completed`);
  }
  if(meaningful.length&&!notes.length&&!changed.includes(policy.workFile))errors.push(`project files changed but no task notes were updated (${notesDir}/<branch>.md or ${policy.workFile})`);
}
const report={generatedAt:new Date().toISOString(),pass:errors.length===0,errors,warnings};
fs.writeFileSync(path.join(ROOT,'DESKTOP_AI_PROTOCOL_REPORT.json'),JSON.stringify(report,null,2)+'\n');
for(const w of warnings)console.warn('[DESKTOP_AI_PROTOCOL] warning:',w);
for(const e of errors)console.error('[DESKTOP_AI_PROTOCOL] error:',e);
if(errors.length)process.exit(61);
console.log('[DESKTOP_AI_PROTOCOL] PASS');
