'use strict';
const crypto=require('node:crypto');
const {createAdminClient,firstEnv}=require('../lib/env');
const {sendJson,readJsonBody,withErrors,httpError,methodNotAllowed}=require('../lib/http');
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
module.exports=withErrors(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&origin!==ORIGIN)throw httpError(403,'Origin not permitted');
 res.setHeader('Access-Control-Allow-Origin',ORIGIN);
 res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, X-Telegram-Init-Data');
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
 if(req.method!=='POST')return methodNotAllowed(res,['POST','OPTIONS']);
 const actor=authenticate(req.headers['x-telegram-init-data']);
 const body=await readJsonBody(req);
 if(!body||Buffer.byteLength(JSON.stringify(body))>32768)fail(413);
 const request=uuid(body.request_id),action=body.action, payload=sanitize(action,body.data||{});
 const {data,error}=await createAdminClient().rpc('mgw_action',{p_actor:actor,p_request:request,p_action:action,p_data:payload});
 if(error){
  const known=new Set(['INVALID_INPUT','REQUEST_REUSED','DAILY_ALREADY_CLAIMED','UNKNOWN_ASSET','INVENTORY_FULL','INSUFFICIENT_CRYSTALS','INVALID_OFFER','NOT_OWNER','OFFER_LIMIT','OFFER_NOT_OPEN','BALANCE_LIMIT','INVALID_WORLD','WORLD_CONFLICT','NO_WORLD','WORLD_NOT_FOUND','UNKNOWN_ACTION']);
  if(known.has(error.message))return sendJson(res,409,{error:error.message});
  if(error.code==='23505')return sendJson(res,409,{error:'CONFLICT'});
  return sendJson(res,503,{error:'WORLD_SERVICE_UNAVAILABLE'});
 }
 sendJson(res,200,{ok:true,data});
});