'use strict';
const fs=require('fs');
const path=require('path');
const {sendJson,methodNotAllowed,withErrors}=require('../lib/http');
const {loadRegistry}=require('../lib/pixel-panorama-registry.cjs');
const root=process.cwd();
const registryFile=path.join(root,'data','pixel-panorama-registry.json');
module.exports=withErrors(async(req,res)=>{
  if(req.method!=='GET') return methodNotAllowed(res,['GET']);
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const action=url.searchParams.get('action')||'registry';
  if(action==='status') return sendJson(res,200,{ok:true,system:'PIXEL_PANORAMA_360_V4',registryCount:fs.existsSync(registryFile)?loadRegistry(registryFile).items.length:0,publicBase:process.env.PIXEL_PANORAMA_360_PUBLIC_BASE||'/shared/panorama360'});
  if(action==='manifest'){
    const slug=String(url.searchParams.get('slug')||'').trim();
    if(!slug) return sendJson(res,400,{ok:false,error:'slug required'});
    const file=path.resolve(root,'shared','panorama360',slug,'manifest.json');
    const base=path.resolve(root,'shared','panorama360');
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file)) return sendJson(res,404,{ok:false,error:'manifest not found'});
    return sendJson(res,200,JSON.parse(fs.readFileSync(file,'utf8')));
  }
  return sendJson(res,200,loadRegistry(registryFile));
});
