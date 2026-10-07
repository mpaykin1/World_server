#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PROVIDER_ERROR_PATTERNS = [
  /provider returned error/i,
  /unknownerror/i,
  /unexpected server error/i,
  /rate.?limit/i,
  /\b429\b/,
  /overload/i,
  /temporar(?:y|ily)/i,
  /unavailable/i,
  /timeout/i,
  /fetch failed/i,
  /connection (?:reset|closed|refused)/i,
  /no endpoints? (?:found|available)/i,
];

function isTransientProviderFailure(text) {
  return PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(String(text || '')));
}

function readModels(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}
function buildConfig(modelId) {
  return {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      worldrouter: {
        npm: '@ai-sdk/openai-compatible',
        name: 'World OpenRouter',
        options: {
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: '{env:OPENROUTER_API_KEY}',
        },
        models: {
          [modelId]: {
            name: modelId,
            limit: { context: 200000, output: 32768 },
          },
        },
      },
    },
  };
}

function resetAttempt(cwd) {
  cp.spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd, stdio: 'ignore', windowsHide: true });
  cp.spawnSync('git', ['clean', '-fd'], { cwd, stdio: 'ignore', windowsHide: true });
}
function appendGithubEnv(modelId, configPath) {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) return;
  fs.appendFileSync(envFile, `MODEL=worldrouter/${modelId}\nOPENCODE_CONFIG=${configPath}\n`);
}

function runOne(modelId, prompt, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const tempDir = opts.tempDir || process.env.RUNNER_TEMP || require('os').tmpdir();
  const safe = modelId.replace(/[^A-Za-z0-9._-]/g, '_');
  const configPath = path.join(tempDir, `world-opencode-${safe}.json`);
  fs.writeFileSync(configPath, JSON.stringify(buildConfig(modelId), null, 2) + '\n');

  const env = { ...process.env, OPENCODE_CONFIG: configPath };
  const bin = process.env.OPENCODE_BIN || 'opencode';
  const r = cp.spawnSync(bin, ['run', '--model', `worldrouter/${modelId}`, '--agent', 'build', prompt], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: opts.timeoutMs || 20 * 60 * 1000,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return { modelId, configPath, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error || null };
}
function runWithFailover(prompt, opts = {}) {
  const models = opts.models || readModels(opts.modelsFile);
  if (!models.length) return { ok: false, result: 'NO_FREE_MODEL', attempts: [] };
  const attempts = [];
  const runOneFn = opts.runOneFn || runOne;
  const resetFn = opts.resetFn || resetAttempt;

  for (let index = 0; index < models.length; index += 1) {
    if (index > 0) resetFn(opts.cwd || process.cwd());
    const run = runOneFn(models[index], prompt, opts);
    const combined = `${run.stdout}\n${run.stderr}\n${run.error ? String(run.error) : ''}`;
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    attempts.push({ modelId: run.modelId, status: run.status, transientProviderFailure: isTransientProviderFailure(combined) });

    if (run.status === 0 && !run.error) {
      appendGithubEnv(run.modelId, run.configPath);
      return { ok: true, result: 'PASS', modelId: run.modelId, attempts };
    }
    if (!isTransientProviderFailure(combined)) {
      return { ok: false, result: 'AGENT_FAIL', modelId: run.modelId, attempts };
    }
    console.error(`Provider failure on ${run.modelId}; trying next approved zero-cost model.`);
  }

  return { ok: false, result: 'ALL_FREE_PROVIDERS_FAILED', attempts };
}
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (require.main === module) {
  const promptFile = argValue('--prompt-file');
  const modelsFile = argValue('--models-file') || process.env.WORLD_FREE_MODELS_FILE;
  if (!promptFile || !modelsFile) {
    console.error('usage: node world-cloud-opencode-failover.cjs --prompt-file <file> --models-file <file>');
    process.exit(2);
  }
  const prompt = fs.readFileSync(promptFile, 'utf8');
  const result = runWithFailover(prompt, { modelsFile });
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

module.exports = {
  PROVIDER_ERROR_PATTERNS,
  isTransientProviderFailure,
  readModels,
  buildConfig,
  resetAttempt,
  runOne,
  runWithFailover,
};
