'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { prepareDataset, readJson, verifyDataset } = require('./world-brain-factory');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function commandAvailable(command) {
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true })
    : spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  return probe.status === 0;
}

function kaggleAuthState(env = process.env, home = os.homedir()) {
  const kaggleDir = path.join(home, '.kaggle');
  const sources = [];
  if (env.KAGGLE_API_TOKEN) sources.push('env:KAGGLE_API_TOKEN');
  if (env.KAGGLE_USERNAME && env.KAGGLE_KEY) sources.push('env:legacy-pair');
  for (const file of ['access_token', 'access_token.txt', 'kaggle.json']) {
    if (fs.existsSync(path.join(kaggleDir, file))) sources.push(`file:${file}`);
  }
  return { configured: sources.length > 0, sources };
}

function loadPolicy(root) {
  return readJson(path.join(root, 'data', 'world-brain-factory-policy.json'));
}

function buildGpuPlan(root, options = {}) {
  const policy = loadPolicy(root);
  const auth = options.kaggleAuth || kaggleAuthState(options.env || process.env, options.home || os.homedir());
  const cliAvailable = options.kaggleCliAvailable ?? commandAvailable('kaggle');
  const kaggleStatus = auth.configured && cliAvailable
    ? 'READY_TO_SUBMIT'
    : (!auth.configured ? 'NEEDS_AUTH' : 'NEEDS_CLI');
  const providers = [
    {
      id: 'kaggle-free-gpu-t4',
      priority: 1,
      costUsd: 0,
      accelerator: policy.freeGpuRouter.kaggle.accelerator,
      automatic: true,
      status: kaggleStatus,
      authConfigured: auth.configured,
      cliAvailable,
      trainingAllowed: true
    },
    {
      id: 'google-colab-free-gpu',
      priority: 2,
      costUsd: 0,
      automatic: false,
      status: 'READY_FOR_BROWSER',
      trainingAllowed: true
    },
    {
      id: 'user-provided-compatible-gpu',
      priority: 3,
      costUsd: null,
      automatic: false,
      status: 'OPTIONAL',
      trainingAllowed: true
    },
    {
      id: 'cpu-prepare-only',
      priority: 4,
      costUsd: 0,
      automatic: true,
      status: 'READY_PREPARE_ONLY',
      trainingAllowed: false
    }
  ];
  return {
    system: 'WORLD_BRAIN_FREE_GPU_ROUTER',
    state: kaggleStatus === 'READY_TO_SUBMIT' ? 'READY_TO_SUBMIT' : 'READY_FOR_GPU',
    selected: kaggleStatus === 'READY_TO_SUBMIT' ? 'kaggle-free-gpu-t4' : 'google-colab-free-gpu',
    serverBlocked: false,
    localHeavyTrainingAllowed: false,
    providers
  };
}

function normalizeOwner(value) {
  if (!value) return null;
  const owner = String(value).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(owner) ? owner : null;
}

function normalizeSlug(value) {
  const slug = String(value || 'world-brain-unsloth').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) throw new Error('Invalid Kaggle kernel slug');
  return slug;
}

function buildEmbeddedKaggleScript(datasetPayload, trainerSource, policy) {
  const packedDataset = zlib.gzipSync(Buffer.from(JSON.stringify(datasetPayload), 'utf8')).toString('base64');
  const trainerB64 = Buffer.from(trainerSource, 'utf8').toString('base64');
  const model = policy.training.defaultModel;
  const maxSteps = Number(policy.training.defaultMaxSteps || 60);
  return `#!/usr/bin/env python3\n` +
`import base64, gzip, json, os, pathlib, subprocess, sys\n\n` +
`DATA_B64 = ${JSON.stringify(packedDataset)}\n` +
`TRAINER_B64 = ${JSON.stringify(trainerB64)}\n` +
`MODEL = ${JSON.stringify(model)}\n` +
`MAX_STEPS = ${maxSteps}\n` +
`WORK = pathlib.Path('/kaggle/working')\n` +
`DATASET_DIR = WORK / 'world-brain'\n` +
`OUTPUT_DIR = WORK / 'world-brain-model'\n` +
`TRAINER = WORK / 'train-world-brain-unsloth.py'\n` +
`DATASET_DIR.mkdir(parents=True, exist_ok=True)\n` +
`payload = json.loads(gzip.decompress(base64.b64decode(DATA_B64)).decode('utf-8'))\n` +
`for name in ('train.jsonl', 'validation.jsonl', 'manifest.json'):\n` +
`    (DATASET_DIR / name).write_text(payload[name], encoding='utf-8')\n` +
`TRAINER.write_bytes(base64.b64decode(TRAINER_B64))\n` +
`subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'unsloth', 'datasets', 'trl'])\n` +
`import torch\n` +
`if not torch.cuda.is_available():\n` +
`    raise SystemExit('Kaggle GPU is not available for this run; leave the job pending and retry later.')\n` +
`print('GPU:', torch.cuda.get_device_name(0))\n` +
`cmd = [sys.executable, str(TRAINER), '--dataset-dir', str(DATASET_DIR), '--model', MODEL, '--output-dir', str(OUTPUT_DIR), '--max-steps', str(MAX_STEPS)]\n` +
`subprocess.check_call(cmd)\n` +
`print((OUTPUT_DIR / 'candidate-manifest.json').read_text(encoding='utf-8'))\n` +
`print((OUTPUT_DIR / 'metrics.json').read_text(encoding='utf-8'))\n`;
}

