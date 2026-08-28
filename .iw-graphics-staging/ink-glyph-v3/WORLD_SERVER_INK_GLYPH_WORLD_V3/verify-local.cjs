#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),ROOT=__dirname;
const required=[
 '00_START_HERE.md','01_DESKTOP_AI_INSTALL_VERIFY_REPAIR.md','02_NEXT_SYSTEMS.md','03_FREE_OPEN_SOURCE_DOWNLOADS.md','04_STATUS_AND_READINESS.md',
 'PATCH_MANIFEST.json','install-ink-glyph-world.cjs','integration-test.cjs','PAYLOAD_SHA256.json',
 'payload/apps/ink-glyph-world/index.html','payload/apps/ink-glyph-world/client.js','payload/apps/ink-glyph-world/worker.js',
 'payload/shared/ink-glyph-world-core.js','payload/data/ink-glyph-font-registry.json',
 'payload/scripts/download-ink-glyph-fonts.cjs','payload/scripts/download-ink-glyph-vendor.cjs','payload/scripts/download-ink-glyph-strokes.cjs',
 'payload/scripts/install-ink-glyph-tools.cjs','payload/scripts/optimize-ink-glyph-glb.cjs','payload/scripts/validate-ink-glyph-glb.cjs','payload/scripts/check-ink-glyph-world.cjs',
 'payload/scripts/benchmark-ink-glyph-world.cjs','payload/scripts/optimize-ink-glyph-fonts.py','payload/scripts/ink-glyph-network-diagnostics.cjs',
 'payload/test/ink-glyph-world.test.js','payload/e2e/ink-glyph-world.spec.js','payload/docs/INK_GLYPH_WORLD.md',
 'payload/assets/fonts/ink-glyph/.gitkeep','payload/assets/hanzi-strokes/.gitkeep'
];
let ok=true;
for(const f of required){if(!fs.existsSync(path.join(ROOT,f))){console.error('MISSING',f);ok=false}}
const jsChecks=[
 'install-ink-glyph-world.cjs','integration-test.cjs','payload/scripts/download-ink-glyph-fonts.cjs','payload/scripts/download-ink-glyph-vendor.cjs',
 'payload/scripts/download-ink-glyph-strokes.cjs','payload/scripts/install-ink-glyph-tools.cjs','payload/scripts/optimize-ink-glyph-glb.cjs','payload/scripts/validate-ink-glyph-glb.cjs',
 'payload/scripts/check-ink-glyph-world.cjs','payload/scripts/benchmark-ink-glyph-world.cjs','payload/scripts/ink-glyph-network-diagnostics.cjs',
 'payload/shared/ink-glyph-world-core.js','payload/apps/ink-glyph-world/client.js','payload/apps/ink-glyph-world/worker.js'
];
for(const f of jsChecks){const r=cp.spawnSync(process.execPath,['--check',path.join(ROOT,f)],{stdio:'inherit'});if(r.status!==0)ok=false}
try{
 const hm=JSON.parse(fs.readFileSync(path.join(ROOT,'PAYLOAD_SHA256.json'),'utf8'));let checked=0;
 for(const [rel,expected] of Object.entries(hm.files||{})){const fp=path.join(ROOT,rel);if(!fs.existsSync(fp)){console.error('HASH MISSING',rel);ok=false;continue}const got=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');checked++;if(got!==expected){console.error('HASH MISMATCH',rel);ok=false}}
 console.log(`PATCH_PAYLOAD_HASHES ${checked}/${Object.keys(hm.files||{}).length} checked`);
}catch(e){console.error(e);ok=false}
const c=cp.spawnSync(process.execPath,[path.join(ROOT,'payload/scripts/check-ink-glyph-world.cjs')],{cwd:path.join(ROOT,'payload'),stdio:'inherit'});if(c.status!==0)ok=false;
const t=cp.spawnSync(process.execPath,['--test',path.join(ROOT,'payload/test/ink-glyph-world.test.js')],{cwd:path.join(ROOT,'payload'),stdio:'inherit'});if(t.status!==0)ok=false;
const b=cp.spawnSync(process.execPath,[path.join(ROOT,'payload/scripts/benchmark-ink-glyph-world.cjs'),'--no-report'],{cwd:path.join(ROOT,'payload'),stdio:'inherit'});if(b.status!==0)ok=false;
const i=cp.spawnSync(process.execPath,[path.join(ROOT,'integration-test.cjs')],{cwd:ROOT,stdio:'inherit'});if(i.status!==0)ok=false;
console.log(`PATCH_LOCAL_VERIFY ${ok?'PASS':'FAIL'}`);process.exit(ok?0:1);
