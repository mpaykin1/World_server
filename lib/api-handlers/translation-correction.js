'use strict';
const {createAdminClient}=require('../env');
const {sendJson,methodNotAllowed,readJsonBody,withErrors,httpError}=require('../http');
const {requireUser}=require('../world-api-auth');
const T=require('../world-translation');
module.exports=withErrors(async(req,res)=>{
  if(req.method!=='POST')return methodNotAllowed(res,['POST']);
  const admin=createAdminClient(),user=await requireUser(admin,req,httpError),body=await readJsonBody(req);
  const source=T.canonical(body.source||body.sourceLanguage||'en'),target=T.canonical(body.target||body.targetLanguage||'en');
  const sourceText=T.cleanText(body.sourceText||body.source_text),suggested=T.cleanText(body.suggestedTranslation||body.suggested_translation),worldId=String(body.worldId||body.world_id||'main').trim().slice(0,120)||'main';
  if(!sourceText||!suggested)throw httpError(400,'Source text and suggested translation are required.');
  if(source===target)throw httpError(400,'Source and target languages must differ.');
  const {data,error}=await admin.from('world_translation_corrections').insert({user_id:user.id,world_id:worldId,source_lang:source,target_lang:target,source_text:sourceText,suggested_translation:suggested,status:'pending'}).select('id,status,created_at').single();
  if(error)throw Object.assign(new Error(error.message),{status:503});
  sendJson(res,202,{ok:true,correction:data});
});
