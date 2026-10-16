# WORK IN PROGRESS — ai/claude/games-on-cloudflare

> Updated 2026-10-16. Task notes for this branch (AGENTS.md §11).

## Task
Serve game builds (`games/*/dist`) from the Cloudflare worker, so a merged game and every game PR have a live link that does not depend on Netlify. Give every agent a real-browser check of that link in the cloud.

## Why
The owner asked to fix every breakage that hinders work (2026-10-14).

**Netlify fails.** Every Netlify deploy fails since 2026-10-15:
- previews of #512, #513, #514, #515 and #516 say «Deploy Preview … failed»;
- the last success was #509 (2026-10-15 01:19 UTC);
- master did not change in between, so the cause is outside the repo; the logs need a Netlify login.

**The game has no live link.**
- «Остров сумерек» merged to master today (#500, 2026-10-16 05:57 UTC).
- The production Netlify site does not serve `/games/ostrov-sumerek/dist/index.html`; the old #500 preview still does.
- Cloudflare is the canonical production host (CHATGPT_GAME_CONTROL.md), but `.assetsignore` publishes only `apps/`, `shared/`, `assets/` and two data files — nothing under `games/`.

**The owner's loop stalls.** §21.5 names only the Netlify preview as the owner's play link, so the next game the AIs finish (#511, moonmoth v2) has no link either.

## Current state
master 644d217.
- The Cloudflare production worker deploys on every master push (Workers Builds, and cloudflare-production-ai.yml with `PROD_URL`).
- PR branches get a Cloudflare `Branch Preview URL`.

## Target state
- `PROD_URL/games/<game>/dist/index.html` serves the merged build.
- The branch preview of a game PR serves that PR's build.
- Game sources and tools stay unpublished.
- §21.5 names whichever host opens.
- `Games autotests` dispatched with `url` opens the link on desktop and phone and reports one annotation per view.

## Files / systems involved
- .assetsignore
- test/cloudflare-runtime-assets.test.js
- .github/workflows/games-autotests.yml (`url` input, `live-link` job)
- test/games-autotests-workflow.test.js
- AGENTS.md §21.5

## Known risks
- Publishing more than intended: only `games/*/dist/**` is re-included. The test proves that sources and tools stay ignored, using git's gitignore matcher, which wrangler's `.assetsignore` follows.
- Asset count and size: one 400 KB file today.
- The worker code runs first only for `/` and `/api/*`, so `/games/...` is a plain static asset.

## Golden systems that must be preserved
- Controls
- Collisions
- Mobile support
- Compact UI/HUD
- Release certification
- Protected errors
- Approved Golden assets/components

## Errors that must not return
- A merged game with no live link because one host is down.

## Exact patch / change plan
1. `.assetsignore`: `!games/`, `!games/*/`, `!games/*/dist/`, `!games/*/dist/**`.
2. Test: the rules are present; no blanket `games/**`; `git check-ignore` publishes the build and keeps sources private.
3. §21.5: play link on Cloudflare or Netlify, whichever opens; stable link = `PROD_URL` + `/games/<game>/dist/index.html`; the cloud live-link check counts as the browser check.
4. `Games autotests`:
   - a `url` input; with it only `live-link` runs (Chromium, desktop 1280×720 and phone 390×844 touch);
   - the job checks: HTTP 2xx, no host error page, game reaches the title, `startGame()` leads to `play`, clean console;
   - one `::notice`/`::error` per view;
   - the link arrives through env, never inlined into the script.

## Tests to run
- node --test test/cloudflare-runtime-assets.test.js test/cloudflare-worker.test.js
- npm run check (ARCHITECTURE_BASE_REF=644d217), check-agent-rules, check-ai-context-discovery, desktop-ai:check
- After merge: Workers Builds deploys master; `PROD_URL/games/ostrov-sumerek/dist/index.html` must serve the game.

## Deployment / PR plan
Task branch -> CI -> PR -> merge on the owner's instruction (2026-10-14) -> the Cloudflare production deploy on the master push.

## Current progress
Patch done; tests green.

## Next action
Open the PR; after merge, confirm the production game URL.

## Completion criteria
- Required checks green.
- The game URL on Cloudflare serves the game after the master deploy.

## Final evidence
- The `ignore` library (5.3.2, the gitignore matcher family wrangler uses) on the new `.assetsignore`:
  - published: `games/ostrov-sumerek/dist/index.html` and `dist/source.json`;
  - kept private: `README.md`, `engine/*.js`, `tools/*.py`;
  - unchanged: `apps/`, `shared/` and the data whitelist.
- `git check-ignore` agrees on the same paths.
- The new test fails on the master `.assetsignore` and passes with the fix. The two Cloudflare test files: 13/13.
- `live-link` script run locally:
  - against the game build served on 127.0.0.1, with three.js routed to the local copy as the game harness does: desktop and phone «Live link OK», state `play`, console clean;
  - against a non-https link: rejected;
  - against a host blocked here: FAILED with `ERR_TUNNEL_CONNECTION_FAILED`, exit 1.
- test/games-autotests-workflow.test.js and the workflow YAML test: 38/38.
- In CI (run 38861202952, dispatched on this branch with the #500 Netlify preview): «Live link OK» for desktop (30.5 s) and phone (107.4 s), state `play`, console clean. The phone run in software GL is slow, so the title wait is 150 s.
