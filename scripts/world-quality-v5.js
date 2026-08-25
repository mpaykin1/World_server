#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path');const ROOT=process.cwd();
function run(script,hard=false){const r=cp.spawnSync(process.execPath,[path.join(ROOT,'scripts',script)],{cwd:ROOT,stdio:'inherit',env:process.env});if(r.status!==0&&hard)process.exit(r.status||1);return r.status===0}
run('world-device-provider-probe.js');run('world-telemetry-harvester.js');run('world-quality-autopilot.js',true);run('system-readiness-v5.js');console.log('[WORLD_QUALITY_V5] complete');
