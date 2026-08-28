export function createShaderHitchCollectorV10({emit = ()=>{}, hitchMs = 8} = {}) {
  let frame = 0;
  return {
    recordCompile(variant, compileMs) { emit({frame, timestamp: performance.now()/1000, variant, compileMs, frameSpikeMs: compileMs >= hitchMs ? compileMs : 0, source:'web-explicit-compile'}); },
    recordFrame(frameMs) { frame++; if (frameMs >= hitchMs) emit({frame, timestamp: performance.now()/1000, variant:'unknown', compileMs:0, frameSpikeMs:frameMs, source:'web-frame-spike-unattributed'}); }
  };
}
