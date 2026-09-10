'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'); process.chdir(root);
const registry=JSON.parse(fs.readFileSync(path.join(root,'data','app-release-registry.json'),'utf8').replace(/^\uFEFF/,''));
const requiredUrls=[
'https://dark-void-navigator.vercel.app/',
'https://improve-world-home-improve-world.vercel.app/',
'https://improve-world-experiment-100-improve-world.vercel.app/',
'https://voxel-gothic-steampunk-world-improve-world.vercel.app/',
'https://gothic-voxel-city-atlas-v3-mobile-final-improve-world.vercel.app/',
'https://voxel-gothic-steampunk-mobile-repaired-improve-world.vercel.app/',
'https://world-server-git-codex-voxel-v3-improve-world.vercel.app/apps/voxel-world/',
'https://world-server.vercel.app/apps/catalog/'
];
function callApps(url){const handler=require('../api/apps');return new Promise(resolve=>{const headers={};const res={setHeader(k,v){headers[k]=v;},end(body){resolve({statusCode:this.statusCode,headers,body:JSON.parse(body)});}};handler({method:'GET',url,headers:{host:'localhost'}},res);});}
test('public app list stays certified-only',async()=>{const {statusCode,body}=await callApps('/api/apps');assert.equal(statusCode,200);assert.equal(body.releasePolicy,'deny-by-default');assert.ok(body.apps.length>0);assert.ok(body.apps.every(x=>x.status==='certified'));assert.equal(body.inventory,undefined);});
test('all=1 keeps every local playable app discoverable',async()=>{const {body}=await callApps('/api/apps?all=1');const ids=new Set(body.inventory.filter(x=>!x.external).map(x=>x.id));for(const id of fs.readdirSync(path.join(root,'apps'),{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(path.join(root,'apps',x.name,'index.html'))).map(x=>x.name))assert.ok(ids.has(id),`missing local app ${id}`);});
test('all eight required legacy worlds are preserved with child-simple lore and tiny video previews',async()=>{const {body}=await callApps('/api/apps?all=1');const external=body.inventory.filter(x=>x.external);const urls=new Set(external.map(x=>x.url));for(const url of requiredUrls)assert.ok(urls.has(url),`required world URL missing: ${url}`);for(const item of external){const m=item.worldMenu;assert.ok(m?.headline&&m?.lore&&m?.history,`story metadata missing: ${item.id}`);const file=path.join(root,m.previewVideo.replace(/^\//,''));assert.ok(fs.existsSync(file),`preview missing: ${item.id}`);const bytes=fs.statSync(file).size;assert.ok(bytes>0&&bytes<100000,`preview must stay ultra-light: ${item.id} ${bytes}`);}});
test('local game worlds expose lore in the same canonical release registry',()=>{for(const id of ['voxel-world','ai3d-voxel-city','survival','world-sharabass']){const m=registry.apps[id]?.worldMenu;assert.equal(m?.show,true,`${id} hidden from Worlds newspaper`);assert.ok(m.headline&&m.lore&&m.history,`${id} lore incomplete`);}});
test('Netlify has a real /api/apps compatibility function',()=>{const s=fs.readFileSync(path.join(root,'netlify/functions/apps.mts'),'utf8');assert.match(s,/path:\s*['"]\/api\/apps['"]/);assert.match(s,/api\/apps\.js/);});
test('Netlify has a real /api/worlds compatibility function',()=>{const s=fs.readFileSync(path.join(root,'netlify/functions/worlds.mts'),'utf8');assert.match(s,/path:\s*['\"]\/api\/worlds['\"]/);assert.match(s,/api\/worlds\.js/);});

test('static world fallback is generated from the canonical registry and cannot drift',()=>{
  const {project}=require('../scripts/generate-world-catalog-fallback.js');
  const actual=JSON.parse(fs.readFileSync(path.join(root,'shared','world-catalog-fallback.json'),'utf8').replace(/^\uFEFF/,''));
  assert.deepEqual(actual,project(registry));
  assert.equal(JSON.stringify(actual).includes('???'),false,'UTF-8 world text was corrupted');
});

test('core world connections preserve canonical world-graph portals',()=>{
  const graph=JSON.parse(fs.readFileSync(path.join(root,'data','world-graph-index.json'),'utf8'));
  for(const world of graph.worlds.filter(w=>w.public&&w.status==='certified')){
    const connections=registry.apps[world.releaseAppId]?.worldMenu?.connections||[];
    const targets=new Set(connections.map(x=>x.targetId));
    for(const portal of world.portals||[]) assert.ok(targets.has(portal.targetWorldId),`world menu lost canonical portal: ${world.id} -> ${portal.targetWorldId}`);
  }
});
