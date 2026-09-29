import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  analyzeViewport,
  analyzeWeapon,
  analyzeLifecycle,
  analyzeForensics,
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
