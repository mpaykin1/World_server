'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeName, normalizedName, accountEmail, validUuid } = require('../lib/auth');

test('usernames keep the existing Cyrillic and Latin contract', () => {
  assert.equal(safeName('  Игрок_One!  '), 'Игрок_One');
  assert.equal(normalizedName('Игрок_One'), 'игрок_one');
});

test('synthetic auth email is deterministic and does not expose username', () => {
  const email = accountEmail('Игрок_One');
  assert.equal(email, accountEmail('игрок_one'));
  assert.match(email, /^u_[a-f0-9]{64}@accounts\.world\.invalid$/);
  assert.equal(email.includes('игрок'), false);
});

test('guest identifiers must be UUIDs', () => {
  assert.equal(validUuid('20000000-0000-4000-8000-000000000001'), true);
  assert.equal(validUuid('../../data/users.json'), false);
});
