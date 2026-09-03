'use strict';
const { createAdminClient } = require('../lib/env');
const { sendJson, methodNotAllowed, readJsonBody, withErrors, httpError } = require('../lib/http');
const { normalizeFeedback } = require('../lib/world-feedback');
const crypto = require('crypto');
const buckets = new Map();
const rateSalt = crypto.randomBytes(24);
function rateKey(req,body,feedback){ const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim(); const material=String(body.sessionId||body.session_id||ip||feedback.client_event_id); return crypto.createHmac('sha256',rateSalt).update(material).digest('hex'); }
function allow(key){ const now=Date.now(), period=60_000, limit=8; const b=buckets.get(key)||{start:now,count:0}; if(now-b.start>period){b.start=now;b.count=0} b.count++; buckets.set(key,b); return b.count<=limit; }
async function optionalUser(admin,req){ const raw=String(req.headers?.authorization||''); const m=/^Bearer\s+(.+)$/i.exec(raw); if(!m) return null; const {data,error}=await admin.auth.getUser(m[1]); if(error) return null; return data?.user||null; }
module.exports = withErrors(async (req,res)=>{
  if(req.method!=='POST') return methodNotAllowed(res,['POST']);
  const body=await readJsonBody(req); const feedback=normalizeFeedback(body); const key=rateKey(req,body,feedback);
  if(!allow(key)) throw httpError(429,'Too many feedback submissions.');
  const admin=createAdminClient(); const user=await optionalUser(admin,req); feedback.user_id=user?.id||null;
  const {data,error}=await admin.from('world_feedback').upsert(feedback,{onConflict:'client_event_id',ignoreDuplicates:true}).select('id,client_event_id,status,created_at').maybeSingle();
  if(error) throw Object.assign(new Error(`Feedback storage failed: ${error.message}`),{status:503});
  sendJson(res,202,{ok:true,feedback:data||{client_event_id:feedback.client_event_id,status:'new'},usedForDevelopment:true});
});
