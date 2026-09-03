#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const reg=require('../lib/world-function-registry');const ROOT=path.resolve(__dirname,'..');
const [cmd='audit',arg]=process.argv.slice(2);function out(x,code=0){console.log(JSON.stringify(x,null,2));if(code)process.exitCode=code}
if(cmd==='audit'||cmd==='catalog'){
  const packages=reg.discover(ROOT),bad=packages.filter(x=>!x.ok);out({schemaVersion:'5.0.0',system:'WORLD_FUNCTION_PACKAGE_MANAGER',cmd,ok:bad.length===0,packages:packages.map(x=>({ok:x.ok,id:x.manifest?.id,version:x.manifest?.version,capabilities:x.manifest?.capabilities,sourceSha256:x.sourceSha256,errors:x.errors}))},bad.length?2:0);
}else if(cmd==='inspect'){
  if(!arg)throw new Error('inspect requires a package directory');const r=reg.inspectPackage(path.resolve(arg));out(r,r.ok?0:2);
}else if(cmd==='install'){
  if(!arg)throw new Error('install requires a package directory');const src=path.resolve(arg),r=reg.inspectPackage(src);if(!r.ok)return out({ok:false,stage:'audit',errors:r.errors},2);
  if(process.env.WORLD_FUNCTION_INSTALL_APPROVED!=='1')return out({ok:false,stage:'approval',message:'Set WORLD_FUNCTION_INSTALL_APPROVED=1 only after review/tests. Runtime hot code installation is forbidden.'},3);
  const dest=path.join(ROOT,'world-functions',r.manifest.id);fs.mkdirSync(path.dirname(dest),{recursive:true});if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(src,dest,{recursive:true});
  out({ok:true,installedTo:path.relative(ROOT,dest),id:r.manifest.id,version:r.manifest.version,next:['npm run world:functions:delivery-gate','deploy existing sandbox slot as a new immutable revision','verify sandbox','promote through Navigator canary']});
}else throw new Error('commands: audit | catalog | inspect <dir> | install <dir>');
