#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const bin=process.env.GODOT_BIN||((cp.spawnSync(process.platform==='win32'?'where':'which',['godot4'],{encoding:'utf8'}).status===0)?'godot4':'godot');
const scene=process.argv[2];
if(!scene){console.log('[GODOT_SMOKE] no scene supplied; capability only');process.exit(0)}
const abs=path.resolve(scene);
if(!fs.existsSync(abs))throw new Error(`scene missing: ${abs}`);
const r=cp.spawnSync(bin,['--headless','--editor','--path',path.dirname(abs),'--quit'],{encoding:'utf8',timeout:120000});
const report={generatedAt:new Date().toISOString(),bin,scene:abs,status:r.status,stdout:r.stdout?.slice(-5000),stderr:r.stderr?.slice(-5000)};
fs.writeFileSync(path.join(ROOT,'GODOT_RUNTIME_SMOKE.json'),JSON.stringify(report,null,2)+'\n');
if(r.status!==0)process.exit(22);
console.log('[GODOT_SMOKE] PASS');
