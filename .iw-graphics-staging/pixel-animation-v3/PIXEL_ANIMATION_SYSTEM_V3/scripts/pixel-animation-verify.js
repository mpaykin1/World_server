"use strict";
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(process.argv[2]||process.cwd());
const required=[
 'shared/pixel-animation-engine.js','shared/pixel-animation-webgpu.js','shared/pixel-animation-runtime.js','shared/pixel-animation-worker.js','shared/pixel-animation-worker-bridge.js','shared/pixel-animation-pixi8-adapter.js','shared/pixel-atlas-builder.js','shared/pixel-animation-auto-profile.js',
 'shared/pixel-animation-gpu-culling.js','shared/pixel-animation-multi-atlas.js','shared/pixel-animation-region-rig.js','shared/pixel-animation-pipeline-cache.js','shared/pixel-animation-visual-regression.js','shared/pixel-animation-device-learning.js','shared/pixel-animation-auto-integrator.js',
 'test/pixel-animation-engine.test.js','test/pixel-animation-v2.test.js','test/pixel-animation-v3.test.js','test/pixel-animation-syntax.test.js',
 'scripts/pixel-animation-visual-regression.js','scripts/pixel-animation-auto-integrate.js',
 'supabase/migrations/20260824053500_pixel_animation_runtime_v3.sql','supabase/migrations/20260824053600_pixel_animation_runtime_v3_deny_policy.sql','supabase/migrations/20260824053700_pixel_animation_runtime_v3_remove_unused_indexes.sql',
 'supabase/functions/pixel-animation-config/index.ts','supabase/functions/pixel-animation-telemetry/index.ts'
];
let failed=false;
for(const rel of required){if(!fs.existsSync(path.join(root,rel))){console.error('MISSING',rel);failed=true;}}
function read(rel){return fs.existsSync(path.join(root,rel))?fs.readFileSync(path.join(root,rel),'utf8'):'';}
const engine=read('shared/pixel-animation-engine.js');
for(const token of ['3.0.0','WebGL2Renderer','SpatialHashGrid','AdaptiveBudget','sampler2DArray','gpuComputeCulling','multiAtlasStreaming','deviceLearning'])if(!engine.includes(token)){console.error('ENGINE_TOKEN_MISSING',token);failed=true;}
const webgpu=read('shared/pixel-animation-webgpu.js');
for(const token of ['texture_2d_array','drawIndexedIndirect','computeCuller','visibilityBuffer','atlasLayer'])if(!webgpu.includes(token)){console.error('WEBGPU_TOKEN_MISSING',token);failed=true;}
const culling=read('shared/pixel-animation-gpu-culling.js');
for(const token of ['@compute','atomicCompareExchangeWeak','indirectBuffer','maxVisible'])if(!culling.includes(token)){console.error('CULLING_TOKEN_MISSING',token);failed=true;}
const runtime=read('shared/pixel-animation-runtime.js');
for(const token of ["'webgpu'","'webgl2'","'canvas2d'",'PixelAnimationPipelineCache','createManaged'])if(!runtime.includes(token)){console.error('RUNTIME_TOKEN_MISSING',token);failed=true;}
const edge=read('supabase/functions/pixel-animation-config/index.ts');
for(const token of ['SUPABASE_PUBLISHABLE_KEYS','credential.modern','pixel-animation-config/v3','gpuComputeCulling','learnedPolicy'])if(!edge.includes(token)){console.error('CONFIG_EDGE_TOKEN_MISSING',token);failed=true;}
const telemetry=read('supabase/functions/pixel-animation-telemetry/index.ts');
for(const token of ['SUPABASE_SECRET_KEYS','serviceHeaders','if(!credential.modern)headers.Authorization','pixel_animation_device_baselines','pixel_animation_learned_policy'])if(!telemetry.includes(token)){console.error('TELEMETRY_TOKEN_MISSING',token);failed=true;}
if(/Authorization:`Bearer \$\{secret\}`/.test(telemetry)){console.error('TELEMETRY_MODERN_SECRET_BEARER_REGRESSION');failed=true;}
if(failed)process.exit(1);
console.log('Pixel Animation V3 structural gate PASS');
