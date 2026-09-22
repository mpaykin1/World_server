# World Server CPU video motion capture (experimental)

## Scope and legal boundary

This adapter is an independent implementation, NOT a modified GVHMR build. It
uses Apache-2.0 MediaPipe *library code* and optional, operator-supplied
Pose Landmarker .task weights. No Mixamo character, GVHMR checkpoint, SMPL-X
model, or third-party animation is embedded or downloaded automatically.

The model bundle's license **must be reviewed independently**. Apache-2.0 on
MediaPipe's GitHub repository does not automatically license every model
weight. The operator must record an approved model's version, source,
commercial terms, and SHA256 before setting the approval flag. Preserve all
attribution/NOTICE obligations for code and models. Do not treat a checkbox
or environment flag alone as legal proof.

Upstream references:
- https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- https://github.com/squall01337/mixamo-llm-mocap/blob/main/LICENSE
- https://developers.google.com/edge/mediapipe/legal/tos

## Setup (after model-rights review)

1. Install optional requirements on the AI3D worker:
   `python -m pip install -r services/ai3d-worker/requirements-motion.txt`.
   Docker: `docker build --build-arg INSTALL_MOCAP=true ...`.
2. Obtain a Pose Landmarker .task bundle from its authorized publisher,
   read the specific MODEL license, and store it outside Git.
3. Record `WORLD_MOCAP_MODEL_PATH` and the independently computed
   `WORLD_MOCAP_MODEL_SHA256` (64 lowercase hex). When and only when
   approved for the intended commercial use, set
   `WORLD_MOCAP_MODEL_COMMERCIAL_USE_APPROVED=true`.
4. Existing AI3D worker auth: same `AI3D_SHARED_SECRET` on frontend gateway
   and worker. Restrict `AI3D_ALLOWED_ORIGINS` to public application origin.
5. `GET /health` must report `plugins.motion_capture.available=true`.
   An unlicensed/unconfigured model keeps this mode disabled (503).
6. AI3D Factory accepts video/mp4, video/webm or video/quicktime, up to the
   existing 25MB default upload limit and 30 seconds. Filenames are never
   trusted; server uses fixed names and verifies the container signature.

## What is implemented

- One visible full-body human, preferably a fixed camera; defaults to
  10 sampled FPS and 20 seconds (limits 2–15 FPS, 1–30 seconds, 180 samples).
- Local video inference; browser uploads directly to authenticated worker,
  Vercel is *only* the token gateway. No GPU or inference inside Vercel.
- Per-frame 33 camera-relative 3D keypoints (JSON), with landmark confidence.
- Lightweight animated diagnostic-mannequin GLB (segment transforms baked
  into glTF 2 animation). In-app canvas playback for quick visual inspection.
- SHA256 provenance and explicit limitations in motion-license-and-qa.json.
- Worker jobs are queued and persisted in SQLite. Raw private videos are
  deleted immediately after completed/failed jobs. If the process crashes,
  queued/recoverable source video persists until recovery or the restart-time
  TTL cleanup. Output landmarks/GLB are purged by the startup retention job
  after the configurable TTL (default 72 hours); there is no continuous
  background purger. Operators must disclose this, obtain subject consent,
  and avoid uploading unconsented third-party recordings.

## Deliberate limitations / next integration

- Diagnostic GLB is a stick/cuboid mannequin, not a user-selected rig.
  JSON trajectories are the handoff contract for a separate Mixamo/Godot/
  voxel retargeting stage with foot-locking, IK and device-specific QA.
- No root/global body travel from monocular fixed-camera inference; no
  two-person tracking, finger animation, ground-contact guarantee or
  game-avatar runtime integration yet.
- No autonomous model downloads, paid GPU reservation or claims of
  end-to-end commercial clearance.
- Do not publish this as a finished playable-world feature until real
  character retargeting, desktop/mobile playback, visible-user gate >=85%,
  security validation and approved-model license evidence all pass.
- No temporary preview URL may be delivered as a permanent user link.
