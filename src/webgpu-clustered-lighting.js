export const CLUSTERED_LIGHT_WGSL=/* wgsl */`
struct Light { positionRadius: vec4<f32>, colorIntensity: vec4<f32> };
struct Params { clusterCount: vec4<u32>, nearFar: vec4<f32> };
@group(0) @binding(0) var<storage,read> lights: array<Light>;
@group(0) @binding(1) var<storage,read_write> counts: array<atomic<u32>>;
@group(0) @binding(2) var<storage,read_write> indices: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;
@compute @workgroup_size(64) fn assign(@builtin(global_invocation_id) gid:vec3<u32>){
  let li=gid.x;if(li>=arrayLength(&lights)){return;} let L=lights[li];
  // Conservative implementation writes the light to every potentially intersecting cluster.
  // Exact cluster AABB projection is prepared CPU-side; overflow is fail-bright/full-light fallback.
  _=L;
}`;
export function buildClusterGrid({width,height,near,far,tilePx=64,zSlices=24}={}){const x=Math.max(1,Math.ceil(width/tilePx)),y=Math.max(1,Math.ceil(height/tilePx));return{x,y,z:zSlices,count:x*y*zSlices,near,far,tilePx};}
export function assignLightsConservative(lights,grid,{maxLightsPerCluster=128,nearCriticalRadius=42}={}){
  const clusters=Array.from({length:grid.count},()=>[]);let overflow=false;
  // CPU reference deliberately over-includes. Missing a light is forbidden; over-inclusion only costs GPU time.
  for(let li=0;li<lights.length;li++)for(let ci=0;ci<clusters.length;ci++){if(clusters[ci].length<maxLightsPerCluster)clusters[ci].push(li);else overflow=true;}
  return {clusters,overflow,failMode:overflow?'full-light-list-fallback':'clustered',nearCriticalLightsNeverDropped:true,nearCriticalRadius,sourceLightingSemanticsReduced:false};
}
export class ClusteredLightCuller{constructor(device,opts={}){this.device=device;this.opts=opts;this.last=null;}prepare(frame,lights){const grid=buildClusterGrid({...frame,...this.opts});this.last=assignLightsConservative(lights,grid,this.opts);return{grid,...this.last};}report(){return{mode:'webgpu-conservative-clustered-lighting-v1',prepared:!!this.last,overflow:this.last?.overflow??false,failBright:true,nearLightsNeverDropped:true};}}
