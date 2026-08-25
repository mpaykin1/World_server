'use strict';

export class TextureExplorationBot {
  constructor({ moveCamera, collectSample, settleMs = 120 }) {
    this.moveCamera = moveCamera;
    this.collectSample = collectSample;
    this.settleMs = settleMs;
    this.aborted = false;
  }

  abort() { this.aborted = true; }

  async run(mission) {
    const samples = [];
    for (const waypoint of mission.waypoints || []) {
      if (this.aborted) break;
      const moved = await this.moveCamera(waypoint);
      if (moved === false) continue;
      await new Promise(resolve => setTimeout(resolve, this.settleMs));
      const sample = await this.collectSample(waypoint);
      if (sample) samples.push({ ...sample, targetSetKey: waypoint.targetSetKey ?? null });
    }
    return { completed: !this.aborted, samples };
  }
}
