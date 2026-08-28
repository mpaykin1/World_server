#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),PREFIX=path.join(ROOT,'.ink-glyph-tools','npm');
const packages=['gltfpack@1.2.0','meshoptimizer@1.2.0'];
fs.mkdirSync(PREFIX,{recursive:true});
const npm=process.platform==='win32'?'npm.cmd':'npm';
console.log(`INSTALL tools into ${PREFIX}`);
const r=cp.spawnSync(npm,['install','--prefix',PREFIX,'--no-audit','--no-fund','--package-lock=false','--ignore-scripts',...packages],{stdio:'inherit',windowsHide:true,timeout:180000});
if(r.status!==0){console.error(`INK_GLYPH_TOOLS FAIL npm exited ${r.status}`);process.exit(r.status||1)}
const checks=[['gltfpack','1.2.0'],['meshoptimizer','1.2.0']];const installed={};
for(const [name,version] of checks){const p=path.join(PREFIX,'node_modules',name,'package.json');if(!fs.existsSync(p))throw new Error(`missing ${name}`);const pkg=JSON.parse(fs.readFileSync(p,'utf8'));if(pkg.version!==version)throw new Error(`${name} version ${pkg.version} != ${version}`);installed[name]=pkg.version}
fs.writeFileSync(path.join(ROOT,'.ink-glyph-tools','MANIFEST.json'),JSON.stringify({schemaVersion:1,installedAt:new Date().toISOString(),packages:installed,licenses:{gltfpack:'MIT',meshoptimizer:'MIT'}},null,2)+'\n');
console.log('INK_GLYPH_TOOLS PASS gltfpack=1.2.0 meshoptimizer=1.2.0');
