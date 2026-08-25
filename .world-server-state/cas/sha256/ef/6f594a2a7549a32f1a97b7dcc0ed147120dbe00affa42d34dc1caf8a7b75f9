#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd(),action=process.argv[2],id=process.argv[3];if(!action||!id)throw new Error('usage: night-checkpoint <load|save|clear> <id> [json]');
const dir=path.join(ROOT,'.quality-checkpoints');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id.replace(/[^a-z0-9_.-]/gi,'-')+'.json');
if(action==='load'){if(!fs.existsSync(file)){console.log('{}');process.exit(0)}console.log(fs.readFileSync(file,'utf8'))}
else if(action==='save'){const raw=process.argv[4]||'{}',data=JSON.parse(raw);fs.writeFileSync(file,JSON.stringify({updatedAt:new Date().toISOString(),...data},null,2)+'\n');console.log(file)}
else if(action==='clear'){if(fs.existsSync(file))fs.unlinkSync(file);console.log('cleared')}
else throw new Error('unknown action');
