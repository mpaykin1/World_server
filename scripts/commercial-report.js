'use strict';
const fs=require('fs');
const path=require('path');
const {scoreEntry}=require('./commercial-score');
const ROOT=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const standard=read('data/commercial-standard.json');
const targets=read('data/commercial-targets.json');
const registry=read('data/home-experiments.json');

console.log('=== COMMERCIAL 100 REPORT ===');
console.log(`Primary: ${registry.currentPrimary || '-'}`);
console.log('\nHomepage experiments:');
for(const [id,e] of Object.entries(registry.experiments||{})){
  const r=scoreEntry(e,standard);
  console.log(` - ${id}: ${r.score}/100 [${e.status}] ${e.title}`);
}
if(!Object.keys(registry.experiments||{}).length) console.log(' - none yet');
console.log('\nServer product targets:');
for(const x of targets.items) console.log(` - ${x.label}: target ${x.target}/100; previous estimate ${x.previousEstimate ?? 'n/a'}`);
console.log('\nIMPORTANT: target 100 is not a claim of market validation. Real conversion/retention metrics remain separate.');
process.exit(0);
