#!/usr/bin/env node
'use strict';
const cp=require('child_process');
const commands=[
  ['npm',['run','golden:check']],
  ['npm',['run','quality:check']],
  ['npm',['run','quality:regression']]
];
for(const [cmd,args] of commands){
  const r=cp.spawnSync(cmd,args,{stdio:'inherit',shell:process.platform==='win32'});
  if(r.status!==0)process.exit(1);
}
process.exit(0);
