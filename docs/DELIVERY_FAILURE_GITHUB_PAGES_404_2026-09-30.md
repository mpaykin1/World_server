# Delivery failure — GitHub Pages 404 after declaring Meta6 EN ready

**Date:** 30 September 2026  
**Severity:** release-process failure, not gameplay failure  
**Affected URL:** https://mpaykin1.github.io/meta6/en/  
**User evidence:** physical iPhone showed GitHub Pages `404 File not found`

## 1. What failed

The English file existed in the repository, but the public GitHub Pages artifact had not finished deploying when the link was reported as ready.

This is an important distinction:

    repository state != deployed public state

The implementation itself had been committed, but delivery was not yet proven.

## 2. Exact evidence

Repository evidence:

- `meta6/en/index.html` existed on `main`;
- the Russian root `meta6/index.html` remained unchanged;
- the English file had valid JavaScript and English UI content.

GitHub Pages evidence:

- initial English Pages build for commit `1df4a929ffeee44e8b3e884c09ede0abbffca707` was later **cancelled**;
- the next Pages build for `aeb25223a2922f9eb762bf75ad607f413b2b30c7` was also **cancelled** by a newer push;
- the next Pages build for `56cb0c6bd9dc73f6d91180d7cf7c92cc49fa9305` was still **queued** while the user opened the URL;
- therefore the public Pages artifact still represented the older Russian-only deployment.

The resulting 404 was expected from that stale deployment even though the repository already contained `en/index.html`.

## 3. Root cause

The root cause was **premature release declaration**.

The incorrect process was:

    write file
    -> commit exists
    -> assume Pages is live
    -> send public link

The required process is:

    write file
    -> commit exists
    -> deployment starts
    -> deployment succeeds
    -> public GET returns HTTP 200
    -> expected build marker/content is present
    -> only then report the public link as ready

A secondary contributing factor was commit churn immediately after publication. Multiple rapid commits cancelled earlier GitHub Pages deployments before they reached production.

## 4. What was NOT the root cause

Do not misdiagnose this event as:

- wrong `/en/` directory;
- missing `en/index.html`;
- filename case mismatch;
- broken English JavaScript;
- iPhone Safari routing bug.

At the time of diagnosis, the repository path was correct. The public artifact was simply older than the repository state.

## 5. Permanent prevention added to Meta6

Meta6 now contains:

`.github/workflows/live-delivery-gate.yml`

The workflow is triggered after the dynamic GitHub Pages build completes.

It enforces:

1. Pages workflow conclusion must be `success`;
2. Russian baseline URL must return live content with the expected marker;
3. English URL must return live content with the expected `Chain Reaction: Meta6 EN` marker;
4. 404/stale content fails the gate;
5. a public link is not releasable until the live gate passes.

The gate retries live URLs for up to several minutes because GitHub Pages activation can lag behind source commits.

## 6. New canonical release rule for all World Server public demos

**A committed file is not a released artifact.**

For every externally shared playable URL:

    SOURCE_COMMITTED
    + DEPLOYMENT_SUCCESS
    + HTTP_200
    + EXPECTED_MARKER
    = READY_TO_SHARE

If any term is missing, status is **NOT READY**.

## 7. Exact-head principle

When possible, public demos should expose or embed an exact build marker/SHA and live verification should assert it.

Preferred proof:

    expected source SHA
    -> deployed page marker
    -> live HTTP response contains same marker

For legacy/simple static demos where exact SHA is not embedded yet, at minimum assert a version-specific unique marker and HTTP 200.

## 8. Human-facing reporting rule

Never say:

> "Готово, вот рабочая ссылка"

based only on repository state.

Use one of these statuses:

- **COMMITTED** — source exists, deployment not yet proven;
- **DEPLOYING** — Pages/hosting job is running or queued;
- **LIVE VERIFIED** — deployment success + HTTP 200 + marker check passed;
- **FAILED DELIVERY** — deployment failed, 404, stale marker, or live check failed.

Only **LIVE VERIFIED** may be presented as a working public link.

## 9. Rapid-commit rule

After creating a new public page:

1. group final content changes before the release commit where possible;
2. avoid cosmetic follow-up commits while Pages is deploying;
3. if a new commit is necessary, assume previous deployment evidence is invalid;
4. re-run live verification against the newest head.

This avoids a chain of cancelled Pages builds.

## 10. Regression check

For any new language/version/path:

- [ ] source file exists on expected branch;
- [ ] public hosting workflow exists;
- [ ] latest deployment corresponds to intended commit/version;
- [ ] deployment conclusion is success;
- [ ] URL returns HTTP 200;
- [ ] unique page marker is present;
- [ ] old baseline URL still works;
- [ ] physical target device opens the URL;
- [ ] only after all checks is link sent to user as ready.

## 11. Main lesson for future AI agents

The failure happened because **implementation completion was confused with delivery completion**.

Future agents must treat deployment as an independently verified stage.

The release pipeline is:

**code → commit → deploy → activate → live probe → user link**

—not:

**code → commit → user link**.
