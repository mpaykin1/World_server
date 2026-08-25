export const RUNTIME_STANDARD = Object.freeze({
  id: 'WORLD_FACTORY_QUALITY_CORE_V10',
  schemaVersion: 2,
  coordinateSystem: 'Y_UP_RIGHT_HANDED',
  metersPerUnit: 1,
  physicsHz: 60,
  minDesktopFps: 55,
  minMobileFps: 30,
  maxPitchDeg: 89,
  defaultPlayer: Object.freeze({
    profile: 'human-v2', height: 1.72, radius: 0.32, eyeHeight: 1.58,
    moveSpeed: 4.6, airControl: 0.30, jumpSpeed: 5.6, gravity: 16.5,
    maxFallSpeed: 28, groundSnap: 0.24, stepHeight: 0.38, maxSlopeDeg: 50,
    fallResetMargin: 12,
  }),
});

function push(checks, ok, id, detail, severity = 'block') {
  checks.push({ ok: Boolean(ok), id, detail, severity });
}
const arr3 = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

export function validateManifest(manifest) {
  const checks = [];
  push(checks, manifest && typeof manifest === 'object', 'manifest', 'manifest is object');
  if (!manifest || typeof manifest !== 'object') return finish(checks);

  push(checks, manifest.schemaVersion === 2, 'schema', `schemaVersion=${manifest.schemaVersion}`);
  push(checks, typeof manifest.id === 'string' && /^[a-z0-9][a-z0-9-_]{1,63}$/.test(manifest.id || ''), 'id', manifest.id || 'missing');
  push(checks, typeof manifest.title === 'string' && manifest.title.trim().length > 0, 'title', manifest.title || 'missing');

  const v = manifest.visual || {};
  push(checks, ['glb','ply-mesh','ply-splat','spz'].includes(v.type), 'SRC-001.visual.type', v.type || 'missing');
  push(checks, typeof v.url === 'string' && v.url.length > 0, 'SRC-001.visual.url', v.url || 'missing');
  push(checks, v.fidelity === 'source-locked', 'SRC-001.visual.fidelity', v.fidelity || 'missing');
  push(checks, /^[a-f0-9]{64}$/i.test(v.sha256 || ''), 'SRC-001.visual.sha256', v.sha256 || 'missing');

  const t = manifest.transform || {};
  push(checks, ['X','Y','Z'].includes(t.sourceUpAxis), 'transform.sourceUpAxis', t.sourceUpAxis || 'missing');
  push(checks, arr3(t.rotationDeg), 'transform.rotationDeg', JSON.stringify(t.rotationDeg));
  push(checks, arr3(t.position), 'transform.position', JSON.stringify(t.position));
  push(checks, Number.isFinite(t.scale) && t.scale > 0, 'transform.scale', String(t.scale));
  const ai = t.autoInference || {};
  push(checks, Number.isFinite(ai.axisConfidence) && ai.axisConfidence >= 0.2, 'orientation.confidence', String(ai.axisConfidence), 'warn');
  push(checks, Number.isFinite(ai.scaleConfidence) && ai.scaleConfidence >= 0.2, 'scale.confidence', String(ai.scaleConfidence), 'warn');

  const streaming = manifest.streaming || {};
  push(checks, ['whole-asset-frustum-v2','lossless-spatial-chunks-v2','lossless-glb-spatial-chunks-v1','renderer-native-splat-v2'].includes(streaming.mode), 'streaming.mode', streaming.mode || 'missing');
  push(checks, streaming.lossless === true, 'streaming.lossless', String(streaming.lossless));
  if (streaming.mode === 'lossless-spatial-chunks-v2' || streaming.mode === 'lossless-glb-spatial-chunks-v1') {
    push(checks, Array.isArray(streaming.chunks) && streaming.chunks.length > 0, 'streaming.chunks', String(streaming.chunks?.length || 0));
    push(checks, manifest.collision?.mode === 'proxy', 'streaming.proxy-collider', 'streamed worlds require full collision proxy');
  }

  const c = manifest.collision || {};
  push(checks, c.enabled === true, 'PHY-001.collision.enabled', String(c.enabled));
  if (v.type === 'spz' || v.type === 'ply-splat') {
    push(checks, c.mode === 'proxy', 'PHY-001.splat-proxy', c.mode || 'missing');
    push(checks, typeof c.url === 'string' && c.url.length > 0, 'PHY-001.proxy.url', c.url || 'missing');
  } else {
    push(checks, ['visual-exact','proxy'].includes(c.mode), 'PHY-001.collision.mode', c.mode || 'missing');
  }

  const semantic = manifest.semantic || {};
  push(checks, semantic.required === true && typeof semantic.url === 'string', 'SEM-001.semantic', semantic.url || 'missing');

  const s = manifest.spawn || {};
  push(checks, ['auto-safe-ground','snap-to-ground'].includes(s.mode), 'PHY-002.spawn.mode', s.mode || 'missing');
  push(checks, s.requireCapsuleClearance === true, 'PHY-002.capsule-clearance', String(s.requireCapsuleClearance));
  push(checks, Number.isFinite(s.maxSlopeDeg) && s.maxSlopeDeg <= 55, 'PHY-005.spawn-slope', String(s.maxSlopeDeg));

  const p = { ...RUNTIME_STANDARD.defaultPlayer, ...(manifest.player || {}) };
  push(checks, p.profile === 'human-v2', 'player.profile', p.profile || 'missing');
  push(checks, p.height >= 1.2 && p.height <= 2.4, 'player.height', String(p.height));
  push(checks, p.radius >= 0.2 && p.radius <= 0.6, 'player.radius', String(p.radius));
  push(checks, p.eyeHeight > p.radius && p.eyeHeight < p.height, 'player.eyeHeight', String(p.eyeHeight));
  push(checks, p.jumpSpeed > 0 && p.gravity > 0, 'PHY-003.jump', `jump=${p.jumpSpeed} gravity=${p.gravity}`);
  push(checks, p.stepHeight > 0 && p.stepHeight <= 0.45, 'PHY-005.step-height', String(p.stepHeight));
  push(checks, p.maxSlopeDeg <= 55, 'PHY-005.player-slope', String(p.maxSlopeDeg));

  const ctrl = manifest.controls || {};
  push(checks, ctrl.profile === 'standard-v2', 'controls.profile', ctrl.profile || 'missing');
  push(checks, ctrl.desktop !== false && ctrl.mobile !== false && ctrl.gamepad !== false, 'controls.parity', JSON.stringify(ctrl));
  push(checks, ctrl.cameraRoll === false, 'CAM-001.camera-roll', String(ctrl.cameraRoll));
  push(checks, Number.isFinite(ctrl.maxPitchDeg) && ctrl.maxPitchDeg >= 88 && ctrl.maxPitchDeg <= 89.5, 'CAM-002.pitch', String(ctrl.maxPitchDeg));
  push(checks, ctrl.jumpImpulse === 'vertical-only', 'PHY-003.jump-vector', ctrl.jumpImpulse || 'missing');
  push(checks, ctrl.feetFollowTravel === true, 'ACT-001.feet-follow-travel', String(ctrl.feetFollowTravel));
  push(checks, ctrl.attackFollowsFeet === true, 'ACT-001.attack-follows-feet', String(ctrl.attackFollowsFeet));

  const g = manifest.graphics || {};
  push(checks, g.allowVisualGeometryLod === false, 'SRC-002.no-visual-lod', String(g.allowVisualGeometryLod));
  push(checks, g.allowTextureDownscale === false, 'SRC-002.no-texture-downscale', String(g.allowTextureDownscale));
  push(checks, g.allowVisualRecompression === false, 'SRC-002.no-recompression', String(g.allowVisualRecompression));
  push(checks, g.profile === 'cinematic-preserve-v9', 'GFX-004.profile-v8', g.profile || 'missing');
  push(checks, g.performanceGovernor === 'cpu-first-non-destructive-v9', 'PERF-002.governor', g.performanceGovernor || 'missing');
  const pq=g.proximityQuality||{};
  push(checks, pq.enabled===true && pq.preserveFullSourceGeometry===true, 'PERF-003.near-field-max-quality', JSON.stringify(pq));
  push(checks, pq.fogOccludedCulling===true && Number.isFinite(pq.fogCullMargin) && pq.fogCullMargin>=0, 'GFX-006.fog-occluded-culling', JSON.stringify(pq));
  push(checks, Number.isFinite(pq.maxQualityRadius) && pq.maxQualityRadius>=8, 'PERF-003.near-radius', String(pq.maxQualityRadius));
  const fpsOpt=g.fpsOptimization||{};
  push(checks, fpsOpt.enabled===true && fpsOpt.mode==='cpu-first-near-lossless-v9', 'PERF-003.lossless-near-fps', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.forbidDynamicResolution===true && fpsOpt.forbidNearFieldFidelityReduction===true, 'PERF-003.no-near-degrade', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.staticTransformFreeze===true && fpsOpt.shaderWarmup===true && fpsOpt.predictiveStreaming===true, 'PERF-004.cpu-optimizations', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.nearestFirstStreaming===true && fpsOpt.adaptiveDecodeConcurrency===true, 'PERF-005.streaming-priority', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.workerPlyDecode===true && fpsOpt.indexedDbShaCache===true && fpsOpt.serializedBvhCache===true, 'PERF-007.cache-worker-bvh', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.materialDeduplicationExactOnly===true && fpsOpt.staticShadowCache===true, 'PERF-010.material-shadow-safe', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.networkInterestManagement===true && fpsOpt.distantPoseSharing===true, 'NET-001.distance-work', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.wasmSimd===true && fpsOpt.webgpuHzbPreferred===true && fpsOpt.webgpuIndirectMeshletsPreferred===true, 'PERF-015/016.v8-fastpaths', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.wasmSimdThreadPool===true, 'PERF-018.threaded-simd', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.parallelBvhExactPrepass===true, 'PERF-019.parallel-bvh-prepass', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.webgpuSourceEquivalentPbr===true, 'PERF-017.webgpu-pbr-fastpath', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.sharedArrayBufferDecode===true, 'PERF-020.shared-memory-decode', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.webgpuExactMaterialTable===true, 'PERF-021.material-table', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.webgpuClusteredLighting===true, 'LGT-006.clustered-lighting', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.virtualTextureResidencyFullResolution===true, 'PERF-022.virtual-texture', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.portalRoomVisibility===true, 'PERF-023.portal-visibility', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.screenSpaceAnimationBudget===true, 'ANM-002.animation-budget', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.physicsSpatialHashBroadphase===true, 'PHY-009.physics-broadphase', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.losslessNetworkDeltaCompression===true, 'NET-002.lossless-delta', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.ratchetApprovedDeviceSchedules===true, 'PERF-024.device-schedule', JSON.stringify(fpsOpt));
  push(checks, fpsOpt.sweptDynamicMeshCollision===true, 'PHY-008.dynamic-sweep-enabled', JSON.stringify(fpsOpt));
  const gpu=g.gpuVisibility||{};
  push(checks, gpu.enabled===true && gpu.mode==='webgl2-conservative-occlusion-v1', 'PERF-006.gpu-occlusion', JSON.stringify(gpu));
  push(checks, Number.isFinite(gpu.nearBypassRadius) && gpu.nearBypassRadius>=32, 'PERF-006.gpu-near-bypass', String(gpu.nearBypassRadius));
  const hzb=g.webgpuVisibility||{};
  push(checks, hzb.enabled===true && hzb.mode==='private-depth-hzb-v1' && hzb.failVisible===true, 'PERF-014.webgpu-hzb', JSON.stringify(hzb));
  push(checks, Number.isFinite(hzb.nearBypassRadius) && hzb.nearBypassRadius>=gpu.nearBypassRadius, 'PERF-014.webgpu-near-bypass', String(hzb.nearBypassRadius));
  const pbr=g.webgpuPbr||{};
  push(checks, pbr.enabled===true && pbr.mode==='webgpu-source-equivalent-pbr-v1', 'PERF-017.webgpu-pbr', JSON.stringify(pbr));
  push(checks, pbr.sourceGeometryExact===true && pbr.sourceTextureDimensionsPreserved===true && pbr.lossyFallbackAllowed===false, 'PERF-017.webgpu-pbr-source-equivalence', JSON.stringify(pbr));
  const mt=g.webgpuMaterialTable||{}; push(checks, mt.enabled===true && mt.sourceTextureDimensionsPreserved===true && mt.lossyFallbackAllowed===false, 'PERF-021.material-table-exact', JSON.stringify(mt));
  const cl=g.clusteredLighting||{}; push(checks, cl.enabled===true && cl.overflowFallback==='full-light-list', 'LGT-006.clustered-fail-bright', JSON.stringify(cl));
  const vt=g.virtualTextureResidency||{}; push(checks, vt.enabled===true && Number(vt.nearRadius)>=32 && vt.pageScale===1 && vt.missingPageFallback==='whole-source-texture', 'PERF-022.virtual-texture-near-full', JSON.stringify(vt));
  const pv=g.portalVisibility||{}; push(checks, pv.enabled===true && pv.unknownRoomFailVisible===true && Number(pv.nearBypassRadius)>=32, 'PERF-023.portal-conservative', JSON.stringify(pv));
  const probe=g.reflectionProbes||{};
  push(checks, probe.enabled===true && ['static-world-cubemap-once-v1','offline-preferred-runtime-fallback-v1'].includes(probe.mode), 'PERF-012/LGT-005.static-reflection-probe', JSON.stringify(probe));
  const meshlets=g.meshlets||{};
  if(v.type==='ply-mesh'||v.type==='glb'){
    push(checks, meshlets.enabled===true && meshlets.faceConservation===true, 'PERF-011.meshlets-enabled', JSON.stringify(meshlets));
    push(checks, meshlets.sourceSha256===v.sha256 && meshlets.sourceTriangles===meshlets.meshletTriangles, 'PERF-011.meshlet-conservation', JSON.stringify(meshlets));
  }
  const atm=g.atmosphere||{};
  push(checks, atm.enabled===true && atm.mode==='linear-depth-fog-plus-horizon-shimmer', 'GFX-005.distance-atmosphere', JSON.stringify(atm));
  push(checks, atm.postDepthFog===true, 'GFX-005.custom-renderer-depth-fog', String(atm.postDepthFog));
  push(checks, atm.horizonShimmer===true, 'GFX-005.horizon-shimmer', String(atm.horizonShimmer), 'warn');

  const mats=manifest.materials||{}; const wet=mats.wetSurface||{};
  push(checks, mats.profile==='pbr-preserve-wet-v8', 'MAT-002.wet-profile', mats.profile||'missing');
  push(checks, wet.enabled===true && wet.runtimeOnly===true, 'MAT-002.wet-surface', JSON.stringify(wet));
  push(checks, wet.postFallbackForUnsupported===true, 'MAT-003.wet-fallback', String(wet.postFallbackForUnsupported));
  push(checks, Number.isFinite(wet.intensity) && wet.intensity>=0.05 && wet.intensity<=0.25, 'MAT-002.subtle-wetness', String(wet.intensity));

  const bake=manifest.lightingBake||{};
  push(checks, bake.enabled===true, 'LGT-001.static-light-bake', JSON.stringify(bake));
  if(v.type==='ply-mesh'){
    push(checks, ['vertex-scalar-ply-v1','voxel-raytraced-gi-ply-v1'].includes(bake.mode) && typeof bake.descriptorUrl==='string', 'LGT-001/LGT-004.ply-bake-descriptor', bake.descriptorUrl||'missing');
    push(checks, bake.verified===true && bake.sourceSha256===v.sha256 && bake.sourceAssetModified===false, 'LGT-001.ply-bake-lock', JSON.stringify(bake));
  } else if(v.type==='glb'){
    push(checks, ['uv-lightmap-glb-v1','runtime-normal-scalar-v1'].includes(bake.mode), 'LGT-003.glb-static-bake', bake.mode||'missing');
    if(bake.mode==='uv-lightmap-glb-v1')push(checks, typeof bake.descriptorUrl==='string', 'LGT-003.glb-uv-descriptor', bake.descriptorUrl||'missing');
    push(checks, bake.verified===true && bake.sourceSha256===v.sha256 && bake.sourceAssetModified===false, 'LGT-003.glb-bake-lock', JSON.stringify(bake));
  } else if(v.type==='spz' || v.type==='ply-splat'){
    push(checks, bake.mode==='renderer-native-splat-lighting-v1', 'LGT-002.splat-lighting-policy', bake.mode||'missing');
    push(checks, bake.verified===true && bake.sourceSha256===v.sha256 && bake.sourceAssetModified===false, 'LGT-002.splat-light-lock', JSON.stringify(bake));
  }

  const q = manifest.quality || {};
  push(checks, q.profile === RUNTIME_STANDARD.id, 'quality.profile', q.profile || 'missing');
  for (const key of ['preserveSourceAsset','regressionGate','visualRegressionGate','geometryRegressionGate','automatedPlaytestGate','performanceGate','knowledgeGate','failClosed']) {
    push(checks, q[key] === true, `quality.${key}`, String(q[key]));
  }
  push(checks, q.visualDecimationAllowed === false, 'SRC-002.no-decimation', String(q.visualDecimationAllowed));
  push(checks, q.textureDownscaleAllowed === false, 'SRC-002.no-texture-downscale-2', String(q.textureDownscaleAllowed));
  push(checks, q.visualRecompressionAllowed === false, 'SRC-002.no-recompression-2', String(q.visualRecompressionAllowed));

  const ab=manifest.animationBudget||{}; push(checks, Number(ab.nearRadius)>=32 && Number(ab.farHz)>0 && ab.interactionBoundaryExact===true, 'ANM-002.animation-budget-contract', JSON.stringify(ab));
  const pb=manifest.physicsBroadphase||{}; push(checks, pb.nearBodiesNeverSleep===true && pb.playerContactBodiesNeverSleep===true, 'PHY-009.broadphase-contract', JSON.stringify(pb));
  const nc=manifest.networkCompression||{}; push(checks, nc.mode==='lossless-delta-v1' && nc.quantization===false && nc.localPlayerAuthoritative===true, 'NET-002.lossless-network', JSON.stringify(nc));
  const ps=manifest.performanceSchedule||{}; const unsafe=Object.keys(ps.knobs||{}).some(k=>/resolution|texture|geometry|lod|pixelratio|material|nearfield/i.test(k)); push(checks, !unsafe, 'PERF-024.safe-device-schedule', JSON.stringify(ps));
  const audio = manifest.audio || {};
  push(checks, (audio.minimumVariationsPerRepeatedEvent || 0) >= 3, 'AUD-001.variations', String(audio.minimumVariationsPerRepeatedEvent), 'warn');
  push(checks, audio.randomPitch === true && audio.randomGain === true && audio.spatial === true, 'AUD-001.variation-system', JSON.stringify(audio), 'warn');

  const lock = manifest.qualityLock || {};
  push(checks, lock.visualSha256 === v.sha256, 'SRC-001.quality-lock', lock.visualSha256 || 'missing');
  push(checks, lock.immutableWorldId === true, 'version.immutable-id', String(lock.immutableWorldId));
  push(checks, lock.runtimeStandard === RUNTIME_STANDARD.id, 'QA-004.shared-standard', lock.runtimeStandard || 'missing');

  return finish(checks);
}

function finish(checks) {
  const failed = checks.filter(c => !c.ok && c.severity !== 'warn');
  const warnings = checks.filter(c => !c.ok && c.severity === 'warn');
  const passed = checks.length - failed.length - warnings.length;
  return { pass: failed.length === 0, score: checks.length ? Math.round(passed / checks.length * 100) : 0, checks, failed, warnings };
}

export function formatQualityFailure(report) {
  return report.failed.map(c => `FAIL ${c.id}: ${c.detail}`).join('\n');
}
