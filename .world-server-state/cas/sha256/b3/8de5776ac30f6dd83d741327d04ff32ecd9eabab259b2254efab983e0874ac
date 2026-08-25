'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(process.argv[2]||process.cwd());
const marker='<!-- PIXEL_ANIMATION_V3_AUTOINSTALL -->';
const scripts=['/shared/pixel-animation-engine.js','/shared/pixel-animation-webgpu.js','/shared/pixel-animation-runtime.js','/shared/pixel-animation-auto-profile.js','/shared/pixel-atlas-builder.js','/shared/pixel-animation-gpu-culling.js','/shared/pixel-animation-multi-atlas.js','/shared/pixel-animation-region-rig.js','/shared/pixel-animation-pipeline-cache.js','/shared/pixel-animation-device-learning.js','/shared/pixel-animation-auto-integrator.js'];
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist','build','.next','.vercel'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(/\.html$/i.test(e.name))out.push(p);}return out;}
function eligible(s){return /<canvas[^>]*(?:data-pixel-animation|data-world-canvas|id=["'](?:game|world)["'])/i.test(s);}
let changed=0,found=0,skipped=0;
for(const file of walk(root)){
  let s=fs.readFileSync(file,'utf8');if(!eligible(s)){skipped++;continue;}found++;if(s.includes(marker))continue;if(!/<\/body>/i.test(s))continue;
  const block='\n'+marker+'\n'+scripts.map(src=>`<script src="${src}"></script>`).join('\n')+'\n<script>window.addEventListener("DOMContentLoaded",()=>{if(window.PixelAnimationAutoIntegrator)PixelAnimationAutoIntegrator.install({onError:console.warn});});</script>\n';
  s=s.replace(/<\/body>/i,block+'</body>');fs.writeFileSync(file,s);changed++;
}
console.log(JSON.stringify({root,eligible:found,changed,skipped,idempotentMarker:marker},null,2));
