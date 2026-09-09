\
# World Brain Factory вЂ” Unsloth + free GPU router

World Brain Factory is the fine-tuning layer for the existing World_server Collective Brain. It **does not replace** Collective Brain, Model Registry, the agent scheduler, or production inference.

Canonical flow:

`verified server lessons -> deterministic dataset -> free GPU router -> Unsloth QLoRA -> measured candidate -> real benchmark -> reviewed promotion`

## Runtime order

The checked-in policy is `data/world-brain-factory-policy.json`.

The current free-first order is:

1. **Kaggle free GPU / NVIDIA T4** вЂ” preferred automated backend.
2. **Google Colab Free GPU** вЂ” browser fallback.
3. **User-provided compatible GPU** вЂ” optional fallback.
4. **CPU prepare-only** вЂ” dataset building, verification and benchmarking prep; no heavy fine-tuning.

GPU unavailability never blocks the game server. The router reports `READY_FOR_GPU`, `NEEDS_AUTH`, `NEEDS_CLI`, or `READY_TO_SUBMIT` while World_server continues normal operation.

Kaggle's own GPU documentation currently describes a weekly free GPU quota (commonly 30 hours, sometimes higher depending on demand). Quota and hardware availability are external and must never be represented as guaranteed by World_server.

The current Kaggle CLI documentation supports explicit accelerators on `kaggle kernels push`. World Brain Factory selects `NvidiaTeslaT4` by default. Current Kaggle metadata docs warn that the default Kaggle image's PyTorch build can fail on P100/Pascal kernels, so P100 is deliberately not our default.

References:
- https://www.kaggle.com/docs/efficient-gpu-usage
- https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels.md
- https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels_metadata.md
- https://github.com/Kaggle/kaggle-cli/blob/main/skills/references/auth.md

## What enters the dataset

Only structured, project-owned, accepted knowledge is eligible:

- `protected` entries from `data/error-prevention-registry.json`;
- `golden` entries from `data/golden-components.json`;
- only `verified` / `promoted` / `approved` Collective Brain entries;
- only promoted AutoFix lessons.

Unprotected known issues are excluded. Secret-like strings, bearer tokens, password/API-key assignments, private keys and JWT-like values are rejected.

## Lightweight local/server commands

These commands do not install Unsloth and do not start local training:

```bash
npm run world-brain:status
npm run world-brain:prepare
npm run world-brain:verify
npm run world-brain:test
npm run world-brain:gpu:plan
npm run world-brain:gpu:test
```

The normal dataset pack is written to ignored `work/world-brain/` and contains `train.jsonl`, `validation.jsonl`, and `manifest.json`. The manifest pins file hashes and source commit.

## Kaggle private T4 bundle

Build a self-contained private Kaggle kernel bundle:

```bash
npm run world-brain:kaggle:prepare -- --owner YOUR_KAGGLE_USERNAME
```

The output is written to ignored `work/world-brain-kaggle/` and contains:

- `world-brain-kaggle.py` вЂ” self-contained training script with the already verified dataset and canonical trainer embedded;
- `kernel-metadata.json` вЂ” private kernel, internet enabled, GPU enabled, `NvidiaTeslaT4` selected;
- `bundle-manifest.json` вЂ” provenance, counts and hashes; contains no credentials.

No public Kaggle Dataset is created. The plaintext temporary dataset used to build the embedded payload is removed immediately after bundle generation.

The bundle does **not** contain `KAGGLE_API_TOKEN`, legacy Kaggle keys, passwords, or any other authentication material.

## One-time Kaggle authentication

World_server never creates or stores a Kaggle account on behalf of the user. Kaggle requires a user-owned account.

Current Kaggle CLI supports OAuth (`kaggle auth login`) and API-token auth. For non-interactive GitHub Actions we use:

- GitHub Actions secret: `KAGGLE_API_TOKEN`
- GitHub Actions repository variable: `KAGGLE_USERNAME`

After those two values are configured once, the repository includes a manual workflow named **World Brain Free GPU**. It is `workflow_dispatch` only: there is intentionally no hourly schedule, because automatic recurring GPU runs would waste the free quota.

The workflow:

1. checks out the exact repository commit;
2. verifies the World Brain dataset;
3. builds the private T4 bundle;
4. installs the current Kaggle CLI in the GitHub runner;
5. submits the private Kaggle kernel with `--accelerator NvidiaTeslaT4`;
6. exits, leaving the heavy training on Kaggle rather than the user's PC or the production server.

Local direct submission is also available when the Kaggle CLI and authentication are already configured:

```bash
npm run world-brain:kaggle:submit
```

The submit command fails closed if the owner is missing or the CLI is unavailable. It never auto-installs Kaggle on the user's PC.

## Colab fallback

`notebooks/world-brain-unsloth.ipynb` remains the browser fallback. Open it in Google Colab, select a GPU runtime, and run the cells. It clones World_server, prepares/verifies the dataset, installs Unsloth in Colab and runs the same canonical trainer.

Free Colab GPU availability is controlled by Colab and is not guaranteed. A missing GPU is an availability condition, not a World_server failure.

## CPU-only mode

Without any GPU, the infrastructure is still useful. CPU-only mode can:

- collect verified lessons;
- build deterministic train/validation datasets;
- filter secrets;
- verify hashes/provenance;
- prepare Kaggle and Colab jobs;
- run non-training tests and candidate evaluation tooling;
- keep accumulating better training material.

Heavy Unsloth fine-tuning remains disabled on the production host and the user's CPU-only PC.

## Promotion rules

Training completion is **never** production readiness.

A candidate only advances when:

- dataset verification passes;
- the verified training set meets the minimum sample count;
- post-training validation loss improves over the pre-training model;
- no secret finding exists;
- a separate real World_server task benchmark shows no capability regression;
- a reviewed PR promotes the candidate.

`productionPromoted` is always written as `false` by the trainer. There is no automatic Model Registry replacement.

## Safety and cost invariants

- no training dependency is added to the production Node dependencies;
- no GPU is required for production;
- no paid GPU is enabled by default;
- no heavy local training is allowed;
- no scheduled Kaggle quota burn is allowed;
- Kaggle kernel is private by default;
- generated datasets/models stay outside git by default;
- credentials never enter generated bundles;
- promotion remains evidence-gated and reviewed.
