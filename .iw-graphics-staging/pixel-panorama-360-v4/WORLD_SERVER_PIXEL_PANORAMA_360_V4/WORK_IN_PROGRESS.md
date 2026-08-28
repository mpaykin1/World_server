# WORK_IN_PROGRESS

## Goal
Integrate Pixel Panorama 360 V4 into World_server with existing durable AI3D queue, CPU-first processing, multires tiles, Supabase publishing and certification gates.

## Exact patch / change plan
- add app viewer + factory + editor;
- add panorama API/registry;
- add sharp-based local build and multires tiles;
- add temporal/seam validation;
- extend AI3D API modes;
- extend worker server upload policy;
- extend runner with PixelPanorama360Engine;
- add Supabase migration/publisher;
- add e2e/visual/prod/release checks;
- keep app hidden until certification.

## Tests to run
See `DESKTOP_AI_INSTALL_VERIFY_FIX.md`.

## Deployment / PR plan
branch → install → npm install → migration → worker tests → local e2e → preview → prod verify → certify → PR/merge.

## Errors that must not return
See `DESKTOP_AI_INSTALL_VERIFY_FIX.md`.

## Root cause rule
Fix and rerun until all required checks pass.

## Readiness
98% patch-code readiness; production evidence pending live environment verification.
