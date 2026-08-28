#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const PATCH=__dirname,PAYLOAD=path.join(PATCH,'payload'),args=process.argv.slice(2),repoArg=args.indexOf('--repo');
const ROOT=path.resolve(repoArg>=0&&args[repoArg+1]?args[repoArg+1]:process.cwd());
const skipFonts=args.includes('--skip-fonts'),skipVendor=args.includes('--skip-vendor'),skipStrokes=args.includes('--skip-strokes'),skipTools=args.includes('--skip-tools');
function fail(m){console.error(`INSTALL FAIL: ${m}`);process.exit(1)}
function run(cmd,argv){console.log(`> ${cmd} ${argv.join(' ')}`);const execCmd = process.platform==='win32' && /\s/.test(cmd) ? `"${cmd}"` : cmd;const r=cp.spawnSync(execCmd,argv,{cwd:ROOT,stdio:'inherit',shell:process.platform==='win32',windowsHide:true});if(r.status!==0)fail(`${cmd} exited ${r.status}`)}
if(!fs.existsSync(path.join(ROOT,'package.json')))fail(`package.json not found in ${ROOT}`);if(!fs.existsSync(path.join(ROOT,'apps')))fail(`apps/ not found in ${ROOT}`);
const hashManifest=JSON.parse(fs.readFileSync(path.join(PATCH,'PAYLOAD_SHA256.json'),'utf8'));
for(const [rel,expected] of Object.entries(hashManifest.files||{})){const fp=path.join(PATCH,rel);if(!fs.existsSync(fp))fail(`payload integrity missing ${rel}`);const got=crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');if(got!==expected)fail(`payload integrity mismatch ${rel}`)}
console.log(`PAYLOAD_INTEGRITY PASS ${Object.keys(hashManifest.files||{}).length} files`);
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),backup=path.join(ROOT,'.ink-glyph-backups',stamp);let copied=0,backed=0;
function backupExisting(rel){const src=path.join(ROOT,rel);if(!fs.existsSync(src)||!fs.statSync(src).isFile())return;const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);backed++}
function copyTree(src,dst,rel=''){for(const ent of fs.readdirSync(src,{withFileTypes:true})){const s=path.join(src,ent.name),d=path.join(dst,ent.name),r=path.join(rel,ent.name);if(ent.isDirectory()){fs.mkdirSync(d,{recursive:true});copyTree(s,d,r)}else if(ent.isFile()){fs.mkdirSync(path.dirname(d),{recursive:true});if(fs.existsSync(d)){const b=path.join(backup,r);fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(d,b);backed++}fs.copyFileSync(s,d);copied++}}}
copyTree(PAYLOAD,ROOT);
backupExisting('package.json');
const pkgPath=path.join(ROOT,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.scripts=pkg.scripts||{};
Object.assign(pkg.scripts,{
 'vendor:ink:download':'node scripts/download-ink-glyph-vendor.cjs',
 'vendor:ink:verify':'node scripts/check-ink-glyph-world.cjs --require-vendor',
 'fonts:ink:download':'node scripts/download-ink-glyph-fonts.cjs --strict-pin',
 'fonts:ink:verify':'node scripts/check-ink-glyph-world.cjs --require-fonts',
 'fonts:ink:optimize':'python scripts/optimize-ink-glyph-fonts.py',
 'strokes:ink:download':'node scripts/download-ink-glyph-strokes.cjs',
 'strokes:ink:verify':'node scripts/check-ink-glyph-world.cjs --require-strokes',
 'tools:ink:install':'node scripts/install-ink-glyph-tools.cjs',
 'tools:ink:verify':'node scripts/check-ink-glyph-world.cjs --require-tools',
 'ink:glyph:glb:optimize':'node scripts/optimize-ink-glyph-glb.cjs',
 'ink:glyph:glb:validate':'node scripts/validate-ink-glyph-glb.cjs',
 'quality:ink-glyph':'node scripts/check-ink-glyph-world.cjs && node --test test/ink-glyph-world.test.js',
 'quality:ink-glyph:production':'node scripts/check-ink-glyph-world.cjs --require-fonts --require-vendor --require-strokes && node --test test/ink-glyph-world.test.js',
 'quality:ink-glyph:bench':'node scripts/benchmark-ink-glyph-world.cjs',
 'quality:ink-glyph:e2e':'playwright test e2e/ink-glyph-world.spec.js',
 'ink:glyph:network':'node scripts/ink-glyph-network-diagnostics.cjs'
});
let gate=pkg.scripts['release:gate']||'';
if(gate&&!gate.includes('npm run quality:ink-glyph:production')){
  if(/npm run quality:ink-glyph(?![:\w-])/.test(gate))gate=gate.replace(/npm run quality:ink-glyph(?![:\w-])/g,'npm run quality:ink-glyph:production');
  else gate+=' && npm run quality:ink-glyph:production';
  pkg.scripts['release:gate']=gate;
}
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const gitignorePath=path.join(ROOT,'.gitignore');let gitignore=fs.existsSync(gitignorePath)?fs.readFileSync(gitignorePath,'utf8'):'';if(!/^\.ink-glyph-tools\/$/m.test(gitignore)){backupExisting('.gitignore');if(gitignore&&!gitignore.endsWith('\n'))gitignore+='\n';gitignore+='\n# Ink Glyph World local tool cache\n.ink-glyph-tools/\n';fs.writeFileSync(gitignorePath,gitignore)}
run(process.execPath,['scripts/check-ink-glyph-world.cjs']);run(process.execPath,['--test','test/ink-glyph-world.test.js']);run(process.execPath,['scripts/benchmark-ink-glyph-world.cjs']);
if(!skipVendor){run(process.execPath,['scripts/download-ink-glyph-vendor.cjs']);run(process.execPath,['scripts/check-ink-glyph-world.cjs','--require-vendor'])}
if(!skipFonts){run(process.execPath,['scripts/download-ink-glyph-fonts.cjs','--strict-pin']);run(process.execPath,['scripts/check-ink-glyph-world.cjs','--require-fonts'])}
if(!skipStrokes){run(process.execPath,['scripts/download-ink-glyph-strokes.cjs']);run(process.execPath,['scripts/check-ink-glyph-world.cjs','--require-strokes'])}
if(!skipTools){run(process.execPath,['scripts/install-ink-glyph-tools.cjs']);run(process.execPath,['scripts/check-ink-glyph-world.cjs','--require-tools'])}
const report={schemaVersion:3,version:'3.0.0',installedAt:new Date().toISOString(),root:ROOT,copied,backedUp:backed,backup:backed?backup:null,fontsDownloaded:!skipFonts,vendorDownloaded:!skipVendor,strokesDownloaded:!skipStrokes,toolsInstalled:!skipTools,releaseGateIntegrated:Boolean(pkg.scripts['release:gate']?.includes('quality:ink-glyph:production')),features:['worker','indexeddb-cache','semantic-world-presets','opentype-vector-source','hanzi-stroke-order','stroke-write-animation','cpu-navgraph-a-star','lod-tiers','quality-tournament','glb-export','glb-structural-validator','gltfpack-optimizer','benchmark','playwright-e2e']};
fs.writeFileSync(path.join(ROOT,'INK_GLYPH_WORLD_INSTALL_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`INK_GLYPH_WORLD V3 INSTALL PASS copied=${copied} backup=${backed} fonts=${skipFonts?'SKIPPED':'PASS'} vendor=${skipVendor?'SKIPPED':'PASS'} strokes=${skipStrokes?'SKIPPED':'PASS'} tools=${skipTools?'SKIPPED':'PASS'}`);
