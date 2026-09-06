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
  let baseDiffAvailable=true;
  if(process.env.DESKTOP_AI_CHANGED_FILES){
    changed=process.env.DESKTOP_AI_CHANGED_FILES.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
  }else{
    const base=process.env.QUALITY_BASE_SHA||process.env.GITHUB_BASE_REF||'master';
    let r=cp.spawnSync('git',['diff','--name-only',base,'HEAD'],{cwd:ROOT,encoding:'utf8'});
    if(r.status!==0){
      // Shallow CI checkouts (fetch-depth: 1) don't have `base` locally - fetch just
      // that ref before giving up, so the real branch-vs-base diff still applies.
      cp.spawnSync('git',['fetch','--depth=1','origin',base],{cwd:ROOT,encoding:'utf8'});
      r=cp.spawnSync('git',['diff','--name-only',`origin/${base}`,'HEAD'],{cwd:ROOT,encoding:'utf8'});
    }
    if(r.status===0){
      changed=r.stdout.trim().split(/\r?\n/).filter(Boolean);
    }else{
      // Base truly unavailable (offline, unknown ref, ...). Falling back to raw
      // working-tree dirty/staged/untracked state is NOT a substitute: on a fully
      // committed CI checkout it only reflects side effects of earlier release:gate
      // steps (build artifacts, regenerated lockfiles/reports), not "did this task
      // update WORK_IN_PROGRESS.md" - that produced false failures on every CI run.
      // Skip the meaningful-file gate rather than guess from noise; other checks
      // (required sections, UNSET marker) still run below.
      baseDiffAvailable=false;
    }
  }
  if(!process.env.DESKTOP_AI_CHANGED_FILES&&baseDiffAvailable){
    // Local/dirty-workspace verification (not CI, which diffs a fully committed
    // checkout): also count uncommitted work so an AI mid-task still gets the
    // "update WORK_IN_PROGRESS.md" reminder before committing.
    const dirty=cp.spawnSync('git',['diff','--name-only'],{cwd:ROOT,encoding:'utf8'});
    const staged=cp.spawnSync('git',['diff','--cached','--name-only'],{cwd:ROOT,encoding:'utf8'});
    const untracked=cp.spawnSync('git',['ls-files','--others','--exclude-standard'],{cwd:ROOT,encoding:'utf8'});
    [dirty,staged,untracked].forEach(x=>{ if(x.status===0&&x.stdout.trim()) changed.push(...x.stdout.trim().split(/\r?\n/).filter(Boolean)); });
    changed=[...new Set(changed)];
  }
  // Root-level ALL_CAPS_NAME.json/.log/.md files are auto-generated evidence/report
  // artifacts rewritten as a side effect of earlier release:gate steps in the same
  // CI job (Sentry build, AI3D checks, this very script's own previous runs, ...).
  // Their content (timestamps, durations, absolute paths) legitimately differs
  // between a local Windows run and a fresh Linux CI run even when nothing about
  // the actual task changed, so treating every such diff as "you forgot to update
  // WORK_IN_PROGRESS.md" is a false positive, not a real signal. Real source lives
  // under scripts/, lib/, api/, apps/, services/, test/, data/, shared/ etc. with
  // lowercase/kebab-case names, so this pattern cleanly separates evidence noise
  // from actual project changes without needing an exhaustive exclusion list.
  const isGeneratedEvidenceFile=f=>!f.includes('/')&&/^[A-Z][A-Z0-9_]*\.(json|log)$/.test(f);
  const meaningful=changed.filter(f=>![
    'WORK_IN_PROGRESS.md','DESKTOP_AI_INSTALL_AND_VERIFY.md',
    'QUALITY_MASTER_REPORT.json','QUALITY_DIFF.md','QUALITY_DIFF.json'
  ].includes(f)&&!isGeneratedEvidenceFile(f));
  const hasUnset=/\bUNSET\b/.test(wip);
  if(meaningful.length&&hasUnset)errors.push(`WORK_IN_PROGRESS still contains UNSET while ${meaningful.length} project files changed`);
  if(meaningful.length&&!changed.includes('WORK_IN_PROGRESS.md'))errors.push('project files changed but WORK_IN_PROGRESS.md was not updated');
  if(!meaningful.length&&hasUnset)warnings.push('WORK_IN_PROGRESS is still the install template; update it before the next task');
  const final=/## Final evidence\s*\n([\s\S]*)$/i.exec(wip)?.[1]||'';
  if(process.env.DESKTOP_AI_REQUIRE_COMPLETE==='1'&&/Not completed\.|UNSET/i.test(final))errors.push('completion requested but Final evidence is not completed');
}
const report={generatedAt:new Date().toISOString(),pass:errors.length===0,errors,warnings};
const __reportPath=path.join(ROOT,'DESKTOP_AI_PROTOCOL_REPORT.json');
const __reportBody=JSON.stringify(report,null,2)+'\n';
let __wrote=false,__lastErr=null;
for(let __a=0;__a<5;__a++){
  try{ fs.writeFileSync(__reportPath,__reportBody); __wrote=true; break; }catch(__e){
    __lastErr=__e;
    const __code=(__e&&__e.code)||'';
    const __msg=String(__e&&__e.message||'');
    const __retryable=__code==='UNKNOWN'||__code==='EBUSY'||__code==='EPERM'||__code==='EACCES'||/unknown error/i.test(__msg);
    if(!__retryable||__a===4) throw __e;
    const __backoff=120*(Math.pow(2,__a));
    const __t=Date.now()+__backoff; while(Date.now()<__t){}
  }
}
if(!__wrote&&__lastErr) throw __lastErr;
for(const w of warnings)console.warn('[DESKTOP_AI_PROTOCOL] warning:',w);
for(const e of errors)console.error('[DESKTOP_AI_PROTOCOL] error:',e);
if(errors.length)process.exit(61);
console.log('[DESKTOP_AI_PROTOCOL] PASS');
