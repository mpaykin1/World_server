# «Цепная реакция»: backend release checklist

Evidence snapshot: 2026-09-24. Status words are deliberately non-substitutable:

- **MERGED** — code is present in protected `master`.
- **DEPLOYED** — the canonical Cloudflare/Supabase deployment identity is recorded for that integrated SHA.
- **LIVE_VERIFIED** — an independent Fleet POST exercised the behavior in production with authenticated disposable users.
- **NOT_VERIFIED** — the required evidence was not found. PRE, CI, preview deployment, source inspection, or an unauthenticated `401` smoke does not upgrade this status.

Current backend release identity:

- protected `master`: `142200812d3d57a1b79aaaba2af628168acc648e`
- certified PR #286 candidate: `89c910d1b22256bd19e17304dbd735b769c22ff8`
- canonical Supabase project: `iphfwxjuhsucvdyluink`
- `world-emergence`: ACTIVE v14, bundle `345677bf2b2b8d6e3adc98956a6bd045a68768d26a49f0986abb8e3935e2fe3d`

## Release gates

| Requirement | Merged | Deployed | Live verified | Evidence / explicit TODO |
|---|---:|---:|---:|---|
| Authenticated `intent → preview → commit → tick → history` routes | YES | YES | PARTIAL | Routing/auth boundary POST passed on `91702bcad279b8f43f154360708fe96df81c8e85`; the later authenticated lifecycle/CAS proof is covered by #276/#277. [#275 POST](https://github.com/mpaykin1/World_server/pull/275#issuecomment-5798884312) |
| Owner membership, invite/revoke, stale-token denial and two-client CAS | YES | YES | YES | Integrated/live `349dcfb392f84088358416cc0a4dc83860a7c5c1`, Edge v5. [#276 POST](https://github.com/mpaykin1/World_server/pull/276#issuecomment-5803858829) |
| Private free-text/actor journal and public-history redaction | YES | YES | YES | Integrated/live `a1ebfffff228727186136f75745b6d5ed60ba817`, Edge v6. [#277 POST](https://github.com/mpaykin1/World_server/pull/277#issuecomment-5804475132) |
| Deterministic hidden Genie offers, honest 0–4 degradation and bounded fifth lane | YES | YES | YES | Integrated/live `2ace559ef4d284bcfdf601fd5ae6eba32b312695`, Edge v7. [#279 POST](https://github.com/mpaykin1/World_server/pull/279#issuecomment-5805101953) |
| Construction delay and builder reserve/release without double credit | YES | YES | YES | Integrated/live `38dbb6239acb03c67395ccd539db183be82a9333`, Edge v8. [#280 POST](https://github.com/mpaykin1/World_server/pull/280#issuecomment-5805672496) |
| Sustained eight-tick insight, crisis reset and durable first milestone | YES | YES | YES | Integrated/live `794d23811045537c6a0472e02b91a30ac6073626`, Edge v9. [#281 POST](https://github.com/mpaykin1/World_server/pull/281#issuecomment-5806253661) |
| 112 canonical fictional residents, stable address and temple spokesperson | YES | YES | YES | Integrated/live `469076575c78931d3d71e8158690116cccacd167`, Edge v10. [#282 POST](https://github.com/mpaykin1/World_server/pull/282#issuecomment-5806780352) |
| Read-only authenticated `resident-at-address`, strict address validation and exact six-field DTO | YES | YES | **NOT_VERIFIED** | Candidate `95dbd973baf0a2ab0eef71fddc1de20a9c935d30`; integrated `31029a07c0e80470bbc5d500e25f5c2202f2947f`; Edge v13. PRE passed, but #282 POST predates this endpoint and cannot certify it. [#285 PRE](https://github.com/mpaykin1/World_server/pull/285#issuecomment-5810432183), [Ocean handoff](https://github.com/mpaykin1/World_server/issues/80#issuecomment-5810849633) |
| Atomic authenticated `game-state` (world + revision + cards), revision fence, zero-write read and nested privacy | YES | YES | **NOT_VERIFIED** | Candidate `89c910d1b22256bd19e17304dbd735b769c22ff8`; integrated `142200812d3d57a1b79aaaba2af628168acc648e`; Edge v14. PRE and cloud checks passed; no independent deployed-SHA behavioral certificate exists. [#286 PRE](https://github.com/mpaykin1/World_server/pull/286#issuecomment-5811354887), [CI 35979342510](https://github.com/mpaykin1/World_server/actions/runs/35979342510), [Cloudflare 35979342549](https://github.com/mpaykin1/World_server/actions/runs/35979342549), [Ocean handoff](https://github.com/mpaykin1/World_server/issues/80#issuecomment-5811768163) |
| Combined current backend SHA `142200812…` | YES | YES | **NOT_VERIFIED** | Cloudflare and Edge v14 deployment are recorded; production smoke proves fail-closed unauthenticated `game-state` only. Authenticated endpoint behavior remains a POST gate. |
| Player-visible 3D consequences, desktop/mobile behavior, FPS/p95 and ≥85% visibility | OUT OF SCOPE | OUT OF SCOPE | **NOT_VERIFIED** | Graphics owns the final browser slice; backend evidence must not be used as visual-release evidence. |

## Remaining release TODO

1. **Fleet POST owner:** independent Fleet QA. Reuse the already integrated/deployed SHA `142200812d3d57a1b79aaaba2af628168acc648e`; do not create another engine, deployment, or competing POST.
2. Verify on production with real disposable owner, invited player, stranger, and revoked still-valid session:
   - `resident-at-address` returns the same canonical six scalar fields across reconnects; malformed and nonexistent addresses fail; reads cause zero revision/resource/history writes;
   - `game-state` returns world, revision, cards, degradation, and fifth-lane metadata from one revision; `expectedRevision` yields `409` when stale and succeeds after refresh;
   - owner/player parity, stranger/revoked denial, deterministic 0/4-card cases, nested resident/history privacy, and Node/Edge DTO parity;
   - two clients still produce exactly one CAS winner (`200 + 409`) and cleanup removes every disposable world/member/private event/user.
3. Record exact Cloudflare revision, Supabase Edge version/bundle, test identities/counts, cleanup counts, and a linked Fleet POST certificate. Until then both new read endpoints remain **NOT_VERIFIED**, even though merged and deployed.
4. **Graphics owner:** complete the separate final-head browser/mobile behavioral proof. Backend checklist completion does not authorize a public playable-link claim.

No release percentage is derived from this checklist. A release gate is either evidenced at its required stage or it is not.
