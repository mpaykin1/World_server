'use strict';
const fs = require('node:fs');
const path = require('node:path');

function readSmall(file, max = 2 * 1024 * 1024) { try { const s=fs.statSync(file); return s.size <= max ? fs.readFileSync(file,'utf8') : ''; } catch { return ''; } }
function validateWorld(project, engine = { engine: 'generic' }) {
  const findings = []; const files = project.files || [];
  const text = files.filter(f => /\.(js|ts|gd|luau|html|json|godot)$/i.test(f)).map(f => readSmall(f)).join('\n').toLowerCase();
  const checks = {
    spawn: /spawn|respawn|player[_ -]?start|characteradded|global_position/.test(text),
    collision: /collision|collider|raycast|move_and_slide|can_collide|humanoidrootpart/.test(text),
    camera: /camera|pointerlock|mouse.*look|pitch|yaw/.test(text),
    movement: /keyw|arrowup|move_forward|input\.is_action|humanoid\.walkspeed|userinputservice/.test(text),
    jump: /space|jump|move_and_slide|humanoid\.jump/.test(text),
    mobile: /touch|mobile|viewport|virtual.*stick|touchscreen/.test(text),
    lod: /\blod\b|visibility_range|streaming|distance.*quality|impostor|occlusion/.test(text),
    lighting: /light|shadow|environment|worldenvironment|atmosphere|fog/.test(text)
  };
  for (const [name, ok] of Object.entries(checks)) if (!ok) findings.push({ severity: ['spawn','collision','camera','movement'].includes(name) ? 'high' : 'medium', kind: `missing-${name}` });
  const weights = { spawn:18, collision:18, camera:14, movement:14, jump:8, mobile:10, lod:10, lighting:8 };
  const score = Math.round(Object.entries(checks).reduce((n,[k,v])=>n+(v?weights[k]:0),0));
  return { engine: engine.engine, score, checks, findings, critical: findings.filter(f=>f.severity==='high').length };
}
module.exports = { validateWorld };
