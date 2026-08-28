#!/usr/bin/env node
'use strict';const cp=require('child_process');
function cmd(command,args=['--version']){try{const o=cp.execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});return{ok:true,command,snippet:(o.split(/\r?\n/)[0]||'').trim()};}catch(e){return{ok:false,command,error:e.message};}}
function module(name){try{const p=require(`${name}/package.json`);return{ok:true,module:name,version:p.version};}catch(e){return{ok:false,module:name,error:e.message};}}
const checks=[cmd('node',['-v']),cmd('ffmpeg',['-version']),cmd('magick',['-version']),cmd('python',['--version']),cmd('oxipng',['--version']),module('sharp')];const required=checks.filter(x=>['node','ffmpeg','magick'].includes(x.command)||x.module==='sharp');const ok=required.every(x=>x.ok);console.log(JSON.stringify({ok,checks,note:'python/oxipng optional on Node local builder; worker requires Python/Pillow/Numpy'},null,2));process.exit(ok?0:1);
