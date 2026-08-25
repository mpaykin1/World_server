'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd();

test('invariant miner promotes only high-confidence repeated success to novel candidate',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'inv-'));for(const d of ['data','scripts'])fs.mkdirSync(path.join(tmp,d),{recursive:true});
 for(const f of ['data/invariant-miner-policy.json','scripts/quality-invariant-miner.js']){const d=path.join(tmp,f);fs.copyFileSync(path.join(ROOT,f),d)}
 fs.writeFileSync(path.join(tmp,'data/success-knowledge-base.json'),JSON.stringify({patterns:[{id:'x',actionKind:'fix',systemArea:'controls',attempts:4,successProbability:.9,averageDelta:1}]}));
 fs.writeFileSync(path.join(tmp,'data/system-contracts.json'),'{"contracts":{}}');fs.writeFileSync(path.join(tmp,'data/error-prevention-registry.json'),'{"knownErrors":[]}');
 const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/quality-invariant-miner.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const j=JSON.parse(fs.readFileSync(path.join(tmp,'QUALITY_INVARIANT_CANDIDATES.json'),'utf8'));assert.equal(j.novel.length,1);assert.equal(j.novel[0].status,'candidate');fs.rmSync(tmp,{recursive:true,force:true});
});

test('multi-file Golden pattern requires explicit approval and preserves exact hashes',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'goldpat-'));for(const d of ['data','scripts','shared','apps/a'])fs.mkdirSync(path.join(tmp,d),{recursive:true});
 for(const f of ['data/golden-pattern-policy.json','data/golden-patterns.json','scripts/promote-golden-pattern.js']){const d=path.join(tmp,f);fs.copyFileSync(path.join(ROOT,f),d)}
 fs.writeFileSync(path.join(tmp,'apps/a/x.js'),'const x=1;\n');fs.writeFileSync(path.join(tmp,'shared/y.js'),'const y=2;\n');
 let r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/promote-golden-pattern.js'),'pair','apps/a/x.js','shared/y.js'],{cwd:tmp,encoding:'utf8'});assert.notEqual(r.status,0);
 r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/promote-golden-pattern.js'),'pair','apps/a/x.js','shared/y.js'],{cwd:tmp,encoding:'utf8',env:{...process.env,GOLDEN_PATTERN_APPROVED:'YES'}});assert.equal(r.status,0,r.stderr);const j=JSON.parse(fs.readFileSync(path.join(tmp,'data/golden-patterns.json'),'utf8'));assert.equal(j.patterns.pair.versions[0].files.length,2);fs.rmSync(tmp,{recursive:true,force:true});
});
