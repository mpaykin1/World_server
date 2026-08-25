# CPU Night Autopilot

## Hard constraint

This project is configured for:

- GPU: **FORBIDDEN**
- paid GPU: **FORBIDDEN**
- paid compute: **FORBIDDEN**
- CPU night learning: **ENABLED**
- production regression: **FORBIDDEN**

## What "learning" means

The system does not train a large foundation model on CPU. That would be impractical.

It learns a small quality-decision model from its own verified history:

- which action types pass gates;
- which action types increase quality;
- which fingerprints repeatedly fail;
- which fixes transfer well to other projects;
- which project/system should be improved next.

Repeated bad deterministic actions are marked `neverRetry`.

## Night flow

1. Vercel daily cron authenticates with `CRON_SECRET`.
2. It reads verified learning events from Supabase.
3. It updates success priors / expected deltas / never-retry memory.
4. It ranks projects and enqueues **CPU-only, cost=0** jobs.
5. A Windows CPU worker runs at night when the host is idle.
6. The worker refuses a dirty repository.
7. It creates a temporary candidate branch.
8. It runs deterministic improvements/reviews.
9. It runs the full release gate.
10. Any quality regression fails the candidate.
11. It saves a `.patch` candidate and records the verified outcome.
12. The temporary branch is removed; production remains unchanged.

## Install on Windows

Run PowerShell as the same user that owns the repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\install-cpu-night-task.ps1
```

Default: daily at `00:35` local time.

Required user/system environment variables:

- `WORLD_SERVER_URL`
- `AUTOPILOT_WORKER_TOKEN`

The server also needs:

- `CRON_SECRET`
- existing Supabase server credentials.

## Manual test

```bat
desktop\run-cpu-night-now.cmd
```

## Safety

No GPU job can be claimed from the queue because the database claim function filters `requires_gpu=false` and `estimated_paid_cost<=0`.

The local policy gate independently verifies the same constraint.


## V12 extensions

Before each nightly plan:

1. update Failure/Success KB;
2. build project curriculum;
3. calculate adaptive CPU budget;
4. select tasks inside that budget.

During candidate work:

- use incremental tests first;
- use genetic tuning for performance candidates;
- optionally use the local CPU GGUF patch tournament;
- create CPU texture/mesh candidates non-destructively;
- always finish with the full release gate.

Desktop AI must not declare completion until strict error closure passes.


## V13 self-calibration extensions

The nightly order now includes:
1. learn from verified outcomes;
2. update Failure/Success KB;
3. Bayesian action prediction;
4. mine candidate invariants;
5. fingerprint hardware;
6. evaluate 30-night calibration history;
7. calculate adaptive CPU budget;
8. rank projects/tasks;
9. use checkpointed candidate optimizers;
10. use exact test-cache hits for unchanged deterministic tests;
11. always run the full final release gate before candidate acceptance.

No V13 predictor, cache, similarity score, or calibration result may bypass behavioral/no-regression gates.
