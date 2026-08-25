#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const ROOT=process.cwd();
const out=path.join(ROOT,'ROBLOX_BRIDGE_REPORT.json');
const resultFile=process.env.ROBLOX_TEST_RESULT_JSON || path.join(ROOT,'ROBLOX_TEST_RESULT.json');
const requireResult=process.argv.includes('--require');
const launch=process.argv.includes('--launch');

function write(r,code=0){
  fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
  console.log(`[ROBLOX_BRIDGE] ${r.status}`);
  process.exitCode=code;
}

const place=process.env.ROBLOX_PLACE_PATH;
const studio=process.env.ROBLOX_STUDIO_PATH;
const job={
  schemaVersion:1,
  createdAt:new Date().toISOString(),
  place:place||null,
  requiredChecks:['place-opens','play-starts','player-spawns','output-no-critical-errors','movement-works','camera-works','collision-works'],
  resultPath:resultFile
};
fs.writeFileSync(path.join(ROOT,'ROBLOX_TEST_JOB.json'),JSON.stringify(job,null,2)+'\n');

if(launch){
  if(process.platform!=='win32') return write({schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',reason:'Roblox Studio launch bridge requires Windows'}, requireResult?47:0);
  if(!studio||!fs.existsSync(studio)||!place||!fs.existsSync(place)) return write({schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',reason:'ROBLOX_STUDIO_PATH/ROBLOX_PLACE_PATH missing'}, requireResult?47:0);
  cp.spawn(studio,[place],{detached:true,stdio:'ignore'}).unref();
}

if(!fs.existsSync(resultFile)){
  return write({
    schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_VERIFIED',
    job,
    reason:'Studio result file missing. Desktop Roblox harness/plugin must execute the job and write ROBLOX_TEST_RESULT.json.'
  }, requireResult?47:0);
}
const result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
const checks=result.checks||{};
const passed=job.requiredChecks.every(k=>checks[k]===true);
write({schemaVersion:1,generatedAt:new Date().toISOString(),status:passed?'PASS':'FAIL',job,result}, passed?0:47);
