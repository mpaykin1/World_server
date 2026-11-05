'use strict';

// Author-controlled, offline WebGL2 game compiler. No remote source/code/asset imports.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runSevenEngines } = require('./seven-adapters.cjs');
const { simulatePhysicsStep } = require('./physics.cjs');
const { packArtifact, verifyArtifact } = require('./artifact.cjs');

const sha = value => createHash('sha256').update(value).digest('hex');
const text = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const jsonScript = value => JSON.stringify(value).replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function vector(v, label) {
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
      ['x', 'y', 'z'].some(a => typeof v[a] !== 'number' || !Number.isFinite(v[a]) ||
      Math.abs(v[a]) > 10000)) throw new TypeError(label + ' needs finite bounded x/y/z');
  return v;
}
function validateGeometry(card, result) {
  const world = card.world;
  if (!world || typeof world !== 'object' || !Array.isArray(world.solids) ||
      !world.solids.length || world.solids.length > 250)
    throw new TypeError('Explicit authored world.solids (1..250) required');
  const physics = result.outputs.physics, layers = physics.collisions.layers;
  for (const [i, solid] of world.solids.entries()) {
    const label = 'world.solids[' + i + ']';
    if (!solid || !layers.includes(solid.layer)) throw new TypeError(label + '.layer not approved');
    vector(solid.min, label + '.min'); vector(solid.max, label + '.max');
    if (['x', 'y', 'z'].some(a => solid.min[a] >= solid.max[a]))
      throw new TypeError(label + ' must have positive volume');
  }
  vector(world.spawn, 'world.spawn');
  if (!Array.isArray(world.sceneMarkers) ||
      world.sceneMarkers.length !== result.outputs.mechanics.scenes.length)
    throw new TypeError('One authored marker per scenario scene required');
  const seen = new Set();
  for (const [i, marker] of world.sceneMarkers.entries()) {
    if (!marker || marker.id !== result.outputs.mechanics.scenes[i].id || seen.has(marker.id))
      throw new TypeError('Scene marker IDs/order must match real ruleSet');
    vector(marker.position, 'world.sceneMarkers[' + i + '].position');
    seen.add(marker.id);
  }
  // Real canonical collision validation, not a fake independent physics implementation.
  simulatePhysicsStep(physics, { solids: world.solids }, {
    position: world.spawn, velocity: { x: 0, y: 0, z: 0 }
  }, 1 / 120);
}
function makeHTML(data) {
  const markup = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
    '<meta name="theme-color" content="#07111c">',
    '<title>META GAMES — The Witness Vault</title>',
    '<style>',
    '*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;background:#07111c;color:#eaf5fb;font-family:system-ui,sans-serif}',
    '#screen{position:fixed;inset:0;display:block;width:100%;height:100%;touch-action:none;overscroll-behavior:none}',
    '#hud{position:fixed;left:0;right:0;top:env(safe-area-inset-top,0px);display:flex;justify-content:center;padding:20px;pointer-events:none;gap:11px}',
    '#hud i{width:10px;height:10px;display:block;transform:rotate(45deg);border:1px solid #a0c8d5aa;background:#1c3343aa;box-shadow:0 0 13px #7ce8ff33}',
    '#hud i.done{background:#d6f5e9;box-shadow:0 0 18px #c5fff4}',
    '#menu{display:none;position:fixed;inset:0;z-index:12;place-items:center;background:#05101bbd;backdrop-filter:blur(14px);padding:22px}',
    '#menu.open{display:grid}#panel{width:min(90vw,510px);max-height:85dvh;overflow:auto;background:linear-gradient(165deg,#183148ee,#071420f5);border:1px solid #84cbd777;padding:30px;box-shadow:0 0 90px #0de0f81a}',
    '#panel h2{font:300 clamp(25px,6vw,40px) Georgia,serif;letter-spacing:.07em;margin:0 0 16px;color:#e8fff6}',
    '#panel p{color:#aac8d7;line-height:1.55;font-size:15px}#options{display:grid;gap:12px;margin-top:20px}',
    '#options button{background:#d1efe9;color:#072532;border:0;padding:15px;text-align:left;font-weight:700;cursor:pointer;min-height:44px}',
    '#options button:hover,#options button:focus-visible{background:#fff4cc}',
    '.control{display:none;position:fixed;bottom:max(7vh,env(safe-area-inset-bottom));width:62px;height:62px;border:1px solid #b5eee599;border-radius:16px;background:#10334ab0;place-items:center;touch-action:none;color:#eff;z-index:8}',
    '.control svg{width:36px;height:36px;fill:#d6f5f0;image-rendering:pixelated;shape-rendering:crispEdges}',
    '#jump{right:22px}#use{right:94px}',
    '#stick{display:none;position:fixed;width:86px;height:86px;border:1px solid #b5eee577;border-radius:50%;background:#64d4d420;pointer-events:none;z-index:8}',
    '#knob{position:absolute;width:32px;height:32px;left:27px;top:27px;border-radius:50%;background:#d9fafa77;box-shadow:0 0 24px #71ecec}',
    '#hint{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);font-size:11px;letter-spacing:.2em;opacity:.52;pointer-events:none}',
    '@media(pointer:coarse){.control{display:grid}#hint{display:none}}',
    '</style></head><body>',
    '<canvas id="screen" aria-label="Playable three dimensional adventure"></canvas>',
    '<div id="hud" aria-label="Chapter progress"></div>',
    '<div id="stick" aria-hidden="true"><div id="knob"></div></div>',
    '<button id="use" class="control" aria-label="Interact"><svg viewBox="0 0 16 16"><path d="M6 1h4v2h2v2h2v6h-2v2h-2v2H6v-2H4v-2H2V5h2V3h2zm1 4v6h2V5z"/></svg></button>',
    '<button id="jump" class="control" aria-label="Jump"><svg viewBox="0 0 16 16"><path d="M7 1h2v2h2v2h2v2h-3v8H6V7H3V5h2V3h2z"/></svg></button>',
    '<div id="hint">WASD / ARROWS · SPACE · E · DRAG TO ORBIT</div>',
    '<div id="menu" role="dialog" aria-modal="true"><section id="panel"><h2 id="title"></h2><p id="description"></p><div id="options"></div></section></div>',
    '<script type="application/json" id="game-data">' + jsonScript(data) + '</script>',
    '<script src="./game.js"></script></body></html>'
  ];
  return markup.join('\n');
}
function bundleCommonJS(name, source) {
  // Only pinned local engine source, NEVER a user-submitted script.
  return '(function(){const module={exports:{}};\n' + source +
    '\nwindow.' + name + '=module.exports;})();\n';
}
function createGameArtifact({ gameCard, randomSeed, recentGames = [], sourceCommit } = {}) {
  const result = runSevenEngines({ gameCard, randomSeed, recentGames });
  if (result.errors.length || result.steps.length !== 7)
    throw new Error('Full canonical pipeline required: ' + JSON.stringify(result.errors));
  if (Array.isArray(gameCard.referenceIds) && gameCard.referenceIds.length)
    throw new Error('Rights-unverified external assets are forbidden');
  validateGeometry(gameCard, result);
  const mechanics = text('mechanics.cjs'), physics = text('physics.cjs');
  const browser = text('browser-runtime.js');
  const runtime = bundleCommonJS('EngineMechanics', mechanics) +
    bundleCommonJS('EnginePhysics', physics) + browser;
  const data = {
    gameId: result.gameId, seed: result.seed,
    scenario: result.outputs.story, rules: result.outputs.mechanics,
    physics: result.outputs.physics, visual: result.outputs.visual,
    onboarding: result.outputs.onboarding, world: structuredClone(gameCard.world)
  };
  const provenance = {
    generator: 'meta-games-game-builder-v1', sourceCommit,
    sourceCommitVerified: false, externalAssets: [],
    components: Object.fromEntries([
      ['seven-adapters.cjs', text('seven-adapters.cjs')],
      ['mechanics.cjs', mechanics], ['physics.cjs', physics],
      ['visual.cjs', text('visual.cjs')], ['browser-runtime.js', browser]
    ].map(([name, value]) => [name, { sha256: sha(value), origin: 'World_server/lib/engines/' + name }])),
    rights: 'generated_original_code_only_external_rights_not_verified'
  };
  const atmosphere = result.outputs.visual.shaders.atmosphere;
  const files = {
    'index.html': makeHTML(data), 'game.js': runtime,
    'data/pipeline.json': JSON.stringify(result),
    'data/provenance.json': JSON.stringify(provenance),
    'shaders/atmosphere-vertex.glsl': atmosphere.vertexShader,
    'shaders/atmosphere-fragment.glsl': atmosphere.fragmentShader
  };
  const artifact = packArtifact({ gameId: gameCard.id, sourceCommit, pipelineResult: result, files });
  if (!verifyArtifact(artifact)) throw new Error('Artifact integrity check failed');
  return artifact;
}
module.exports = { createGameArtifact };
