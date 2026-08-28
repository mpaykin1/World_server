#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const here=__dirname;const argv=process.argv.slice(2);const {compute:computeFingerprint}=require('./fingerprint.cjs');
function argValue(name,f=null){const i=argv.indexOf(name);return i>=0&&i+1<argv.length?argv[i+1]:f;}function has(n){return argv.includes(n);}function atomicJson(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(obj,null,2)+'\n');fs.renameSync(t,file);}function loadJson(file,f=null){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return f;}}
function run(cmd,args,opts={}){const started=Date.now();const r=spawnSync(cmd,args,{encoding:'utf8',stdio:opts.inherit?'inherit':'pipe',shell:!!opts.shell,cwd:opts.cwd||process.cwd(),timeout:opts.timeout||0});return{pass:r.status===0,status:r.status,elapsedSeconds:Math.round((Date.now()-started)/100)/10,stdoutTail:(r.stdout||'').slice(-8000),stderrTail:(r.stderr||'').slice(-8000)};}
function findPython(){const opts=process.platform==='win32'?[[path.join(here,'.venv','Scripts','python.exe'),[]],['python',[]],['py',['-3']]]:[[path.join(here,'.venv','bin','python'),[]],['python3',[]],['python',[]]];for(const [cmd,prefix] of opts){if((cmd.includes('/')||cmd.includes('\\'))&&!fs.existsSync(cmd))continue;const t=run(cmd,[...prefix,'-c','import sys']);if(t.pass)return[cmd,prefix];}return null;}
const outputArg=argValue('--output');if(!outputArg){console.error('[GS360 AUTOPILOT] missing --output');process.exit(2);}const output=path.resolve(outputArg);const statePath=path.join(output,'GS360_AUTOPILOT_STATE.json');const reportPath=path.join(output,'GS360_AUTOPILOT_REPORT.json');const manifestPath=path.join(output,'GS360_MANIFEST.json');const qualityPath=path.join(output,'GS360_QUALITY_REPORT.json');const resume=has('--resume');const retries=Math.max(1,Number(argValue('--retries','2'))||2);const postWait=Math.max(0,Number(argValue('--post-wait','0'))||0);const postCheck=argValue('--post-check','');const trainMode=argValue('--train','auto');
const forward=[];for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--resume')continue;if(['--retries','--post-wait','--post-check','--train'].includes(a)){i++;continue;}forward.push(a);}
const state=resume?(loadJson(statePath,{})||{}):{};const fp=computeFingerprint(forward);const priorFingerprint=state.generationFingerprint||null;if(resume&&priorFingerprint&&priorFingerprint!==fp.fingerprint){state.resumeInvalidated={at:new Date().toISOString(),reason:'input_or_generation_config_changed',previous:priorFingerprint,current:fp.fingerprint};state.stages={};}state.schema='world-server.gs360-autopilot-state/v3';state.startedAt=state.startedAt||new Date().toISOString();state.updatedAt=new Date().toISOString();state.output=output;state.generationFingerprint=fp.fingerprint;state.fingerprintInputs=fp.inputs;state.stages=state.stages||{};atomicJson(statePath,state);
function mark(stage,data){state.stages[stage]={...(state.stages[stage]||{}),...data,updatedAt:new Date().toISOString()};state.updatedAt=new Date().toISOString();atomicJson(statePath,state);}
console.log('[GS360 AUTOPILOT V6] output:',output);

// 1. Generation with checkpoint/resume.
if(!(resume&&state.stages.generate?.pass&&fs.existsSync(manifestPath))){mark('generate',{pass:false,status:'running',attempts:[]});let gen=null;for(let attempt=1;attempt<=retries;attempt++){gen=run(process.execPath,[path.join(here,'run.cjs'),...forward]);state.stages.generate.attempts.push({attempt,...gen});atomicJson(statePath,state);if(gen.pass)break;}mark('generate',{pass:!!gen?.pass,status:gen?.pass?'complete':'failed'});if(!gen?.pass){atomicJson(reportPath,{schema:'world-server.gs360-autopilot/v2',pass:false,status:'GENERATION_FAILED',statePath,state});process.exit(10);}}else console.log('[GS360 AUTOPILOT V6] resume: generation complete');

