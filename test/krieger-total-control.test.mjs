import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  analyzeViewport,
  analyzeWeapon,
  analyzeLifecycle,
  analyzeForensics,
  analyzeAssets,
  analyzeScene,
  analyzeRenderer,
  analyzeLighting,
  analyzeData,
  analyzeGame,
  validateCoreRuntimeEvidence,
} from "../tools/krieger-total-control/observatory-core.mjs";

test("viewport forensics localizes the pinned portrait 2:1 master viewport", () => {
  const events=[
    {stage:"engine.screen",config:[390,844],browserNow:1},
    {stage:"mainplayer.master_viewport",window:[0,324,390,519],browserNow:2},
    {stage:"mainplayer.projection_aspect",aspect:2,browserNow:3},
  ];
  const v=analyzeViewport(events);
  assert.equal(v.portrait,true);
  assert.equal(v.forcedTwoToOne,true);
  assert.equal(v.firstMismatch,"mainplayer.master_viewport");
  assert.ok(v.masterMetrics.areaCoverage < 0.3);
});

test("viewport forensics does not accuse a full portrait viewport", () => {
  const events=[
    {stage:"engine.screen",config:[390,844],browserNow:1},
    {stage:"mainplayer.master_viewport",window:[0,0,390,844],browserNow:2},
    {stage:"mainplayer.projection_aspect",aspect:390/844,browserNow:3},
  ];
  const v=analyzeViewport(events);
  assert.equal(v.forcedTwoToOne,false);
  assert.equal(v.firstMismatch,null);
  assert.ok(v.masterMetrics.areaCoverage > 0.99);
});

test("weapon Observatory distinguishes UI request, inventory rejection and real commit", () => {
  const rejected=analyzeWeapon([
    {stage:"weapon.request",mapped:4,owned:0,current:0,next:0,timer:0.25,browserNow:10},
  ]);
  assert.equal(rejected.state,"rejected_or_unowned");
  assert.equal(rejected.commits,0);

  const pending=analyzeWeapon([
    {stage:"weapon.request",mapped:2,owned:1,current:0,next:0,timer:0.25,browserNow:10},
    {stage:"weapon.request_accepted",mapped:2,current:0,next:2,timer:0.25,browserNow:11},
  ]);
  assert.equal(pending.state,"pending_animation");

  const committed=analyzeWeapon([
    {stage:"weapon.request",mapped:2,owned:1,current:0,next:0,timer:0.25,browserNow:10},
    {stage:"weapon.request_accepted",mapped:2,current:0,next:2,timer:0.25,browserNow:11},
    {stage:"weapon.commit",current:2,next:2,timerBeforeReset:1.01,browserNow:20},
  ]);
  assert.equal(committed.state,"committed");
  assert.equal(committed.lastCommit.current,2);
});

test("START lifecycle acceptance requires runtime ready, real pointerdown, click and callMain begin", () => {
  const bad=analyzeLifecycle([
    {stage:"lifecycle.start_click",browserNow:1},
    {stage:"lifecycle.callmain_begin",browserNow:2},
  ]);
  assert.equal(bad.readyForDeterministicStart,false);
  assert.ok(bad.missingBeforeCallMain.includes("lifecycle.runtime_initialized"));
  assert.ok(bad.missingBeforeCallMain.includes("lifecycle.start_pointerdown"));

  const good=analyzeLifecycle([
    {stage:"lifecycle.runtime_initialized",browserNow:1},
    {stage:"lifecycle.start_pointerdown",browserNow:2},
    {stage:"lifecycle.start_click",browserNow:3},
    {stage:"lifecycle.callmain_begin",browserNow:4},
  ]);
  assert.equal(good.readyForDeterministicStart,true);
});

test("knowledge graph keeps all ten maps and physical-device acceptance override", () => {
  const graph=JSON.parse(fs.readFileSync(new URL("../data/krieger-knowledge-graph.json",import.meta.url),"utf8"));
  assert.equal(graph.maps.length,10);
  assert.deepEqual(graph.maps.map(x=>x.id),[
    "geometry","material","renderer","scene_level","creature",
    "weapon","effects","audio","browser_wasm","data_compression"
  ]);
  assert.equal(graph.userAcceptanceOverridesAutomation,true);
  assert.ok(graph.openForensicsFindings.some(x=>x.id==="portrait_forced_2_to_1"));
});

