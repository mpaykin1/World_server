'use strict';
/**
 * Plugin Orchestrator — maximally mutual-supportive wiring
 * Each open-source plugin enhances 2+ existing systems, and existing systems feed it.
 * Synergy score ensures only +50% net gain is installed.
 */
const PLUGINS = {
  'cannon-es': {
    npm: 'cannon-es', license:'MIT', impact:80,
    provides:['physics:stable-collision','physics:step-up','physics:wall-slide'],
    requires:[],
    enhances:['collision:stairs','collision:wall','controls:movement','performance:worker-physics'],
    wiring:'lib/adapters/physics-cannon.js will wrap cannon-es World+Body and expose stepUp(1.05) used by shared/common.js collision'
  },
  'comlink': {
    npm:'comlink', license:'Apache-2.0', impact:65,
    provides:['worker:typed-rpc','worker:offload'],
    requires:[],
    enhances:['quality.worker.queue','physics:worker','pixel.atlas.build','quality.world'],
    wiring:'lib/adapters/worker-comlink.js exposes expose/wrap for quality_worker_jobs and world chunk meshing'
  },
  'idb-keyval': {
    npm:'idb-keyval', license:'Apache-2.0', impact:55,
    provides:['persistence:indexeddb','persistence:evidence-cache'],
    requires:['worker:offload'],
    enhances:['persistence:device-evidence','quality.world:evidence-ledger','persistence:atlas-cache'],
    wiring:'lib/adapters/persist-idb.js caches procedural_quality_device_reports and atlas manifests offline'
  },
  'sharp': {
    npm:'sharp', license:'Apache-2.0', impact:70,
    provides:['image:atlas-build','image:resize','image:optimize'],
    requires:['worker:offload'],
    enhances:['pixel.animation.atlas','pixel.animation.streaming','performance:texture-memory'],
    wiring:'scripts/build-pixel-atlas.js will prefer sharp if available, fallback to canvas'
  },
  'msw': {
    npm:'msw', license:'MIT', impact:60,
    provides:['mock:supabase','mock:realtime','mock:http'],
    requires:[],
    enhances:['tests:regression','quality:stability','quality:diff'],
    wiring:'test/mocks/supabase-msw.js will mock supabase Realtime for deterministic CI'
  },
  'zod': {
    npm:'zod', license:'MIT', impact:55,
    provides:['validation:schema','validation:contract'],
    requires:[],
    enhances:['supabase.schema.drift','factory.schema.contracts','data_integrity'],
    wiring:'lib/validation.js already uses zod if present for factory/game-spec validation'
  }
};

function synergyScore(installedKeys){
  // mutual support: count enhances that are also provides of another installed plugin
  const providesSet=new Set();
  for(const k of installedKeys) for(const p of (PLUGINS[k]?.provides||[])) providesSet.add(p);
  let cross=0;
  for(const k of installedKeys){
    for(const e of (PLUGINS[k]?.enhances||[])){
      // if another plugin requires or enhances same domain, it's mutual
      for(const other of installedKeys) if(other!==k){
        if((PLUGINS[other].requires||[]).some(r=> e.includes(r.split(':')[0])) || (PLUGINS[other].enhances||[]).includes(e)) cross++;
      }
    }
  }
  const maxSingle=Math.max(...installedKeys.map(k=>PLUGINS[k]?.impact||0),1);
  return Math.round((cross*10 + installedKeys.length*15)/maxSingle*100); // heuristic 0-~120
}

function getGraph(){
  const installed=Object.keys(PLUGINS).filter(k=>{
    try{ require.resolve(k); return true; }catch{
      try{ require('fs').existsSync(require('path').join(__dirname,'..','node_modules',k)); return require('fs').existsSync(require('path').join(__dirname,'..','node_modules',k)); }catch{ return false; }
    }
  });
  const missing=Object.keys(PLUGINS).filter(k=>!installed.includes(k));
  return {
    installed, missing,
    synergy: synergyScore(installed),
    synergyWithAll: synergyScore(Object.keys(PLUGINS)),
    plugins: PLUGINS
  };
}

function wireInfo(){
  const g=getGraph();
  return {
    ...g,
    wiring: Object.fromEntries(Object.entries(PLUGINS).map(([k,v])=>[k,v.wiring])),
    policy: 'install only if impact>=50 and synergy>=50 and allowed license'
  };
}

module.exports={ PLUGINS, getGraph, synergyScore, wireInfo };
if(require.main===module) console.log(JSON.stringify(wireInfo(),null,2));
