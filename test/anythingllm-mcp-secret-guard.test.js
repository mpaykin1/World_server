'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { checkMcpFilesystemConfig, checkSecretGuard, MAIN_WORLD_SERVER_ROOT, SECRET_MARKERS } = require('../scripts/anythingllm-health-check');

function tmpMcpConfig(servers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allm-mcp-'));
  const cfgPath = path.join(dir, 'anythingllm_mcp_servers.json');
  fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: servers }, null, 2));
  return cfgPath;
}

test('sandbox worktree with no secret markers passes the guard', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'allm-sandbox-'));
  fs.writeFileSync(path.join(sandbox, 'package.json'), '{"name":"fixture"}');
  const cfgPath = tmpMcpConfig({ 'world-server-sandbox': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', sandbox] } });
  const mcp = checkMcpFilesystemConfig(cfgPath);
  assert.equal(mcp.configured, true);
  assert.equal(mcp.unsafeMainTreeGrant, false);
  const guard = checkSecretGuard(cfgPath);
  assert.equal(guard.status, 'PASS');
  assert.equal(guard.results[0].status, 'PASS_NO_SECRETS');
});

test('a scoped directory containing a secret marker fails the guard', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'allm-sandbox-secret-'));
  fs.writeFileSync(path.join(sandbox, SECRET_MARKERS[0]), 'API_KEY=do-not-read');
  const cfgPath = tmpMcpConfig({ 'world-server-sandbox': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', sandbox] } });
  const guard = checkSecretGuard(cfgPath);
  assert.equal(guard.status, 'FAIL');
  assert.equal(guard.results[0].status, 'FAIL_SECRET_PRESENT');
  assert.ok(guard.results[0].foundSecrets.includes(SECRET_MARKERS[0]));
});

test('a filesystem MCP server scoped to the live main World_server tree is flagged unsafe', () => {
  const cfgPath = tmpMcpConfig({ 'main-tree': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', MAIN_WORLD_SERVER_ROOT] } });
  const mcp = checkMcpFilesystemConfig(cfgPath);
  assert.equal(mcp.unsafeMainTreeGrant, true);
  assert.equal(mcp.unsafe[0].name, 'main-tree');
});

test('no MCP config file present is reported as not configured, not a silent pass', () => {
  const missingPath = path.join(os.tmpdir(), `allm-missing-${Date.now()}.json`);
  const mcp = checkMcpFilesystemConfig(missingPath);
  assert.equal(mcp.configured, false);
  const guard = checkSecretGuard(missingPath);
  assert.equal(guard.status, 'N/A');
});
