#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const PATCH=__dirname,tmp=fs.mkdtempSync(path.join(os.tmpdir(),'igw-v3-')),repo=path.join(tmp,'World_server');fs.mkdirSync(path.join(repo,'apps'),{recursive:true});
fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'fixture',scripts:{'release:gate':'node -e "process.exit(0)" && npm run quality:ink-glyph'}},null,2));
const r=cp.spawnSync(process.execPath,[path.join(PATCH,'install-ink-glyph-world.cjs'),'--repo',repo,'--skip-fonts','--skip-vendor','--skip-strokes','--skip-tools'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);
const pkg=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
const checks=[
 pkg.scripts['release:gate'].includes('quality:ink-glyph:production')&&!/npm run quality:ink-glyph(?![:\w-])/.test(pkg.scripts['release:gate']),
 fs.existsSync(path.join(repo,'apps','ink-glyph-world','worker.js')),
 fs.existsSync(path.join(repo,'shared','ink-glyph-world-core.js')),
 fs.existsSync(path.join(repo,'e2e','ink-glyph-world.spec.js')),
 fs.existsSync(path.join(repo,'scripts','download-ink-glyph-strokes.cjs')),
 fs.existsSync(path.join(repo,'scripts','optimize-ink-glyph-glb.cjs')),
 fs.existsSync(path.join(repo,'scripts','validate-ink-glyph-glb.cjs'))&&Boolean(pkg.scripts['ink:glyph:glb:validate']),
 Boolean(pkg.scripts['strokes:ink:download']&&pkg.scripts['tools:ink:install']),
 fs.existsSync(path.join(repo,'INK_GLYPH_WORLD_INSTALL_REPORT.json')),
 fs.readFileSync(path.join(repo,'.gitignore'),'utf8').includes('.ink-glyph-tools/'),
 fs.existsSync(path.join(repo,'.ink-glyph-backups'))&&fs.readdirSync(path.join(repo,'.ink-glyph-backups')).some(stamp=>fs.existsSync(path.join(repo,'.ink-glyph-backups',stamp,'package.json')))
];
if(checks.some(x=>!x)){console.error('INTEGRATION FAIL',checks);process.exit(1)}console.log(`PATCH_INTEGRATION_VERIFY PASS ${checks.filter(Boolean).length}/${checks.length}`);fs.rmSync(tmp,{recursive:true,force:true});
