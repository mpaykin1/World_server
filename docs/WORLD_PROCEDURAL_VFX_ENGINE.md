# World Procedural VFX Engine V3

Single shared procedural VFX runtime for World_server. The server/realtime layer replicates deterministic recipes (`type + transform + params + seed + priority`), not particle state. Clients generate effects locally and are governed by the existing WorldQualityAutopilot.

V3 adds interest management, batch replication, capability-class rollback, GPU pressure protection, shader warmup manifests, surface-response memory, optional shared-device WebGPU compute, and a Web ⇄ Godot event contract.
