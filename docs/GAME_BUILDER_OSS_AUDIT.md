# Game Builder OSS selective audit — 2026-10-04

## Goal

Analyze the complete Git trees of the open-source projects considered for a Game Builder Garage-like capability, but keep World Server lean. Every upstream file/submodule path is classified before integration as:

- `IMPORT`
- `ADAPT`
- `LEARN-REIMPLEMENT`
- `PRESERVE-FOR-LATER`
- `SKIP`

The audit separates **analysis** from **import**. Upstream repositories are not vendored into World Server. Only selected World Server-native code, tests, and audit evidence are committed.

## Coverage

The pinned recursive Git trees were enumerated in full. All seven GitHub tree responses reported `truncated: false`.

The complete per-file ledger contains **11,686 file/submodule paths**, each assigned exactly one decision:

| Decision | Paths |
|---|---:|
| IMPORT | 0 |
| ADAPT | 1,725 |
| LEARN-REIMPLEMENT | 1,271 |
| PRESERVE-FOR-LATER | 1,699 |
| SKIP | 6,991 |
| **Total** | **11,686** |

Machine-readable evidence:

- `docs/audits/GAME_BUILDER_OSS_FILE_DECISIONS.json` — all 11,686 paths.
- `docs/GAME_BUILDER_OSS_AUDIT_SUMMARY.json` — compact counts and pinned SHAs.
- `docs/GAME_BUILDER_OSS_SELECTED_COMPONENTS.json` — deep-reviewed candidate subsystems and take/avoid decisions.
- `scripts/audit-game-builder-sources.cjs` — reproducible audit script.
- `npm run oss:game-builder:audit` — one-command rerun.

The script uses partial/blobless clones and `git ls-tree -r`, so 100% of paths can be classified without bulk-importing upstream source or assets. Contents are fetched only for candidate subsystems that survive the first pass.

## Final classification by repository

| Repository | Files | IMPORT | ADAPT | LEARN-REIMPLEMENT | PRESERVE | SKIP |
|---|---:|---:|---:|---:|---:|---:|
| Game Builder Garage Editor | 154 | 0 | 0 | 23 | 0 | 131 |
| GDevelop | 6,647 | 0 | 1,615 | 0 | 1,150 | 3,882 |
| Armory3D | 2,333 | 0 | 0 | 1,221 | 1 | 1,111 |
| microStudio | 748 | 0 | 73 | 0 | 0 | 675 |
| ct.js | 1,628 | 0 | 0 | 27 | 533 | 1,068 |
| Rete | 33 | 0 | 5 | 0 | 6 | 22 |
| LiteGraph | 143 | 0 | 32 | 0 | 9 | 102 |
| **Total** | **11,686** | **0** | **1,725** | **1,271** | **1,699** | **6,991** |

`IMPORT = 0` is intentional. No upstream file was both more self-contained and more useful than a smaller World Server-native adaptation. Vendoring whole engines would duplicate renderers, project models, editors, runtime assumptions, and dependency trees.

## Pinned upstreams and licenses

| Project | Commit | License | Policy |
|---|---|---|---|
| jaames/game-builder-garage-editor | `97aa6e801c28162da166655fe1806ffd0f0ae60a` | MPL-2.0 | LEARN-REIMPLEMENT |
| 4ian/GDevelop | `6253b8e9d2e18bd8972eca3db5d7df6a81e09a91` | MIT | ADAPT |
| armory3d/armory | `f9642c643c8ebf8ec3e98081d1e433d306c50b77` | zlib | LEARN-REIMPLEMENT |
| pmgl/microstudio | `b59d904b56a8cdbdde1b08a1b107c90bab59b31f` | MIT | ADAPT |
| ct-js/ct-js | `63791a05b7ecb6ced3c14de72b0649e4eb54574b` | MIT | LEARN-REIMPLEMENT |
| retejs/rete | `2aae19950180dc12725306f06c0440f64473bd21` | MIT | ADAPT |
| jagenjo/litegraph.js | `0555a2f2a3df5d4657593c6d45eb192359888195` | MIT | ADAPT |

Exact selected paths are recorded in `docs/GAME_BUILDER_OSS_SELECTED_COMPONENTS.json`.

## Deep-reviewed useful subsystems

### Game Builder Garage Editor

