# LIGHT

Canonical reusable luminous-line system for World Server.

Start here:

- Documentation: `docs/LIGHT_SYSTEM.md`
- Public API: `shared/light/index.mjs`
- Runtime pipeline: `shared/light/pipeline.mjs`
- 3D proof path: `apps/silhouette-3d-lab/`
- Regression contract: `test/light-system.test.js`
- User-approved 3D creature success: `LIVING_LIGHT_CAT_3D_SUCCESS.md`
- User-approved animated V2 editable baseline: `LIVING_LIGHT_CAT_3D_V2_SUCCESS.md`
- Accepted V1 production proof: `https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d/`
- Accepted V2 production proof: `https://world-server.mmmpaykin.workers.dev/apps/living-light-cat-3d-v2/`

Search term for future chats/agents: **LIGHT**.

Important decision boundary:
- underlying 3D silhouette architecture was explicitly accepted by the user;
- the previously observed plain line was explicitly rejected by the user;
- the Living Light Cat 3D production proof at merge SHA `f044aa498b94618bab4d2590b140d7aa4695fdc4` was explicitly marked **SUCCESS** by the user;
- the animated Living Light Cat 3D V2 baseline at merge SHA `0e54df67f6edc8212e067f099998ca3c246b9175` was explicitly committed as **SUCCESS** by the user and is the canonical editable target for that V2 URL;
- future changes beyond those accepted baselines still require their own user verdict and must not inherit SUCCESS automatically.
