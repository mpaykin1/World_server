'use strict';
const MODEL='gemini-3.5-live-translate-preview';
function targetLanguage(v){const s=String(v||'en').trim();return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(s)?s:'en'}
async function createToken({apiKey=process.env.GEMINI_API_KEY,target='en',minutes=15}={}){
  if(!apiKey)throw Object.assign(new Error('GEMINI_API_KEY is not configured.'),{status:503});
  target=targetLanguage(target); const expireTime=new Date(Date.now()+Math.min(30,Math.max(2,minutes))*60_000).toISOString();
  const payload={uses:1,expireTime,liveConnectConstraints:{model:`models/${MODEL}`,config:{responseModalities:['AUDIO'],inputAudioTranscription:{},outputAudioTranscription:{},translationConfig:{targetLanguageCode:target,echoTargetLanguage:false}}}};
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(payload)});
  if(!r.ok)throw Object.assign(new Error(`Gemini auth token failed: ${r.status}`),{status:502}); const b=await r.json(); if(!b?.name)throw Object.assign(new Error('Gemini token response missing name.'),{status:502});
  return {name:b.name,expireTime:b.expireTime||expireTime,targetLanguage:target,model:MODEL,websocketBase:'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained'};
}
module.exports={MODEL,targetLanguage,createToken};
