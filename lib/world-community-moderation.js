'use strict';
const REASONS=['harassment','hate','sexual','spam','threat','cheating','impersonation','privacy','other'];
function cleanText(v,max=2000){return String(v??'').replace(/[\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function normalizeReport(body={}){
  const reason=REASONS.includes(String(body.reason))?String(body.reason):'other';
  const targetUserId=cleanText(body.targetUserId||body.target_user_id,80)||null;
  const messageId=cleanText(body.messageId||body.message_id,100)||null;
  const details=cleanText(body.details,1000)||null;
  if(!targetUserId&&!messageId) throw Object.assign(new Error('Report requires a target user or message.'),{status:400});
  return {reason,target_user_id:targetUserId,message_id:messageId,details,world_id:cleanText(body.worldId||body.world_id,120)||null,room_id:cleanText(body.roomId||body.room_id,120)||null,locale:cleanText(body.locale,32)||'en'};
}
function normalizeChat(body={}){
  const text=cleanText(body.text,2000); if(!text)throw Object.assign(new Error('Message is empty.'),{status:400});
  return {client_message_id:cleanText(body.clientMessageId||body.client_message_id,100)||null,world_id:cleanText(body.worldId||body.world_id,120)||'main',room_id:cleanText(body.roomId||body.room_id,120)||'lobby',nickname:cleanText(body.nickname,80)||'Guest',source_language:cleanText(body.sourceLanguage||body.source_language,32)||'en',text};
}
class SpamWindow{
  constructor({limit=12,windowMs=10000,duplicateLimit=3}={}){this.limit=limit;this.windowMs=windowMs;this.duplicateLimit=duplicateLimit;this.map=new Map()}
  check(key,text){const now=Date.now(),k=String(key||'guest'),t=cleanText(text).toLowerCase();const arr=(this.map.get(k)||[]).filter(x=>now-x.at<this.windowMs);arr.push({at:now,text:t});this.map.set(k,arr);const dup=arr.filter(x=>x.text===t).length;return {allowed:arr.length<=this.limit&&dup<=this.duplicateLimit,count:arr.length,duplicates:dup}}
}
module.exports={REASONS,cleanText,normalizeReport,normalizeChat,SpamWindow};
