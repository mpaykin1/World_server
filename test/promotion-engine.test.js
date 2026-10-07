const test = require('node:test');
const assert = require('node:assert/strict');

async function core() { return import('../lib/promotion-engine.mjs'); }

const campaign = {
  id: 'private_workshops',
  targetSectors: ['Information Technology & Services', 'Financial Services'],
  needSignals: ['communication', 'change', 'leadership'],
  offer: { ru: 'командный театр-воркшоп', en: 'a team theatre workshop' },
  subject: { ru: 'Командный воркшоп', en: 'Team workshop' }
};

test('high-fit prospect requires cited evidence for evidenceReady', async () => {
  const { scoreProspect } = await core();
  const scored = scoreProspect(campaign, {
    company: 'Example',
    location: 'Tbilisi, Georgia',
    sector: 'Information Technology & Services',
    needSignals: ['communication', 'change'],
    publicFact: 'The public careers page mentions team learning.',
    sourceUrl: 'https://example.com/careers'
  });
  assert.ok(scored.score >= 75);
  assert.equal(scored.evidenceReady, true);
  assert.equal(scored.autoSendAllowed, false);
  assert.equal(scored.humanReviewRequired, true);
});

test('uncited personalization never counts as evidence ready', async () => {
  const { scoreProspect } = await core();
  const scored = scoreProspect(campaign, {
    location: 'Tbilisi, Georgia',
    sector: 'Financial Services',
    publicFact: 'Some unsupported claim'
  });
  assert.equal(scored.evidenceReady, false);
  assert.ok(scored.cautions.some((x) => x.includes('no source URL')));
});

test('opt-out hard-stops prospect score', async () => {
  const { scoreProspect } = await core();
  const scored = scoreProspect(campaign, {
    location: 'Tbilisi, Georgia',
    sector: 'Financial Services',
    needSignals: ['communication'],
    publicFact: 'Fact',
    sourceUrl: 'https://example.com',
    optOut: true
  });
  assert.equal(scored.score, 0);
  assert.ok(scored.cautions.some((x) => x.includes('Do not contact')));
});

test('email draft does not fabricate personal knowledge when evidence is absent', async () => {
  const { buildEmailDraft } = await core();
  const draft = buildEmailDraft({ language: 'en', campaign, prospect: { company: 'Example Co' }, role: 'HR Manager' });
  assert.match(draft.body, /without pretending we already know each other/i);
  assert.equal(draft.evidenceUsed, false);
  assert.equal(draft.autoSendAllowed, false);
});

test('email draft cites supplied public source when evidence exists', async () => {
  const { buildEmailDraft } = await core();
  const draft = buildEmailDraft({
    language: 'ru', campaign,
    prospect: { company: 'Example Co', publicFact: 'Есть публичная программа обучения.', sourceUrl: 'https://example.com/learning' },
    role: 'HR Manager'
  });
  assert.match(draft.body, /https:\/\/example\.com\/learning/);
  assert.equal(draft.evidenceUsed, true);
});

test('campaign roles are bounded to known organizational functions', async () => {
  const { decisionMakerRoles } = await core();
  const roles = decisionMakerRoles('ngo_programs');
  assert.ok(roles.includes('Program Director'));
  assert.equal(decisionMakerRoles('unknown_campaign').length, 0);
});

test('Agent Zero brief requires sources and forbids private-data guessing', async () => {
  const { buildAgentZeroBrief } = await core();
  const brief = buildAgentZeroBrief({
    site: { url: 'https://theater.mmmpaykin.workers.dev/' },
    competitors: ['https://example.com'],
    prospects: ['Example Co'],
    language: 'en'
  });
  assert.match(brief, /source_url/);
  assert.match(brief, /Do not guess private emails/);
});

test('evidence importer rejects uncited rows and malformed JSON', async () => {
  const { importEvidence } = await core();
  const parsed = importEvidence(JSON.stringify({
    site_findings: [
      { observed_fact: 'Cited', source_url: 'https://example.com', observed_date: '2026-09-30' },
      { observed_fact: 'Uncited' }
    ]
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.ignoredUncited, 1);
  assert.equal(importEvidence('{oops').ok, false);
});


test('reviewer counterexamples stay low-confidence', async () => {
  const { scoreProspect } = await core();
  const geoOnly = scoreProspect(campaign, {
    company: 'AnyCo',
    location: 'Tbilisi, Georgia',
    sector: 'NonProfit',
    needSignals: [],
    publicFact: 'Hello world',
    sourceUrl: 'https://example.com'
  });
  assert.ok(geoOnly.score < 50);
  assert.equal(geoOnly.evidenceReady, false);
  assert.ok(!geoOnly.reasons.includes('Sector matches campaign'));
  assert.ok(!geoOnly.reasons.some(x => x.startsWith('Need signals match:')));

  const substringSector = scoreProspect(campaign, { sector: 'Finance' });
  assert.ok(!substringSector.reasons.includes('Sector matches campaign'));

  const substringNeed = scoreProspect(campaign, { needSignals: ['management'] });
  assert.ok(!substringNeed.reasons.some(x => x.startsWith('Need signals match:')));

  for (const optOut of ['true', 1]) {
    const optedOut = scoreProspect(campaign, {
      location: 'Tbilisi, Georgia',
      sector: 'Financial Services',
      needSignals: ['communication'],
      publicFact: 'A sufficiently detailed cited public fact for this test.',
      sourceUrl: 'https://example.com/source',
      optOut
    });
    assert.equal(optedOut.score, 0);
  }
});
