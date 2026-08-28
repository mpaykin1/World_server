'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const REG = path.join(ROOT,'data','home-experiments.json');
const LEDGER = path.join(ROOT,'data','home-experiment-ledger.jsonl');
const TEMPLATE = path.join(ROOT,'templates','home-experiment','commercial-profile.json');

const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const write = (p,v) => fs.writeFileSync(p, JSON.stringify(v,null,2)+'\n','utf8');
const now = () => new Date().toISOString();
const append = event => fs.appendFileSync(LEDGER, JSON.stringify({at:now(),...event})+'\n','utf8');

function ensureId(id) {
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(id || '')) throw new Error('id must match /^[a-z0-9][a-z0-9._-]{1,79}$/');
}
function registry(){ return read(REG); }
function save(r){ write(REG,r); }

function add(id, expPath, title) {
  ensureId(id);
  const r=registry();
  if (r.experiments[id]) throw new Error(`Experiment already exists: ${id}`);
  const t=read(TEMPLATE);
  t.id=id; t.title=title || id; t.path=expPath; t.createdAt=now(); t.status='candidate';
  r.experiments[id]=t;
  save(r); append({type:'created',id,path:expPath,title:t.title});
}
function activate(id){
  const r=registry(); if(!r.experiments[id]) throw new Error(`Unknown experiment: ${id}`);
  if(!r.activeExperiments.includes(id)) r.activeExperiments.push(id);
  r.experiments[id].status='active';
  save(r); append({type:'activated',id});
}
function library(id){
  const r=registry(); if(!r.experiments[id]) throw new Error(`Unknown experiment: ${id}`);
  r.activeExperiments=r.activeExperiments.filter(x=>x!==id);
  if(r.currentPrimary===id) r.currentPrimary=null;
  r.experiments[id].status='library';
  save(r); append({type:'moved-to-library',id});
}
function promote(id){
  const r=registry(); if(!r.experiments[id]) throw new Error(`Unknown experiment: ${id}`);
  const prev=r.currentPrimary;
  if(prev && prev!==id && r.experiments[prev]) {
    r.experiments[prev].status='library';
    r.activeExperiments=r.activeExperiments.filter(x=>x!==prev);
    append({type:'moved-to-library',id:prev,reason:'replaced-as-primary-by-'+id});
  }
  r.currentPrimary=id;
  r.experiments[id].status='primary';
  if(!r.activeExperiments.includes(id)) r.activeExperiments.push(id);
  save(r); append({type:'promoted-to-primary',id,previousPrimary:prev || null});
}
function list(){
  const r=registry();
  console.log(`Primary: ${r.currentPrimary || '-'}`);
  console.log(`Active: ${(r.activeExperiments||[]).join(', ') || '-'}`);
  for(const [id,e] of Object.entries(r.experiments||{}))
    console.log(`${id}\t${e.status}\t${e.path}\t${e.title}`);
}
function history(id){
  if(!fs.existsSync(LEDGER)) return;
  const lines=fs.readFileSync(LEDGER,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  lines.filter(x=>!id || x.id===id).forEach(x=>console.log(JSON.stringify(x)));
}

const [cmd,id,arg1,...rest]=process.argv.slice(2);
try{
  if(cmd==='add') add(id,arg1,rest.join(' '));
  else if(cmd==='activate') activate(id);
  else if(cmd==='library') library(id);
  else if(cmd==='promote') promote(id);
  else if(cmd==='list') list();
  else if(cmd==='history') history(id);
  else {
    console.log('Commands:');
    console.log('  add <id> <path> <title...>');
    console.log('  activate <id>');
    console.log('  library <id>');
    console.log('  promote <id>      # never deletes previous primary; it moves it to library');
    console.log('  list');
    console.log('  history [id]');
    process.exit(cmd ? 2 : 0);
  }
}catch(e){ console.error('HOME EXPERIMENT MANAGER FAIL:',e.message); process.exit(1); }
