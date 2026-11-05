'use strict';
// Local stdio only. No HTTP listener, arbitrary paths, remote writes or user code.
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createLocalGeneratorMcp}=require('../lib/engines/local-generator-mcp.cjs');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{
 cwd:path.resolve(__dirname,'..'),encoding:'utf8'}).trim();
const handle=createLocalGeneratorMcp({sourceCommit});
const max=131072;
const send=value=>{if(value!==null)process.stdout.write(JSON.stringify(value)+'\n');};
const bad=(code,message)=>({jsonrpc:'2.0',id:null,error:{code,message}});
(async()=>{
 let buffer=Buffer.alloc(0);
 for await(const chunk of process.stdin){
  buffer=Buffer.concat([buffer,chunk]);
  let newline;
  while((newline=buffer.indexOf(10))!==-1){
   if(newline>max){send(bad(-32600,'Frame exceeds limit'));return;}
   const line=buffer.subarray(0,newline);buffer=buffer.subarray(newline+1);
   if(!line.length)continue;
   try{send(await handle(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line))));}
   catch{send(bad(-32700,'Invalid JSON'));}
  }
  if(buffer.length>max){send(bad(-32600,'Frame exceeds limit'));return;}
 }
 if(buffer.length)send(bad(-32700,'Newline-delimited message required'));
})().catch(()=>{process.stderr.write('Local generator transport failed\n');process.exitCode=1;});
