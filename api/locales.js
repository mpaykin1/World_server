'use strict';
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');
const contract=require('../shared/i18n/world-locales.json');
module.exports=withErrors(async(req,res)=>{ if(req.method!=='GET')return methodNotAllowed(res,['GET']); sendJson(res,200,{ok:true,...contract,chatTranslation:{endpoint:'/api/translate',fallback:'original-text',nonBlocking:true}}); });
