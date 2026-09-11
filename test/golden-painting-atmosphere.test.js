const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const atmosphere=require('../shared/golden-painting-atmosphere.js');

test('canonical cycle durations are exact',()=>{
  assert.deepEqual(atmosphere.STANDARD.cycle,{day:60,sunset:60,night:10,sunrise:60,total:190});
  assert.equal(atmosphere.phaseAt(0).phase,'day');
  assert.equal(atmosphere.phaseAt(59.999).phase,'day');
  assert.equal(atmosphere.phaseAt(60).phase,'sunset');
  assert.equal(atmosphere.phaseAt(120).phase,'night');
  assert.equal(atmosphere.phaseAt(130).phase,'sunrise');
  assert.equal(atmosphere.phaseAt(190).phase,'day');
});

test('golden painting runtime is loaded by every playable web world',()=>{
  const worlds=['ai3d-voxel-city','cinematic-encounter','dark-void-scene','survival','voxel-world','world-sharabass'];
  for(const world of worlds){
    const html=fs.readFileSync(path.join(__dirname,'..','apps',world,'index.html'),'utf8');
    assert.match(html,/\/shared\/golden-painting-atmosphere\.js/,world);
  }
});

test('Three.js worlds register real scene atmosphere',()=>{
  for(const world of ['ai3d-voxel-city','cinematic-encounter','dark-void-scene','survival','voxel-world']){
    const js=fs.readFileSync(path.join(__dirname,'..','apps',world,'client.js'),'utf8');
    assert.match(js,/GoldenPaintingAtmosphere\?\.registerThree/,world);
  }
});
test('Sharabass custom shader receives time state and aerial perspective',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','apps','world-sharabass','index.html'),'utf8');
  assert.match(html,/goldenAtmosphereState/);
  assert.match(html,/smoothstep\(MAX_DIST \* 0\.32, MAX_DIST \* 0\.78, t\)/);
  assert.match(html,/atmosphereCol/);
});

test('painting doctrine includes atmospheric exception',()=>{
  assert.match(atmosphere.STANDARD.painting.foreground,/warmer/);
  assert.match(atmosphere.STANDARD.painting.background,/cooler/);
  assert.match(atmosphere.STANDARD.painting.exception,/sunset/);
  assert.ok(atmosphere.STANDARD.nightEmitters.includes('aurora glow'));
});


test('natural cycle state never depends on an undefined timer',()=>{
  const s=atmosphere.currentState(1500);
  assert.ok(atmosphere.PHASE_ORDER.includes(s.phase));
  assert.equal(typeof s.elapsedInCycle,'number');
});

test('depth grading encodes the painting foreground/background rules',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/goldenPaintingDepthV2/);
  assert.match(src,/gpNear/);
  assert.match(src,/gpFar/);
  assert.match(src,/1\.34,\.56,1\.22,\.62/);
  assert.match(src,/goldenFarTint/);
});

test('golden graphics surface stack is cheap, semantic and texture-aware',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/SURFACE_PBR/);
  assert.match(src,/goldenPbrTuned/);
  assert.match(src,/goldenSurfaceVariation/);
  assert.match(src,/goldenSurfaceNormal/);
  assert.match(src,/goldenSurfaceRough/);
  assert.match(src,/LinearMipmapLinearFilter/);
  assert.match(src,/getMaxAnisotropy/);
  assert.match(src,/PCFSoftShadowMap/);
  assert.match(src,/ACESFilmicToneMapping/);
});

test('adaptive graphics keeps expensive surface detail off low-power devices and adapts exposure',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/const lowPower=!forceHigh/);
  assert.match(src,/pbrCapable&&!a\.lowPower/);
  assert.match(src,/currentExposure/);
  assert.match(src,/exposureAdaptation:true/);
});

test('voxel water uses one-pass animated Fresnel shading',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','apps','voxel-world','client.js'),'utf8');
  assert.match(src,/goldenWaterShader/);
  assert.match(src,/gwFresnel/);
  assert.match(src,/goldenWaterStrength/);
  assert.match(src,/goldenWaterTime\.value=now\/1000/);
});

test('adaptive profile does not misclassify 720p desktop as mobile',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/\(global\.innerWidth\|\|9999\)<760/);
  assert.doesNotMatch(src,/Math\.min\(global\.innerWidth/);
});

test('procedural LUT color grading is built once per adapter and skipped on low-power',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/function buildProceduralLut\(a\)/);
  assert.match(src,/const LUT_SIZE=8/);
  assert.match(src,/const useLut=Boolean\(a\.lutTexture\)&&!a\.lowPower/);
  assert.match(src,/goldenLutSample/);
  assert.match(src,/if\(!a\.lowPower\)\{\s*\n\s*a\.lutTexture=buildProceduralLut\(a\);/);
  assert.match(src,/lut:\{enabled:Boolean\(a\.lutTexture\)/);
});

