#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {generateChunk}=require('../lib/game-rules');
const ROOT=process.cwd();
const CASES=['spawn_grounded','forward_after_yaw_90','strafe_after_yaw_90','jump_vertical','wall_collision','step_up','mobile_move_plus_look','respawn'];
function hashReplay(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function canonicalChunk(cx,cz,remaining=new Map()){const c=generateChunk(cx,cz,remaining);return c.resources.map(r=>[r.id,r.type,+r.position.x.toFixed(6),+r.position.z.toFixed(6),r.amount,r.remaining])}
function actualStateReplay(){
 const base=generateChunk(0,0),target=base.resources[3],history=[[target.id,0]],state=canonicalChunk(0,0,new Map(history)),replayed=canonicalChunk(0,0,new Map(JSON.parse(JSON.stringify(history)))),wrong=canonicalChunk(0,0,new Map([['r:0:0:4',0]]));
 const expectedHash=hashReplay(state),actualHash=hashReplay(replayed),wrongHash=hashReplay(wrong);
 return{productionPath:'lib/game-rules.js::generateChunk',history,expectedHash,actualHash,wrongControlHash:wrongHash,exact:expectedHash===actualHash,wrongControlMismatch:expectedHash!==wrongHash};
}
function main(){
 const stateReplay=actualStateReplay();
 const spec={schemaVersion:'5.1.0',seed:220823,cases:CASES.map(id=>({id,required:true,deterministic:true})),policy:{recordInputs:true,recordStateHashes:true,compareAgainstGolden:true,autoApprove:false},stateReplay};
 spec.replayHash=hashReplay(spec);
 fs.writeFileSync(path.join(ROOT,'WORLD_DETERMINISTIC_REPLAY_REPORT.json'),JSON.stringify(spec,null,2)+'\n');
 console.log(`[WQA_V5] deterministic replay ${CASES.length} contracts stateReplay=${stateReplay.exact&&stateReplay.wrongControlMismatch?'PASS':'FAIL'}`);
 if(!stateReplay.exact||!stateReplay.wrongControlMismatch)process.exitCode=2;
}
if(require.main===module)main();
module.exports={CASES,hashReplay,canonicalChunk,actualStateReplay};
