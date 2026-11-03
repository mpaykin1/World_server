import index from '../ASSET_INDEX.json' with { type: 'json' };
const V='2026-07-28', INFO={name:'meta-games-readonly',version:'0.1.0'};
const tools=[
  {name:'list_games',description:'List SHA-pinned games; no asset reuse rights granted.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
  {name:'inspect_game',description:'Inspect a known game by ID, without arbitrary file reads.',inputSchema:{type:'object',properties:{game_id:{type:'string',enum:index.games.map(x=>x.id)}},required:['game_id'],additionalProperties:false},annotations:{readOnlyHint:true}}
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
    if(url.pathname==='/health'&&req.method==='GET')return response({status:'ok',protocol:V,games:index.games.length,licensed_assets:index.reusable_assets.length},200,origin);
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