// 2. Input-quality gate before spending more compute on refinement/training.
const py=findPython();if(!py){mark('input_quality',{pass:false,status:'python_missing'});process.exit(11);}
const iqRun=run(py[0],[...py[1],path.join(here,'input-quality.py'),'--output',output]);
const iq=loadJson(path.join(output,'GS360_INPUT_QUALITY.json'),{});
mark('input_quality',{pass:iqRun.pass,status:iq.status||'unknown',score:iq.score??null,report:iq});

// 2b. Synthetic-view stability gate. It detects unstable depth warps without claiming metric geometry.
const scRun=run(py[0],[...py[1],path.join(here,'synthetic-consistency.py'),'--output',output]);
const consistency=loadJson(path.join(output,'GS360_SYNTHETIC_CONSISTENCY.json'),{});
mark('synthetic_consistency',{pass:scRun.pass,status:consistency.status||'unknown',score:consistency.score??null,report:consistency});

// 3. Depth registry chooses OpenVINO/ONNX/proxy truthfully.
const dr=run(process.execPath,[path.join(here,'depth-registry.cjs'),output]);
const depthRegistry=loadJson(path.join(output,'GS360_DEPTH_REGISTRY.json'),{});
mark('depth_registry',{pass:dr.pass,status:dr.pass?'complete':'failed',selected:depthRegistry.selected||null});

// 4. Backend registry and optional real trainer.
const reg=run(process.execPath,[path.join(here,'backend-registry.cjs'),output]);const registry=loadJson(path.join(output,'GS360_BACKEND_REGISTRY.json'),{});mark('backend_registry',{pass:reg.pass,status:reg.pass?'complete':'failed',selected:registry.selected||null});
const beforeTrain=loadJson(manifestPath,{});const pref=beforeTrain.selected_preference||'approximate';let trainerRequired=false;let trainerAttempted=false;let trainerOk=true;
if(trainMode!=='off'&&pref!=='approximate'&&!beforeTrain?.quality_contract?.trained_3dgs){trainerRequired=!!registry.selected; if(registry.selected){trainerAttempted=true;console.log('[GS360 AUTOPILOT V6] trainer:',registry.selected);const trArgs=[path.join(here,'trainer-runner.cjs'),'--output',output];if(resume)trArgs.push('--resume');const tr=run(process.execPath,trArgs);trainerOk=tr.pass;mark('trainer',{pass:tr.pass,status:tr.pass?'complete':'failed',backend:registry.selected,stdoutTail:tr.stdoutTail,stderrTail:tr.stderrTail});}else mark('trainer',{pass:true,status:'not_available',backend:null});}else mark('trainer',{pass:true,status:pref==='approximate'?'skipped_approximate':'already_trained_or_disabled'});

// 5. Artifact integrity audit after any training attempt.
const auditRun=run(py[0],[...py[1],path.join(here,'artifact-audit.py'),'--output',output]);const audit=loadJson(path.join(output,'GS360_ARTIFACT_AUDIT.json'),{});mark('artifact_audit',{pass:auditRun.pass,status:audit.status||'unknown',score:audit.score??null,report:audit});

// 5b. Safe delivery optimization. Original PLY is never deleted or replaced.
const optRun=run(process.execPath,[path.join(here,'splat-optimizer.cjs'),'--output',output,'--target','auto']);
const optimization=loadJson(path.join(output,'GS360_OPTIMIZATION_REPORT.json'),{});
mark('optimizer',{pass:optRun.pass,status:optimization.status||'unknown',variants:optimization.variants||[],report:optimization});

