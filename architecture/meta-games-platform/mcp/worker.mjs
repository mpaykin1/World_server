import {createSourcePackage,sourceGate,previewSourcePackage} from './source-package.mjs';
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
// License-gated dependencies: unknown and unlicensed IDs are indistinguishable.
export function getLicensedDependencies(assetId, data = index, audit = rights) {
  if (typeof assetId !== 'string' || !assetId || assetId.length > 96) return null;
  const asset = licensedAssets(data, audit).find(a => a.id === assetId);
  if (!asset || !Array.isArray(asset.dependencies) || asset.dependencies.length > 64 ||
      asset.dependencies.some(dep => typeof dep !== 'string' || !dep || dep.length > 256)) return null;
  return {
    asset_id: asset.id,
    source_commit: asset.source?.commit,
    source_blob_sha: asset.source?.git_blob_sha,
    dependencies: asset.dependencies
  };
}
export function searchLicensedMechanics(filters = {}, data = index, audit = rights) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) ||
      Object.hasOwn(filters, 'type')) return null;
  const match = searchLicensedAssets({...filters, type: 'game_mechanics'}, data, audit);
  return match === null ? null : {mechanics: match.assets, total: match.total};
}

// Only an exact, SHA-pinned and independently licensed blob can be delivered.
// Do not interpret untrusted index entries as URLs or accept redirects.
function safePinnedSource(asset, data) {
  const src = asset?.source;
  if (!src || src.repository !== data.source_repository ||
      src.commit !== data.source_commit ||
      !/^[a-f0-9]{40}$/.test(src.commit) ||
      !/^[a-f0-9]{40}$/.test(src.git_blob_sha) ||
      typeof src.path !== 'string' || src.path.length > 240 ||
      !/^[a-zA-Z0-9_./-]+$/.test(src.path) ||
      src.path.split('/').some(p => !p || p === '.' || p === '..') ||
      !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(src.repository)) return null;
  return src;
}
async function boundedBytes(response, maxBytes = 131072) {
  const size = Number(response.headers.get('content-length') || 0);
  if (!response.ok || (size && size > maxBytes) || !response.body) return null;
  const reader = response.body.getReader();
  const parts = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) return null;
      parts.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.byteLength; }
  return bytes;
}
async function githubBlobSha(bytes) {
  const header = new TextEncoder().encode('blob ' + bytes.length + '\0');
  const source = new Uint8Array(header.length + bytes.length);
  source.set(header);
  source.set(bytes, header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', source)),
    b => b.toString(16).padStart(2, '0')).join('');
}
function encodeBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
export async function readLicensedBlob(assetId, { data = index, audit = rights, fetcher = fetch, asSource = false } = {}) {
  if (typeof assetId !== 'string' || !assetId || assetId.length > 96) return null;
  const asset = licensedAssets(data, audit).find(a => a.id === assetId);
  if (!asset || !Array.isArray(asset.dependencies) || !asset.dependencies_verified) return null;
  const src = safePinnedSource(asset, data);
  if (!src || (asSource && !/\.(?:js|mjs|cjs|json|glsl|vert|frag|wgsl|ts|css|html|txt|md)$/i.test(src.path))) return null;
  let bytes;
  try {
    const url = 'https://raw.githubusercontent.com/' + src.repository + '/' + src.commit + '/' + src.path;
    bytes = await boundedBytes(await fetcher(url, {
      redirect: 'error', signal: AbortSignal.timeout(15000)
    }));
    if (!bytes || await githubBlobSha(bytes) !== src.git_blob_sha) return null;
  } catch { return null; }
  const common = { asset_id: asset.id, source_commit: src.commit, source_blob_sha: src.git_blob_sha };
  if (asSource) {
    try {
      return { ...common, encoding: 'utf-8', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
    } catch { return null; }
  }
  return { ...common, encoding: 'base64', bytes: bytes.byteLength, content: encodeBase64(bytes) };
}

const V='2026-07-28', INFO={name:'meta-games-readonly',version:'0.1.0'};
const tools=[
  {name:'list_games',description:'List SHA-pinned games; no asset reuse rights granted.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'inspect_game',description:'Inspect a known game by ID, without arbitrary file reads.',inputSchema:{type:'object',properties:{game_id:{type:'string',enum:index.games.map(x=>x.id)}},required:['game_id'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'list_assets',description:'List only SHA-pinned assets with verified redistribution grants and cleared dependencies. Empty when none qualify.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'search_assets',description:'Search only independently cleared, redistribution-licensed assets. Never returns unlicensed review candidates.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:120},type:{type:'string',maxLength:64},game_id:{type:'string',enum:index.games.map(x=>x.id)},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'search_mechanics',description:'Find reuse-approved game mechanics only; unaudited code is not discoverable.',inputSchema:{type:'object',properties:{query:{type:'string',maxLength:120},game_id:{type:'string',enum:index.games.map(x=>x.id)},limit:{type:'integer',minimum:1,maximum:50}},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'get_asset',description:'Fetch at most 128 KiB of independently licensed asset bytes, pinned and checked against Git blob SHA-1. Unlicensed IDs are denied.',inputSchema:{type:'object',properties:{asset_id:{type:'string',maxLength:96}},required:['asset_id'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'get_source',description:'Fetch verified UTF-8 source text only for reuse-approved exact Git blobs with cleared dependencies.',inputSchema:{type:'object',properties:{asset_id:{type:'string',maxLength:96}},required:['asset_id'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'combine_assets',description:'Compose a read-only package from verified original JavaScript assets.',inputSchema:{type:'object',properties:{asset_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:20}},required:['asset_ids'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'create_game',description:'Generate a provenance-pinned HTML source composition; not a guaranteed playable game.',inputSchema:{type:'object',properties:{asset_ids:{type:'array',items:{type:'string'},minItems:1,maxItems:20}},required:['asset_ids'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'validate_game',description:'Validate a read-only package against the current licensed source catalog.',inputSchema:{type:'object',properties:{package:{type:'object'}}},required:['package'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'preview_game',description:'Return HTML preview for a package passing source-gate.',inputSchema:{type:'object',properties:{package:{type:'object'}}},required:['package'],additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'get_dependencies',description:'Inspect verified dependencies of a reuse-approved asset by exact ID. Unknown and unauthorized IDs are rejected alike.',inputSchema:{type:'object',properties:{asset_id:{type:'string',maxLength:96}},required:['asset_id'],additionalProperties:false},annotations:{readOnlyHint:true}}
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
        if (b.params.name === 'create_game' || b.params.name === 'combine_assets') {
          const pkg = await createSourcePackage(a, licensedAssets(), id => readLicensedBlob(id,{asSource:true}));
          return response(toolResult(id,pkg ?? {error:'SOURCE_GATE: denied or unavailable'},pkg===null),200,origin);
        }
        if (b.params.name === 'validate_game' || b.params.name === 'preview_game') {
          const valid = Object.keys(a).length===1 && Object.hasOwn(a,'package') && sourceGate(a.package,licensedAssets());
          const result = b.params.name === 'validate_game' ? {ok:valid,source_gate:valid?'PASS':'FAIL'} :
            (valid ? previewSourcePackage(a.package,licensedAssets()) : null);
          return response(toolResult(id,result ?? {error:'SOURCE_GATE: denied'},!valid),200,origin);
        }
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
        if(b.params.name==='search_mechanics'){
          const found=searchLicensedMechanics(a);
          return response(toolResult(id,found??{error:'Invalid search parameters'},found===null),200,origin);
        }
        if(b.params.name==='get_dependencies'){
          if(Object.keys(a).length!==1 || !Object.hasOwn(a,'asset_id')) return response(toolResult(id,{error:'Invalid arguments'},true),200,origin);
          const found=getLicensedDependencies(a.asset_id);
          return response(toolResult(id,found??{error:'Asset unavailable for reuse'},found===null),200,origin);
        }
        if (b.params.name === 'get_asset' || b.params.name === 'get_source') {
          if (Object.keys(a).length !== 1 || !Object.hasOwn(a, 'asset_id')) {
            return response(toolResult(id, { error: 'Invalid arguments' }, true), 200, origin);
          }
          const found = await readLicensedBlob(a.asset_id, { asSource: b.params.name === 'get_source' });
          return response(toolResult(id, found ?? { error: 'Asset unavailable for reuse' }, found === null), 200, origin);
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
