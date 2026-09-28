#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const manifestPath=path.join(root,'third-party-manifest.json');
const noticesPath=path.join(root,'THIRD_PARTY_NOTICES.txt');
const packagePath=path.join(root,'package.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
const notices=fs.readFileSync(noticesPath,'utf8');
const codeAllow=new Set(manifest.allowlist?.code||[]),assetAllow=new Set(manifest.allowlist?.assets||[]);
const declared=new Map((manifest.dependencies||[]).map(entry=>[entry.name,entry]));
const legacy=new Set(manifest.legacyPackageBaseline||[]);
let failed=false;
function fail(msg){console.error(`FAIL: ${msg}`);failed=true;}
for(const entry of manifest.dependencies||[]){
  const scope=entry.class==='asset'?'asset':'code',allow=scope==='asset'?assetAllow:codeAllow;
  if(!entry.name||!entry.upstream||!entry.version||!entry.license) fail('dependency entry missing required provenance fields');
  if(!allow.has(entry.license)) fail(`${entry.name}: ${entry.license} is not allowlisted for ${scope}`);
  if(!entry.commitOrTag) fail(`${entry.name}: exact commit/tag missing`);
  if(!entry.sha256) fail(`${entry.name}: downloaded/imported content SHA-256 missing`);
  if(!Array.isArray(entry.filesImported)||entry.filesImported.length===0) fail(`${entry.name}: filesImported missing`);
  if(entry.requiredNotices&&!notices.includes(entry.name)) fail(`${entry.name}: required notice missing`);
  if(entry.commercialUseStatus!=='allowed') fail(`${entry.name}: commercialUseStatus must be allowed`);
}
const direct={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
for(const name of Object.keys(direct)) if(!legacy.has(name)&&!declared.has(name)) fail(`${name}: new direct package dependency lacks third-party-manifest entry`);
if(failed)process.exit(1);
console.log(`Third-party license gate PASSED (${(manifest.dependencies||[]).length} audited imports; ${legacy.size} legacy direct packages frozen)`);
