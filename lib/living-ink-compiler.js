'use strict';
const fs=require('fs');
const path=require('path');
const REQUIRED_ACTIONS=['walk','sit','type','coffee'];
function assert(cond,msg){if(!cond)throw new Error(msg);}
function validateWorldRecipe(recipe){
  assert(recipe&&typeof recipe==='object','WorldRecipe must be an object');
  assert(recipe.kind==='living-ink-office','WorldRecipe.kind must be living-ink-office');
  assert(Number.isInteger(recipe.seed),'WorldRecipe.seed must be an integer');
  assert(Array.isArray(recipe.characters)&&recipe.characters.length>=3,'WorldRecipe requires at least three characters');
  assert(Array.isArray(recipe.props)&&recipe.props.includes('desk')&&recipe.props.includes('computer')&&recipe.props.includes('plant')&&recipe.props.includes('coffee-machine'),'WorldRecipe is missing required office props');
  assert(Array.isArray(recipe.actions)&&REQUIRED_ACTIONS.every(x=>recipe.actions.includes(x)),'WorldRecipe is missing required animation actions');
  assert(recipe.lod&&recipe.lod.artisticLevels>=2,'WorldRecipe requires at least two artistic LOD levels');
  return recipe;
}
function escapeInlineScript(source){return String(source).replace(/<\/script/gi,'<\\/script');}
function compileStandalone({recipe,coreSource,officeSource,title='ASQURA Living Ink Office'}){
  validateWorldRecipe(recipe);assert(coreSource&&officeSource,'runtime sources are required');
  const json=JSON.stringify(recipe).replace(/</g,'\\u003c');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#f8f5ef"><link rel="icon" href="data:,"><title>${title}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;background:#f8f5ef}body{position:fixed;inset:0;touch-action:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif}canvas{display:block;width:100vw;height:100vh;touch-action:none}.brand{position:fixed;right:18px;top:max(14px,env(safe-area-inset-top));color:rgba(49,72,95,.24);font-weight:800;font-size:12px;letter-spacing:.14em;pointer-events:none;user-select:none}.hint{position:fixed;left:16px;bottom:max(12px,env(safe-area-inset-bottom));color:rgba(49,72,95,.24);font:600 10px/1.25 system-ui;letter-spacing:.08em;pointer-events:none;user-select:none}</style></head><body><canvas id="living-ink"></canvas><div class="brand">ASQURA / LIVING INK</div><div class="hint">DRAG TO LOOK · WASD / ARROWS</div><script>${escapeInlineScript(coreSource)}</script><script>${escapeInlineScript(officeSource)}</script><script>window.__LIVING_INK_STANDALONE__=true;const WORLD_RECIPE=${json};LivingInkOffice.start(document.getElementById('living-ink'),WORLD_RECIPE);</script></body></html>\n`;
}
function buildFromRepo(root=path.resolve(__dirname,'..')){
  const recipe=JSON.parse(fs.readFileSync(path.join(root,'data','living-ink-office.recipe.json'),'utf8'));
  const coreSource=fs.readFileSync(path.join(root,'shared','living-ink-core.js'),'utf8');
  const officeSource=fs.readFileSync(path.join(root,'shared','living-ink-office.js'),'utf8');
  const html=compileStandalone({recipe,coreSource,officeSource});
  const out=path.join(root,'apps','living-ink-office','index.html');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html,'utf8');return {out,bytes:Buffer.byteLength(html),recipe};
}
module.exports={REQUIRED_ACTIONS,validateWorldRecipe,compileStandalone,buildFromRepo};
