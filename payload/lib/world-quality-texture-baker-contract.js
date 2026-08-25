'use strict';
const crypto=require('crypto');
const CHANNELS=['baseColor','normal','roughness','ao','emissive'];
function recipe(material={},opts={}){
  const resolution=Math.max(128,Math.min(4096,Number(opts.resolution)||1024));
  const payload={version:'5.0.0',materialClass:String(material.materialClass||'generic'),resolution,channels:CHANNELS,seed:Number(opts.seed)||0,sourceHash:String(opts.sourceHash||''),destructive:false,requiresApproval:true};
  payload.recipeId=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,20);
  return payload;
}
function validateBakeEvidence(e={}){
  const missing=CHANNELS.filter(c=>!e[c]);
  return {ok:missing.length===0&&!!e.sourceHash&&!!e.outputHash,missing,sourcePreserved:!!e.sourceHash,outputProven:!!e.outputHash};
}
module.exports={CHANNELS,recipe,validateBakeEvidence};
