'use strict';
const fs=require('fs');
const path=require('path');
const {scoreEntry}=require('./commercial-score');
const ROOT=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const id=process.argv[2];
if(!id){console.error('Usage: node scripts/commercial-promotion-check.js <experiment-id>');process.exit(2);}
const s=read('data/commercial-standard.json');
const r=read('data/home-experiments.json');
const e=r.experiments[id];
if(!e){console.error('Unknown experiment:',id);process.exit(2);}
const result=scoreEntry(e,s);
if(result.score<100){
  console.error(`PROMOTION BLOCKED: ${id} packaging score ${result.score}/100. Release/testing remains allowed.`);
  process.exit(1);
}
console.log(`PROMOTION PACKAGING GATE PASS: ${id} = 100/100`);
console.log('Winner status still requires real comparative metrics; do not invent them.');
