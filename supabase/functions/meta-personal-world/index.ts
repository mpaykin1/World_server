import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
const firstEnv=(names)=>names.map(n=>Deno.env.get(n)||'').find(Boolean)||'';
const httpError=(status,message)=>Object.assign(new Error(message),{status});
const ORIGIN='https://mpaykin1.github.io';
const KINDS=new Set('well settlement council market guild tax school scholarAction printing castle court decree monastery relief doctrine guard patrol militia prison inquiry pardon granary ration caravan healer quarantine hospital fire brigade watch plague cordon burial observer contact extraction'.split(' '));
const SHOP=new Set(['granary','school','monastery','guild']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID=/^[1-9][0-9]{0,15}$/;
function fail(code=400){throw httpError(code,code===401?'Telegram authorization required':'Invalid personal world request')}
function authenticate(raw){
 const token=firstEnv(['META_TELEGRAM_BOT_TOKEN']);
 if(typeof raw!=='string'||raw.length>8192)fail(401);
 const p=new URLSearchParams(raw),keys=new Set();
 for(const [k] of p){if(keys.has(k))fail(401);keys.add(k)}
 const hash=p.get('hash'),signature=p.get('signature');p.delete('hash');
 if(signature){
  p.delete('signature');
  const check='8904896133:WebAppData\n'+[...p.entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>k+'='+v).join('\n');
  const publicKey=crypto.createPublicKey({key:Buffer.from('302a300506032b6570032100e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d','hex'),format:'der',type:'spki'});
  if(!/^[A-Za-z0-9_-]{86}={0,2}$/.test(signature)||!crypto.verify(null,Buffer.from(check),publicKey,Buffer.from(signature,'base64url')))fail(401);
 }else{
  if(!token||!/^8904896133:/.test(token)||! /^[0-9a-f]{64}$/i.test(hash||''))fail(401);
  const check=[...p.entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>k+'='+v).join('\n');
  const key=crypto.createHmac('sha256','WebAppData').update(token).digest();
  const expected=crypto.createHmac('sha256',key).update(check).digest();
  if(!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex')))fail(401);
 }
 const date=Number(p.get('auth_date')),now=Math.floor(Date.now()/1000);
 if(!Number.isInteger(date)||date>now+30||date<now-86400)fail(401);
 let user;try{user=JSON.parse(p.get('user'))}catch{fail(401)}
 if(!Number.isSafeInteger(user?.id)||!ID.test(String(user.id)))fail(401);
 return String(user.id);
}
function uuid(v){if(typeof v!=='string'||!UUID.test(v))fail();return v}
function sanitize(action,v){
 if(!v||typeof v!=='object'||Array.isArray(v))fail();
 switch(action){
 case 'state':case 'daily':case 'publish':case 'unpublish':return {};
 case 'buy':if(!SHOP.has(v.kind))fail();return {kind:v.kind};
 case 'offer':if(typeof v.buyer!=='string'||!ID.test(v.buyer)||!Number.isInteger(v.price)||v.price<0||v.price>10000)fail();return {buyer:v.buyer,asset_id:uuid(v.asset_id),price:v.price};
 case 'accept':case 'cancel':return {offer_id:uuid(v.offer_id)};
 case 'visit':return {share_code:uuid(v.share_code)};
 case 'save':{
  if(!Number.isSafeInteger(v.revision)||v.revision<0||!Array.isArray(v.objects)||v.objects.length>120)fail();
  const objects=[];
  for(const o of v.objects){
   if(!o||!KINDS.has(o.kind)||![o.x,o.y,o.z].every(Number.isFinite)||o.x<3||o.x>60||o.z<3||o.z>60||o.y<0||o.y>64||objects.some(q=>Math.hypot(q.x-o.x,q.z-o.z)<3))fail();
   objects.push({kind:o.kind,x:Math.round(o.x*100)/100,y:Math.round(o.y*100)/100,z:Math.round(o.z*100)/100});
  }return {revision:v.revision,objects};
 }
 default:fail();
 }
}

const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Content-Type, X-Telegram-Init-Data','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 try{
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply(403,{error:'ORIGIN'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply(405,{error:'METHOD'});
  const actor=authenticate(req.headers.get('x-telegram-init-data'));
  const stream=req.body?.getReader();if(!stream)fail();const chunks=[];let size=0;
  for(;;){const {done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>32768){await stream.cancel();fail(413)}chunks.push(value)}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{fail()}
  const request=uuid(body.request_id),action=body.action,payload=sanitize(action,body.data||{});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{error:'WORLD_SERVICE_UNAVAILABLE'});
  const res=await fetch(url+'/rest/v1/rpc/mgw_action',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_actor:actor,p_request:request,p_action:action,p_data:payload}),signal:AbortSignal.timeout(15000)});
  const data=await res.json();
  if(!res.ok){const known=new Set(['INVALID_INPUT','REQUEST_REUSED','DAILY_ALREADY_CLAIMED','UNKNOWN_ASSET','INVENTORY_FULL','INSUFFICIENT_CRYSTALS','INVALID_OFFER','NOT_OWNER','OFFER_LIMIT','OFFER_NOT_OPEN','BALANCE_LIMIT','INVALID_WORLD','WORLD_CONFLICT','NO_WORLD','WORLD_NOT_FOUND','UNKNOWN_ACTION']);return reply(known.has(data.message)||data.code==='23505'?409:503,{error:known.has(data.message)?data.message:data.code==='23505'?'CONFLICT':'WORLD_SERVICE_UNAVAILABLE'})}
  return reply(200,{ok:true,data});
 }catch(e){return reply(e.status||503,{error:e.status===401?'TELEGRAM_AUTH_REQUIRED':e.status===400?'INVALID_INPUT':e.status===413?'PAYLOAD_LIMIT':'WORLD_SERVICE_UNAVAILABLE'})}
});