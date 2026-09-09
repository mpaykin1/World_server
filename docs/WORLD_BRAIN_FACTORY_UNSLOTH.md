# World Brain Factory вЂ” Unsloth integration

World Brain Factory is the fine-tuning layer for the existing World_server Collective Brain. It **does not replace** Collective Brain, Model Registry, the agent scheduler, or production inference. Its job is narrower:

`verified server lessons -> deterministic dataset -> external Unsloth QLoRA -> measured candidate -> later benchmark/promotion`

## Why this architecture

The production server should stay lightweight. GPU training is deliberately kept outside Cloud Run/Vercel/Netlify and outside the user's CPU-only PC. The default path is a free browser GPU runtime such as Google Colab when capacity is available.

The checked-in policy is `data/world-brain-factory-policy.json`.

## What enters the dataset

Only structured, project-owned knowledge is eligible:

- `protected` entries from `data/error-prevention-registry.json`;
- `golden` entries from `data/golden-components.json`;
- only `verified` / `promoted` / `approved` Collective Brain entries;
- only promoted AutoFix lessons.

Unprotected known issues are excluded. Secret-like strings, bearer tokens, password/API-key assignments, private keys and JWT-like values are rejected.

## Local/server commands

These are lightweight Node operations; they do **not** install or run Unsloth:

```bash
npm run world-brain:status
npm run world-brain:prepare
npm run world-brain:verify
npm run world-brain:test
```

The default generated pack is written to ignored `work/world-brain/`:

- `train.jsonl`
- `validation.jsonl`
- `manifest.json`

The manifest pins hashes and the source commit so the training input is reproducible.

## Free Colab flow

Open `notebooks/world-brain-unsloth.ipynb` in Google Colab, select a GPU runtime, then run the cells. The notebook:

1. clones the canonical `mpaykin1/World_server` repository;
2. prepares the verified dataset;
3. installs Unsloth in Colab, not on the server;
4. runs QLoRA against the configurable default `unsloth/Qwen3-4B-unsloth-bnb-4bit`;
5. compares validation loss before and after tuning;
6. saves LoRA output and, optionally, GGUF.

Free Colab capacity is not guaranteed. A missing GPU is treated as an external availability blocker, not as a World_server bug.

## Promotion rules

Training completion is **never** equivalent to production readiness.

A candidate is only eligible for the next stage when:

- dataset verification passes;
- the verified training set meets the minimum sample count;
- post-training validation loss improves over the pre-training model;
- no secret finding exists;
- a separate real World_server task benchmark shows no capability regression;
- a reviewed PR promotes the candidate.

`productionPromoted` is always written as `false` by the training script. There is intentionally no automatic model-registry replacement.

## Model choice

The model name is configurable with `--model`. The default is a current Unsloth-hosted 4-bit Qwen3 4B checkpoint that is small enough to be practical for free GPU experimentation and later GGUF/Ollama use.

The training script follows the current Unsloth CLI pattern: `FastLanguageModel`, PEFT/LoRA, `SFTConfig(max_length=...)`, and `SFTTrainer(processing_class=tokenizer, ...)`.

## Safety and cost invariants

- no training dependency is added to `package.json`;
- no GPU is required for production;
- no paid GPU is enabled by default;
- no heavy local training is allowed by policy;
- generated datasets/models stay outside git by default;
- secrets are filtered before dataset write;
- promotion is evidence-gated and reviewed.
