'use strict';
const {requireUser}=require('../world-api-auth');
const {createAdminClient}=require('../env');const {sendJson,methodNotAllowed,readJsonBody,withErrors,httpError}=require('../http');const {normalizeReport}=require('../world-community-moderation');
const buckets=new Map();function allow(id){const now=Date.now(),a=(buckets.get(id)||[]).filter(t=>now-t<3600_000);if(a.length>=12)return false;a.push(now);buckets.set(id,a);return true}
module.exports=withErrors(async(req,res)=>{if(req.method!=='POST')return methodNotAllowed(res,['POST']);const admin=createAdminClient(),user=await requireUser(admin,req,httpError);if(!allow(user.id))throw httpError(429,'Too many reports.');const row={...normalizeReport(await readJsonBody(req)),reporter_user_id:user.id};const {data,error}=await admin.from('world_community_reports').insert(row).select('id,status,created_at').single();if(error)throw Object.assign(new Error(error.message),{status:503});sendJson(res,202,{ok:true,report:data})});
