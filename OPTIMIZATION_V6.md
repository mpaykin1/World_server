# V6 — FPS optimization without near-field quality loss

Уже внедрено: predictive/nearest-first streaming, immutable SHA cache, serialized BVH cache, worker PLY decode, exact material dedup, safe static-shadow cache, distant AI/audio/pose/network throttling, fog-occluded culling, WebGL2 query fallback, conservative WebGPU HZB, lossless meshlets, WebGPU indirect-command kernel, WASM SIMD, source-locked baked lighting/reflections, byte-identical GLB range streaming.

Жёсткий инвариант: рядом с игроком нельзя снижать source geometry, textures, materials, pixel ratio или texture sampling ради FPS.

Следующие безопасные оптимизации для V7:

- полноценный source-equivalent PBR WebGPU renderer, чтобы `drawIndexedIndirect` реально заменял WebGL draw loop без потери материалов/света;
- GPU-native meshlet frustum/HZB compaction + multi-draw/indirect count при сохранении исходных треугольников;
- более глубокое WASM-SIMD/WASM-threads подключение к PLY/SPZ/GLB decode и BVH build;
- GPU texture/transcode cache только для lossless/source-equivalent formats;
- offline bake farm/job queue с content-addressed cache, чтобы GI/reflection/lightmaps не пересчитывались повторно;
- hardware/device performance profiles и автоматический scheduling distant work по frametime, не по качеству;
- occluder selection learned from measured visibility benefit, но с conservative fail-visible proof;
- network delta compression/interest graph для multiplayer без изменения локальной графики;
- animation GPU skinning/compute only where pixel-equivalent to source pose;
- persistent shader pipeline cache/precompile per GPU family.
