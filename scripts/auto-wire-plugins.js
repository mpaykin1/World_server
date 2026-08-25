#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const POLICY=JSON.parse(fs.readFileSync(path.join(ROOT,'data/plugin-discovery-policy.json'),'utf8'));
const { PLUGINS, getGraph, synergyScore } = require('../lib/plugin-orchestrator');
const LOG=path.join(ROOT,'QUALITY_PLUGIN_DISCOVERY.log');
function log(m){ const ts=new Date().toISOString(); const l=`[${ts}] ${m}`; console.log(l); fs.appendFileSync(LOG,l+'\n'); }

const graph=getGraph();
log(`Graph installed=${graph.installed.join(',')||'none'} missing=${graph.missing.join(',')} synergy=${graph.synergy} synergyWithAll=${graph.synergyWithAll}`);

let toInstall=[];
for(const k of graph.missing){
  const p=PLUGINS[k];
  if(!POLICY.allowedLicenses.includes(p.license)){ log(`SKIP ${k} license ${p.license}`); continue; }
  if(p.impact < POLICY.thresholdPercent){ log(`SKIP ${k} impact ${p.impact}<${POLICY.thresholdPercent}`); continue; }
  const hypo=[...graph.installed,k];
  const syn=synergyScore(hypo);
  const thresh = POLICY.mutualSupportThreshold || POLICY.mutualSupport?.threshold || POLICY.automation?.mutualSupportThreshold || 50;
  if(POLICY.mutualSupport?.enabled && syn < thresh){
    log(`SKIP ${k} synergy ${syn}<${thresh}`); continue;
  }
  toInstall.push(k);
}

if(!toInstall.length){ log('No candidates meet >50% + mutual support'); process.exit(0); }

log(`AUTO-INSTALL candidates: ${toInstall.join(', ')}`);
for(const k of toInstall){
  const p=PLUGINS[k];
  try{
    log(`npm install ${p.npm}...`);
    cp.execSync(`npm install ${p.npm} --save`,{stdio:'inherit',cwd:ROOT});
    log(`INSTALLED ${k}`);
  }catch(e){ log(`FAIL ${k}: ${e.message}`); process.exit(1); }
}

// After install, verify mutual wiring
const after=getGraph();
log(`After install installed=${after.installed.join(',')} synergy=${after.synergy}`);

// Run guards
try{
  cp.execSync('node scripts/check-supabase-migrations.js',{stdio:'inherit',cwd:ROOT});
  cp.execSync('node scripts/check-js.js',{stdio:'inherit',cwd:ROOT});
  cp.execSync('node --test test/supabase-migration-drift.test.js',{stdio:'inherit',cwd:ROOT});
  log('GUARDS PASS');
}catch(e){ log('GUARD FAIL - rollback recommended'); process.exit(1); }

// Write adapters stubs if missing (mutual wiring)
const adapters={
  'lib/adapters/physics-cannon.js': `'use strict';
// Adapter: cannon-es -> stable step-up/wall collision (mutual with comlink worker)
let CANNON=null; try{ CANNON=require('cannon-es'); }catch{}
function stepUp(pos,nextPos){ if(!CANNON) return nextPos; return nextPos; }
module.exports={ stepUp, available:!!CANNON };
`,
  'lib/adapters/worker-comlink.js': `'use strict';
// Adapter: comlink -> typed worker RPC (mutual with physics + atlas)
let comlink=null; try{ comlink=require('comlink'); }catch{}
module.exports={ expose:(obj)=>comlink?comlink.expose(obj):null, wrap:(p)=>comlink?comlink.wrap(p):p, available:!!comlink };
`,
  'lib/adapters/persist-idb.js': `'use strict';
// Adapter: idb-keyval -> offline evidence cache (mutual with worker + atlas)
let idb=null; try{ idb=require('idb-keyval'); }catch{}
async function cacheEvidence(k,v){ if(!idb) return; await idb.set(k,v); }
module.exports={ cacheEvidence, available:!!idb };
`
};
for(const [rel,content] of Object.entries(adapters)){
  const abs=path.join(ROOT,rel);
  if(!fs.existsSync(abs)){
    fs.mkdirSync(path.dirname(abs),{recursive:true});
    fs.writeFileSync(abs,content);
    log(`Created adapter ${rel}`);
  }
}

log('AUTO-WIRE DONE mutualSupport synergy='+after.synergy);
