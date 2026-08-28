#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const output=path.resolve(process.argv[2]||'');if(!output||!fs.existsSync(output)){console.error('next-action.cjs <output>');process.exit(2);}function j(n,d={}){try{return JSON.parse(fs.readFileSync(path.join(output,n),'utf8'));}catch{return d;}}
const m=j('GS360_MANIFEST.json'),q=j('GS360_QUALITY_REPORT.json'),iq=j('GS360_INPUT_QUALITY.json'),a=j('GS360_ARTIFACT_AUDIT.json'),d=j('GS360_DEPTH_REGISTRY.json'),b=j('GS360_BACKEND_REGISTRY.json'),sc=j('GS360_SYNTHETIC_CONSISTENCY.json'),opt=j('GS360_OPTIMIZATION_REPORT.json');
let action='DONE',reason='Quality target reached',priority=0,command=null;
if(a.status==='FAIL'){action='REPAIR_ARTIFACTS';reason='Artifact audit failed';priority=100;}
else if((iq.score??100)<55){action='RECAPTURE_INPUT';reason='Input quality is too low; extra compute is unlikely to fix seam/blur/exposure problems';priority=95;}
else if(m.selected_preference==='accurate' && m.source_panorama_count>1 && !m.pose_estimation?.pass){action='ENABLE_COLMAP';reason='Accurate multi-view mode needs reliable poses';priority=90;command='npm run gs360:resources';}
else if((sc.score??100)<55){action='STABILIZE_SYNTHETIC_VIEWS';reason='Synthetic-view stability is low; reduce virtual baseline or improve depth before training';priority=88;}
else if((m.depth?.kind||'proxy')==='proxy'){action='ENABLE_CPU_DEPTH';reason='Proxy depth is the main remaining single-view quality bottleneck';priority=85;command='npm run gs360:resources';}
else if(m.selected_preference==='accurate' && !m.quality_contract?.trained_3dgs){action=b.selected?'TRAIN_REAL_3DGS':'INSTALL_TRAINER';reason=b.selected?'A real trainer is available but output is not trained yet':'No real 3DGS trainer is available';priority=80;command=b.selected?`node systems/gs360/trainer-runner.cjs --output ${JSON.stringify(output)}`:'npm run gs360:resources';}
else if((q.reconstruction_fidelity??0)<70){action='ADD_VIEWPOINTS';reason='Reconstruction fidelity remains below target; capture coach should guide new views';priority=70;}
else if((q.ready_for_game_preview || q.ready_for_accurate_delivery) && opt.status==='TOOL_MISSING'){action='INSTALL_DELIVERY_OPTIMIZER';reason='Core result is ready; install MIT-licensed splat-transform for cleanup, SPZ/SOG compression and LOD exports';priority=40;command='npm run gs360:resources';}
else if(q.ready_for_game_preview || q.ready_for_accurate_delivery){action='DONE';reason='Current target is ready';priority=0;}
else {action='REFINE';reason='Run another quality/refine cycle';priority=50;}
const rep={schema:'world-server.gs360-next-action/v2',generatedAt:new Date().toISOString(),output,action,reason,priority,command,signals:{preference:m.selected_preference,inputQuality:iq.score??null,syntheticConsistency:sc.score??null,depth:m.depth?.kind||null,posePass:m.pose_estimation?.pass??null,trainer:b.selected||null,artifactStatus:a.status||null,optimizationStatus:opt.status||null,fidelity:q.reconstruction_fidelity??null}};fs.writeFileSync(path.join(output,'GS360_NEXT_ACTION.json'),JSON.stringify(rep,null,2)+'\n');console.log(JSON.stringify(rep,null,2));
