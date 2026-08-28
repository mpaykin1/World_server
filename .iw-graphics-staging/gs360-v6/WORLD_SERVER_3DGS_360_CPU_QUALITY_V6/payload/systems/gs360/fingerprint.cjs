#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const crypto=require('node:crypto');const path=require('node:path');
function fileHash(file){const h=crypto.createHash('sha256');const fd=fs.openSync(file,'r');try{const buf=Buffer.allocUnsafe(1024*1024);let pos=0,n=0;while((n=fs.readSync(fd,buf,0,buf.length,pos))>0){h.update(buf.subarray(0,n));pos+=n;}}finally{fs.closeSync(fd);}return h.digest('hex');}
function inputPaths(argv){const i=argv.indexOf('--input');if(i<0)return[];const out=[];for(let j=i+1;j<argv.length;j++){const a=argv[j];if(a.startsWith('--'))break;out.push(path.resolve(a));}return out;}
function compute(argv){const h=crypto.createHash('sha256');h.update(JSON.stringify(argv));const inputs=[];for(const p of inputPaths(argv)){if(fs.existsSync(p)&&fs.statSync(p).isFile()){const st=fs.statSync(p);const sha=fileHash(p);inputs.push({path:p,size:st.size,sha256:sha});h.update(p);h.update(String(st.size));h.update(sha);}else{inputs.push({path:p,missing:true});h.update(p);h.update('MISSING');}}
for(const env of ['GS360_DEPTH_ONNX','GS360_DEPTH_OPENVINO','GS360_DEPTH_ANYTHING_ROOT','GS360_DEPTH_ANYTHING_CHECKPOINT']){const v=process.env[env]||'';h.update(env+'='+v);if(v&&fs.existsSync(v)&&fs.statSync(v).isFile()){const st=fs.statSync(v);h.update(String(st.size));h.update(String(st.mtimeMs));}}
return{fingerprint:h.digest('hex'),inputs,argv};}
if(require.main===module){const rep=compute(process.argv.slice(2));console.log(JSON.stringify(rep,null,2));}
module.exports={compute};
