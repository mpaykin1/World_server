#!/usr/bin/env node
'use strict';
// OLLAMA_THINK_PROXY
//
// A minimal reverse proxy in front of the real Ollama server that injects
// "think": false into plain (non-tool) /api/generate and /api/chat requests.
//
// Root cause this exists: raw-Ollama A/B benchmark proved Qwen3's default
// "thinking" mode costs ~18x latency on a trivial single-turn query (42.06s
// with thinking vs 2.34s with think:false, same warm model, same prompt).
// AnythingLLM's own Ollama provider does not expose a "think" passthrough
// anywhere in its system settings, and a custom Modelfile TEMPLATE override
// was silently ignored (`ollama show` kept the GGUF's embedded Jinja template).
// Injecting the field at the HTTP layer is the one control point that reliably
// works for plain text generation.
//
// IMPORTANT, found via live E2E testing (see ANYTHINGLLM_AB_COMPARISON.json):
// forcing think:false on AGENTIC / tool-calling requests (body.tools present
// and non-empty) made the model produce empty/malformed responses instead of
// valid tool_call blocks, across multiple reproducible runs - going from
// "correct tool, wrong reasoning" or "wrong tool, real prose explaining why"
// (both seen with thinking on/unset) to literally empty content 6/6 times with
// thinking forced off. Re-enabling thinking for tool-calling turns did NOT
// regress to timeout-free reliability either (it still timed out at 150s
// without even attempting a tool call) - the honest conclusion is that
// qwen3:1.7b's tool-calling reliability under this harness is a genuine,
// currently-unresolved model-capability limitation, not something this proxy
// alone can fix. This proxy therefore ONLY touches plain (non-tool) requests
// by default - the "different profile for different task type" split the
// tools field itself already encodes, rather than a single global switch.
//
// Usage: OLLAMA_THINK_PROXY_PORT=11435 node ollama-think-proxy.cjs
const http = require('http');

const TARGET_HOST = process.env.OLLAMA_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.OLLAMA_TARGET_PORT || 11434);
const LISTEN_PORT = Number(process.env.OLLAMA_THINK_PROXY_PORT || 11435);
// Only applied when body.tools is absent/empty - see the header comment above
// for why tool-calling requests are left untouched (natural default: thinking on).
const FAST_PATH_THINK = process.env.OLLAMA_THINK_PROXY_FAST_PATH_THINK !== 'false';
const INJECT_PATHS = new Set(['/api/generate', '/api/chat']);

function shouldInject(path) {
  return INJECT_PATHS.has(path.split('?')[0]);
}

function hasTools(body) {
  return Array.isArray(body.tools) && body.tools.length > 0;
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
    const alreadySet = Object.prototype.hasOwnProperty.call(body, 'think');
    if (!alreadySet && !hasTools(body) && FAST_PATH_THINK) {
      body.think = false;
    }
    // Tool-calling requests (body.tools non-empty): deliberately left untouched -
    // do not set think:false, let the model use its natural default.
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
  console.log(`[OLLAMA_THINK_PROXY] listening on 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT} (fast-path think:false for non-tool requests only)`);
});

module.exports = { server };
