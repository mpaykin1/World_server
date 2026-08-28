import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
function arg(name,fallback=null){const i=args.indexOf(name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback;}
const repo=path.resolve(arg('--repo',process.cwd()));
const promote=args.includes('--promote');
const dry=args.includes('--dry-run');
const patchRoot=path.join(here,'patch');

function ensureRepo(){for(const f of ['package.json','data/app-release-registry.json','shared/golden-physics.js','shared/golden-performance-autotuner.js','services/ai3d-worker/ai3d/plugins/depth_anything.py'])if(!fs.existsSync(path.join(repo,f)))throw new Error(`Not a compatible World_server root: missing ${f}`);}
function walk(dir,base=dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);e.isDirectory()?walk(p,base,out):out.push(path.relative(base,p));}return out;}
function copyFile(rel){const src=path.join(patchRoot,rel),dst=path.join(repo,rel);if(dry){console.log('[dry] copy',rel);return;}fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}
function writeJson(file,obj){if(dry){console.log('[dry] update',file);return;}fs.writeFileSync(path.join(repo,file),JSON.stringify(obj,null,2)+'\n','utf8');}

ensureRepo();
for(const rel of walk(patchRoot))copyFile(rel);

const pkgPath=path.join(repo,'package.json');const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.scripts||={};
Object.assign(pkg.scripts,{
  'dreamfog:static':'node scripts/dreamfog-static-gate.mjs',
  'dreamfog:e2e':'playwright test e2e/dreamfog-world.spec.js --project=desktop-chromium --project=mobile-chromium',
  'dreamfog:test':'npm run dreamfog:static && node --test test/dreamfog-config.test.js && npm run dreamfog:e2e',
  'dreamfog:from-image':'python services/ai3d-worker/tools/dreamfog_from_image.py'
});
if(!dry)fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n','utf8');

const registry=JSON.parse(fs.readFileSync(path.join(repo,'data/app-release-registry.json'),'utf8'));registry.apps||={};
if(promote){
  const reportPath=path.join(repo,'DREAMFOG_VERIFICATION_REPORT.json');if(!fs.existsSync(reportPath))throw new Error('Promotion refused: DREAMFOG_VERIFICATION_REPORT.json missing. Run node verify.mjs --repo <repo> --full first.');
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));if(report.passed!==true||report.full!==true)throw new Error('Promotion refused: full DreamFog verification has not passed.');
  registry.apps['dreamfog-world']={title:'DreamFog World',description:'Туманный сюрреалистический 3D-мир с процедурными существами, водой и адаптивной графикой.',visible:true,status:'certified',kind:'game',goldenStandard:'v2',required:['desktop-controls','camera-relative-directions','mobile-controls','mouse-look','touch-look','grounding','wall-collision','spawn','render','adaptive-quality']};
}else{
  const prev=registry.apps['dreamfog-world'];
  if(!(prev?.status==='certified'&&prev?.visible===true))registry.apps['dreamfog-world']={title:'DreamFog World',description:'DreamFog candidate. Hidden until full verification passes.',visible:false,status:'quarantine',kind:'game',goldenStandard:'v2',reason:'Installer keeps deny-by-default policy. Run full verification before promotion.',required:['desktop-controls','camera-relative-directions','mobile-controls','mouse-look','touch-look','grounding','wall-collision','spawn','render','adaptive-quality']};
}
writeJson('data/app-release-registry.json',registry);

console.log(JSON.stringify({status:'PASS',repo,mode:promote?'promote':'install',dryRun:dry,copied:walk(patchRoot).length,next:promote?'Run release smoke / deployment.':'Run: node '+path.join(here,'verify.mjs')+' --repo "'+repo+'" --full'},null,2));
