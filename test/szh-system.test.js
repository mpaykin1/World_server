'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('SZH living writing system is registered as canonical AI context', () => {
  const index = JSON.parse(read('.ai/project-context-index.json'));
  const szh = index.concepts && index.concepts.szh;

  assert.ok(szh, 'project context index must register SZH');
  assert.equal(szh.canonicalFile, 'docs/SZH_SYSTEM_RU.md');
  assert.ok(szh.aliases.includes('СЖ'));
  assert.ok(szh.aliases.includes('СП'));
  assert.ok(index.canonicalContextFiles.includes('docs/SZH_SYSTEM_RU.md'));
  assert.ok(index.canonicalContextFiles.includes('.ai/szh-writing-system.json'));
  assert.deepEqual(index.freshChatMandatoryReads.userWriting, [
    'AI_START_HERE.md',
    '.ai/project-context-index.json',
    'docs/SZH_SYSTEM_RU.md',
    '.ai/szh-writing-system.json',
    'lib/szh-writing-system.js'
  ]);
});

test('SZH machine contract preserves user-edit precedence and explicit canon updates', () => {
  const rules = JSON.parse(read('.ai/szh-writing-system.json'));

  assert.equal(rules.id, 'szh');
  assert.equal(rules.canonicalFile, 'docs/SZH_SYSTEM_RU.md');
  assert.ok(rules.rules.length >= 15);
  assert.equal(rules.orthographyPolicy.name, 'functional_roughness');
  assert.equal(rules.learningPolicy.userEditIsStrongerEvidenceThanAssistantDraft, true);
  assert.equal(rules.learningPolicy.updateCanonicalRulesOnlyAfterExplicitUserInstruction, true);
  assert.equal(rules.learningPolicy.doNotSelfDeclareSuccessOrFailure, true);
  assert.equal(rules.activation.defaultForPersonalAuthoredTextsForUser, true);
});

test('SZH human-readable canon is discoverable from AI_START_HERE', () => {
  const start = read('AI_START_HERE.md');
  const canon = read('docs/SZH_SYSTEM_RU.md');

  assert.match(start, /СЖ — источник истины/);
  assert.match(start, /docs\/SZH_SYSTEM_RU\.md/);
  assert.match(start, /\.ai\/szh-writing-system\.json/);
  assert.match(canon, /функциональная шероховатость/i);
  assert.match(canon, /не менять каноническую СЖ без явной команды/i);
});


test('SZH executable resolver activates and preserves user precedence', () => {
  const { buildSzhContext, buildSzhPrompt, shouldActivateSzh } = require('../lib/szh-writing-system');

  assert.equal(shouldActivateSzh({ request: 'напиши по СЖ', personalAuthoredText: false }), true);
  assert.equal(shouldActivateSzh({ request: 'technical note', personalAuthoredText: false }), false);

  const context = buildSzhContext({
    request: 'перепиши текст',
    latestUserEdit: 'мой живой вариант',
    currentStyleInstruction: 'короче и жёстче',
    personalAuthoredText: true
  });
  assert.equal(context.active, true);
  assert.equal(context.latestUserEdit, 'мой живой вариант');
  assert.equal(context.currentStyleInstruction, 'короче и жёстче');

  const prompt = buildSzhPrompt({
    latestUserEdit: 'мой живой вариант',
    currentStyleInstruction: 'короче и жёстче',
    personalAuthoredText: true
  });
  assert.ok(prompt.indexOf('LATEST USER EDIT') < prompt.indexOf('CURRENT STYLE INSTRUCTION'));
  assert.ok(prompt.indexOf('CURRENT STYLE INSTRUCTION') < prompt.indexOf('SZH CORE FORMULA'));
});


test('SZH CLI honors --request even when personal default is disabled', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'szh-context.js'), '--not-personal', '--request', 'напиши по СЖ'],
    { encoding: 'utf8' }
  );
  const context = JSON.parse(output);
  assert.equal(context.active, true);
  assert.equal(context.id, 'szh');
});

test('SZH inactive context keeps a stable safe shape', () => {
  const { buildSzhContext } = require('../lib/szh-writing-system');
  const context = buildSzhContext({ request: 'technical note', personalAuthoredText: false });
  assert.equal(context.active, false);
  assert.deepEqual(context.rules, []);
  assert.deepEqual(context.selfCheck, []);
  assert.equal(context.latestUserEdit, null);
  assert.equal(context.currentStyleInstruction, null);
});
