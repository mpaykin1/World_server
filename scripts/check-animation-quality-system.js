#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const validatorPath = path.join(ROOT, 'shared/animation-quality-validator.js');
const policyPath = path.join(ROOT, 'data/self-improvement-policy.json');
const releasePath = path.join(ROOT, 'data/app-release-registry.json');
const report = { schemaVersion:'4.0.0', generatedAt: new Date().toISOString(), checks: [], certifiedApps: [] };
function check(name, pass, detail = '') { report.checks.push({ name, pass: Boolean(pass), detail }); }

check('validator-runtime', fs.existsSync(validatorPath));
check('rig-adapter-runtime', fs.existsSync(path.join(ROOT,'shared/rig-adapters.js')));
check('self-improvement-policy', fs.existsSync(policyPath));
if (fs.existsSync(validatorPath)) {
  const mod = require(validatorPath);
  const good = mod.evaluate({
    movementDirection: { x: 0, y: 0, z: 1 },
    feetDirection: { x: 0, y: 0, z: 1 },
    attackDirection: { x: 0, y: 0, z: 1 },
    weaponPosition: { x: 0, y: 1, z: 0 },
    weaponHandPosition: { x: 0, y: 1, z: 0 }
  });
  const bad = mod.evaluate({ movementDirection: { x: 1, y: 0, z: 0 }, feetDirection: { x: 0, y: 0, z: 1 } });
  check('pure-validator-good-sample', good.score === 100 && good.violations.length === 0);
  check('pure-validator-detects-direction-error', bad.violations.some(v => v.id === 'feet-vs-movement'));
}
if (fs.existsSync(policyPath)) {
  const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const rules = policy.animationRules || [];
  check('feet-direction-rule', rules.some(x => /Feet point/i.test(x)));
  check('attack-direction-rule', rules.some(x => /Attack and shooting direction/i.test(x)));
  check('weapon-hand-rule', rules.some(x => /Hand-held weapons/i.test(x)));
  check('shield-rule', rules.some(x => /Shields remain in front/i.test(x)));
}
if (fs.existsSync(releasePath)) {
  const registry = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f,out);else if(e.isFile()&&/\.(js|mjs|ts|tsx)$/i.test(e.name))out.push(f)}return out;}
  const semanticRe = /AnimationMixer|SkinnedMesh|Skeleton|\bBone\b|leftFoot|rightFoot|weapon|sword|pistol|rifle|machine.?gun|shield/i;
  for (const [id, meta] of Object.entries(registry.apps || {})) {
    if (meta.status !== 'certified' || meta.kind !== 'game') continue;
    const appDir = path.join(ROOT, 'apps', id);
    const code = walk(appDir).map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const relevant = semanticRe.test(code);
    const integrated = code.includes('WorldServerAnimationQuality');
    report.certifiedApps.push({ id, semanticRelevant: relevant, semanticRigIntegrated: integrated });
    if (relevant) check(`semantic-rig-integrated:${id}`, integrated, integrated ? '' : 'semantic character/weapon/shield signals found but no WorldServerAnimationQuality adapter registered');
  }
}
const failed = report.checks.filter(c => !c.pass);
report.pass = failed.length === 0;
const semanticRelevant = report.certifiedApps.filter(x => x.semanticRelevant);
report.semanticIntegrationCoverage = semanticRelevant.length
  ? Math.round(1000 * semanticRelevant.filter(x => x.semanticRigIntegrated).length / semanticRelevant.length) / 10
  : 100;
fs.writeFileSync(path.join(ROOT, 'ANIMATION_QUALITY_SYSTEM_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[ANIMATION_QUALITY] pass=${report.pass} checks=${report.checks.length - failed.length}/${report.checks.length} semanticCoverage=${report.semanticIntegrationCoverage}%`);
if (failed.length) process.exit(72);
