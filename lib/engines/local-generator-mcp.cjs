'use strict';
const { createGenerationService } = require('./generation-service.cjs');
const VERSION='2026-07-28';
const INFO={name:'meta-games-local-generator',version:'0.1.0'};
const object=x=>!!x && Object.getPrototypeOf(x)===Object.prototype;
const idSchema={type:'object',properties:{artifact_id:{type:'string',pattern:'^[a-f0-9]{64}$'}},required:['artifact_id'],additionalProperties:false};
const definitions=[
 {name:'create_game',description:'Create an original offline package; no browser, rights or publication acceptance.',inputSchema:{type:'object',properties:{gameCard:{type:'object'},randomSeed:{type:['string','number']},recentGames:{type:'array',maxItems:8}},required:['gameCard','randomSeed'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 ...['validate_game','preview_game'].map(name=>({name,description:name==='validate_game'?'Check package integrity only.':'Return package data without executing or publishing it.',inputSchema:idSchema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}))
];
function createLocalGeneratorMcp({sourceCommit}={}) {
 const service=createGenerationService({sourceCommit});
 const error=(id,code,message,data)=>({jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{})}});
 const success=(id,result)=>({jsonrpc:'2.0',id,result:{resultType:'complete',...result,_meta:{'io.modelcontextprotocol/serverInfo':INFO}}});
 return request=>{
  if(!object(request)||request.jsonrpc!=='2.0'||typeof request.method!=='string')
   return error(null,-32600,'Invalid request');
  // Never execute notifications; no persistent effects from a missing request ID.
  if(!Object.hasOwn(request,'id')) return null;
  const id=request.id;
  if(!(typeof id==='string'||(typeof id==='number'&&Number.isFinite(id))))
   return error(null,-32600,'Invalid ID');
  const p=request.params, meta=p?._meta;
  if(!object(p)||!object(meta))return error(id,-32602,'Request metadata required');
  const version=meta['io.modelcontextprotocol/protocolVersion'];
  if(version!==VERSION)return error(id,-32022,'Unsupported protocol version',{supported:[VERSION],requested:version??null});
  if(!object(meta['io.modelcontextprotocol/clientCapabilities']))
   return error(id,-32602,'Client capabilities required');
  if(request.method==='server/discover')
   return success(id,{supportedVersions:[VERSION],capabilities:{tools:{}},instructions:'Trusted local process only. No remote writes or publication.'});
  if(request.method==='tools/list')return success(id,{tools:structuredClone(definitions)});
  if(request.method!=='tools/call')return error(id,-32601,'Method not found');
  const a=p.arguments;
  if(!definitions.some(t=>t.name===p.name))return error(id,-32602,'Unavailable tool');
  if(!object(a))return error(id,-32602,'Arguments must be an object');
  try{
   let value;
   if(p.name==='create_game')value=service.createGame(a);
   else{
    if(Object.keys(a).length!==1||!Object.hasOwn(a,'artifact_id'))
     return error(id,-32602,'Only artifact_id accepted');
    value=p.name==='validate_game'?service.validateGame(a.artifact_id):service.previewGame(a.artifact_id);
   }
   return success(id,{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:false});
  }catch{return success(id,{content:[{type:'text',text:'Generation operation rejected'}],isError:true});}
 };
}
module.exports={createLocalGeneratorMcp};
