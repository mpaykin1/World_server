#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const EXEMPT_APPS=new Set(['ai-3d','ai3d-reference-test','ai3d-voxel-city','chat']);
const MARKER='data-world-server-viewport-lock="1"';
const LINK='<link rel="stylesheet" href="/shared/world-server-game-viewport.css" '+MARKER+'>';
const SCRIPT='<script src="/shared/world-server-game-viewport.js" defer '+MARKER+'></script>';

function appNameFromPath(filePath){
  const rel=path.relative(ROOT,path.resolve(filePath)).replace(/\\/g,'/');
  const m=rel.match(/^apps\/([^/]+)\/index\.html$/i);
  return m?.[1]||null;
}
function shouldInjectPath(filePath){
  const app=appNameFromPath(filePath);
  return !!app&&!EXEMPT_APPS.has(app);
}
function injectHtml(html){
  if(html.includes(MARKER)) return html;
  if(/<\/head>/i.test(html)) return html.replace(/<\/head>/i,LINK+'\n'+SCRIPT+'\n</head>');
  return LINK+'\n'+SCRIPT+'\n'+html;
}
function indexFiles(){
  const appsDir=path.join(ROOT,'apps');
  if(!fs.existsSync(appsDir)) return [];
  return fs.readdirSync(appsDir,{withFileTypes:true})
    .filter(e=>e.isDirectory())
    .map(e=>path.join(appsDir,e.name,'index.html'))
    .filter(fs.existsSync);
}
function run({write=true}={}){
  const files=indexFiles(),changed=[],protectedFiles=[],exempt=[];
  for(const file of files){
    const app=appNameFromPath(file);
    if(!shouldInjectPath(file)){ exempt.push(app); continue; }
    protectedFiles.push(app);
    const source=fs.readFileSync(file,'utf8');
    const next=injectHtml(source);
    if(next!==source){
      changed.push(path.relative(ROOT,file).replace(/\\/g,'/'));
      if(write) fs.writeFileSync(file,next);
    }
  }
  return {protectedFiles,exempt,changed};
}
if(require.main===module){
  const check=process.argv.includes('--check');
  console.log('[GAME_VIEWPORT_INJECT]',check?'CHECK':'WRITE',JSON.stringify(run({write:!check})));
}
module.exports={ROOT,EXEMPT_APPS,MARKER,LINK,SCRIPT,appNameFromPath,shouldInjectPath,injectHtml,indexFiles,run};
