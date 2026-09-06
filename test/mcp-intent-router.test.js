'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyIntent, route, PROFILES } = require('../lib/mcp-intent-router');

test('the exact failing E2E prompt classifies as filesystem-read', () => {
  const c = classifyIntent('Find package.json in your workspace, read it, and tell me the value of the "name" field and how many scripts are defined.');
  assert.equal(c, 'filesystem-read');
});

test('filesystem-read allowlist never contains document-summarizer', () => {
  assert.ok(!PROFILES['filesystem-read'].includes('document-summarizer'));
});

test('no capability class ever allows document-summarizer, rag-memory, or web-scraping', () => {
  for (const [cls, tools] of Object.entries(PROFILES)) {
    for (const builtin of ['document-summarizer', 'rag-memory', 'web-scraping']) {
      assert.ok(!tools.includes(builtin), `class '${cls}' must not allow built-in '${builtin}'`);
    }
  }
});

test('a plain read task resolves to exactly the 4-tool minimal filesystem-read set', () => {
  const r = route('прочитай файл package.json и скажи что в нём');
  assert.equal(r.capabilityClass, 'filesystem-read');
  assert.deepEqual(r.allowedTools.sort(), ['list_directory', 'read_file', 'read_text_file', 'search_files'].sort());
});

test('a write/edit task resolves to filesystem-write and includes edit_file+write_file', () => {
  const r = route('fix the bug in server.js and update the file');
  assert.equal(r.capabilityClass, 'filesystem-write');
  assert.ok(r.allowedTools.includes('edit_file'));
  assert.ok(r.allowedTools.includes('write_file'));
});

test('a pure search task resolves to filesystem-search, no write tools', () => {
  const r = route('где находится функция initGame в проекте');
  assert.equal(r.capabilityClass, 'filesystem-search');
  assert.ok(!r.allowedTools.includes('write_file'));
  assert.ok(!r.allowedTools.includes('edit_file'));
});

test('a task that only asks to find/locate a file (no read/show wording) still resolves to a profile with search tools available', () => {
  const r = route('найди файл где находится функция initGame');
  // "найди" is genuinely ambiguous between search and read intent - it resolves to
  // filesystem-read here, which is fine functionally (that profile still includes
  // list_directory+search_files), just documented so the ambiguity is explicit.
  assert.equal(r.capabilityClass, 'filesystem-read');
  assert.ok(r.allowedTools.includes('search_files'));
});

test('git/test/doc intents are recognized but fall back to the safe read-only default (no tool provider wired up yet)', () => {
  assert.equal(classifyIntent('commit this to git and open a PR'), 'git');
  assert.deepEqual(route('commit this to git and open a PR').allowedTools, []);
  assert.equal(classifyIntent('run the tests'), 'test');
});

test('an unrelated/unknown task falls back to the minimal read-only default, not the full 15-tool set', () => {
  const r = route('what time is it');
  assert.equal(r.capabilityClass, 'unknown');
  assert.ok(r.allowedTools.length <= 4);
});