test('light probe is a cheap phase-updated static SH approximation, not a real-time cube capture',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/function ensureLightProbe\(a\)/);
  assert.match(src,/T\.LightProbe/);
  assert.match(src,/T\.SphericalHarmonics3/);
  assert.doesNotMatch(src,/CubeCamera/);
  assert.match(src,/function updateLightProbe\(a,s\)/);
  assert.match(src,/updateLightProbe\(a,s\);/);
  assert.match(src,/lightProbe:\{enabled:Boolean\(a\.lightProbe\)/);
});

test('procedural normal/roughness textures prefer OffscreenCanvas with a document canvas fallback',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/function makeSurfaceCanvas\(size\)/);
  assert.match(src,/typeof OffscreenCanvas!=='undefined'/);
  assert.match(src,/if\(!global\.document\)return null;/);
  assert.match(src,/offscreenCanvas:\{supported:typeof OffscreenCanvas!=='undefined'/);
  assert.doesNotMatch(src,/renderer\s*=\s*new\s+\w*\.?OffscreenCanvas/);
});

test('registerThree only prewarms the shared asset codec for diagnostics on non-lowPower devices',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/global\.GoldenAssetCodec\?\.prewarm/);
  assert.match(src,/global\.GoldenAssetCodec\.prewarm\(\{renderer:options\.renderer,worldId:options\.worldId,threeRevision:options\.THREE\?\.REVISION\}\)/);
  assert.match(src,/assetCodec:\(a\.assetCodec&&typeof a\.assetCodec\.diagnostics==='function'\)\?a\.assetCodec\.diagnostics\(\):null/);
});

test('shared KTX2/Meshopt asset-codec helper is lazy, cached, fail-soft and matches the client three.js version',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','graphics','golden-asset-codec.js'),'utf8');
  assert.match(src,/THREE_VERSION = '0\.165\.0'/);
  assert.match(src,/https:\/\/esm\.sh\/three@\$\{version\}\/examples\/jsm\/loaders\/KTX2Loader\.js\?bundle/);
  assert.match(src,/loaders\/KTX2Loader\.js/);
  assert.match(src,/libs\/meshopt_decoder\.module\.js/);
  assert.match(src,/setTranscoderPath/);
  assert.match(src,/detectSupport\(renderer\)/);
  assert.match(src,/function createKTX2Loader\(renderer, options\)/);
  assert.match(src,/if \(state\.ktx2\.promise\) return state\.ktx2\.promise;/);
  assert.match(src,/if \(state\.meshopt\.promise\) return state\.meshopt\.promise;/);
  assert.match(src,/\.catch\(\(error\) => \{/);
  assert.match(src,/function prewarm\(options\)/);
  assert.match(src,/function diagnostics\(\)/);
  assert.match(src,/global\.GoldenAssetCodec = api;/);
});

test('golden asset codec loads before the client on every playable web world',()=>{
  const worlds=['ai3d-voxel-city','cinematic-encounter','dark-void-scene','survival','voxel-world','world-sharabass'];
  for(const world of worlds){
    const html=fs.readFileSync(path.join(__dirname,'..','apps',world,'index.html'),'utf8');
    const codecIndex=html.indexOf('/shared/graphics/golden-asset-codec.js');
    const clientIndex=html.search(/<script[^>]*src=["'][^"']*client\.js["']/);
    assert.ok(codecIndex!==-1,`${world} missing golden-asset-codec.js`);
    if(clientIndex!==-1)assert.ok(codecIndex<clientIndex,`${world} must load asset codec before client.js`);
  }
});

test('directional shadows use a camera-relative importance window without extra cascades',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/updateImportanceShadows/);
  assert.match(src,/shadowBases:new WeakMap/);
  assert.match(src,/light\.target\.position\.copy\(focus\)/);
  assert.match(src,/const extent=a\.mobile\?26:36/);
  assert.match(src,/importanceShadows:Boolean/);
});


test('directional shadow stabilization sets bias without extra passes',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/light\.shadow\.bias=-0\.0006/);
  assert.match(src,/light\.shadow\.normalBias=a\.mobile\?\.025:\.035/);
});

test('vegetation wind is vertex-only and disabled for low-power adapters',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/vegetation&&!a\.lowPower/);
  assert.match(src,/goldenWindTime/);
  assert.match(src,/goldenWindMask/);
  assert.match(src,/for\(const u of a\.windUniforms\)u\.value=/);
});

test('procedural environment IBL rebuilds only on phase changes and is low-power gated',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/function updateEnvironment\(a,s\)/);
  assert.match(src,/a\.lowPower\|\|.*a\.environmentPhase===s\.phase/);
  assert.match(src,/EquirectangularReflectionMapping/);
  assert.match(src,/a\.scene\.environment=tex/);
});

test('auto mobile keeps cinematic-lite graphics while low mode remains available',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/const graphicsMode=/);
  assert.match(src,/graphicsMode==='low'/);
  assert.match(src,/memory>0&&memory<=2/);
  assert.match(src,/cores<=2&&!mobile/);
  assert.match(src,/!a\.mobile&&global\.GoldenAssetCodec/);
});
