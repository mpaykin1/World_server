# Quality Autopilot v3

## Invariant
Production/master is immutable to the optimizer. Every mutation is first a candidate, isolated, measured, compared to its baseline and rejected on any protected regression.

## Closed improvement loop
Discover projects -> score dimensions -> find weakest area -> generate safe candidates -> tournament -> static/security/migration gates -> exact visual baseline comparison -> desktop/mobile gameplay probes -> synthetic player army -> candidate deployment -> live telemetry -> progressive canary -> causal evidence -> Golden promotion -> cross-project reuse.

## Protection against repeated mistakes
1. Every rejected fingerprint enters Never-Retry-Bad-Fix.
2. Production failures with a source pattern become executable regression tests.
3. The same event also enters Global Regression KB.
4. Global rules are reused only on compatible engines/versions and above the confidence threshold.
5. A fix becomes Golden only after repeated success; causal evidence can be required before global propagation.
6. Audit records form a tamper-evident hash chain.

## Progressive canary
Stages: 1%, 5%, 20%, 50%, 100%. A stage needs its minimum sessions/time plus two consecutive clean telemetry windows. A regression in FPS, crashes, errors, latency, memory or WebGL context loss returns `rollback` immediately.

## Engine optimization
- WebGL: distance-quality contract, offscreen containment, LOD/fog/occlusion candidate planning.
- Godot: Visibility Range/LOD, baked lighting/probes, streaming candidates.
- Roblox: StreamingEnabled/mesh LOD and collision audit candidates.
High-risk geometry/lighting rewrites stay candidate-only until visual, semantic, synthetic-player and live gates all pass. Near-player fidelity is protected by policy.

## Central knowledge
Supabase private schema stores Quality Autopilot runs, global regression knowledge and canary decisions. Client roles have no direct access.

## Remaining external integration work
GitHub write permission, Vercel project binding/real traffic splitting, GPU worker provider and verified deployed telemetry endpoint. These are connection/runtime gaps, not missing core safety architecture.
