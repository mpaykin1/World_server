#!/usr/bin/env node
// Minimal MCP stdio server; connect Codex/Claude Code to your running Bridge.
// Never put BRIDGE_API_TOKEN in prompts or committed configuration.
import readline from 'node:readline';
const endpoint=(process.env.BRIDGE_URL||'http://127.0.0.1:8765').replace(/\/$/,'');
const token=process.env.BRIDGE_API_TOKEN||'';
const tools=[
 {name:'graf_submit_job', description:'Submit an allowlisted GitHub write to GRAF Bridge durable queue. Supported actions: create_issue, update_issue, comment_issue, update_comment, create_pr, update_pr. Always use a STABLE idempotencyKey for retries; this queues changes but does not merge or deploy.', inputSchema:{type:'object',required:['repo','action','payload','idempotencyKey'],properties:{repo:{type:'string'},action:{type:'string',enum:['create_issue','update_issue','comment_issue','update_comment','create_pr','update_pr']},payload:{type:'object'},idempotencyKey:{type:'string'}}}},
 {name:'graf_job_status',description:'Retrieve durable status and GitHub URL for one queued bridge operation.',inputSchema:{type:'object',required:['jobId'],properties:{jobId:{type:'string'}}}},
 {name:'graf_recent_jobs',description:'Retrieve last 20 bridge operations.',inputSchema:{type:'object',properties:{}}},
 {name:'graf_diagnostics',description:'Read-only GitHub App permissions/connectivity test for allowlisted repository.',inputSchema:{type:'object',required:['repo'],properties:{repo:{type:'string'}}}}
];
async function request(path,method='GET',body,idem){
 if(!token)throw new Error('BRIDGE_API_TOKEN not set');
 const r=await fetch(`${endpoint}${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(idem?{'idempotency-key':idem}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 const s=await r.text();if(!r.ok)throw new Error(`Bridge HTTP ${r.status}: ${s.slice(0,600)}`);
 return JSON.parse(s);
}
async function execute(name,args){
 switch(name){
  case 'graf_submit_job': {const {idempotencyKey,...body}=args;return request('/v1/jobs','POST',body,idempotencyKey)}
  case 'graf_job_status':return request(`/v1/jobs/${encodeURIComponent(args.jobId)}`);
  case 'graf_recent_jobs':return request('/v1/jobs');
  case 'graf_diagnostics':return request('/v1/diagnostics','POST',{repo:args.repo});
  default:throw new Error('Unknown tool');
 }
}
function send(v){process.stdout.write(JSON.stringify(v)+'\n')}
const rl=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 let msg;try{msg=JSON.parse(line)}catch{continue}
 if(msg.id===undefined)continue;
 try{
  let result;
  if(msg.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'graf-github-bridge',version:'1.0.0'}};
  else if(msg.method==='tools/list')result={tools};
  else if(msg.method==='tools/call') {
   const {name,arguments:a={}}=msg.params||{};
   try{const value=await execute(name,a);result={content:[{type:'text',text:JSON.stringify(value)}]}}
   catch(e){result={isError:true,content:[{type:'text',text:e.message}]}}
  }else if(msg.method==='ping')result={};
  else {send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}});continue}
  send({jsonrpc:'2.0',id:msg.id,result});
 }catch(e){send({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:e.message}})}
}
