'use strict';const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),mp=path.join(root,'PROCEDURAL_MODEL_MANIFEST.json'),m=JSON.parse(fs.readFileSync(mp,'utf8'));let ok=true,changed=false;
for(const model of m.models||[]){const p=path.join(root,model.path);if(!fs.existsSync(p)||fs.statSync(p).size<(model.minBytes||1)){console.error('MODEL MISSING',model.id);ok=false;continue}
const hash=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(model.sha256&&model.sha256!==hash){console.error('MODEL HASH MISMATCH',model.id,hash);ok=false}
else if(!model.sha256&&process.argv.includes('--lock')){model.sha256=hash;changed=true;console.log('MODEL LOCKED',model.id,hash)}
else console.log('MODEL OK',model.id,hash)}
if(changed)fs.writeFileSync(mp,JSON.stringify(m,null,2)+'\n');if(!ok)process.exit(1);
