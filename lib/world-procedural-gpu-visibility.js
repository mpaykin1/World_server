'use strict';

const { planVisibility } = require('./world-procedural-visibility');

const GPU_VISIBILITY_VERSION = '3.0.0';

const HZB_CULL_WGSL = String.raw`
struct Meshlet { minv: vec4<f32>, maxv: vec4<f32>, draw: vec4<u32> };
struct Params { viewProj: mat4x4<f32>, viewport: vec2<f32>, hzbMipCount: u32, meshletCount: u32 };
@group(0) @binding(0) var<storage, read> meshlets: array<Meshlet>;
@group(0) @binding(1) var hzb: texture_2d<f32>;
@group(0) @binding(2) var hzbSampler: sampler;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<storage, read_write> visibility: array<u32>;

fn clipPoint(p: vec3<f32>) -> vec4<f32> { return params.viewProj * vec4<f32>(p, 1.0); }
fn ndc(c: vec4<f32>) -> vec3<f32> { return c.xyz / max(0.00001, c.w); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.meshletCount) { return; }
  let m = meshlets[i];
  let c = (m.minv.xyz + m.maxv.xyz) * 0.5;
  let e = (m.maxv.xyz - m.minv.xyz) * 0.5;
  let cc = clipPoint(c);
  if (cc.w <= 0.0) { visibility[i] = 0u; return; }
  let n = ndc(cc);
  if (abs(n.x) > 1.2 || abs(n.y) > 1.2 || n.z < -0.1 || n.z > 1.2) { visibility[i] = 0u; return; }
  let radiusPx = max(1.0, max(e.x, max(e.y, e.z)) * params.viewport.y / max(0.01, cc.w));
  let mip = min(f32(params.hzbMipCount - 1u), max(0.0, floor(log2(radiusPx))));
  let uv = vec2<f32>(n.x * 0.5 + 0.5, 1.0 - (n.y * 0.5 + 0.5));
  let depth = textureSampleLevel(hzb, hzbSampler, uv, mip).x;
  visibility[i] = select(0u, 1u, n.z <= depth + 0.02);
}`;

function brickKey(x, y, z) { return `${x},${y},${z}`; }
function buildMeshletsFromChunk(chunk, options = {}) {
  if (!chunk || !Array.isArray(chunk.voxels)) throw new TypeError('voxel chunk required');
  const brick = Math.max(2, Math.min(16, Math.trunc(Number(options.brickSize) || 4)));
  const buckets = new Map();
  for (const v of chunk.voxels) {
    const x = Math.floor(Number(v[0]) / brick), y = Math.floor(Number(v[1]) / brick), z = Math.floor(Number(v[2]) / brick);
    const key = brickKey(x, y, z);
    let b = buckets.get(key);
    if (!b) {
      b = { key, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], voxels: 0, paletteMask: new Set() };
      buckets.set(key, b);
    }
    b.voxels += 1;
    b.paletteMask.add(Math.trunc(Number(v[3]) || 0));
    b.min[0] = Math.min(b.min[0], Number(v[0])); b.min[1] = Math.min(b.min[1], Number(v[1])); b.min[2] = Math.min(b.min[2], Number(v[2]));
    b.max[0] = Math.max(b.max[0], Number(v[0]) + 1); b.max[1] = Math.max(b.max[1], Number(v[1]) + 1); b.max[2] = Math.max(b.max[2], Number(v[2]) + 1);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).map((b, index) => ({
    id: index,
    key: b.key,
    min: b.min,
    max: b.max,
    center: b.min.map((v, i) => (v + b.max[i]) * 0.5),
    voxels: b.voxels,
    palette: [...b.paletteMask].sort((a, c) => a - c),
    draw: { firstInstance: index, instanceCount: 1, firstVertex: 0, vertexCount: 0 }
  }));
}

function buildGpuVisibilityPlan(chunks = [], camera = {}, budget = {}, options = {}) {
  const cpu = planVisibility(chunks, camera, budget, options);
  const meshlets = [];
  for (const visible of cpu.visible) {
    if (!visible.chunkData?.voxels) continue;
    const generated = buildMeshletsFromChunk(visible.chunkData, options);
    for (const m of generated) meshlets.push({ ...m, chunkX: visible.x, chunkZ: visible.z, lod: visible.lod });
  }
  const maxMeshlets = Math.max(1, Math.trunc(Number(options.maxMeshlets) || 8192));
  const selected = meshlets.slice(0, maxMeshlets);
  return {
    version: GPU_VISIBILITY_VERSION,
    backendPreference: ['webgpu-hzb-meshlet', 'webgl2-cpu-hlod', 'cpu-hlod'],
    cpu,
    meshlets: selected,
    indirectDraws: selected.map((m, index) => ({ meshlet: index, ...m.draw })),
    truncated: meshlets.length > selected.length,
    wgsl: HZB_CULL_WGSL
  };
}

function canUseWebGpu(scope = globalThis) {
  return Boolean(scope?.navigator?.gpu);
}

async function createWebGpuCuller(device, options = {}) {
  if (!device?.createShaderModule || !device?.createComputePipeline) throw new TypeError('WebGPU device required');
  const shader = device.createShaderModule({ code: options.shader || HZB_CULL_WGSL, label: 'world-procedural-hzb-cull' });
  const pipeline = device.createComputePipeline({
    label: 'world-procedural-hzb-cull',
    layout: 'auto',
    compute: { module: shader, entryPoint: 'main' }
  });
  return { version: GPU_VISIBILITY_VERSION, shader, pipeline, workgroupSize: 64 };
}

module.exports = {
  GPU_VISIBILITY_VERSION,
  HZB_CULL_WGSL,
  buildMeshletsFromChunk,
  buildGpuVisibilityPlan,
  canUseWebGpu,
  createWebGpuCuller
};
