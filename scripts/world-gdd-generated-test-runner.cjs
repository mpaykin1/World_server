#!/usr/bin/env node
'use strict';const fs=require('fs'),path=require('path');const ROOT=path.resolve(__dirname,'..');function has(f){return fs.existsSync(path.join(ROOT,f))}const checks=[
['Navigator API/runtime',has('api/generative.js')||has('apps/chat')||has('game-design/IMPROVE_WORLD_GAME_DESIGN_BASELINE.json')],
['Create/Join GDD',has('game-design/IMPROVE_WORLD_GAME_DESIGN_BASELINE.json')],
['multiplayer bridge',has('shared/multiplayer/world-multiplayer-bridge.js')],
['eye/mobile controls contract',has('game-design/IMPROVE_WORLD_GAME_DESIGN_BASELINE.json')],
['11-language runtime',has('shared/i18n/world-locales.json')],
['feedback loop',has('api/feedback.js')&&has('scripts/world-feedback-development-bridge.cjs')],
['safe functions',has('lib/world-function-registry.js')&&has('scripts/world-function-delivery-gate.cjs')],
['Google slots',has('google-ai-studio/slot-contract.json')],
['replay',has('scripts/deterministic-record-replay.cjs')||has('google-ai-studio/replay-smoke.json')],
['AOI authority',has('lib/world-spatial-aoi.js')]
].map(([name,pass])=>({name,pass}));const report={schemaVersion:'6.0.0',generatedAt:new Date().toISOString(),pass:checks.every(x=>x.pass),checks,generatedFrom:'Game Design Spec + capability plan',note:'These are executable repository contracts. Browser/device acceptance remains a separate live gate.'};fs.writeFileSync(path.join(ROOT,'WORLD_GDD_GENERATED_TEST_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=2;
