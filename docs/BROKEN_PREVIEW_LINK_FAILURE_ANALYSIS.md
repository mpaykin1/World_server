# Broken Preview Link Failure Analysis — host status is not live delivery proof

Date: 2026-10-04

## User-visible failure

The user opened:

`https://deploy-preview-401--world-server.netlify.app/apps/infinite-gothic-traversal/`

on a real iPhone and received Netlify's host-level **Site not found** page.

At the same time, GitHub commit status for SHA `9134f2ba0f5e8b88de57b24d0817953c40c2d7c5` reported:

- context: `netlify/world-server/deploy-preview`
- state: `success`
- description: `Deploy Preview ready!`
- target URL: `https://deploy-preview-401--world-server.netlify.app`
- timestamp: `2026-10-04T06:25:54Z`

The app files were present in the PR source. Therefore this was not evidence that the app code itself was missing. It was a **delivery-proof failure**: a hosting integration status/alias was accepted as if it were a live, currently routable exact app URL.

The available Netlify connector exposes the current production deploy for the `world-server` project but does not expose a currently live deploy record for that PR alias, so the exact internal lifecycle event that invalidated the alias cannot be proven from available telemetry. We do not guess whether it was deletion, alias expiry, preview cleanup, or routing failure.

## Root cause class

**Stale/orphaned preview alias handed to the user without a fresh exact-URL probe.**

The process mistake was:

1. read `Deploy Preview ready!` from GitHub status;
2. construct/use the status target URL;
3. assume that status still represented a live routable preview;
4. send the URL without immediately opening the exact app path and checking the application runtime.

A status badge proves only that an integration reported success at some earlier point. It does **not** prove that:
- the alias still exists;
- the exact app path exists;
- the preview was not deleted/overwritten;
- the runtime booted;
- mobile rendering works;
- the deployment still corresponds to the expected source revision.

## Permanent prevention

### 1. Exact URL verification is mandatory

`scripts/verify-working-link.cjs` now supports public URLs across Cloudflare, Netlify, Vercel and other hosts.

Before a test link can be handed to the user it must:
- return HTTP 2xx **three times**;
- not contain host-error markers such as `Site not found`, `Page not found`, `DEPLOYMENT_NOT_FOUND`;
- boot the requested runtime marker;
- pass browser rendering;
- pass mobile browser verification for playable worlds;
- be rechecked no more than 120 seconds before handoff.

### 2. Host status alone can never certify a link

For non-Cloudflare hosts, `--expected-sha` now fails closed because the current runtime has no exact revision proof.

A GitHub/Netlify/Vercel status such as `Ready` cannot be promoted to `LIVE_VERIFIED_FRESH` by itself.

### 3. Guessed preview URLs are forbidden

`data/manual-task-completion-contract.json` and `lib/manual-task-completion-contract.js` now require explicit live evidence for temporary preview links.

A preview URL with `urlSource: guessed` or `onlyHostStatus: true` is rejected.

### 4. Exact deploy output is preferred

The Infinite Gothic Cloudflare workflow now certifies the exact URL returned by the deployment step and writes that URL to the GitHub Actions summary only after:
- exact SHA identity proof;
- HTTP 2xx x3;
- desktop runtime proof;
- mobile runtime proof;
- visible canvas proof.

Agents should use only that certified URL, never synthesize a host alias from PR number or remembered naming conventions.

## Regression tests

- `test/verified-link-delivery.test.js` — host error-page markers, provider identity rules, retry defaults.
- `test/manual-task-completion-contract.test.js` — fresh preview evidence, stale evidence, guessed URL and host-status-only rejection.
- `.github/workflows/cloudflare-preview.yml` — exact user-facing Infinite Gothic URL certification after browser tests.

## General lesson

**Deployment metadata is not delivery evidence.**

The thing the user opens is the URL, not the status badge. Therefore the final unit of verification is always the exact URL immediately before handoff.