test("capability extraction uses only the five explicit dispositions", () => {
  const cap=JSON.parse(fs.readFileSync(new URL("../data/krieger-capability-map.json",import.meta.url),"utf8"));
  const allowed=new Set(["REUSE","ADAPT","REIMPLEMENT","KRIEGER-ONLY","OBSOLETE"]);
  assert.ok(cap.capabilities.length>=15);
  for(const c of cap.capabilities) assert.ok(allowed.has(c.status),c.id);
});

test("full analysis keeps viewport, weapon and lifecycle as independent channels", () => {
  const report=analyzeForensics([
    {stage:"engine.screen",config:[320,900],browserNow:1},
    {stage:"mainplayer.master_viewport",window:[0,370,320,530],browserNow:2},
    {stage:"mainplayer.projection_aspect",aspect:2,browserNow:3},
    {stage:"weapon.request",mapped:4,owned:0,current:0,next:0,timer:0.25,browserNow:4},
    {stage:"lifecycle.start_click",browserNow:5},
  ]);
  assert.equal(report.viewport.forcedTwoToOne,true);
  assert.equal(report.weapon.state,"rejected_or_unowned");
  assert.equal(report.lifecycle.readyForDeterministicStart,false);
});


test("geometry/material Observatory aggregates actual generated runtime samples", () => {
  const a=analyzeAssets([
    {stage:"geometry.mesh",kind:"GenMesh",vertices:120,triangles:80,animated:0},
    {stage:"geometry.mesh",kind:"GenMinMesh",vertices:60,triangles:40,animated:1},
    {stage:"material.pass",usage:0,program:1},
    {stage:"material.pass",usage:4,program:1},
    {stage:"material.pass",usage:4,program:1},
  ]);
  assert.equal(a.meshSamples,2);
  assert.equal(a.byKind.GenMesh,1);
  assert.equal(a.byKind.GenMinMesh,1);
  assert.equal(a.totalSampledVertices,180);
  assert.equal(a.totalSampledTriangles,120);
  assert.equal(a.animatedMeshSamples,1);
  assert.equal(a.materialPassSamples,3);
  assert.equal(a.materialUsageHistogram[4],2);
});

test("scene Observatory reports portal visibility as a ratio", () => {
  const s=analyzeScene([
    {stage:"scene.portals",sectors:12,visibleSectors:3,portals:18,observer:1},
  ]);
  assert.equal(s.observed,true);
  assert.equal(s.latest.portals,18);
  assert.equal(s.visibilityRatio,0.25);
});

test("renderer Observatory proves CPU paint jobs reached actual WebGL draws", () => {
  const r=analyzeRenderer([
    {stage:"renderer.frame",mode:"2004",meshJobs:20,effectJobs:4,paintJobs:71,rawLights:9,selectedLights:4},
    {stage:"gpu.frame",frame:2,viewportChanges:9,drawCalls:83,emptyDraws:0,setups:41},
  ]);
  assert.equal(r.cpuHasJobs,true);
  assert.equal(r.gpuHasDraws,true);
  assert.equal(r.cpuToGpuObserved,true);

  const noGpu=analyzeRenderer([
    {stage:"renderer.frame",mode:"2004",paintJobs:71},
    {stage:"gpu.frame",frame:2,drawCalls:0},
  ]);
  assert.equal(noGpu.cpuToGpuObserved,false);
});

test("full Total Control analysis includes render/scene/assets channels independently", () => {
  const a=analyzeForensics([
    {stage:"geometry.mesh",kind:"GenMesh",vertices:12,triangles:8,animated:0},
    {stage:"material.pass",usage:0},
    {stage:"scene.portals",sectors:4,visibleSectors:2,portals:3,observer:1},
    {stage:"renderer.frame",mode:"generic",paintJobs:6},
    {stage:"gpu.frame",frame:1,drawCalls:6},
  ]);
  assert.equal(a.assets.meshSamples,1);
  assert.equal(a.scene.visibilityRatio,0.5);
  assert.equal(a.renderer.cpuToGpuObserved,true);
});


