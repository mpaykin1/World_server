#!/usr/bin/env node
'use strict';

const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-coder:6.7b';
const MAX_DIFF_CHARS = Math.max(0, Number(process.env.DEEPSEEK_MAX_DIFF_CHARS || 12000));
const OLLAMA = new URL(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');

function gitText(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  } catch {
    return fallback;
  }
}

function askDeepSeek(prompt, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0, num_ctx: 4096, num_predict: 256 } });
    const req = http.request({
      hostname: OLLAMA.hostname,
      port: OLLAMA.port || 11434,
      path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`ollama_http_${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('deepseek_timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const task = process.argv.slice(2).join(' ').trim() || 'Review the current work.';
  const status = gitText(['status', '--short']).slice(0, 12000);
  const diff = gitText(['diff', '--no-ext-diff', '--unified=2']).slice(0, MAX_DIFF_CHARS);
  const prompt = [
    'You are an independent senior code reviewer collaborating with another developer.',
    'Be concise. Find concrete defects, regressions, missing tests, weak assumptions, and simpler fixes.',
    'Do not invent files or behavior. If evidence is insufficient, say so.',
    `TASK:\n${task}`,
    `GIT STATUS:\n${status || '(clean tracked tree)'}`,
    `GIT DIFF:\n${diff || '(no tracked diff)'}`,
    'Return: BLOCKERS, RISKS, TESTS TO RUN, RECOMMENDED PATCH. Use NONE where appropriate.',
  ].join('\n\n');
  const response = await askDeepSeek(prompt);
  const text = response && response.response;
  if (!text) throw new Error('deepseek_empty_response');
  process.stdout.write(`DEEPSEEK_MODEL=${MODEL}\n\n${text.trim()}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`DEEPSEEK_REVIEW_FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { askDeepSeek, gitText };
