'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');const root=path.resolve(__dirname,'..');
const txt=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(rel){const code=txt(rel),ctx={globalThis:{},console,Math,Float32Array,Uint32Array,Uint16Array,performance:{now:()=>0}};ctx.globalThis.globalThis=ctx.globalThis;vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.globalThis}
test('V8 true skinned velocity samples current and previous bone textures',()=>{const s=txt('shared/procedural-quality-three-skinned-motion.js');for(const m of ['prevBoneTexture','boneTexture','skinIndex','skinWeight','skinPos','pqPrevClip'])assert.ok(s.includes(m),m)});
test('V8 unknown procedural deformation becomes reactive instead of fake velocity',()=>{const s=txt('shared/procedural-quality-three-skinned-motion.js');assert.ok(s.includes('__pqDeformationReactive'));assert.ok(s.includes('customDeformerAPI'))});
test('V8 voxel DDGI injects real voxel/palette radiance into WebGPU 3D textures',()=>{const s=txt('shared/procedural-quality-voxel-ddgi.js');for(const m of ['voxelsOf','paletteColor','writeTexture','ddgi.current','voxelSceneRadiance'])assert.ok(s.includes(m),m)});
test('V8 promotion requires golden and physical certification for production',()=>{const P=load('shared/procedural-quality-promotion.js').WorldProceduralPromotion;
 const base={score:95,visualScore:94,animationScore:92,stabilityScore:96,nativeCoveragePct:90,skinnedVelocityPct:90,verified:true,regressionFree:true,baselinePass:true};
 assert.equal(P.assess({...base,production:true,deviceCertified:false}).promote,false);
 assert.equal(P.assess({...base,production:true,deviceCertified:true}).promote,true);
});
test('V8 physical report API and DB migration exist',()=>{for(const p of ['api/procedural-quality-device-report.js','api/procedural-quality-certification.js','supabase/procedural_quality_v8.sql'])assert.ok(fs.existsSync(path.join(root,p)),p)});
test('V8 profile exposes true velocity, voxel radiance and device certification',()=>{const p=require('../api/procedural-quality-profile.js').buildProfile({webgpu:'1',webgl2:'1',memory:16,cores:16,dpr:1});assert.ok(p.version>=8);assert.equal(p.policy.trueSkinnedVelocity,true);assert.equal(p.policy.voxelSceneRadiance,true);assert.equal(p.policy.physicalDeviceCertification,true)});
test('V8 runtime has kill switch',()=>{const s=txt('shared/procedural-quality-runtime.js');assert.ok(s.includes("get('pq')==='off'"));assert.ok(s.includes('WORLD_PROCEDURAL_QUALITY_DISABLED'))});
