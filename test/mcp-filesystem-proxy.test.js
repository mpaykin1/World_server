'use strict';
// Spawns the real proxy (which itself spawns the real @modelcontextprotocol/server-filesystem
// via npx) against a throwaway temp directory, and drives it over real stdio JSON-RPC -
// this is a structural proof that tools/list is actually filtered, not a mock of the logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const readline = require('readline');

const PROXY = path.join(__dirname, '..', 'scripts', 'mcp-filesystem-proxy.cjs');

function withProxy(profile, fn, extraEnv = {}, sandboxPrefix = 'mcp-proxy-sandbox-') {
  return new Promise((resolve, reject) => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), sandboxPrefix));
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { a: '1', b: '2' } }));
    const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-profile-'));
    const profileFile = path.join(profilePath, 'profile.json');
    fs.writeFileSync(profileFile, JSON.stringify({ capabilityClass: 'test', allowedTools: profile }));

    const child = spawn(process.execPath, [PROXY, sandbox, profileFile], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
    const rl = readline.createInterface({ input: child.stdout, terminal: false });
    const pending = new Map();
    let nextId = 1;
    function call(method, params) {
      const id = nextId++;
      return new Promise((res) => {
        pending.set(id, res);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }
    rl.on('line', (line) => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    });

    let settled = false;
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); reject(new Error('proxy test timed out')); } }, 30000);

    fn(call, sandbox).then((r) => { settled = true; clearTimeout(timer); child.kill(); resolve(r); })
      .catch((e) => { settled = true; clearTimeout(timer); child.kill(); reject(e); });
  });
}

test('proxy advertises only the read-profile tools, never document-summarizer or write tools', { timeout: 35000 }, async () => {
  const result = await withProxy(['list_directory', 'search_files', 'read_file', 'read_text_file'], async (call) => {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    const listRes = await call('tools/list', {});
    return listRes;
  });
  const names = result.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['list_directory', 'read_file', 'read_text_file', 'search_files']);
  assert.ok(!names.includes('write_file'));
  assert.ok(!names.includes('edit_file'));
});

test('proxy rejects a tools/call for a tool outside the current profile with capability_mismatch', { timeout: 35000 }, async () => {
  const result = await withProxy(['list_directory', 'search_files', 'read_file', 'read_text_file'], async (call) => {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    return call('tools/call', { name: 'write_file', arguments: { path: 'x.txt', content: 'nope' } });
  });
  assert.ok(result.error);
  assert.match(result.error.message, /capability_mismatch/);
});

test('a real read_text_file call through the proxy returns the fixture package.json content', { timeout: 35000 }, async () => {
  const { readRes } = await withProxy(['list_directory', 'search_files', 'read_file', 'read_text_file'], async (call, sandbox) => {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    const readRes = await call('tools/call', { name: 'read_text_file', arguments: { path: path.join(sandbox, 'package.json') } });
    return { readRes };
  });
  assert.ok(!readRes.error, JSON.stringify(readRes));
  const content = readRes.result.content[0].text;
  const parsed = JSON.parse(content);
  assert.equal(parsed.name, 'fixture');
  assert.equal(Object.keys(parsed.scripts).length, 2);
});

// Real bug found live: this project's real sandbox lives under a path with a
// space ("...\World_server AI\World_server_anythingllm_sandbox"). The proxy
// spawns npx with {shell:true}, which on Windows hands the args array to
// cmd.exe as a plain space-joined string WITHOUT quoting each element -
// sandboxRoot's embedded space silently split into two separate cmd.exe
// tokens, so @modelcontextprotocol/server-filesystem never received the real
// directory ("Cannot access directory ...\<cwd>\AI\...sandbox, skipping") and
// AnythingLLM's MCPHypervisor reported 0 servers started even though its
// config file correctly pointed at this exact proxy. None of the existing
// tests above caught this because os.tmpdir() sandboxes happen not to
// contain a space. Fixed via shellQuote() wrapping sandboxRoot before it
// reaches the shell:true spawn.
test('a sandbox path containing a space (this project real path shape) still resolves correctly - not silently swapped for a cwd-derived path', { timeout: 35000 }, async () => {
  const { readRes } = await withProxy(['list_directory', 'search_files', 'read_file', 'read_text_file'], async (call, sandbox) => {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    const readRes = await call('tools/call', { name: 'read_text_file', arguments: { path: path.join(sandbox, 'package.json') } });
    return { readRes };
  }, {}, 'mcp proxy sandbox with space-');
  assert.ok(!readRes.error, JSON.stringify(readRes));
  const content = readRes.result.content[0].text;
  assert.equal(JSON.parse(content).name, 'fixture');
});

test('a real tools/call is recorded into the tool-cost ledger with a real latency', { timeout: 35000 }, async () => {
  const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-costledger-'));
  const ledgerPath = path.join(ledgerDir, 'ledger.json');
  await withProxy(['list_directory', 'search_files', 'read_file', 'read_text_file'], async (call, sandbox) => {
    await call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    await call('tools/call', { name: 'read_text_file', arguments: { path: path.join(sandbox, 'package.json') } });
  }, { TOOL_COST_LEDGER_PATH: ledgerPath });
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assert.ok(ledger.entries.read_text_file, JSON.stringify(ledger));
  const entry = ledger.entries.read_text_file.history[0];
  assert.equal(entry.outcome, 'success');
  assert.ok(typeof entry.latencyMs === 'number' && entry.latencyMs >= 0);
});
