# Next upgrades worth adding

These are not required for v2 to work; they are the highest-value next steps after real-device profiling proves the current baseline.

1. **Froxel volumetric fog / WebGPU path** — true light scattering in a 3D froxel grid on capable hardware, while keeping current WebGL fallback.
2. **Temporal reprojection for fog** — reuse previous fog samples to get higher apparent raymarch quality at lower cost; requires strong ghosting rejection.
3. **Blue-noise temporal dither atlas** — better volumetric sampling with less banding; vendor a license-safe asset locally rather than runtime third-party fetch.
4. **SDF creature raymarch tier** — signed-distance-field organic creatures on high-end GPUs; current instanced silhouettes remain fallback.
5. **Billboard/impostor creature LOD** — convert very distant creatures to one-draw-call animated impostors after profiling confirms creature geometry is a bottleneck.
6. **Hierarchical depth occlusion** — skip hidden fog lights / anomaly meshes in dense scenes.
7. **GPU timing queries** — EXT_disjoint_timer_query/WebGL2 and WebGPU timestamps to tune fog cost by actual GPU time, not FPS alone.
8. **KTX2/BasisU + local asset packaging** — especially when image-derived layers become large; integrate with existing asset-dedup pipeline.
9. **WebGL2 local Three.js bundle** — remove CDN dependency once the repository standardizes a bundled Three.js version; do it across worlds, not only DreamFog.
10. **Optical flow / 4D fog animation** for image-derived layers — RAFT/GMFlow-style offline flow can animate source layers subtly; CPU fallback must remain.
11. **Semantic layer masks** — split water / sky / characters / structures before LDI so each receives different motion and fog treatment.
12. **Light-cookie / caustic atlas** — animated projected light in fog and water without many dynamic lights.
13. **Spatial audio event graph** — seeded distant splashes, sub-bass, whispers and object-linked sound emitters with strict volume caps.
14. **Visual perceptual regression baseline for DreamFog** — screenshots should verify “foggy/strange/soft” survives optimization, not only that a canvas exists.
15. **Real-device adaptive profiles** persisted by GPU/device class — learn known-good tier limits from telemetry and reuse on future visits/worlds.

Priority: 1/2/7/14/15 give the largest production improvement once v2 has real measurements.
