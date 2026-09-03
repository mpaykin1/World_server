'use strict';
const crypto = require('crypto');
const CATEGORIES = new Set(['bug','idea','gameplay','graphics','performance','multiplayer','navigator','accessibility','localization','other']);
const SEVERITIES = new Set(['low','medium','high','critical']);
const strip = (v,max=2000) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim().slice(0,max);
function normalizeFeedback(input={}){
  const message=strip(input.message,4000); if(message.length<3) throw Object.assign(new Error('Feedback message is too short.'),{status:400});
  const category=CATEGORIES.has(input.category)?input.category:'other'; const severity=SEVERITIES.has(input.severity)?input.severity:'medium';
  const rating=input.rating==null?null:Number(input.rating); if(rating!=null && (!Number.isInteger(rating)||rating<1||rating>5)) throw Object.assign(new Error('Rating must be 1..5.'),{status:400});
  const out={
    client_event_id:strip(input.clientEventId||input.client_event_id,128)||crypto.randomUUID(),
    session_id:strip(input.sessionId||input.session_id,128)||null, world_id:strip(input.worldId||input.world_id,128)||null,
    build_sha:strip(input.buildSha||input.build_sha,128)||null, platform:strip(input.platform,80)||null, locale:strip(input.locale,20)||'en',
    category,severity,rating,message,source:'in_app',public_consent:Boolean(input.publicConsent||input.public_consent)
  };
  out.content_hash=crypto.createHash('sha256').update([out.category,out.severity,out.message.toLowerCase(),out.world_id||'',out.build_sha||''].join('\n')).digest('hex');
  return out;
}
function priorityScore(row={}){
  const sev={low:5,medium:15,high:35,critical:65}[row.severity]||15; const cat={bug:20,performance:18,multiplayer:20,navigator:15,accessibility:12,localization:10,graphics:10,gameplay:12,idea:6,other:4}[row.category]||4;
  const rating=row.rating==null?0:Math.max(0,5-Number(row.rating))*5; const repeats=Math.min(50,Math.max(0,Number(row.occurrences||1)-1)*8); return Math.min(100,sev+cat+rating+repeats);
}
function clusterKey(row={}){ return crypto.createHash('sha256').update(`${row.category||'other'}|${String(row.message||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(' ').slice(0,18).join(' ')}`).digest('hex').slice(0,20); }
module.exports={CATEGORIES,SEVERITIES,normalizeFeedback,priorityScore,clusterKey};