test("data Observatory measures compact document expansion without guessing visual size", () => {
  const d=analyzeData([
    {stage:"data.document",classes:43,ops:600,splines:20,events:35,songBytes:9000,sampleBytes:3000,bytesConsumed:120000,beta2004:1},
  ]);
  assert.equal(d.observed,true);
  assert.equal(d.document.ops,600);
  assert.equal(d.expansion.semanticNodes,655);
  assert.equal(d.expansion.audioBytes,12000);
  assert.ok(d.expansion.semanticNodesPerKB>5);
});

test("game Observatory reads real simulated player and creature state", () => {
  const g=analyzeGame([
    {stage:"game.state",tick:100,player:{life:87,armor:12,weapon:2,nextWeapon:2,weaponTimer:.25},monsters:{count:8,alive:5,states:[0,1,2,1,4]},shots:1,dynamicCells:3},
    {stage:"creature.sample",index:0,type:2,state:4,life:80,lifeMax:100,weaponKind:1,pos:[1,2,3]},
  ]);
  assert.equal(g.observed,true);
  assert.equal(g.playerWeapon,2);
  assert.equal(g.playerNextWeapon,2);
  assert.equal(g.activeMonsters,4);
  assert.equal(g.creatureSamples.length,1);
});

test("full Total Control analysis keeps compact-data and live-game channels separate", () => {
  const a=analyzeForensics([
    {stage:"data.document",classes:10,ops:100,splines:4,events:6,bytesConsumed:20000},
    {stage:"game.state",player:{weapon:1,nextWeapon:2},monsters:{states:[0,0,0,1,3]}},
  ]);
  assert.equal(a.data.observed,true);
  assert.equal(a.game.observed,true);
  assert.equal(a.game.playerWeapon,1);
  assert.equal(a.game.playerNextWeapon,2);
});


test("asset Observatory keeps exact KDoc operator provenance separate from geometry metrics", () => {
  const a=analyzeAssets([
    {stage:"geometry.mesh",kind:"GenMesh",originOp:317,originClass:0x91,originResult:3,vertices:120,triangles:80,animated:0},
    {stage:"material.pass",usage:4,program:1},
    {stage:"material.job",originOp:88,originClass:0x42,originResult:5,usage:4,program:1,renderPass:7},
  ]);
  assert.deepEqual(a.meshOrigins,[{kind:"GenMesh",op:317,classId:0x91,result:3,vertices:120,triangles:80}]);
  assert.deepEqual(a.materialOrigins,[{op:88,classId:0x42,result:5,usage:4,program:1,renderPass:7}]);
  assert.equal(a.materialJobSamples,1);
});

test("unowned/transient runtime objects do not invent KDoc provenance", () => {
  const a=analyzeAssets([
    {stage:"geometry.mesh",kind:"GenMinMesh",originOp:-1,originClass:-1,originResult:-1,vertices:60,triangles:20,animated:1},
    {stage:"material.job",originOp:-1,originClass:-1,originResult:-1,usage:0,program:1,renderPass:0},
  ]);
  assert.equal(a.meshOrigins.length,0);
  assert.equal(a.materialOrigins.length,0);
  assert.equal(a.meshSamples,1);
  assert.equal(a.materialJobSamples,1);
});


test("renderer Observatory carries exact KDoc provenance into WebGL draw samples", () => {
  const r=analyzeRenderer([
    {stage:"renderer.frame",mode:"2004",paintJobs:12},
    {stage:"gpu.frame",frame:2,drawCalls:14},
    {stage:"gpu.draw",originOp:317,originClass:0x91,originResult:3,jobId:4,usage:4,renderPass:7,program:0,vertices:120,indices:240,setup:11,renderTarget:-1,viewport:[0,0,390,844]},
  ]);
  assert.equal(r.cpuToGpuObserved,true);
  assert.equal(r.drawSamples,1);
  assert.equal(r.drawsWithOperator,1);
  assert.deepEqual(r.drawProvenance[0],{
    op:317,classId:0x91,result:3,jobId:4,usage:4,renderPass:7,program:0,
    vertices:120,indices:240,setup:11,renderTarget:-1,viewport:[0,0,390,844]
  });
});

