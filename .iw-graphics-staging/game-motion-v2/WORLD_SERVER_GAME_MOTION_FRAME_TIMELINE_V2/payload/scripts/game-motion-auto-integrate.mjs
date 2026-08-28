#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd(), APPLY=process.argv.includes('--apply');
const roots=['apps','games','projects'].map(x=>path.join(ROOT,x)).filter(fs.existsSync);
const skip=new Set(['node_modules','.git','dist','build','.cache']);
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p,out);else if(e.name.toLowerCase()==='index.html')out.push(p)}return out}
const files=roots.flatMap(r=>walk(r));const changed=[],candidates=[];
for(const file of files){
  let s=fs.readFileSync(file,'utf8');
  if(!/(<canvas\b|three(?:\.min)?\.js|webgl|getcontext\s*\(\s*['"]webgl)/i.test(s))continue;
  candidates.push(path.relative(ROOT,file));
  if(/game-motion-engine\.js/i.test(s))continue;
  const three=/(three(?:\.min)?\.js|THREE\.)/.test(s);
  const tags=`\n<script src="/shared/game-motion-engine.js"></script>${three?'\n<script src="/shared/game-motion-three-adapter.js"></script>':''}\n`;
  if(!/<\/body>/i.test(s))continue;
  s=s.replace(/<\/body>/i,`${tags}</body>`);
  if(APPLY){fs.writeFileSync(file,s)}
  changed.push(path.relative(ROOT,file));
}
console.log(JSON.stringify({apply:APPLY,candidates:candidates.length,changed},null,2));
if(!APPLY&&changed.length)console.log('[GAME_MOTION_AUTO_INTEGRATE] dry-run only; re-run with --apply after review.');
