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

function withProxy(profile, fn) {
  return new Promise((resolve, reject) => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-sandbox-'));
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { a: '1', b: '2' } }));
    const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proxy-profile-'));
    const profileFile = path.join(profilePath, 'profile.json');
    fs.writeFileSync(profileFile, JSON.stringify({ capabilityClass: 'test', allowedTools: profile }));

    const child = spawn(process.execPath, [PROXY, sandbox, profileFile], { stdio: ['pipe', 'pipe', 'pipe'] });
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
