'use strict';const cp=require('child_process'),path=require('path');const root=path.resolve(__dirname,'..');
function run(args){console.log('>',process.execPath,args.join(' '));cp.execFileSync(process.execPath,args,{cwd:root,stdio:'inherit'})}
run(['scripts/check-procedural-quality-runtime.js']);
run(['scripts/run-procedural-tests.js']);
run(['scripts/procedural-quality-native-audit.js']);
run(['scripts/procedural-quality-v6-device-matrix.js']);
run(['scripts/procedural-quality-readiness.js']);
run(['scripts/procedural-quality-visual-critic.js']);
run(['scripts/procedural-quality-tournament.js']);
run(['scripts/procedural-quality-rollback.js']);
console.log('PROCEDURAL QUALITY V6 GATE: PASS');
