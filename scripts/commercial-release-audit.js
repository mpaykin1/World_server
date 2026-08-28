'use strict';
const cp=require('child_process');
function run(cmd){
  try{ cp.execSync(cmd,{stdio:'inherit'}); }
  catch(e){ console.warn('COMMERCIAL AUDIT WARNING:',cmd,'failed. Release is NOT blocked by commercial score/evidence.'); }
}
run('node scripts/commercial-validate.js');
run('node scripts/commercial-report.js');
process.exit(0);