// 6. Quality gate.
const qrun=run(py[0],[...py[1],path.join(here,'quality-gate.py'),'--output',output]);const quality=loadJson(qualityPath,{});mark('quality',{pass:qrun.pass,status:quality.status||'unknown',report:quality});

// 7. Capture coach tells user exactly what extra viewpoints give the largest benefit.
const capRun=run(py[0],[...py[1],path.join(here,'capture-coach.py'),'--output',output]);const cap=loadJson(path.join(output,'GS360_CAPTURE_PLAN.json'),{});mark('capture_coach',{pass:capRun.pass,status:capRun.pass?'complete':'failed',needMoreCapture:!!cap.need_more_capture});
const naRun=run(process.execPath,[path.join(here,'next-action.cjs'),output]);const nextAction=loadJson(path.join(output,'GS360_NEXT_ACTION.json'),{});mark('next_action',{pass:naRun.pass,status:naRun.pass?'complete':'failed',action:nextAction.action||null});

// 8. License gate + free resource plan.
const lg=run(process.execPath,[path.join(here,'license-gate.cjs'),process.cwd()]);mark('license_gate',{pass:lg.pass,status:lg.pass?'complete':'failed'});
const resourceRun=run(process.execPath,[path.join(here,'resource-advisor.cjs'),process.cwd()]);mark('resources',{pass:resourceRun.pass,status:resourceRun.pass?'complete':'failed',stdoutTail:resourceRun.stdoutTail,stderrTail:resourceRun.stderrTail});

// 9. Delayed verification helper for installs / DNS / PATH / deployment propagation.
if(postWait>0||postCheck){const wa=[path.join(here,'wait-and-verify.cjs'),'--wait',String(postWait),'--retries','3','--retry-wait','60'];if(postCheck)wa.push('--check',postCheck);wa.push('--reason','GS360 autopilot delayed verification');const wr=run(process.execPath,wa,{inherit:true});mark('delayed_verify',{pass:wr.pass,status:wr.pass?'complete':'failed'});}

const ready=pref==='accurate'?!!quality.ready_for_accurate_delivery:!!quality.ready_for_game_preview;const hardFailure=!state.stages.generate?.pass||!state.stages.artifact_audit?.pass||!state.stages.quality?.pass||(trainerRequired&&trainerAttempted&&!trainerOk);
const report={schema:'world-server.gs360-autopilot/v3',pass:!hardFailure,ready,status:quality.status||(ready?'READY':'PARTIAL'),preference:pref,generationFingerprint:fp.fingerprint,trainer:{required:trainerRequired,attempted:trainerAttempted,pass:trainerOk,selected:registry.selected||null},artifactAuditScore:audit.score??null,syntheticConsistency:consistency.score??null,optimizationStatus:optimization.status||null,optimizedVariants:optimization.variants||[],technicalReadiness:quality.technical_readiness??null,gamePreviewReadiness:quality.game_preview_readiness??null,reconstructionFidelity:quality.reconstruction_fidelity??null,statePath,qualityPath,backendRegistry:path.join(output,'GS360_BACKEND_REGISTRY.json'),capturePlan:path.join(output,'GS360_CAPTURE_PLAN.json'),resourcePlan:path.resolve(process.cwd(),'GS360_RESOURCE_PLAN.json'),licenseGate:path.resolve(process.cwd(),'GS360_LICENSE_GATE.json'),depthRegistry:path.join(output,'GS360_DEPTH_REGISTRY.json'),inputQuality:path.join(output,'GS360_INPUT_QUALITY.json'),syntheticConsistencyReport:path.join(output,'GS360_SYNTHETIC_CONSISTENCY.json'),optimizationReport:path.join(output,'GS360_OPTIMIZATION_REPORT.json'),nextAction:path.join(output,'GS360_NEXT_ACTION.json'),completedAt:new Date().toISOString()};atomicJson(reportPath,report);mark('complete',{pass:report.pass,status:report.status});console.log(JSON.stringify(report,null,2));process.exit(report.pass?0:20);
