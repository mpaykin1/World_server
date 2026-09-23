# Chain Reaction backend contract

POST `/api/voxel` (also existing `/api/emergence` alias), JSON body and
`Authorization: Bearer <Supabase access token>`.

All eight actions require a verified user. World Factory creates the owner's
private membership. An owner can then use the bounded membership actions; the
backend must never accept a client-authored role. Runtime
authorization deliberately ignores JWT metadata so an owner revoke takes
effect immediately even when the removed player still has an older token.
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
- `genie-options`: no additional inputs. Returns up to four deterministic,
  simulator-verified choices for the current revision plus a bounded fifth
  `free_intent` lane. The server exposes costs, delay, risk and forecast
  deltas, but deliberately withholds each choice's internal classification.
  If the simulator cannot fund the required mix, `degraded` is true and
  `offeredCount` honestly reports fewer than four choices.
- `invite-member`: owner-only `targetUserId` (Supabase Auth UUID). Creates or
  repairs a `player` membership; it cannot change an owner.
- `revoke-member`: owner-only `targetUserId`. Removes only a `player`
  membership. The next request is denied even if that player presents a stale
  JWT containing the retired legacy grant.

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

The public scenario contains only deterministic simulation data. Raw player
comments and actor UUIDs are stored in the private provenance journal and are
not returned by public world reads or `history`. This contract does not change
guest behavior for legacy voxel actions.

Verification: `node --test test/chain-reaction-api.test.js test/chain-reaction-edge.test.js test/world-consequence-engine.test.js`.
Persistence tests use a Supabase-shaped CAS fake; live two-client Supabase
verification and full cloud release gates remain required before release. No
browser client or simulation arithmetic is modified.
