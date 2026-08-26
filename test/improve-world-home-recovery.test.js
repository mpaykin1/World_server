'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression guard for the recovered `improve-world-home` frontend
// (recovered 2026-08-26 from the live production deployment's served
// assets — Vercel's Deployment Files API was checked and found
// inaccessible with any tool available in this session; see
// WORK_IN_PROGRESS.md for the full provenance record). This is the
// canonical source now — these tests exist so a later change can't
// silently drop the questionnaire content or the app's own built-in
// IW_CONTRACT regression guard.

const APP_DIR = path.join(__dirname, '..', 'apps', 'improve-world-home');

test('apps/improve-world-home/index.html and client.js exist', () => {
  assert.ok(fs.existsSync(path.join(APP_DIR, 'index.html')));
  assert.ok(fs.existsSync(path.join(APP_DIR, 'client.js')));
});

test('client.js keeps the exact CREATE (31) and JOIN (28) questionnaire lengths', () => {
  const source = fs.readFileSync(path.join(APP_DIR, 'client.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  const { CREATE, JOIN } = new Function(`${source}\nreturn { CREATE, JOIN };`.replace(
    // The recovered file calls verifyContract()/home() at load time, which
    // touch `document`/`location` — stub just enough to evaluate the file
    // for its data arrays without a real DOM.
    'verifyContract();location.hash===\'#why\'?showWhy():home();',
    ''
  ))();
  assert.equal(CREATE.length, 31, 'CREATE questionnaire must stay at 31 questions (IW_CONTRACT)');
  assert.equal(JOIN.length, 28, 'JOIN questionnaire must stay at 28 questions (IW_CONTRACT)');
});

test('client.js still contains its own IW_CONTRACT runtime regression guard', () => {
  const source = fs.readFileSync(path.join(APP_DIR, 'client.js'), 'utf8');
  assert.ok(source.includes('IW_CONTRACT'), 'the app\'s own built-in regression guard must not be removed');
  assert.ok(source.includes("rule:'ADD_ONLY'"), 'the ADD_ONLY contract rule must not be weakened');
});

test('index.html declares the same ADD_ONLY regression contract in its meta tag', () => {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  assert.match(html, /iw-regression-contract/);
  assert.match(html, /create=31/);
  assert.match(html, /join=28/);
});

test('index.html references client.js as a root-relative script (standalone Vercel deployment, not nested under /apps/)', () => {
  const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
  assert.match(html, /<script src="\/client\.js">/);
});

test('apps/improve-world-home/vercel.json disables the build step (no build tooling was recovered, and none is needed for two static files)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'vercel.json'), 'utf8'));
  assert.equal(config.buildCommand, null);
});
