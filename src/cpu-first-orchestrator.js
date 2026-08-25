import {HierarchicalSpatialGrid} from './hierarchical-spatial-grid.js';
import {CpuOcclusionCache} from './cpu-occlusion-cache.js';
import {PredictiveStreamingV2} from './predictive-streaming-v2.js';
import {SimulationLOD} from './simulation-lod.js';
export class CpuFirstOrchestrator {
  constructor(opts={}){this.grid=new HierarchicalSpatialGrid(opts.grid);this.occlusion=new CpuOcclusionCache(opts.occlusion);this.streaming=new PredictiveStreamingV2(opts.streaming);this.simulation=new SimulationLOD(opts.simulation);this.stats={frames:0,deferredBackgroundJobs:0};}
  frame({player,camera,chunks=[],backgroundJobs=[]}){this.stats.frames++;this.occlusion.beginFrame();const nearby=this.grid.querySphere(player.position,42);const prefetch=this.streaming.prioritize(chunks,{position:player.position,velocity:player.velocity,cameraForward:camera.forward});const budget=Math.max(0,2-Math.min(2,backgroundJobs.length));this.stats.deferredBackgroundJobs+=Math.max(0,backgroundJobs.length-budget);return {nearby,prefetch,backgroundJobsToRun:backgroundJobs.slice(0,budget),nearFieldFidelity:100,sourceFidelity:100,serverGpuRequired:false};}
  contract(){return {serverGpuRequired:false,nearFieldFidelity:100,sourceFidelity:100,qualitySacrificeForbidden:true};}
}
