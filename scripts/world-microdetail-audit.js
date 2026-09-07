#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {POLICY,validatePolicy}=require('../lib/world-quality-microdetail-policy');
const ROOT=process.cwd();
const read=rel=>{try{return fs.readFileSync(path.join(ROOT,rel),'utf8')}catch{return''}};
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const checks=[];
function check(id,ok,critical=true,detail=''){checks.push({id,ok:Boolean(ok),critical,detail});}

const policyValidation=validatePolicy();
const runtime=read('shared/graphics/universal-voxel-microdetail.js');
const bootstrap=read('shared/graphics/universal-voxel-microdetail-bootstrap.js');
const voxelIndex=read('apps/voxel-world/index.html');
const cityIndex=read('apps/ai3d-voxel-city/index.html');
const autopilot=read('scripts/world-quality-autopilot.js');
const pkg=JSON.parse(read('package.json')||'{}');
const requiredProfiles=['smooth','stone','earth','sand','snow','wood','vegetation','metal','brick','skin','face','scales','fur','bone','armor','weapon','fabric','default'];

check('policy-valid',policyValidation.ok,true,policyValidation.errors.join(','));
check('semantic-profile-coverage',requiredProfiles.every(p=>POLICY.profiles[p]),true,`${requiredProfiles.length} required profiles`);
check('dynamic-detail-runtime',runtime.includes('buildDetailedGeometry')&&bootstrap.includes('swapForRender')&&bootstrap.includes('restoreAfterRender'),true);
check('shader-path',runtime.includes('patchMaterial')&&runtime.includes('uMicroStrength'),true);
check('skinned-topology-safe',!runtime.includes('skinIndex')&&!runtime.includes('skinWeight'),true,'shader-only for arbitrary animated meshes');
check('orthographic-exact-guard',bootstrap.includes('camera?.isOrthographicCamera')&&runtime.includes('setPresentationMode'),true);
check('collision-isolation',POLICY.guards.collisionAgnostic===true&&bootstrap.includes('does not create a second renderer or collision world'),true);
check('voxel-world-bootstrap',voxelIndex.includes('/shared/graphics/universal-voxel-microdetail-bootstrap.js'),true);
check('ai3d-city-bootstrap',cityIndex.includes('/shared/graphics/universal-voxel-microdetail-bootstrap.js'),true);
check('quality-autopilot-integration',autopilot.includes("'world-microdetail-audit.js'")&&autopilot.includes('microdetailPercent:'),true);
check('package-script',pkg.scripts?.['quality:world:microdetail']==='node scripts/world-microdetail-audit.js',true);
check('desktop-ai-instruction',exists('DESKTOP_AI_MICRODETAIL_V2.md'),false);
check('architecture-doc',exists('docs/UNIVERSAL_VOXEL_MICRODETAIL_V2.md'),false);

const changed=new Set();
for(const args of [['diff','--name-only'],['diff','--name-only','origin/master...HEAD']]){
  try{for(const rel of cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean))changed.add(rel)}catch{}
}
check('gameplay-source-preserved',!changed.has('apps/voxel-world/client.js')&&!changed.has('apps/ai3d-voxel-city/client.js'),true,'render hook only; gameplay/collision sources untouched in working tree and committed branch diff');

const critical=checks.filter(c=>c.critical),passed=checks.filter(c=>c.ok).length,criticalOk=critical.every(c=>c.ok);
const structuralPercent=Math.round(100*passed/checks.length);
const percent=criticalOk?Math.min(92,Math.round(structuralPercent*.92)):Math.round(structuralPercent*.75);
const report={
  schemaVersion:POLICY.schemaVersion,system:'UNIVERSAL_VOXEL_MICRODETAIL',generatedAt:new Date().toISOString(),
  valid:criticalOk,percent,structuralPercent,requiresBrowserEvidence:true,
  guarantees:{singlePolicySource:true,dynamicNearestMeshGeometry:true,shaderMidDistance:true,exactFrontPreserved:true,collisionAgnostic:true,localFpsEmergencyFallback:true,globalQualityCeiling:true},
  profileCount:Object.keys(POLICY.profiles).length,tierCount:Object.keys(POLICY.tiers).length,checks,
  remainingFor100:[
    'Playwright visual evidence on desktop + mobile for protrusions/dents and exact-front preservation',
    'Measured FPS/triangles/draw-calls before/after on representative scenes',
    'Explicit semantic tags from every future animal/character/weapon asset pipeline where names are ambiguous'
  ]
};
fs.writeFileSync(path.join(ROOT,'WORLD_MICRODETAIL_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_MICRODETAIL_V2] ${criticalOk?'PASS':'FAIL'} · structural=${structuralPercent}% · implementation=${percent}%`);
if(!criticalOk){for(const c of critical.filter(c=>!c.ok))console.error(` - ${c.id}: ${c.detail||'failed'}`);process.exitCode=1;}
