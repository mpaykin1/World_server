'use strict';
const {requireUser}=require('../lib/world-api-auth');
const {createAdminClient}=require('../lib/env');const {sendJson,methodNotAllowed,readJsonBody,withErrors,httpError}=require('../lib/http');const {createToken,targetLanguage}=require('../lib/world-live-translate-token');
const buckets=new Map();function allow(id){const now=Date.now(),a=(buckets.get(id)||[]).filter(t=>now-t<10*60_000);if(a.length>=4)return false;a.push(now);buckets.set(id,a);return true}
module.exports=withErrors(async(req,res)=>{if(req.method!=='POST')return methodNotAllowed(res,['POST']);const admin=createAdminClient(),user=await requireUser(admin,req,httpError);if(!allow(user.id))throw httpError(429,'Live translation session limit reached.');const body=await readJsonBody(req),target=targetLanguage(body.targetLanguage||body.target_language);const token=await createToken({target});sendJson(res,200,{ok:true,...token})});
