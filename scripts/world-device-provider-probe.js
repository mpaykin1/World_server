#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),OUT=path.join(ROOT,'REAL_DEVICE_RUNTIME_EVIDENCE.json');
const base=String(process.env.REAL_DEVICE_PROVIDER_URL||'').replace(/\/+$/,''),token=process.env.REAL_DEVICE_PROVIDER_TOKEN||'',req=process.argv.includes('--require');
const required=['physical-ios-phone','physical-android-phone'];
function norm(x){const t=[x?.id,x?.name,x?.platform,x?.os,x?.type].filter(Boolean).join(' ').toLowerCase(),physical=x?.physical!==false&&!/emulat|simulat|virtual/.test(t);return{ios:physical&&/(ios|iphone|ipad)/.test(t),android:physical&&/android/.test(t)}}
async function call(url){const r=await fetch(url,{headers:{accept:'application/json',...(token?{authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(10000)});let body=null;try{body=await r.json()}catch{}return{url,status:r.status,ok:r.ok,body}}
async function main(){
 if(!base){const o={schemaVersion:'5.0.0',generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',required,reason:'REAL_DEVICE_PROVIDER_URL missing'};fs.writeFileSync(OUT,JSON.stringify(o,null,2)+'\n');console.log('[DEVICE_PROBE_V5] NOT_CONFIGURED');if(req)process.exitCode=52;return}
 const attempts=[];let devices=[];for(const url of [...new Set([base,`${base}/health`,`${base}/v1/devices`])]){try{const a=await call(url);attempts.push({url:a.url,status:a.status,ok:a.ok});const b=a.body,c=Array.isArray(b)?b:Array.isArray(b?.devices)?b.devices:Array.isArray(b?.data?.devices)?b.data.devices:[];if(c.length){devices=c;break}}catch(e){attempts.push({url,ok:false,error:String(e.message||e)})}}
 const n=devices.map(norm),hasIos=n.some(x=>x.ios),hasAndroid=n.some(x=>x.android),healthy=attempts.some(x=>x.ok),verified=healthy&&hasIos&&hasAndroid;
 const o={schemaVersion:'5.0.0',generatedAt:new Date().toISOString(),status:verified?'PASS':healthy?'HEALTHY_UNVERIFIED':'FAIL',required,hasPhysicalIos:hasIos,hasPhysicalAndroid:hasAndroid,deviceCount:devices.length,attempts};fs.writeFileSync(OUT,JSON.stringify(o,null,2)+'\n');console.log(`[DEVICE_PROBE_V5] ${o.status} ios=${hasIos} android=${hasAndroid}`);if(req&&!verified)process.exitCode=52;
}
main().catch(e=>{fs.writeFileSync(OUT,JSON.stringify({schemaVersion:'5.0.0',generatedAt:new Date().toISOString(),status:'FAIL',error:String(e.stack||e)},null,2)+'\n');console.error(e);process.exitCode=52});
