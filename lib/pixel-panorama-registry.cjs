'use strict';
const fs = require('fs');
const path = require('path');
function ensureShape(json){ if(!json||typeof json!=='object') json={}; json.schemaVersion||='2.0.0'; json.system||='PIXEL_PANORAMA_360'; json.items||=[]; return json; }
function loadRegistry(file){ const abs=path.resolve(file); if(!fs.existsSync(abs)) return ensureShape({}); return ensureShape(JSON.parse(fs.readFileSync(abs,'utf8'))); }
function saveRegistry(file,json){ const abs=path.resolve(file); fs.mkdirSync(path.dirname(abs),{recursive:true}); fs.writeFileSync(abs,JSON.stringify(ensureShape(json),null,2)+'\n','utf8'); }
function upsertItem(registry,item){ const now=new Date().toISOString(); const i=registry.items.findIndex(x=>x.slug===item.slug); if(i>=0) registry.items[i]={...registry.items[i],...item,updatedAt:now}; else registry.items.push({...item,createdAt:now,updatedAt:now}); registry.items.sort((a,b)=>String(a.title||a.slug).localeCompare(String(b.title||b.slug),'ru')); return registry; }
module.exports={ensureShape,loadRegistry,saveRegistry,upsertItem};
