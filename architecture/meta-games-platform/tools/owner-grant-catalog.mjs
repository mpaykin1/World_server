#!/usr/bin/env node
// Deterministic, fail-closed discovery of SHA-pinned owner-grant candidates.
// Run from a local checkout of mpaykin1/meta6: node owner-grant-catalog.mjs <checkout> <40-char SHA>
// Emits JSON candidates for manual rights/dependency review; NEVER grants reuse rights automatically.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const roots = {
  'twilight-island':'observer-world-en-v7/',
  'ashen-path':'ashen-sumerek/',
  'underwater-world':'underwater-world/',
  'three-worlds':'three-worlds-game/',
  'veil-terraces':'meta-games-worlds/veil-terraces/'
};
const extensions = new Set(['js','mjs','glsl','json','png','webp','ogg','mp3','wav','glb','gltf']);
const marker = /@license|Copyright \(c\)|SPDX-License-Identifier|three\.module|three\.min|cdn\.jsdelivr|unpkg\.com|playgama|advertisement/i;
const [checkout,sha]=process.argv.slice(2);
if (!checkout || !/^[a-f0-9]{40}$/.test(sha||'')) {
  console.error('Usage: node owner-grant-catalog.mjs <meta6-checkout> <40-char-source-SHA>');
  process.exit(2);
}
const cwd=resolve(checkout);
const git=(...args)=>execFileSync('git',args,{cwd,maxBuffer:64*1024*1024});
const remote=git('remote','get-url','origin').toString().trim();
if (!/^(?:https:\/\/github\.com\/|git@github\.com:)mpaykin1\/meta6(?:\.git)?$/.test(remote)) throw Error('Only the canonical meta6 repository is accepted');
git('cat-file','-e',sha+'^{commit}');
const grant='https://github.com/mpaykin1/meta6/blob/'+sha+'/rules/06-rabota-ii-s-kodom/META_GAMES_SOURCE_ALLOWLIST.md';
git('cat-file','-e',sha+':rules/06-rabota-ii-s-kodom/META_GAMES_SOURCE_ALLOWLIST.md');
const tree=git('ls-tree','-r','-z',sha).toString('utf8').split('\0').filter(Boolean);
const candidates=[];
for(const row of tree){
  const tab=row.indexOf('\t');if(tab<0)throw Error('Invalid tree entry');
  const [mode,type,blob]=row.slice(0,tab).split(' ');
  const path=row.slice(tab+1);
  const game=Object.entries(roots).find(([,prefix])=>path.startsWith(prefix))?.[0];
  const ext=path.split('.').pop().toLowerCase();
  if(!game||!extensions.has(ext)||type!=='blob'||mode!=='100644')continue;
  const bytes=git('show',sha+':'+path);
  // No text decode for binary assets. No automatic rights approval even without markers.
  const isText=['js','mjs','glsl','json','gltf'].includes(ext);
  const text=isText?bytes.toString('utf8'):'';
  const marked=isText&&marker.test(text);
  const dependenciesSuspected=!isText || /\bimport\b|\brequire\s*\(|fetch\s*\(|https?:\/\/|new\s+Image\s*\(/i.test(text);
  const source={repository:'mpaykin1/meta6',commit:sha,path,git_blob_sha:blob,url:'https://github.com/mpaykin1/meta6/blob/'+sha+'/'+path.split('/').map(encodeURIComponent).join('/')};
  candidates.push({
    id:game+':'+path,game_id:game,type:ext==='glsl'?'shader':isText?'game_code':'asset',
    format:ext,version:sha,source,license_status:'unverified',
    reuse_allowed:false,redistribution_allowed:false,dependencies_verified:false,
    dependencies: null,grant_evidence:grant,
    review_note:marked?'third-party or ad marker':dependenciesSuspected?'dependencies or binary provenance require review':'originality and dependencies require independent review'
  });
}
if(candidates.length===0)throw Error('No permitted source assets found');
process.stdout.write(JSON.stringify({source_repository:'mpaykin1/meta6',source_commit:sha,review_candidates:candidates},null,2)+'\n');
