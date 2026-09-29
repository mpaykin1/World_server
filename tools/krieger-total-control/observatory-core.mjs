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

export function analyzeForensics(events = []) {
  return {
    viewport: analyzeViewport(events),
    weapon: analyzeWeapon(events),
    lifecycle: analyzeLifecycle(events),
    eventCount: events.length,
  };
}
