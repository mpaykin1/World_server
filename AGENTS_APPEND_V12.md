## WORLD SERVER QUALITY RUNTIME V12.3

Add once to `AGENTS.md`.

- Query `public.quality_desktop_ai_work_packet()` before and after every quality repair.
- Do not stop while a reproducible in-scope error remains unfixed or changed behavior remains unverified.
- After 2–3 failed attempts, change strategy and inspect evidence instead of looping the same action.
- Never fabricate pixel-atlas, physical-device, runtime, schema-sync, branch-protection, CI, canary, or deployment evidence.
- Never push directly to `master`.
- Git/Supabase drift is a release blocker until the merged master filename manifest exactly matches production migration history.
- Prefer GitHub Actions OIDC bridge (`quality-github-bridge`) over long-lived Supabase service-role secrets in GitHub.
- `master` protection is a blocker until fresh GitHub API evidence records `protected=true`.
- SECURITY DEFINER exposure is evaluated by the V12 authorization audit; unexpected grants require root-cause repair, not blanket revocation.
- A pixel atlas is PASS only when real project assets were packed and `quality_register_pixel_atlas_manifest()` accepted the real manifest.
- Real-device readiness requires verified physical iOS + Android evidence.
- Every confirmed fix should gain regression protection where technically possible.
- Run `npm run release:gate` plus all relevant runtime/browser tests before completing a task.
