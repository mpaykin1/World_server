'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewriteUbuntuMirror } = require('../scripts/configure-ubuntu-apt-mirror.cjs');
test('deb822 archive substitution preserves suites, components and signing key', () => {
  const suffix = '\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
  assert.equal(rewriteUbuntuMirror('Types: deb\nURIs: http://azure.archive.ubuntu.com/ubuntu/' + suffix),
    'Types: deb\nURIs: https://archive.ubuntu.com/ubuntu/' + suffix);
});
test('legacy list and runner mirror file use canonical HTTPS archive idempotently', () => {
  for (const input of ['deb http://azure.archive.ubuntu.com/ubuntu noble main\n',
    'https://azure.archive.ubuntu.com/ubuntu/\nhttps://security.ubuntu.com/ubuntu/\n']) {
    const result = rewriteUbuntuMirror(input);
    assert.ok(result.includes('https://archive.ubuntu.com/ubuntu'));
    assert.equal(rewriteUbuntuMirror(result), result);
  }
});
test('unrelated hosts, paths and trust configuration are unchanged', () => {
  const input = 'https://azure.archive.ubuntu.com.evil/ubuntu\nhttps://azure.archive.ubuntu.com/ubuntu-other\nhttps://security.ubuntu.com/ubuntu\nSigned-By: key\nTrusted: no\n';
  assert.equal(rewriteUbuntuMirror(input), input);
});
