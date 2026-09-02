#!/usr/bin/env node
'use strict';
// OLLAMA_THINK_PROXY
//
// A minimal reverse proxy in front of the real Ollama server that injects
// "think": false into /api/generate and /api/chat request bodies by default.
//
// Root cause this exists: raw-Ollama A/B benchmark proved Qwen3's default
// "thinking" mode costs ~18x latency on a trivial single-turn query (42.06s
// with thinking vs 2.34s with think:false, same warm model, same prompt -
// see ANYTHINGLLM_OLLAMA_BENCHMARK.json). AnythingLLM's own Ollama provider
// does not expose a "think" passthrough option anywhere in its system
// settings (checked: no ThinkEnabled/Reasoning/-prefixed key exists), and a
// custom Modelfile TEMPLATE override was silently ignored - `ollama show`
// on the derived model still returned the GGUF's embedded Jinja chat
// template, not the Go template supplied via Modelfile. Injecting the field
// at the HTTP layer is the one control point that reliably works, proven by
// direct API testing (see ANYTHINGLLM_OLLAMA_BENCHMARK.json).
//
// Per-request override: a client can still force thinking on for a specific
// call by sending its own top-level "think" field - this proxy only fills in
// the default when the field is absent, so a reasoning-heavy task classified
// by lib/mcp-intent-router.js as needing a stronger model can still opt in.
//
// Usage: OLLAMA_THINK_PROXY_PORT=11435 node ollama-think-proxy.cjs
const http = require('http');

const TARGET_HOST = process.env.OLLAMA_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.OLLAMA_TARGET_PORT || 11434);
const LISTEN_PORT = Number(process.env.OLLAMA_THINK_PROXY_PORT || 11435);
const DEFAULT_THINK = process.env.OLLAMA_THINK_PROXY_DEFAULT_THINK === 'true';
const INJECT_PATHS = new Set(['/api/generate', '/api/chat']);

function shouldInject(path) {
  return INJECT_PATHS.has(path.split('?')[0]);
}

const server = http.createServer((req, res) => {
  if (!shouldInject(req.url) || req.method !== 'POST') {
    forward(req, res, null);
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      forward(req, res, Buffer.concat(chunks));
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(body, 'think')) {
      body.think = DEFAULT_THINK;
    }
    forward(req, res, Buffer.from(JSON.stringify(body)));
  });
});

function forward(req, res, overrideBody) {
  const headers = { ...req.headers };
  if (overrideBody) headers['content-length'] = Buffer.byteLength(overrideBody);
  delete headers['host'];
  const proxyReq = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', (e) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `ollama-think-proxy: upstream error: ${e.message}` }));
  });
  if (overrideBody) proxyReq.end(overrideBody);
  else req.pipe(proxyReq);
}

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[OLLAMA_THINK_PROXY] listening on 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT} (default think=${DEFAULT_THINK})`);
});

module.exports = { server };
