#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const EXTS=new Set(['.html','.js','.mjs','.cjs','.ts','.gd','.lua','.luau']);
const SKIP=new Set(['node_modules','.git','.vercel','.next','dist','build','.cache','.system-integration-backups','.patch-backups']);
const rules=[
  ['character',['character','player','avatar','npc','skeleton','rig','locomotion','walk','run']],
  ['environment',['tree','foliage','grass','flag','banner','rope','chain','lamp','sign','wind']],
  ['mechanical',['gear','fan','propeller','wheel','piston','engine','machine','door','elevator']],
  ['effects',['steam','smoke','fire','flame','dust','particle','spark','water']],
  ['destruction',['explode','exploded','destruct','break','fragment','debris']],
  ['camera',['camera','shake','zoom','orbit','lookat']],
];
function walk(dir,out=[]){
  if(!fs.existsSync(dir))return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(SKIP.has(e.name))continue;const p=path.join(dir,e.name);
    if(e.isDirectory())walk(p,out);else if(EXTS.has(path.extname(e.name).toLowerCase()))out.push(p);
  }return out;
}
const roots=['apps','games','projects','shared'].map(x=>path.join(ROOT,x)).filter(fs.existsSync);
const files=roots.flatMap(r=>walk(r));
const opportunities=[];
for(const file of files){
  let text='';try{text=fs.readFileSync(file,'utf8').toLowerCase()}catch{continue}
  const hits=[];
  for(const [category,words] of rules){const found=words.filter(w=>text.includes(w));if(found.length)hits.push({category,signals:found.slice(0,8)})}
  if(hits.length)opportunities.push({file:path.relative(ROOT,file).replaceAll('\\','/'),hits});
}
const report={schemaVersion:'1.0.0',system:'GAME_MOTION_AUDIT',generatedAt:new Date().toISOString(),filesScanned:files.length,opportunityFiles:opportunities.length,opportunities};
fs.writeFileSync(path.join(ROOT,'GAME_MOTION_OPPORTUNITIES.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GAME_MOTION_AUDIT] scanned=${files.length} opportunities=${opportunities.length}`);
