import index from '../ASSET_INDEX.json' with { type: 'json' };
import rights from '../RIGHTS_REVIEW.json' with { type: 'json' };
// Never infer permission from a public repository or a candidate review.
export function licensedAssets(data = index, audit = rights) {
  if (audit?.schema_version !== 1 || audit.source_repository !== data.source_repository ||
      audit.source_commit !== data.source_commit || !Array.isArray(audit.entries) ||
      !Array.isArray(data.reusable_assets) || !Array.isArray(data.review_candidates)) return [];
  const all = [...data.reusable_assets, ...data.review_candidates];
  if (audit.entries.length !== all.length) return [];
  const byId = new Map(audit.entries.map(r => [r.id, r]));
  if (byId.size !== all.length || all.some(a => {
    const r = byId.get(a.id);
    return !r || r.source_path !== a.source?.path || r.git_blob_sha !== a.source?.git_blob_sha ||
      (r.license_status !== 'verified' && (a.reuse_allowed || a.redistribution_allowed || r.reuse_allowed || r.redistribution_allowed));
  })) return [];
  return data.reusable_assets.filter(a => {
    const r = byId.get(a.id);
    return a.license_status === 'verified' && a.reuse_allowed === true &&
      a.redistribution_allowed === true && typeof a.license_id === 'string' && !!a.license_id &&
      a.dependencies_verified === true && r.license_status === 'verified' &&
      r.reuse_allowed === true && r.redistribution_allowed === true &&
      r.dependencies_verified === true && typeof r.grant_evidence === 'string' && !!r.grant_evidence.trim();
  });
}
// Search is intentionally restricted to assets independently cleared by the rights audit.
export function searchLicensedAssets(filters = {}, data = index, audit = rights) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) ||
      Object.keys(filters).some(k => !['query', 'type', 'game_id', 'limit'].includes(k))) return null;
  const { query = '', type = '', game_id = '', limit = 20 } = filters;
  if (typeof query !== 'string' || query.length > 120 ||
      typeof type !== 'string' || type.length > 64 ||
      typeof game_id !== 'string' || game_id.length > 64 ||
      !Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  const term = query.trim().toLowerCase();
  const assets = licensedAssets(data, audit).filter(a =>
    (!type || a.type === type) && (!game_id || a.game_id === game_id) &&
    (!term || [a.id, a.type, a.game_id, a.format]
      .some(v => typeof v === 'string' && v.toLowerCase().includes(term))));
  return { assets: assets.slice(0, limit), total: assets.length };
}
const V='2026-07-28', INFO={name:'meta-games-readonly',version:'0.1.0'};
const tools=[
  {name:'list_games',description:'List SHA-pinned games; no asset reuse rights granted.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'inspect_game',description:'Inspect a known game by ID, without arbitrary file reads.',inputSchema:{type:'object',properties:{game_id:{type:'string',enum:index.games.map(x=>x.id)}},required:['game_id'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'list_assets',description:'List only SHA-pinned assets with verified redistribution grants and cleared dependencies. Empty when none qualify.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'search_assets',description:'Search only independently cleared, redistribution-licensed assets. Never returns unlicensed review candidates.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:120},type:{type:'string',maxLength:64},game_id:{type:'string',enum:index.games.map(x=>x.id)},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:true}}
];
function response(value,status=200,origin){
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
  if(origin){headers['access-control-allow-origin']=origin;headers.vary='Origin';}
  return new Response(JSON.stringify(value),{status,headers});
}
function error(id,code,message,data){
  return {jsonrpc:'2.0',id,error:{code,message,...(data===undefined?{}:{data})}};
}
function success(id,data){
  return {jsonrpc:'2.0',id,result:{resultType:'complete',...data,_meta:{'io.modelcontextprotocol/serverInfo':INFO}}};
}
function toolResult(id,value,isError=false){
  return success(id,{content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError});
}
async function readBounded(req){
  if(Number(req.headers.get('content-length')||0)>16384)throw new RangeError();
  if(!req.body)throw new SyntaxError();
  const r=req.body.getReader();let n=0;const chunks=[];
  try{for(;;){const x=await r.read();if(x.done)break;n+=x.value.byteLength;if(n>16384)throw new RangeError();chunks.push(x.value);}}
  finally{r.releaseLock();}
  const buf=new Uint8Array(n);let i=0;for(const x of chunks){buf.set(x,i);i+=x.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));
}
export default {
  async fetch(req,env){
    const url=new URL(req.url),origin=req.headers.get('origin');
    const allowed=[url.origin,'https://mpaykin1.github.io'];
    if(typeof env?.PORTAL_ORIGIN==='string')allowed.push(env.PORTAL_ORIGIN);
    if(origin&&!allowed.includes(origin))return response(error(null,-32001,'Forbidden origin'),403);
    if(url.pathname==='/health'&&req.method==='GET'){
      const sha=typeof env?.RENDER_GIT_COMMIT==='string'&&/^[a-f0-9]{40}$/.test(env.RENDER_GIT_COMMIT)?env.RENDER_GIT_COMMIT:null;
      return response({status:'ok',protocol:V,games:index.games.length,licensed_assets:index.reusable_assets.length,...(sha?{source_sha:sha}:{})},200,origin);
    }
    if(url.pathname!=='/mcp')return response(error(null,-32601,'Not found'),404,origin);
    if(req.method==='OPTIONS'&&origin)return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'accept, content-type, mcp-protocol-version, mcp-method, mcp-name',vary:'Origin'}});
    if(req.method!=='POST')return response(error(null,-32600,'POST required'),405,origin);
    const accept=req.headers.get('accept')||'';
    if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return response(error(null,-32600,'Accept must allow JSON and event-stream'),406,origin);
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))return response(error(null,-32600,'JSON required'),415,origin);
    let b;try{b=await readBounded(req);}catch(e){return response(error(null,-32700,e instanceof RangeError?'Body exceeds limit':'Invalid JSON'),e instanceof RangeError?413:400,origin);}
    if(!b||Array.isArray(b)||b.jsonrpc!=='2.0'||typeof b.method!=='string'||!b.params||typeof b.params!=='object')return response(error(b?.id??null,-32600,'Invalid request'),400,origin);
    const id=Object.hasOwn(b,'id')?b.id:null;
    const version=b.params._meta?.['io.modelcontextprotocol/protocolVersion'];
    if(!version||req.headers.get('mcp-protocol-version')!==version)return response(error(id,-32020,'HeaderMismatch: version'),400,origin);
    if(version!==V)return response(error(id,-32022,'Unsupported protocol version',{supported:[V],requested:version}),400,origin);
    if(!b.params._meta['io.modelcontextprotocol/clientCapabilities']||typeof b.params._meta['io.modelcontextprotocol/clientCapabilities']!=='object')return response(error(id,-32602,'Missing capabilities'),400,origin);
    if(req.headers.get('mcp-method')!==b.method)return response(error(id,-32020,'HeaderMismatch: method'),400,origin);
    if(b.method==='tools/call'&&req.headers.get('mcp-name')!==b.params.name)return response(error(id,-32020,'HeaderMismatch: name'),400,origin);
    if(!Object.hasOwn(b,'id'))return new Response(null,{status:202});
    if(typeof id!=='string'&&typeof id!=='number')return response(error(null,-32600,'Invalid ID'),400,origin);
    switch(b.method){
      case 'server/discover':return response(success(id,{supportedVersions:[V],capabilities:{tools:{}},instructions:'Public metadata only; unverified assets excluded.'}),200,origin);
      case 'tools/list':return response(success(id,{tools}),200,origin);
      case 'tools/call':{
        const a=b.params.arguments||{};
        if(b.params.name==='list_games'){
          if(Object.keys(a).length)return response(toolResult(id,{error:'Unexpected arguments'},true),200,origin);
          return response(toolResult(id,{games:index.games}),200,origin);
        }
        if(b.params.name==='list_assets'){
          if(Object.keys(a).length)return response(toolResult(id,{error:'Unexpected arguments'},true),200,origin);
          const assets=licensedAssets();
          return response(toolResult(id,{assets,total:assets.length}),200,origin);
        }
        if(b.params.name==='search_assets'){
          const found=searchLicensedAssets(a);
          return response(toolResult(id,found??{error:'Invalid search parameters'},found===null),200,origin);
        }
        if(b.params.name==='inspect_game'){
          const game=index.games.find(x=>x.id===a.game_id);
          return response(toolResult(id,game||{error:'Not indexed'},!game),200,origin);
        }
        return response(error(id,-32602,'Unavailable tool'),400,origin);
      }
      default:return response(error(id,-32601,'Method not found'),404,origin);
    }
  }
};
