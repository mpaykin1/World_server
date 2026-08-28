#!/usr/bin/env node
'use strict';const fs=require('fs'),path=require('path');
const repo=path.resolve(process.argv[2]||process.cwd()), manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','graphics-integration-manifest.json'),'utf8'));
function exists(rel){return fs.existsSync(path.join(repo,rel));}
const modules=manifest.modules.map(m=>{const found=(m.sentinels||[]).filter(exists);return{id:m.id,name:m.name,phase:m.phase||null,observed:m.statusObserved,sentinels:m.sentinels||[],found,status:found.length===(m.sentinels||[]).length&&found.length?'INSTALLED':found.length?'PARTIAL':'MISSING'};});
const report={schema:'improve-world.graphics-audit/v1',repo,at:new Date().toISOString(),modules,summary:{installed:modules.filter(x=>x.status==='INSTALLED').length,partial:modules.filter(x=>x.status==='PARTIAL').length,missing:modules.filter(x=>x.status==='MISSING').length}};console.log(JSON.stringify(report,null,2));if(process.argv.includes('--write'))fs.writeFileSync(path.join(repo,'GRAPHICS_SYSTEM_AUDIT.json'),JSON.stringify(report,null,2)+'\n');
