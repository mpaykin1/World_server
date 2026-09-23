# Chain Reaction backend contract

POST `/api/voxel` (also existing `/api/emergence` alias), JSON body and
`Authorization: Bearer <Supabase access token>`.

All five actions require a verified user. A trusted administrator/backend must
provision `app_metadata.chain_reaction_worlds: ["world-id"]` for that user.
There is no automatic claim of shared worlds; guest IDs, `user_metadata`, and
body actor IDs never authorize access. The world must already exist.

Common body: `action`, `worldId`. Actions:

- `interpret-intent`: `structure` (engine project key), optional `text` (600 characters).
  Returns canonical `intent`, `revision`, `scenarioVersion`, `worldId`.
- `preview-plan`: same inputs; returns `plan` and current `world`, without writing.
- `commit-plan`: same inputs plus integer `expectedRevision`; recomputes the plan
  on the server, checks feasibility, pays costs and persists it.
- `tick`: integer `expectedRevision`, optional `count` (1–24, default 1).
- `history`: optional integer `offset` (default 0), `limit` (1–100, default 50).
  Returns `history`, `total`, `nextOffset` and current revision.

Mutation responses include `world` and its new `revision`. Obtain initial
revision from preview/history (0 for an uninitialized scenario). Client-supplied
compiled intents, resources, costs and world states are ignored.

Persistence uses the existing `voxel_worlds.settings.chainReaction` JSON field.
Seed comes from the stored world, never the request. Unrelated settings are
preserved. State and audit history are saved together with `updated_at` CAS.
A conflict returns 409; fetch/preview again before explicitly submitting another
mutation. No automatic replay or retry of commits. Existing committed intents
retain `schemaVersion: 1`; action history records actor and before/after revisions.

Limits: 8 KiB request JSON, 256 projects, 1 MiB scenario state. Reaching storage
capacity rejects further mutations without deleting history. Future archival is
needed for indefinite play. Unsupported stored schema versions fail closed.

Errors: 400 invalid inputs, 401 missing/invalid authentication, 403 absent world
grant, 404 absent world, 409 stale revision/infeasible plan/capacity, 413 oversized
request, 500 persistence failure. Database internals are not returned.

Existing voxel world settings are publicly readable under the existing Supabase
policy: comments/history are game-world content, **not private messages**. This
patch changes neither RLS nor guest behavior for legacy voxel actions.

Verification: `node --test --test-isolation=none test/chain-reaction-api.test.js test/world-consequence-engine.test.js`.
Persistence tests use a Supabase-shaped CAS fake; live Supabase verification and
full cloud release gates remain required before release. No browser client,
simulation arithmetic, migrations, master branch or deployment is modified.
