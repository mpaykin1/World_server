# Systems to add after World Quality Autopilot V4

V4 closes almost every system that can be built locally without external evidence. The remaining work is primarily evidence, high-end external generation and optional next-generation rendering.

## Priority 1 — required for evidence-backed 100%
1. **Approved multi-view Visual Golden Baselines** — desktop + mobile screenshots for every certified world, explicitly approved once by a human/operator.
2. **Real Rig Runtime Evidence** — real Roblox/Godot/generated characters mapped to the V4 retarget contract with feet, hands, weapon, shield, root motion, foot slide and jitter samples.
3. **Physical iOS + Android device provider** — sustained FPS, frame P95, memory, crash/reload, touch and thermal behavior on real hardware.

## Priority 2 — quality above the current local ceiling
4. **Verified semantic texture baker** — actual normal/roughness/AO/emissive maps, using the V4 PBR candidate IDs and texture budgets. Outputs must pass visual baseline gates.
5. **Universal production retarget backend** — UniRig/Rigify or equivalent automatically mapping arbitrary skeletons to the V4 contract, including two-hand IK and planted feet.
6. **Learned geometry semantic parser** — label arch/buttress/column/window/roof/street/foliage/hero landmark more precisely than heuristics and allocate geometry budgets by semantic importance.

## Priority 3 — optional advanced runtime
7. **WebGPU meshlet/compute culling path** with WebGL fallback and evidence-based promotion.
8. **Hardware occlusion queries / hierarchical Z** where browser/device support is reliable; retain V4 conservative sector/frustum fallback.
9. **Virtual texture streaming** backed by real texture assets and measured mobile memory limits.

## Priority 4 — autonomous delivery
10. **Write-capable winner-only PR bot** with branch-only GitHub/Vercel permissions; never master push and never auto-merge.
11. **Production telemetry warehouse** feeding V4 learner with anonymized aggregate runtime evidence and automatic rollback triggers.
12. **Cross-project Golden propagation** so a proven material/visibility/animation solution is automatically proposed to every compatible world and only promoted if each project passes its own gates.
