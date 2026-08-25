export const SAFE_DEVICE_KNOBS=new Set(['decodeConcurrency','distantTickHz','shadowUpdateIntervalFrames','reflectionUpdateIntervalFrames','farAudioUpdateHz','streamingPrefetchSeconds','animationFarHz','physicsSleepDelaySec','networkFarHz','backgroundBakeConcurrency']);
const FORBIDDEN=/resolution|texture|geometry|lod|pixelRatio|anisotropy|material|nearField/i;
export function validateDeviceSchedule(schedule){const errors=[];for(const k of Object.keys(schedule?.knobs||{})){if(!SAFE_DEVICE_KNOBS.has(k)||FORBIDDEN.test(k))errors.push(k);}return{pass:errors.length===0,errors,qualityInvariant:'only-cost-scheduling-knobs;never-source-or-near-fidelity'};}
export class DevicePerformanceSchedule{
  constructor(schedule={profile:'default',knobs:{}}){const v=validateDeviceSchedule(schedule);if(!v.pass)throw new Error(`Unsafe device schedule knobs: ${v.errors.join(',')}`);this.schedule=schedule;}
  apply(targets={}){const k=this.schedule.knobs||{};targets.streaming?.setConcurrencyCap?.(k.decodeConcurrency);targets.animation?.setFarHz?.(k.animationFarHz);targets.network?.setFarHz?.(k.networkFarHz);targets.physics?.setSleepDelay?.(k.physicsSleepDelaySec);return this.report();}
  report(){return{mode:'ratchet-approved-per-device-schedule-v1',profile:this.schedule.profile||'default',knobs:this.schedule.knobs||{},nearFieldQualityReduced:false,dynamicResolution:false,sourceAssetsModified:false};}
}
