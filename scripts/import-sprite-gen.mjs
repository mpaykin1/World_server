#!/usr/bin/env node
// Publish an already-composed sprite-gen atlas into World Server's static NPC catalog.
// CPU-only, local-file operation. AI generation credentials are never used here.
import {readFile, writeFile, mkdir, rename, copyFile, rm, stat, mkdtemp} from 'node:fs/promises';
import {resolve, join, basename, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {validateSpriteGenManifest} from '../apps/voxel-world/sprite-gen-runtime.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutputRoot = join(projectRoot, 'shared', 'sprite-gen');

function usage() {
  console.log('Usage: node scripts/import-sprite-gen.mjs <sprite-gen-run-dir> [--id creature-id] [--out-root <path>]');
}
export async function importSpriteRun(runDir, {id, outputRoot=defaultOutputRoot}={}) {
  const source = resolve(runDir);
  const original = JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
  const valid = validateSpriteGenManifest(original);
  const characterId = String(id || original.characterId || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(characterId) || characterId.length > 48) {
    throw new Error('Character ID must be lowercase letters/digits and hyphens (max 48)');
  }
  const atlasName = String(original.game_input || '');
  if (!/^[a-zA-Z0-9._-]+\.png$/.test(atlasName) || atlasName === '.' || atlasName === '..') {
    throw new Error('Manifest game_input must be a local PNG basename');
  }
  const atlas = await readFile(join(source,atlasName));
  if (atlas.length < 24 || atlas.length > 8*1024*1024 ||
      !atlas.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) {
    throw new Error('Missing, oversized, or invalid PNG atlas');
  }
  const width = atlas.readUInt32BE(16), height = atlas.readUInt32BE(20);
  if (width !== valid.width || height !== valid.height) throw new Error('Manifest dimensions do not match PNG');
  if ((await stat(join(source,'curation.json')).catch(()=>null)) && original.curation_applied !== true) {
    throw new Error('Refusing uncurated export: rerun sprite-gen compose-atlas after curation');
  }
  const targetRoot = resolve(outputRoot);
  await mkdir(targetRoot,{recursive:true});
  const target = join(targetRoot,characterId);
  if (await stat(target).catch(()=>null)) {
    throw new Error('Character already published: ' + characterId + '. Choose another --id.');
  }
  const scratch = await mkdtemp(join(targetRoot,'.sprite-stage-'));
  try {
    // Serialize only the runtime contract; never publish base images, credentials, raw frames or QA caches.
    const publish = {
      characterId,
      engine:original.engine,
      game_input:'sprite-sheet-alpha.png',
      degraded_static_fallback:original.degraded_static_fallback ?? false,
      curation_applied:original.curation_applied === true,
      animation:original.animation,
      frame_layout:original.frame_layout
    };
    await writeFile(join(scratch,'manifest.json'),JSON.stringify(publish,null,2)+'\n','utf8');
    await copyFile(join(source,atlasName),join(scratch,'sprite-sheet-alpha.png'));
    await rename(scratch,target);
    const catalogPath = join(targetRoot,'catalog.json');
    const oldCatalog = await readFile(catalogPath,'utf8').then(JSON.parse).catch(()=>[]);
    const existing = Array.isArray(oldCatalog) ? oldCatalog.filter(
      value=>value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id||'')
    ) : [];
    const updated = [...existing.filter(entry=>entry.id!==characterId),{id:characterId}].slice(-100);
    const tmpPath = catalogPath + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(tmpPath,JSON.stringify(updated,null,2)+'\n','utf8');
      await rename(tmpPath,catalogPath);
    } finally {await rm(tmpPath,{force:true}).catch(()=>{});}
    return {characterId,atlasBytes:atlas.length,frames:Object.values(valid.states).reduce((n,s)=>n+s.frames.length,0),target};
  } finally {await rm(scratch,{force:true,recursive:true}).catch(()=>{});}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2);
    if (!args.length || args[0]==='--help') {usage();process.exitCode=args.length?0:1;}
    else {
      const opts={};
      for(let i=1;i<args.length;i++){
        if(args[i]==='--id' && args[i+1]) opts.id=args[++i];
        else if(args[i]==='--out-root' && args[i+1]) opts.outputRoot=args[++i];
        else throw new Error('Unknown/missing flag: '+args[i]);
      }
      const result=await importSpriteRun(args[0],opts);
      console.log(JSON.stringify({ok:true,...result},null,2));
    }
  } catch(error){console.error('sprite-gen import failed:',error.message);process.exitCode=1;}
}
