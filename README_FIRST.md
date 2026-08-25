# WORLD SERVER QUALITY RUNTIME V12.3

This patch connects the live Supabase V12 quality control plane to GitHub Actions without a long-lived Supabase service-role secret in GitHub.

## Already live in production

- Supabase runtime/control plane V12.x.
- Synthetic production probe.
- Autonomous runtime Edge Worker.
- Runtime score.
- Security Definer Audit: 23 functions audited, 0 unexpected grants at package creation.
- External-control evidence registry.
- `github.master.protection.disabled` blocker gap.
- `supabase.schema.drift` blocker gap.
- Pixel-atlas acceptance contract.
- Physical-device verification contract.
- GitHub OIDC bridge Edge Function.
- Negative OIDC security test: unauthenticated request returns HTTP 401.
- Desktop AI work-packet V12.2.

## Known blockers at package creation

1. `master` is not protected.
2. Git migrations do not match production Supabase migrations.
3. Pixel atlas is not materialized.
4. Verified physical iOS + Android evidence is missing.
5. GitHub OIDC bridge has passed the negative-auth test but still needs one real allowed GitHub Actions positive-path run.
6. ChatGPT's connected GitHub app can read but cannot write refs/files (HTTP 403), so Git installation must be done by Desktop AI/local `git`/`gh`.

Read `DESKTOP_AI_V12_INSTRUCTION.md` first.
