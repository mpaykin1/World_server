'use strict';
const {createAdminClient,firstEnv}=require('../env');
const {sendJson,methodNotAllowed,readJsonBody,withErrors,httpError}=require('../http');
const {requireUser}=require('../world-api-auth');
const T=require('../world-translation');
module.exports=withErrors(async(req,res)=>{
  if(req.method!=='POST')return methodNotAllowed(res,['POST']);
  const body=await readJsonBody(req),text=T.cleanText(body.text);if(!text)throw httpError(400,'Text is required.');
  const admin=createAdminClient();await requireUser(admin,req,httpError);
  const source=body.source==='auto'?'auto':T.canonical(body.source||'auto'),target=T.canonical(body.target),worldId=String(body.worldId||body.world_id||'main').trim().slice(0,120)||'main';
  if(source===target)return sendJson(res,200,{ok:true,translated:false,text,translation:text,source,target,provider:'identity'});
  const dynamic=await T.loadDynamicGlossary(admin,{worldId,source,target}),exact=T.exactCorrection(text,dynamic);if(exact)return sendJson(res,200,{ok:true,translated:true,text,translation:exact,source,target,provider:'approved-correction',cached:true});
  const revision=T.glossaryRevision(dynamic),key=T.hashKey(text,source,target,`v4:${worldId}:${revision}`);
  try{const {data}=await admin.from('world_translation_cache').select('translation,source_lang,target_lang,provider,provider_version').eq('source_hash',key).maybeSingle();if(data?.translation)return sendJson(res,200,{ok:true,translated:true,text,translation:data.translation,source:data.source_lang||source,target:data.target_lang||target,provider:data.provider||'cache',cached:true})}catch{}
  let out=null,errors=[];try{out=await T.geminiTranslate({text,source,target,dynamicGlossary:dynamic,apiKey:firstEnv(['GEMINI_API_KEY','GOOGLE_API_KEY'])})}catch(e){errors.push(e.message)}
  if(!out){try{out=await T.libreTranslate({text,source,target,endpoint:firstEnv(['WORLD_TRANSLATION_ENDPOINT','LIBRETRANSLATE_URL']),apiKey:firstEnv(['WORLD_TRANSLATION_API_KEY'])})}catch(e){errors.push(e.message)}}
  if(!out)return sendJson(res,200,{ok:true,translated:false,text,translation:text,source,target,provider:'unavailable',nonBlocking:true,errors:process.env.NODE_ENV==='development'?errors:undefined});
  try{await admin.from('world_translation_cache').upsert({source_hash:key,source_lang:source,target_lang:target,provider:out.provider,provider_version:out.model||revision,translation:out.translation,last_used_at:new Date().toISOString(),hits:1},{onConflict:'source_hash'})}catch{}
  sendJson(res,200,{ok:true,translated:true,text,translation:out.translation,source:out.detectedLanguage||source,target,provider:out.provider,model:out.model||null,cached:false});
});