test("renderer Observatory does not invent provenance for internal/effect draws", () => {
  const r=analyzeRenderer([
    {stage:"renderer.frame",mode:"generic",paintJobs:2},
    {stage:"gpu.frame",frame:1,drawCalls:2},
    {stage:"gpu.draw",originOp:-1,originClass:-1,originResult:-1,jobId:-1,usage:-1,renderPass:-1,program:-1,vertices:4,indices:6,setup:3,renderTarget:8,viewport:[0,0,512,512]},
  ]);
  assert.equal(r.drawSamples,1);
  assert.equal(r.drawsWithOperator,0);
  assert.equal(r.drawProvenance.length,0);
});


test("live-evidence validator rejects stage-only fake telemetry", () => {
  const v=validateCoreRuntimeEvidence([
    {stage:"engine.screen",config:[390,844]},
    {stage:"mainplayer.master_viewport",window:[0,0,390,844]},
    {stage:"geometry.mesh",vertices:0,triangles:0},
    {stage:"material.pass",usage:0,program:0,pass:0},
    {stage:"renderer.frame",paintJobs:0},
    {stage:"gpu.frame",drawCalls:0},
    {stage:"data.document",classes:0,ops:0,bytesConsumed:0},
  ]);
  assert.equal(v.pass,false);
  assert.ok(v.errors.some(x=>x.includes("positive vertices")));
  assert.ok(v.errors.some(x=>x.includes("positive paintJobs")));
  assert.ok(v.errors.some(x=>x.includes("positive drawCalls")));
  assert.ok(v.errors.some(x=>x.includes("positive classes")));
});

test("live-evidence validator accepts coherent measured runtime values", () => {
  const v=validateCoreRuntimeEvidence([
    {stage:"engine.screen",config:[390,844]},
    {stage:"mainplayer.master_viewport",window:[0,300,390,495]},
    {stage:"geometry.mesh",vertices:120,triangles:80},
    {stage:"material.pass",usage:0,program:1,pass:2},
    {stage:"renderer.frame",paintJobs:42},
    {stage:"gpu.frame",drawCalls:44},
    {stage:"gpu.draw",setup:5,viewport:[0,0,390,195]},
    {stage:"data.document",classes:40,ops:600,bytesConsumed:120000},
  ]);
  assert.equal(v.pass,true);
  assert.deepEqual(v.errors,[]);
  assert.equal(v.samples.gpuDraws,1);
});


test("lighting Observatory distinguishes native selected lights and shadow jobs", () => {
  const l=analyzeLighting([
    {stage:"renderer.frame",mode:"2004",rawLights:9,selectedLights:4,shadowLights:3,shadowJobs:18},
    {stage:"observatory.command",code:6,state:1},
  ]);
  assert.equal(l.observed,true);
  assert.equal(l.nativeLightPathObserved,true);
  assert.equal(l.nativeShadowPathObserved,true);
  assert.equal(l.selectedLights,4);
  assert.equal(l.shadowLights,3);
  assert.equal(l.commands.length,1);
});

test("lighting Observatory does not promote an empty frame", () => {
  const l=analyzeLighting([{stage:"renderer.frame",mode:"2004",rawLights:0,selectedLights:0,shadowLights:0,shadowJobs:0}]);
  assert.equal(l.nativeLightPathObserved,false);
  assert.equal(l.nativeShadowPathObserved,false);
});


test("lighting Observatory preserves earlier native-light proof when the latest frame is empty", () => {
  const l=analyzeLighting([
    {stage:"renderer.frame",mode:"2004",rawLights:9,selectedLights:4,shadowLights:2,shadowJobs:12},
    {stage:"renderer.frame",mode:"2004",rawLights:0,selectedLights:0,shadowLights:-1,shadowJobs:0},
  ]);
  assert.equal(l.latest.selectedLights,0);
  assert.equal(l.selectedLights,4);
  assert.equal(l.shadowLights,2);
  assert.equal(l.nativeLightPathObserved,true);
  assert.equal(l.nativeShadowPathObserved,true);
});
