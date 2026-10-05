#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const upstream = process.argv[2];
if (!upstream) {
  console.error("usage: node tools/krieger-total-control/verify-upstream.mjs <werkkzeug3_kkrieger-root>");
  process.exit(2);
}

const repoRoot = process.cwd();
const graph = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/krieger-knowledge-graph.json"), "utf8"));
const caps = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/krieger-capability-map.json"), "utf8"));

const expectedMaps = [
  "geometry","material","renderer","scene_level","creature",
  "weapon","effects","audio","browser_wasm","data_compression"
];
const actualMaps = graph.maps.map(x => x.id);
if (JSON.stringify(actualMaps) !== JSON.stringify(expectedMaps)) {
  throw new Error("knowledge graph must contain the canonical ten maps in order");
}

const requiredPixelStages = [
  "DATA","GENERATOR","RUNTIME_OBJECT","CPU_JOB","GPU_BUFFER",
  "MATERIAL_SHADER","FRAMEBUFFER","POSTPROCESS","VIEWPORT","CANVAS"
];
for (const stage of requiredPixelStages) {
  if (!graph.pixelPipeline?.stages?.includes(stage)) throw new Error("missing pixel pipeline stage: "+stage);
}
const requiredInputStages = [
  "BROWSER_EVENT","SDL_EVENT","WASM_INPUT_BUFFER","APP_HANDLER",
  "GAME_STATE","SIMULATION","ANIMATION_EVENT","RENDERER"
];
for (const stage of requiredInputStages) {
  if (!graph.inputPipeline?.stages?.includes(stage)) throw new Error("missing input pipeline stage: "+stage);
}

const allowed = new Set(["REUSE","ADAPT","REIMPLEMENT","KRIEGER-ONLY","OBSOLETE"]);
for (const cap of caps.capabilities) {
  if (!allowed.has(cap.status)) throw new Error("invalid capability status "+cap.id+": "+cap.status);
  for (const key of ["id","source","input","output","status","worldServerEquivalent","limits"]) {
    if (!(key in cap)) throw new Error("capability missing "+key+": "+cap.id);
  }
}

const cache = new Map();
function read(rel) {
  const p = path.join(upstream, rel);
  if (!fs.existsSync(p)) throw new Error("upstream file missing: "+rel);
  if (!cache.has(rel)) cache.set(rel, fs.readFileSync(p, "utf8"));
  return cache.get(rel);
}

let anchors = 0;
for (const map of graph.maps) {
  if (!map.evidence?.length) throw new Error("map has no evidence: "+map.id);
  for (const ev of map.evidence) {
    const source = read(ev.file);
    for (const anchor of ev.anchors || []) {
      anchors++;
      if (!source.includes(anchor)) {
        throw new Error(`missing pinned-source anchor [${map.id}] ${ev.file}: ${anchor}`);
      }
    }
  }
}

for (const finding of graph.openForensicsFindings || []) {
  if (!finding.file || !finding.anchors) continue;
  const source = read(finding.file);
  for (const anchor of finding.anchors) {
    anchors++;
    if (!source.includes(anchor)) {
      throw new Error(`missing forensic finding anchor [${finding.id}] ${finding.file}: ${anchor}`);
    }
  }
}

if (anchors < 45) throw new Error("too few exact source anchors: "+anchors);
if (caps.upstream.commit !== graph.upstream.commit) throw new Error("upstream commit mismatch between graph and capability map");
if (!graph.userAcceptanceOverridesAutomation) throw new Error("physical-device acceptance override must remain explicit");

console.log(JSON.stringify({
  pass:true,
  upstream:graph.upstream,
  maps:graph.maps.length,
  capabilities:caps.capabilities.length,
  exactAnchorsVerified:anchors,
  filesRead:[...cache.keys()].sort(),
  openForensicsFindings:graph.openForensicsFindings.map(x=>x.id)
}, null, 2));
