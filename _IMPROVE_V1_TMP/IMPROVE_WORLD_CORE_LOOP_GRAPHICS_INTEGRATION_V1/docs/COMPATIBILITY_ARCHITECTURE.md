# COMPATIBILITY ARCHITECTURE

`AnswerWorldEngine -> WorldGraphicsBus -> adapters/refiners`

1. **L0 Empty/Base World** is preloaded.
2. **L1 Immediate** mutation is synchronous and must happen under 300 ms target. It uses CSS/scene-local procedural changes and never waits for network/GPU.
3. **L2 Procedural** enrichment targets <=1.5 s p95. Pixel Animation, Game Motion, voxel/Three.js, Ink Glyph can respond here.
4. **L3 Heavy refinement** is asynchronous: AI3D, 3DGS, Panorama, CharacterForge, texture/mesh processors. Failure here never erases L1/L2.
5. **L4 Story/motion** adds characters, movement, events and narrative state.

### Shared rules
- Only derived traits/world-state travel on the bus. Raw questionnaire text is transient input and is absent from shareable state/events.
- Existing `WorldQualityAutopilot` remains the global budget governor; do not create a second FPS/LOD authority.
- GPU paths are accelerators only. CPU/WebGL2/Canvas fallbacks stay valid.
- A subsystem may register `applyWorldDelta(delta, context)`. If it throws, the bus records the failure and continues other adapters.
- Heavy systems register refiners and resolve later; first visible response is never blocked.
- Pixel Animation and Motion Timeline share the same world delta but own different concerns: visual sprite/particle/object animation vs motion scheduling/locomotion/camera.
- CharacterForge outputs can feed Motion Timeline; Mesh/Texture Quality process generated assets; WorldQualityAutopilot controls budgets; Panorama/GS360 may become environment layers; Ink Glyph/DreamFog/2.5D are style/topology adapters rather than separate global engines.
