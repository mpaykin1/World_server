---
title: World Server ABot-Recon Worker
emoji: 🧭
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: 6.26.0
app_file: app.py
python_version: "3.12"
startup_duration_timeout: 30m
---

# World Server ABot-Recon ZeroGPU worker

A minimal secret-protected ZeroGPU worker for `mpaykin1/World_server`.

The Space downloads the pinned Apache-2.0 ABot-Recon source at startup and uses
the official `acvlab/ABot-Recon` checkpoint. The official model weights are
CC BY-NC 4.0 and therefore are **not commercial-safe by default**.

Configure the Space secret `ABOT_WORKER_SECRET` and use ZeroGPU hardware.
The public Gradio API endpoint is `/reconstruct_api`, but every call must pass
the shared secret.
