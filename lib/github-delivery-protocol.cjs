'use strict';

// Offline protocol only: an independently authorized adapter supplies GitHub I/O.
// Reconciliation bounds duplicate risk; it does not promise exactly-once writes.
const { createHash } = require('node:crypto');

const INPUT_KEYS = ['repo', 'base', 'head', 'sha', 'title', 'body'];
const MANIFEST_KEYS = ['schemaVersion', 'operation', ...INPUT_KEYS, 'id'];
const PR_KEYS = ['repo', 'number', 'url', 'head', 'base', 'sha', 'body', 'draft', 'state'];
const RECEIPT_KEYS = ['schemaVersion', 'operationId', 'status', 'repo', 'number', 'url', 'sha'];
const BASES = Object.freeze({ 'mpaykin1/World_server': 'master', 'mpaykin1/meta6': 'main' });
const MARKER_PREFIX = '<!-- graf-github-delivery:';

class ProtocolError extends Error {
  constructor(code) {
    super(`GitHub delivery protocol: ${code}`);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

function reject(code) { throw new ProtocolError(code); }

function exactObject(value, keys, code = 'INVALID_MANIFEST') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) reject(code);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject(code);
  }
}

function validSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value) && !/^0+$/.test(value);
}

function validHead(value) {
  if (typeof value !== 'string' || value.length > 200 || !value.startsWith('ai/')) return false;
  const parts = value.split('/');
  return parts.length >= 3 && parts.every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)
    && !part.includes('..') && !part.endsWith('.') && !part.endsWith('.lock'));
}

function canonicalInput(input) {
  exactObject(input, INPUT_KEYS);
  if (typeof input.repo !== 'string' || !Object.hasOwn(BASES, input.repo)
    || input.base !== BASES[input.repo]) reject('INVALID_TARGET');
  if (!validHead(input.head) || !validSha(input.sha)) reject('INVALID_SOURCE');
  if (typeof input.title !== 'string' || !input.title || input.title.length > 200
    || input.title.trim() !== input.title || /[\x00-\x1f\x7f]/.test(input.title)) reject('INVALID_TITLE');
  if (typeof input.body !== 'string' || input.body.length > 32000
    || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.body)
    || input.body.includes(MARKER_PREFIX)) reject('INVALID_BODY');
  return Object.fromEntries(INPUT_KEYS.map(key => [key, input[key]]));
}

function createManifest(input) {
  const normalized = canonicalInput(input);
  const core = { schemaVersion: 1, operation: 'create-draft-pr', ...normalized };
  const id = createHash('sha256').update(JSON.stringify(core)).digest('hex');
  return Object.freeze({ ...core, id });
}

function validateManifest(manifest) {
  exactObject(manifest, MANIFEST_KEYS);
  if (manifest.schemaVersion !== 1 || manifest.operation !== 'create-draft-pr') reject('INVALID_OPERATION');
  const expected = createManifest(Object.fromEntries(INPUT_KEYS.map(key => [key, manifest[key]])));
  if (manifest.id !== expected.id) reject('INVALID_ID');
  return expected;
}

function operationMarker(manifest) {
  return `${MARKER_PREFIX}${validateManifest(manifest).id} -->`;
}

function requestBody(manifest) {
  return `${manifest.body}\n\n${MARKER_PREFIX}${manifest.id} -->`;
}

function verifyPr(value, manifest) {
  exactObject(value, PR_KEYS, 'PR_CONFLICT');
  if (!Number.isSafeInteger(value.number) || value.number < 1 || value.number > 2147483647
    || value.url !== `https://github.com/${manifest.repo}/pull/${value.number}`
    || value.repo !== manifest.repo || value.base !== manifest.base || value.head !== manifest.head
    || value.sha !== manifest.sha || value.draft !== true || value.state !== 'open'
    || value.body !== requestBody(manifest)) {
    reject('PR_CONFLICT');
  }
  return Object.freeze(Object.fromEntries(PR_KEYS.map(key => [key, value[key]])));
}

function validateReceipt(receipt, inputManifest) {
  const manifest = validateManifest(inputManifest);
  exactObject(receipt, RECEIPT_KEYS, 'INVALID_RECEIPT');
  if (receipt.schemaVersion !== 1 || receipt.operationId !== manifest.id
    || !['created', 'reused'].includes(receipt.status) || receipt.repo !== manifest.repo
    || receipt.sha !== manifest.sha || !Number.isSafeInteger(receipt.number)
    || receipt.number < 1 || receipt.number > 2147483647
    || receipt.url !== `https://github.com/${manifest.repo}/pull/${receipt.number}`) reject('INVALID_RECEIPT');
  return Object.freeze(Object.fromEntries(RECEIPT_KEYS.map(key => [key, receipt[key]])));
}

function receiptFor(pr, manifest, status) {
  return validateReceipt({ schemaVersion: 1, operationId: manifest.id, status,
    repo: manifest.repo, number: pr.number, url: pr.url, sha: manifest.sha }, manifest);
}

async function read(adapter, method, payload) {
  try { return await adapter[method](Object.freeze(payload)); }
  catch { reject('READ_UNAVAILABLE'); }
}

async function reconcileDraftPullRequest(inputManifest, adapter) {
  const manifest = validateManifest(inputManifest);
  if (!adapter || ['resolveHead', 'findPullRequest', 'createDraftPullRequest']
    .some(method => typeof adapter[method] !== 'function')) reject('INVALID_ADAPTER');
  const source = { repo: manifest.repo, head: manifest.head };
  const identity = { ...source, base: manifest.base };
  const currentSha = await read(adapter, 'resolveHead', source);
  if (currentSha !== manifest.sha) reject('STALE_SOURCE');
  const existing = await read(adapter, 'findPullRequest', identity);
  if (existing !== null) return receiptFor(verifyPr(existing, manifest), manifest, 'reused');
  let created;
  try {
    created = await adapter.createDraftPullRequest(Object.freeze({ ...identity, sha: manifest.sha,
      title: manifest.title, body: requestBody(manifest), draft: true }));
  } catch {
    // An uncertain POST must be reconciled by a new invocation, never retried here.
    reject('WRITE_UNCERTAIN');
  }
  created = verifyPr(created, manifest);
  const verified = verifyPr(await read(adapter, 'findPullRequest', identity), manifest);
  if (verified.number !== created.number || verified.url !== created.url) reject('PR_CONFLICT');
  return receiptFor(verified, manifest, 'created');
}

module.exports = { ProtocolError, createManifest, validateManifest, operationMarker,
  validateReceipt, reconcileDraftPullRequest };
