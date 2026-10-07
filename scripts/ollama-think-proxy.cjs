#!/usr/bin/env node
'use strict';
// OLLAMA_THINK_PROXY
//
// A minimal reverse proxy in front of the real Ollama server with two fixes for
// the AnythingLLM<->Ollama tool-calling defect (error-prevention-registry.json#
// anythingllm-ollama-tool-calling-fixed-timeout-signature):
//
// 1. Injects "think": false into plain (non-tool) requests - proven 18x latency
//    reduction (42.06s -> 2.34s, same prompt) for non-agentic queries.
//
// 2. Rewrites stream:true -> stream:false for TOOL-CALLING requests specifically
//    (body.tools non-empty), then re-wraps the single complete response as a
//    one-line NDJSON "stream" so AnythingLLM's client code (which always expects
//    a stream) still gets a response shape it understands. Root cause: a matrix
//    test isolated the defect to streaming mode itself - the exact same request
//    (qwen2.5:3b-instruct, same tool schema, same prompt) against raw Ollama
//    /api/chat succeeded in 59.6s with a valid tool_calls block when
//    stream:false, but timed out at 150s with zero tool-call ever produced when
//    stream:true (AnythingLLM's actual captured request always sets
//    stream:true). This is the adapter-level fix point #6 of the escalation
//    asked for: fix the proxy, not the whole system.
//
// Usage: OLLAMA_THINK_PROXY_PORT=11435 node ollama-think-proxy.cjs
const http = require('http');
const fs = require('fs');

const TARGET_HOST = process.env.OLLAMA_TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.OLLAMA_TARGET_PORT || 11434);
const LISTEN_PORT = Number(process.env.OLLAMA_THINK_PROXY_PORT || 11435);
const FAST_PATH_THINK = process.env.OLLAMA_THINK_PROXY_FAST_PATH_THINK !== 'false';
const DESTREAM_TOOL_CALLS = process.env.OLLAMA_THINK_PROXY_DESTREAM_TOOLS !== 'false';
const INJECT_PATHS = new Set(['/api/generate', '/api/chat']);
// Diagnostic-only capture, off by default - see error-prevention-registry.json
// entry above for what this was used to find. No secrets pass through this
// proxy (Ollama chat payloads only).
const DEBUG_CAPTURE_PATH = process.env.OLLAMA_THINK_PROXY_DEBUG_CAPTURE || null;
function captureLog(entry) {
  if (!DEBUG_CAPTURE_PATH) return;
  try { fs.appendFileSync(DEBUG_CAPTURE_PATH, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); } catch {}
}

function shouldInject(p) {
  return INJECT_PATHS.has(p.split('?')[0]);
}

function hasTools(body) {
  return Array.isArray(body.tools) && body.tools.length > 0;
}

const server = http.createServer((req, res) => {
  if (!shouldInject(req.url) || req.method !== 'POST') {
    forward(req, res, null, false);
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      forward(req, res, Buffer.concat(chunks), false);
      return;
    }
    const toolCall = hasTools(body);
    const alreadySet = Object.prototype.hasOwnProperty.call(body, 'think');
    if (!alreadySet && !toolCall && FAST_PATH_THINK) {
      body.think = false;
    }
    const wasStreaming = body.stream !== false; // Ollama defaults to streaming when omitted
    const destream = toolCall && wasStreaming && DESTREAM_TOOL_CALLS;
    if (destream) body.stream = false;
    const finalBody = Buffer.from(JSON.stringify(body));
    if (DEBUG_CAPTURE_PATH) {
      captureLog({ direction: 'request', path: req.url, model: body.model, hasTools: toolCall, toolCount: toolCall ? body.tools.length : 0, think: body.think, wasStreaming, destreamed: destream, messageCount: Array.isArray(body.messages) ? body.messages.length : null, body });
    }
    forward(req, res, finalBody, destream);
  });
});

function forward(req, res, overrideBody, wrapAsStream) {
  const headers = { ...req.headers };
  if (overrideBody) headers['content-length'] = Buffer.byteLength(overrideBody);
  delete headers['host'];
  const proxyReq = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, path: req.url, method: req.method, headers },
    (proxyRes) => {
      if (wrapAsStream) {
        // Ollama returns one complete JSON object for stream:false. AnythingLLM's
        // client always expects a stream (application/x-ndjson, one JSON object
        // per line, done:true on the last line) - a single-line "stream" with
        // that one already-done object satisfies that shape without touching
        // AnythingLLM itself.
        const chunks = [];
        proxyRes.on('data', (c) => chunks.push(c));
        proxyRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (DEBUG_CAPTURE_PATH) {
            let parsed = null;
            try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 2000) }; }
            captureLog({ direction: 'response', path: req.url, status: proxyRes.statusCode, destreamed: true, body: parsed });
          }
          res.writeHead(proxyRes.statusCode, { 'content-type': 'application/x-ndjson' });
          res.end(raw.trim() + '\n');
        });
        return;
      }
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      if (DEBUG_CAPTURE_PATH && shouldInject(req.url)) {
        const chunks = [];
        proxyRes.on('data', (c) => chunks.push(c));
        proxyRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 2000) }; }
          captureLog({ direction: 'response', path: req.url, status: proxyRes.statusCode, body: parsed });
        });
        proxyRes.pipe(res);
        return;
      }
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

// Node's http.Server defaults to requestTimeout=300000ms (5 min) and
// headersTimeout=60000ms since Node 18 - under real CPU contention, tool-
// calling turns were observed taking 150-350s+ (see error-prevention-
// registry.json#anythingllm-router-hint-tool-name-mismatch for the underlying
// fix that made these turns actually complete correctly). Without disabling
// these, Node itself force-closes the connection between AnythingLLM and this
// proxy once a request runs past 5 minutes, which surfaces on AnythingLLM's
// side as "[AIbitat] Provider error: fetch failed" - indistinguishable from a
// real network failure, but actually this proxy silently killing a request
// that was going to succeed. Disabled (0 = no timeout) since a slow-but-
// working local model turn should never be truncated by an invisible proxy
// default the actual LLM call itself has no knowledge of.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[OLLAMA_THINK_PROXY] listening on 127.0.0.1:${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT} (fast-path think:false for non-tool requests, destream tool-calling requests: ${DESTREAM_TOOL_CALLS}, requestTimeout disabled)`);
});

module.exports = { server };
