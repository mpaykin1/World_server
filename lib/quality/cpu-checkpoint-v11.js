'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const h=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
class CpuCheckpointStore{
  constructor(root){this.root=root;fs.mkdirSync(root,{recursive:true});}
  file(id){return path.join(this.root,`${String(id).replace(/[^a-zA-Z0-9_.-]/g,'_')}.json`);}
  save(id,input,state){const f=this.file(id),tmp=`${f}.tmp`;const row={id,inputHash:h(input),state,savedAt:new Date().toISOString()};fs.writeFileSync(tmp,JSON.stringify(row));fs.renameSync(tmp,f);return row;}
  load(id,input){const f=this.file(id);if(!fs.existsSync(f))return {ok:false,reason:'not-found'};const row=JSON.parse(fs.readFileSync(f,'utf8'));if(row.inputHash!==h(input))return {ok:false,reason:'input-changed'};return {ok:true,row};}
  clear(id){fs.rmSync(this.file(id),{force:true});}
}
module.exports={CpuCheckpointStore};
