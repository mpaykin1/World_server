# Desktop AI — V6 Phone + 4D MAX

## Absolute rule
**DO NOT STOP while any test, build, viewer check, API check, or deployment check is failing. Find the cause, fix it, rerun the complete regression chain, and continue until every check is green.**

## Install this patch
1. Do not modify/remove the currently working production route.
2. Copy V6 into a new branch/folder.
3. Install `requirements.txt`.
4. Optional quality backends: install `requirements-optional-cpu.txt` and place model files in `models/optional/`.
5. Run `python models_cli.py status` and record which optional backends are active.
6. Run `python tools/regression_runner.py`.
7. Run `python tools/patch_installer.py` only after regression is green.

## Required checks
- `v6_self_test.py` PASS.
- panorama regression `self_test.py` PASS.
- space-video and character-video `video_self_test.py` PASS.
- `/health` reports V6.
- `/models/status` works.
- `/capture-app/` opens on phone.
- phone camera permission works.
- iPhone sensor-permission action is initiated from the user button.
- recording can be stopped and produces video + pose JSON.
- `/capture/upload` accepts a bundle and creates a job.
- job progress reaches complete or gives a concrete error report.
- viewer Enter button works on desktop and phone.
- WASD/arrows are never inverted.
- touch/mouse look is never inverted or rolled.
- jump is vertical only.
- old working build remains available until V6 is verified.

## Video-space checks
- camera path is plausible and does not teleport;
- sensor fusion is used when pose data exists;
- GPS is only a drift anchor, never a hard indoor pose source;
- collision proxy/navgrid exist;
- LOD0 >= LOD1 >= LOD2;
- transient/moving objects are filtered conservatively.

## Character checks
- full body remains in masks;
- hands/head/feet are not systematically clipped;
- `dynamic4d/dynamic4d_tracks.npz` and manifest are created;
- character metric height is correct;
- collision capsule and hybrid character proxy exist;
- if dynamic score is high, do not claim true learned 4DGS: report temporal-track mode accurately.

## Optional models
The system auto-activates models found in `models/optional/` or environment paths. Never claim a backend is active unless `/models/status` says `active:true`.

## Deployment architecture
- Vercel: UI/orchestration only.
- Persistent Python CPU worker: reconstruction/video processing.
- Object storage: source video/panoramas and outputs.
- Serve phone PWA from the Python/API host or proxy `/capture-app/` and `/capture/upload` to it.

## Failure protocol
For every failure:
1. save the exact error;
2. identify root cause, not symptom;
3. fix code/config/dependency;
4. rerun the failed test;
5. rerun `python tools/regression_runner.py` from the beginning;
6. repeat until all checks pass;
7. only then deploy to a new preview URL;
8. verify phone + desktop again before switching production.

## Final release gate
Before deployment require `output/demo_build/readiness_report_v6.json` and `desktop_ai_regression_report_v6.json`. If either is missing or regression `ok` is false, do not deploy; keep fixing and rerunning until green.
