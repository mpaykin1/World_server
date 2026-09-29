'use strict';
importScripts('../../shared/ink-glyph-world-core.js');
const Core = self.InkGlyphWorldCore;
if (!Core) throw new Error('InkGlyphWorldCore missing in worker');
self.onmessage = (event) => {
  const { id, alpha, width, height, options } = event.data || {};
  try {
    const input = alpha instanceof Uint8Array ? alpha : new Uint8Array(alpha);
    const mask = Core.cleanMask(input,width,height,{threshold:options?.threshold ?? .20,minNeighbors:1});
    const world = options?.qualityTournament ? Core.tournamentMaskToWorld(mask,width,height,options||{}) : Core.maskToWorld(mask,width,height,options||{});
    self.postMessage({id,ok:true,world});
  } catch (error) {
    self.postMessage({id,ok:false,error:error?.stack||error?.message||String(error)});
  }
};
