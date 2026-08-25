#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=process.cwd();
function patchFile(file,fn){const p=path.join(root,file);if(!fs.existsSync(p))return false;const before=fs.readFileSync(p,'utf8');const after=fn(before);if(after!==before){fs.writeFileSync(p,after);return true;}return false;}
const changed=[];
if(patchFile('server.js',s=>{if(s.includes("'/api/quality-telemetry'"))return s;const rx=/(\s*\['\/api\/ai3d-voxel-generate',\s*require\('\.\/api\/ai3d-voxel-generate'\)\])(\s*\n\]\);)/;if(rx.test(s))return s.replace(rx,'$1,\n  [\'/api/quality-telemetry\', require(\'./api/quality-telemetry\')]$2');const idx=s.indexOf('\n]);');if(idx>=0)return s.slice(0,idx).replace(/\s*$/,'')+',\n  [\'/api/quality-telemetry\', require(\'./api/quality-telemetry\')]'+s.slice(idx);throw new Error('Could not safely patch server.js API map');}))changed.push('server.js');
const pkgPath=path.join(root,'package.json');if(fs.existsSync(pkgPath)){const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.scripts=pkg.scripts||{};const scripts={
  'quality:observe':'node scripts/quality-autopilot.js --mode observe --report quality-report.json',
  'quality:candidate':'node scripts/quality-autopilot.js --mode candidate --verify --compile-regressions --report quality-report.json',
  'quality:test':'node --test test/quality-autopilot.test.js test/quality-autopilot-v2.test.js test/quality-autopilot-v3.test.js',
  'quality:readiness':'node scripts/quality-readiness.js',
  'quality:audit':'node scripts/quality-audit-verify.js',
  'quality:synthetic':'node scripts/quality-synthetic-player-army.js',
  'quality:canary':'node scripts/quality-progressive-canary.js',
  'quality:dependency-tournament':'node scripts/quality-dependency-tournament.js',
  'quality:sync-knowledge':'node scripts/quality-sync-knowledge.js'
};let dirty=false;for(const[k,v]of Object.entries(scripts)){if(pkg.scripts[k]!==v){pkg.scripts[k]=v;dirty=true;}}if(dirty){fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');changed.push('package.json');}}
if(patchFile('.env.example',s=>{let out=s;for(const line of ['QUALITY_AUTOPILOT_TELEMETRY_SECRET=','QUALITY_PRODUCTION_URL=','QUALITY_FULL_AUTOPILOT_ENABLED=false','QUALITY_GITHUB_WRITE_CONNECTED=false','QUALITY_VERCEL_PROJECT_CONNECTED=false'])if(!out.includes(line.split('=')[0]+'='))out+='\n'+line;return out.endsWith('\n')?out:out+'\n';}))changed.push('.env.example');
fs.mkdirSync(path.join(root,'data','quality-autopilot'),{recursive:true});const errors=path.join(root,'data','quality-autopilot','production-errors.json');if(!fs.existsSync(errors))fs.writeFileSync(errors,JSON.stringify({version:1,events:[]},null,2)+'\n');
console.log('[QUALITY_INSTALL] updated='+[...new Set(changed)].join(','));
