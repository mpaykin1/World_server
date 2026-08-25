'use strict';
const fs = require('node:fs');
const path = require('node:path');

function proposal(id, engine, risk, description, apply) { return { id, engine, risk, description, apply }; }
function proposeEngineOptimizations(project, engineInfo, semantic, config = {}) {
  const out = []; const files = project.files || [];
  if (engineInfo.engine === 'webgl') {
    const html = files.find(f => path.basename(f).toLowerCase()==='index.html');
    if (html && fs.existsSync(html)) {
      const text=fs.readFileSync(html,'utf8');
      if (!/content-visibility\s*:/i.test(text) && /<style/i.test(text)) out.push(proposal('webgl-content-visibility-hint','webgl','low','Add opt-in CSS containment hint for offscreen non-canvas content', file=>{
        const before=fs.readFileSync(file,'utf8'); const after=before.replace(/<style([^>]*)>/i,'<style$1>\n.qa-auto-offscreen{content-visibility:auto;contain-intrinsic-size:1px 800px;}'); if(after!==before) fs.writeFileSync(file,after); return after!==before;
      }));
    }
    if (!semantic.checks.lod) out.push(proposal('webgl-distance-quality-contract','webgl','medium','Add distance-quality contract candidate (near=full, mid=balanced, far=fog/LOD)', null));
  } else if (engineInfo.engine === 'godot') {
    const projectFile=files.find(f=>path.basename(f).toLowerCase()==='project.godot');
    if (projectFile && !semantic.checks.lod) out.push(proposal('godot-visibility-range-plan','godot','medium','Generate Visibility Range/LOD plan preserving full near-player quality', null));
    if (!semantic.checks.lighting) out.push(proposal('godot-baked-light-plan','godot','medium','Generate baked-light/probe plan with dynamic hero lights preserved', null));
  } else if (engineInfo.engine === 'roblox') {
    if (!semantic.checks.lod) out.push(proposal('roblox-streamingmesh-plan','roblox','medium','Generate StreamingEnabled/mesh LOD plan preserving near-player render fidelity', null));
    if (!semantic.checks.collision) out.push(proposal('roblox-collision-plan','roblox','high','Generate collision audit candidate before any geometry rewrite', null));
  }
  return out.filter(p => !config.disabled?.includes(p.id));
}
function applyLowRiskProposal(project, p) {
  if (p.risk !== 'low' || typeof p.apply !== 'function') return { applied:false, reason:'not-low-risk-executable' };
  const target = (project.files||[]).find(f=>path.basename(f).toLowerCase()==='index.html');
  if (!target) return { applied:false, reason:'target-missing' };
  return { applied: !!p.apply(target), target };
}
module.exports = { applyLowRiskProposal, proposeEngineOptimizations };
