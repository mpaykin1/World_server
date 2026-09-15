# AutoDemo delivery gates

This file records the fail-closed delivery contract for the canonical interactive World_server AutoDemo.

## Required before merge

- The normal `check` job must pass; runner-acquisition failures are infrastructure failures and must be retried rather than treated as product defects.
- `quality-regression`, `world-quality`, `agent-rules`, and `godot-web-preview` must satisfy the protected `master` branch requirements.
- Netlify preview status is not publication authority for World_server and must not be used as evidence that the Cloudflare target is healthy or unhealthy.

## Required before a user-facing Cloudflare link

- Deploy the exact candidate revision through the canonical Cloudflare path.
- Verify HTTP 2xx, runtime identity, security/config endpoints, and playable Voxel World startup.
- Run desktop and mobile browser smoke tests.
- Verify the AutoDemo starts without locking player input and that visible choices materially change the world.
- Measure user-visible change (PZ) and require PZ > 85 before presenting a working/final link.

## AutoDemo-specific evidence

The verification must exercise at least one branch from each major capability group: environment/weather, creature creation or transformation, combat, world construction, AI resident action, treasure, canon consequence, and cross-world/world-factory behavior.