Reviewed Nodon base objects, connections, factory, and graph renderer. Useful ideas: stable node IDs, explicit ports/connections, and separation of graph data from rendering.

Because the repository is MPL-2.0 and tied to Nintendo formats, World Server does **not** ship copied Nintendo assets, save blobs, parsers, or MPL source. The concepts are cleanly reimplemented.

### GDevelop

Reviewed event/instruction structures, behavior metadata, and runtime-scene tools. Useful ideas: explicit separation between conditions, actions, behaviors, and runtime-scene operations.

World Server keeps its own world state and action implementations rather than importing GDevelop's C++ core, IDE, renderer, extension catalog, or generated runtime.

### Armory3D

Reviewed `LogicNode`, `LogicTree`, branch nodes, and update triggers. Useful ideas: typed socket defaults, event propagation, branch execution, and explicit trigger nodes.

Haxe/Iron/Kha runtime and renderer-specific node code are not imported.

### microStudio

Reviewed project/runtime separation and time-machine direction. Useful idea: authoring state should remain separate from execution state.

The full IDE, language VMs, asset editors, multiplayer server, and bundled engines are not imported.

### ct.js Catnip

Reviewed compiler and logic/action/movement block semantics. Useful idea: a constrained visual language can compile into a small known action vocabulary.

The NW.js editor, bundled assets/modules, and templates are not imported.

### Rete

Reviewed node/connection model and classic sockets. Useful idea: editor schema can remain independent from runtime execution.

Rete is not added as a dependency yet; World Server keeps the runtime dependency-free and can use a UI adapter later.

### LiteGraph

Reviewed core graph, events, logic, and input nodes. Useful ideas: separate event/action links from value links, branch/sequence flow, and enforce execution limits.

The global runtime, legacy node catalog, canvas editor, unsafe script nodes, and renderer coupling are not vendored.

## Duplicate-capability check

Existing World Server systems were inspected before adding code:

- `lib/world-graph.js` models persistent worlds, patch families, revisions, and portals.
- `lib/world-emergence.js` owns deterministic macro entities, relations, and consequences.
- `shared/world-emergence-runtime.js` projects emergence state into voxel rendering.

Those systems do not provide a user-authored Nodon-style logic graph. Therefore the added visual logic execution layer is a new capability rather than a second implementation of an existing one.

## Added World Server-native capability

`lib/visual-logic-graph.js` is the minimal common denominator extracted from the useful upstream ideas. It adds no npm dependency and does not create a second renderer, database, or world simulation.

Current primitives:

- serializable nodes and links;
- separate `value` and `event` links;
- typed port validation;
- extensible node registry;
- `event:start` and `event:tick`;
- constants, AND, OR, NOT, compare;
- branch and sequence flow;
- `world:get`, `world:set`, and `world:action`;
- deterministic event queue;
- value-cycle detection;
- node/link/step safety limits;
- editor metadata preserved but ignored by runtime;
- adapter boundary into existing World Server actions.

The file is 319 lines, below the project 400-line limit. Built-in node definitions were split into small registries so the implementation stays inside the project's function-size discipline.

## Verification

Before the infrastructure incident, the local targeted command:

`node --test test/visual-logic-graph.test.js test/world-emergence.test.js`

reported **10 passed, 0 failed**.

The final refactored branch version was then loaded directly from GitHub and exercised independently against the pinned existing `lib/world-emergence.js`. All **5/5 subsystem checks passed**:

1. value-driven branch execution;
2. `world:action` invoking the real existing `placeMacroEntity` logic;
3. rejection of event/value miswiring;
4. deterministic value-cycle rejection;
5. editor metadata round-trip without runtime coupling.

A prior syntax scan reported `Syntax OK: 80 JavaScript files`.

### Full-suite caveat

A full `npm run check` was also attempted in the isolated worktree. It reached and passed the new visual-logic tests, but the repository-wide run ended non-zero because that worktree had no installed `@supabase/supabase-js`, `@playwright/test`, or `esbuild`, and existing unrelated baseline tests also reported failures. Existing lifecycle tests then removed the isolated worktree itself.

That repository-wide result is **not** represented as a pass. The work was recovered into the GitHub branch from the preserved audit data, and the final visual-logic subsystem was re-verified independently.

These are engineering results only. They are not a user verdict of “success” or “failure”.
