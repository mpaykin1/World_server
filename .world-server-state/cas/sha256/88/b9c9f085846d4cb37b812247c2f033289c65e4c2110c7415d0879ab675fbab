#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=process.cwd();
const CASES=['spawn_grounded','forward_after_yaw_90','strafe_after_yaw_90','jump_vertical','wall_collision','step_up','mobile_move_plus_look','respawn'];
function hashReplay(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function main(){const spec={schemaVersion:'5.0.0',seed:220823,cases:CASES.map(id=>({id,required:true,deterministic:true})),policy:{recordInputs:true,recordStateHashes:true,compareAgainstGolden:true,autoApprove:false}};spec.replayHash=hashReplay(spec);fs.writeFileSync(path.join(ROOT,'WORLD_DETERMINISTIC_REPLAY_REPORT.json'),JSON.stringify(spec,null,2)+'\n');console.log(`[WQA_V5] deterministic replay ${CASES.length} contracts`)}
if(require.main===module)main();module.exports={CASES,hashReplay};
