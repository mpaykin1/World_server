# WORLD_SERVER_GAME_MOTION_FRAME_TIMELINE_V2

Start with `00_START_HERE_DESKTOP_AI.md`.

This one folder contains the installer, payload, docs, tests, cross-platform adapters, motion manifest schema, preset library, frame-processing tools, OSS update watcher, quality gate and recovery rules.

Local validation performed on the patch bundle:
- 10/10 JS unit tests PASS;
- installer syntax PASS;
- installer double-run/idempotency PASS;
- `animation:verify` fixture PASS;
- audit → plan → dry integrate → apply → second apply idempotency PASS;
- animation quality gate fixture PASS;
- Python syntax PASS;
- frame sequence analyzer PASS;
- exposure stabilization PASS;
- APNG generation PASS (12 frames verified);
- sprite-sheet generation PASS;
- WebP conversion PASS;
- synthetic JS animation benchmark PASS.

Not executed in the artifact environment because external network access is disabled:
- live `animation:oss:bootstrap` downloads;
- real glTF-Transform/Meshopt conversion on the user's assets;
- the repository's full release gate;
- real desktop/mobile game runtime testing.

Those are mandatory before claiming 100% live readiness.
