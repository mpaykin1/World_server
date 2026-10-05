#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  analyzeForensics,
  validateCoreRuntimeEvidence,
} from "./observatory-core.mjs";

const inputs=process.argv.slice(2);
if(!inputs.length){
  console.error("usage: node tools/krieger-total-control/replay-trace.mjs <trace.json|dir> [...]");
  process.exit(2);
}

const files=[];
for(const input of inputs){
  const st=fs.statSync(input);
  if(st.isDirectory()){
    for(const name of fs.readdirSync(input).sort()){
      if(name.endsWith(".json")) files.push(path.join(input,name));
    }
  } else {
    files.push(input);
  }
}
if(!files.length) throw new Error("no trace JSON files found");

const reports=[];
let failed=false;
for(const file of files){
  const doc=JSON.parse(fs.readFileSync(file,"utf8"));
  const events=Array.isArray(doc.events)?doc.events:[];
  const validation=validateCoreRuntimeEvidence(events);
  const analysis=analyzeForensics(events);
  const stages=[...new Set(events.map(e=>e?.stage).filter(Boolean))];
  const item={
    file,
    case:doc.case||null,
    events:events.length,
    validation,
    stages,
    viewport:{
      screen:analysis.viewport.screen,
      master:analysis.viewport.master,
      projectionAspect:analysis.viewport.projectionAspect,
      forcedTwoToOne:analysis.viewport.forcedTwoToOne,
    },
    assets:{
      meshSamples:analysis.assets.meshSamples,
      materialPassSamples:analysis.assets.materialPassSamples,
      materialJobSamples:analysis.assets.materialJobSamples,
      meshOrigins:analysis.assets.meshOrigins.length,
      materialOrigins:analysis.assets.materialOrigins.length,
    },
    renderer:{
      cpuToGpuObserved:analysis.renderer.cpuToGpuObserved,
      drawSamples:analysis.renderer.drawSamples,
      drawsWithOperator:analysis.renderer.drawsWithOperator,
    },
    data:{
      observed:analysis.data.observed,
      ops:analysis.data.document?.ops??null,
      bytesConsumed:analysis.data.document?.bytesConsumed??null,
    },
    game:{
      observed:analysis.game.observed,
      playerWeapon:analysis.game.playerWeapon,
      activeMonsters:analysis.game.activeMonsters,
    },
  };
  if(!validation.pass) failed=true;
  reports.push(item);
}
const output={pass:!failed,traces:reports.length,reports};
console.log(JSON.stringify(output,null,2));
if(failed) process.exitCode=1;
