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
  "material.job",
  "renderer.frame",
  "scene.portals",
  "gpu.frame",
  "gpu.draw",
  "data.document",
  "game.state",
  "creature.sample",
  "observatory.command",
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
  const materialJobs = events.filter(x => x?.stage === "material.job");
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
    materialJobSamples:materialJobs.length,
    materialUsageHistogram:usage,
    meshOrigins:meshes.filter(x=>Number.isInteger(x.originOp) && x.originOp>=0).map(x=>({
      kind:x.kind,op:x.originOp,classId:x.originClass,result:x.originResult,
      vertices:x.vertices,triangles:x.triangles
    })),
    materialOrigins:materialJobs.filter(x=>Number.isInteger(x.originOp) && x.originOp>=0).map(x=>({
      op:x.originOp,classId:x.originClass,result:x.originResult,
      usage:x.usage,program:x.program,renderPass:x.renderPass
    })),
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
  const draws = events.filter(x => x?.stage === "gpu.draw");
  const cpuHasJobs = !!(renderer && Number(renderer.paintJobs || 0) > 0);
  const gpuHasDraws = !!(gpu && Number(gpu.drawCalls || 0) > 0);
  return {
    renderer,
    gpu,
    cpuHasJobs,
    gpuHasDraws,
    cpuToGpuObserved:cpuHasJobs && gpuHasDraws,
    drawSamples:draws.length,
    drawsWithOperator:draws.filter(x=>Number.isInteger(x.originOp) && x.originOp>=0).length,
    drawProvenance:draws.filter(x=>Number.isInteger(x.originOp) && x.originOp>=0).slice(-64).map(x=>({
      op:x.originOp,classId:x.originClass,result:x.originResult,
      jobId:x.jobId,usage:x.usage,renderPass:x.renderPass,program:x.program,
      vertices:x.vertices,indices:x.indices,setup:x.setup,
      renderTarget:x.renderTarget,viewport:x.viewport
    })),
  };
}


export function analyzeLighting(events = []) {
  const frames=events.filter(x=>x?.stage==="renderer.frame"&&x?.mode==="2004");
  const commands=events.filter(x=>x?.stage==="observatory.command"&&[6,8,12].includes(x.code));
  const latest=frames.at(-1)||null;
  const maxField=(key)=>frames.length?Math.max(...frames.map(x=>Number(x?.[key]??0))):null;
  return {
    observed:frames.length>0,frames:frames.length,latest,
    rawLights:maxField("rawLights"),
    selectedLights:maxField("selectedLights"),
    shadowLights:maxField("shadowLights"),
    shadowJobs:maxField("shadowJobs"),
    commands:commands.slice(-16),
    nativeLightFrames:frames.filter(x=>Number(x?.selectedLights||0)>0).length,
    nativeShadowFrames:frames.filter(x=>Number(x?.shadowLights||0)>0&&Number(x?.shadowJobs||0)>0).length,
    nativeLightPathObserved:frames.some(x=>Number(x?.selectedLights||0)>0),
    nativeShadowPathObserved:frames.some(x=>Number(x?.shadowLights||0)>0&&Number(x?.shadowJobs||0)>0),
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


export function validateCoreRuntimeEvidence(events = []) {
  const errors=[];
  const latest=latestByStage(events);
  const meshes=events.filter(x=>x?.stage==="geometry.mesh");
  const passes=events.filter(x=>x?.stage==="material.pass");
  const renderFrames=events.filter(x=>x?.stage==="renderer.frame");
  const gpuFrames=events.filter(x=>x?.stage==="gpu.frame");
  const gpuDraws=events.filter(x=>x?.stage==="gpu.draw");

  const screen=latest["engine.screen"]?.config;
  if(!Array.isArray(screen) || screen.length!==2 || screen.some(x=>!Number.isFinite(x)||x<=0))
    errors.push("engine.screen.config must contain two positive finite dimensions");

  const master=latest["mainplayer.master_viewport"]?.window;
  if(!Array.isArray(master) || master.length!==4 || master.some(x=>!Number.isFinite(x)))
    errors.push("mainplayer.master_viewport.window must contain four finite coordinates");
  else if(master[2]<=master[0] || master[3]<=master[1])
    errors.push("mainplayer.master_viewport.window must have positive area");

  if(!meshes.some(x=>Number(x.vertices)>0 && Number(x.triangles)>0))
    errors.push("no geometry.mesh sample has positive vertices and triangles");

  if(!passes.some(x=>Number.isFinite(Number(x.usage)) && Number.isFinite(Number(x.program)) && Number.isFinite(Number(x.pass))))
    errors.push("no material.pass sample has finite usage/program/pass");

  if(!renderFrames.some(x=>Number(x.paintJobs)>0))
    errors.push("no renderer.frame has positive paintJobs");

  if(!gpuFrames.some(x=>Number(x.drawCalls)>0))
    errors.push("no gpu.frame has positive drawCalls");

  const doc=latest["data.document"];
  if(!doc || Number(doc.ops)<=0 || Number(doc.classes)<=0 || Number(doc.bytesConsumed)<=0)
    errors.push("data.document must report positive classes, ops and bytesConsumed");

  for(const d of gpuDraws.slice(0,64)) {
    if(!Number.isFinite(Number(d.setup)) || !Array.isArray(d.viewport) || d.viewport.length!==4)
      errors.push("gpu.draw sample has invalid setup/viewport");
  }

  return {
    pass:errors.length===0,
    errors,
    samples:{
      meshes:meshes.length,
      materialPasses:passes.length,
      rendererFrames:renderFrames.length,
      gpuFrames:gpuFrames.length,
      gpuDraws:gpuDraws.length,
    },
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
    lighting: analyzeLighting(events),
    data: analyzeData(events),
    game: analyzeGame(events),
    eventCount: events.length,
  };
}
