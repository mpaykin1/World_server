'use strict';
const {parentPort}=require('node:worker_threads');const fs=require('node:fs');const crypto=require('node:crypto');const zlib=require('node:zlib');
function run(task){
  if(task.op==='sha256-file'){const b=fs.readFileSync(task.path);return {hash:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};}
  if(task.op==='json-hash'){const raw=fs.readFileSync(task.path,'utf8');const data=JSON.parse(raw);const canonical=JSON.stringify(data);return {hash:crypto.createHash('sha256').update(canonical).digest('hex'),keys:data&&typeof data==='object'?Object.keys(data).length:0};}
  if(task.op==='gzip-file'){const b=fs.readFileSync(task.path),gz=zlib.gzipSync(b,{level:6});return {inputBytes:b.length,outputBytes:gz.length,hash:crypto.createHash('sha256').update(gz).digest('hex')};}
  throw new Error(`unsupported-cpu-op:${task.op}`);
}
parentPort.on('message',msg=>{try{parentPort.postMessage({id:msg.id,ok:true,result:run(msg.task)});}catch(error){parentPort.postMessage({id:msg.id,ok:false,error:String(error&&error.message||error)});}});