function prepareKaggleBundle(root, outDir, options = {}) {
  const policy = loadPolicy(root);
  const owner = normalizeOwner(options.owner) || 'OWNER_REQUIRED';
  const slug = normalizeSlug(options.slug);
  const accelerator = policy.freeGpuRouter.kaggle.accelerator || 'NvidiaTeslaT4';
  fs.mkdirSync(outDir, { recursive: true });
  const tempDataset = path.join(outDir, '.dataset-tmp');
  fs.rmSync(tempDataset, { recursive: true, force: true });
  const prepared = prepareDataset(root, tempDataset, policy);
  const verified = verifyDataset(tempDataset);
  if (!verified.ok) throw new Error('Prepared World Brain dataset failed verification');
  const datasetPayload = {};
  for (const name of ['train.jsonl', 'validation.jsonl', 'manifest.json']) {
    datasetPayload[name] = fs.readFileSync(path.join(tempDataset, name), 'utf8');
  }
  const trainerSource = fs.readFileSync(path.join(root, 'scripts', 'train-world-brain-unsloth.py'), 'utf8');
  const script = buildEmbeddedKaggleScript(datasetPayload, trainerSource, policy);
  const scriptPath = path.join(outDir, 'world-brain-kaggle.py');
  fs.writeFileSync(scriptPath, script, 'utf8');
  const metadata = {
    id: `${owner}/${slug}`,
    title: 'World Brain Unsloth Free GPU',
    code_file: 'world-brain-kaggle.py',
    language: 'python',
    kernel_type: 'script',
    is_private: true,
    enable_gpu: true,
    enable_internet: true,
    machine_shape: accelerator,
    dataset_sources: [],
    competition_sources: [],
    kernel_sources: [],
    model_sources: []
  };
  fs.writeFileSync(path.join(outDir, 'kernel-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  const manifest = {
    schemaVersion: '1.0.0',
    system: 'WORLD_BRAIN_KAGGLE_BUNDLE',
    sourceCommit: prepared.manifest.sourceCommit,
    datasetPolicyHash: prepared.manifest.policyHash,
    counts: prepared.stats,
    ownerRequired: owner === 'OWNER_REQUIRED',
    accelerator,
    privateKernel: true,
    containsCredentialMaterial: false,
    files: {
      'world-brain-kaggle.py': sha256(script),
      'kernel-metadata.json': sha256(fs.readFileSync(path.join(outDir, 'kernel-metadata.json')))
    },
    submitCommand: `kaggle kernels push -p ${path.basename(outDir)} --accelerator ${accelerator}`,
    note: 'The training dataset is embedded only inside the private kernel script; no Kaggle public dataset is created.'
  };
  fs.writeFileSync(path.join(outDir, 'bundle-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.rmSync(tempDataset, { recursive: true, force: true });
  return { outDir, metadata, manifest, verification: verified };
}

function submitKaggleBundle(bundleDir, options = {}) {
  const metadata = readJson(path.join(bundleDir, 'kernel-metadata.json'));
  if (!metadata.id || metadata.id.startsWith('OWNER_REQUIRED/')) {
    return { ok: false, status: 'NEEDS_OWNER', reason: 'Set a Kaggle username before submission.' };
  }
  const cliAvailable = options.kaggleCliAvailable ?? commandAvailable('kaggle');
  if (!cliAvailable) return { ok: false, status: 'NEEDS_CLI', reason: 'Kaggle CLI is not installed in this execution environment.' };
  const accelerator = metadata.machine_shape || 'NvidiaTeslaT4';
  const result = spawnSync('kaggle', ['kernels', 'push', '-p', bundleDir, '--accelerator', accelerator], {
    encoding: 'utf8',
    env: options.env || process.env,
    windowsHide: true
  });
  return {
    ok: result.status === 0,
    status: result.status === 0 ? 'SUBMITTED' : 'SUBMIT_FAILED',
    exitCode: result.status,
    stdout: (result.stdout || '').trim().slice(-4000),
    stderr: (result.stderr || '').trim().slice(-4000)
  };
}

module.exports = {
  buildGpuPlan,
  buildEmbeddedKaggleScript,
  commandAvailable,
  kaggleAuthState,
  normalizeOwner,
  normalizeSlug,
  prepareKaggleBundle,
  submitKaggleBundle
};
