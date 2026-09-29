export const FORENSICS_STAGES = Object.freeze([
  "browser.viewport",
  "lifecycle.runtime_initialized",
  "lifecycle.start_pointerdown",
  "lifecycle.start_click",
  "lifecycle.callmain_begin",
  "engine.screen",
  "mainplayer.master_viewport",
  "mainplayer.projection_aspect",
  "ipp.viewport.pre_fraction",
  "ipp.viewport.post_fraction",
  "engine.set_viewport.before",
  "weapon.request",
  "weapon.request_accepted",
  "weapon.commit",
  "geometry.mesh",
  "material.pass",
  "renderer.frame",
  "scene.portals",
  "gpu.frame",
  "data.document",
  "game.state",
  "creature.sample",
]);

export function latestByStage(events = []) {
  const out = Object.create(null);
  for (const event of events) {
    if (event && typeof event.stage === "string") out[event.stage] = event;
  }
  return out;
}

export function rectMetrics(rect, outer) {
  if (!Array.isArray(rect) || rect.length !== 4 || !Array.isArray(outer) || outer.length !== 2) return null;
  const w = Math.max(0, rect[2] - rect[0]);
  const h = Math.max(0, rect[3] - rect[1]);
  const area = w * h;
  const outerArea = Math.max(1, outer[0] * outer[1]);
  return { width:w, height:h, aspect:h ? w/h : null, areaCoverage:area/outerArea };
}

export function analyzeViewport(events = []) {
  const by = latestByStage(events);
  const screen = by["engine.screen"]?.config || null;
  const master = by["mainplayer.master_viewport"]?.window || null;
  const masterMetrics = rectMetrics(master, screen);
  const projectionAspect = by["mainplayer.projection_aspect"]?.aspect ?? null;
  const browser = by["browser.viewport"] || null;
  const portrait = !!(screen && screen[1] > screen[0]);
  const forcedTwoToOne = !!(
    portrait &&
    masterMetrics &&
    masterMetrics.aspect !== null &&
    Math.abs(masterMetrics.aspect - 2) <= 0.02 &&
    masterMetrics.areaCoverage < 0.9 &&
    projectionAspect !== null &&
    Math.abs(projectionAspect - 2) <= 0.02
  );
  return {
    screen,
    portrait,
    browser,
    master,
    masterMetrics,
    projectionAspect,
    forcedTwoToOne,
    firstMismatch: forcedTwoToOne ? "mainplayer.master_viewport" : null,
  };
}

export function analyzeWeapon(events = []) {
  const requests = events.filter(x => x?.stage === "weapon.request");
  const accepted = events.filter(x => x?.stage === "weapon.request_accepted");
  const commits = events.filter(x => x?.stage === "weapon.commit");
  const lastRequest = requests.at(-1) || null;
  const lastAccepted = accepted.at(-1) || null;
  const lastCommit = commits.at(-1) || null;
  let state = "idle";
  if (lastRequest && (!lastAccepted || lastAccepted.browserNow < lastRequest.browserNow)) state = "rejected_or_unowned";
  if (lastAccepted) state = "pending_animation";
  if (lastCommit && (!lastAccepted || lastCommit.browserNow >= lastAccepted.browserNow)) state = "committed";
  return {state,lastRequest,lastAccepted,lastCommit,requests:requests.length,accepted:accepted.length,commits:commits.length};
}

export function analyzeLifecycle(events = []) {
  const by = latestByStage(events);
  const stages = [
    "lifecycle.runtime_initialized",
    "lifecycle.start_pointerdown",
    "lifecycle.start_click",
    "lifecycle.fullscreen_request",
    "lifecycle.fullscreen_resolved",
    "lifecycle.fullscreen_rejected",
    "lifecycle.callmain_begin",
    "lifecycle.callmain_return",
  ];
  const observed = stages.filter(x => by[x]);
  const missingBeforeCallMain = [
    "lifecycle.runtime_initialized",
    "lifecycle.start_pointerdown",
    "lifecycle.start_click",
    "lifecycle.callmain_begin",
  ].filter(x => !by[x]);
  return {observed,missingBeforeCallMain,readyForDeterministicStart:missingBeforeCallMain.length===0};
}


export function analyzeAssets(events = []) {
  const meshes = events.filter(x => x?.stage === "geometry.mesh");
  const materialPasses = events.filter(x => x?.stage === "material.pass");
  const byKind = Object.create(null);
  let triangles = 0;
  let vertices = 0;
  let animated = 0;
  for (const m of meshes) {
    byKind[m.kind] = (byKind[m.kind] || 0) + 1;
    triangles += Number(m.triangles || 0);
    vertices += Number(m.vertices || 0);
    animated += m.animated ? 1 : 0;
  }
  const usage = Object.create(null);
  for (const p of materialPasses) usage[p.usage] = (usage[p.usage] || 0) + 1;
  return {
    meshSamples:meshes.length,
    byKind,
    totalSampledVertices:vertices,
    totalSampledTriangles:triangles,
    animatedMeshSamples:animated,
    materialPassSamples:materialPasses.length,
    materialUsageHistogram:usage,
  };
}

export function analyzeScene(events = []) {
  const latest = events.filter(x => x?.stage === "scene.portals").at(-1) || null;
  if (!latest) return {observed:false,latest:null,visibilityRatio:null};
  const ratio = latest.sectors > 0 ? latest.visibleSectors / latest.sectors : null;
  return {observed:true,latest,visibilityRatio:ratio};
}

export function analyzeRenderer(events = []) {
  const renderer = events.filter(x => x?.stage === "renderer.frame").at(-1) || null;
  const gpu = events.filter(x => x?.stage === "gpu.frame").at(-1) || null;
  const cpuHasJobs = !!(renderer && Number(renderer.paintJobs || 0) > 0);
  const gpuHasDraws = !!(gpu && Number(gpu.drawCalls || 0) > 0);
  return {
    renderer,
    gpu,
    cpuHasJobs,
    gpuHasDraws,
    cpuToGpuObserved:cpuHasJobs && gpuHasDraws,
  };
}


export function analyzeData(events = []) {
  const document = events.filter(x => x?.stage === "data.document").at(-1) || null;
  if (!document) return {observed:false,document:null,expansion:null};
  const bytes = Math.max(1,Number(document.bytesConsumed || 0));
  const semanticNodes = Number(document.ops || 0) + Number(document.splines || 0) + Number(document.events || 0);
  return {
    observed:true,
    document,
    expansion:{
      semanticNodes,
      semanticNodesPerKB:semanticNodes / (bytes / 1024),
      audioBytes:Number(document.songBytes || 0) + Number(document.sampleBytes || 0),
    },
  };
}

export function analyzeGame(events = []) {
  const state = events.filter(x => x?.stage === "game.state").at(-1) || null;
  const creatures = events.filter(x => x?.stage === "creature.sample");
  return {
    observed:!!state,
    state,
    creatureSamples:creatures.slice(-4),
    activeMonsters:state?.monsters?.states?.[4] ?? null,
    playerWeapon:state?.player?.weapon ?? null,
    playerNextWeapon:state?.player?.nextWeapon ?? null,
  };
}

export function analyzeForensics(events = []) {
  return {
    viewport: analyzeViewport(events),
    weapon: analyzeWeapon(events),
    lifecycle: analyzeLifecycle(events),
    assets: analyzeAssets(events),
    scene: analyzeScene(events),
    renderer: analyzeRenderer(events),
    data: analyzeData(events),
    game: analyzeGame(events),
    eventCount: events.length,
  };
}
