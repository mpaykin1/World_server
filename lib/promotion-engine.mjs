const DEFAULT_ROLE_MAP = {
  private_workshops: ['HR Manager', 'Head of People', 'Learning & Development', 'People Partner', 'Founder / CEO'],
  schools_colleges: ['School Director', 'Dean', 'Student Affairs', 'Academic Program Lead', 'Counsellor / Wellbeing Lead'],
  ngo_programs: ['Program Director', 'Community Lead', 'Partnerships Manager', 'Training Lead', 'Executive Director'],
  creative_agencies: ['Creative Director', 'Managing Director', 'People Lead', 'Strategy Director', 'Founder'],
  individuals_change: ['Individual participant']
};

const CAMPAIGN_ALIASES = new Set(Object.keys(DEFAULT_ROLE_MAP));

function clean(value, max = 240) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(value, max = 12) {
  return Array.isArray(value) ? value.map(v => clean(v, 100)).filter(Boolean).slice(0, max) : [];
}

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'ru';
}

export function validateCampaignId(value) {
  const id = clean(value, 60);
  return CAMPAIGN_ALIASES.has(id) ? id : '';
}

export function decisionMakerRoles(campaignId) {
  const id = validateCampaignId(campaignId);
  return id ? [...DEFAULT_ROLE_MAP[id]] : [];
}

function normalizedPhrase(value) {
  return clean(value, 160).toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function exactPhraseMatch(left, right) {
  const a = normalizedPhrase(left);
  const b = normalizedPhrase(right);
  return Boolean(a && b && a === b);
}

function wordSignalMatch(signal, need) {
  const signalWords = new Set(normalizedPhrase(signal).split(' ').filter(Boolean));
  const needWords = normalizedPhrase(need).split(' ').filter(Boolean);
  return needWords.length > 0 && needWords.every(word => signalWords.has(word));
}

function isOptedOut(value) {
  if (value === true || value === 1) return true;
  const normalized = clean(value, 16).toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function hasUsefulEvidence(publicFact, sourceUrl) {
  return publicFact.length >= 24 && /^https:\/\//i.test(sourceUrl);
}

export function scoreProspect(campaign, prospect = {}) {
  const reasons = [];
  const cautions = [];
  let score = 20;
  const sectors = list(campaign?.targetSectors);
  const needs = list(campaign?.needSignals);
  const location = clean(prospect.location, 100).toLowerCase();
  const sector = clean(prospect.sector, 120);
  const signals = list(prospect.needSignals);
  const publicFact = clean(prospect.publicFact, 500);
  const sourceUrl = clean(prospect.sourceUrl, 500);

  const sectorMatch = sectors.some(target => exactPhraseMatch(sector, target));
  const signalHits = needs.filter(need => signals.some(signal => wordSignalMatch(signal, need)));
  const geoMatch = /tbilisi|georgia|საქართველო|თბილის/.test(location);
  const evidenceReady = hasUsefulEvidence(publicFact, sourceUrl);

  if (geoMatch && (sectorMatch || signalHits.length)) {
    score += 22;
    reasons.push('Georgia/Tbilisi match');
  } else if (geoMatch) {
    score += 6;
    cautions.push('Georgia/Tbilisi location alone is not enough for campaign fit');
  } else if (location) {
    cautions.push('Location is outside the primary Tbilisi/Georgia focus');
  }

  if (sectorMatch) {
    score += 22;
    reasons.push('Sector matches campaign');
  } else if (sector) {
    score += 4;
    cautions.push('Sector is not an exact campaign match');
  }

  if (signalHits.length) {
    score += Math.min(28, signalHits.length * 10);
    reasons.push('Need signals match: ' + signalHits.slice(0, 3).join(', '));
  }

  if (evidenceReady) {
    score += 8;
    reasons.push('Personalization has a cited public fact');
  } else if (publicFact && sourceUrl) {
    cautions.push('Public fact/source pair is too weak to count as evidence');
  } else if (publicFact) {
    cautions.push('Public fact has no source URL');
  } else {
    cautions.push('No verified personalization fact yet');
  }

  if (isOptedOut(prospect.optOut)) {
    score = 0;
    cautions.push('Do not contact: prospect is marked opt-out');
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    band: score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low',
    reasons,
    cautions,
    evidenceReady,
    humanReviewRequired: true,
    autoSendAllowed: false
  };
}

export function buildEmailDraft({ language = 'ru', campaign, prospect = {}, role = '' } = {}) {
  const lang = normalizeLanguage(language);
  const company = clean(prospect.company, 100) || (lang === 'en' ? 'your team' : 'ваша команда');
  const recipientRole = clean(role, 100);
  const publicFact = clean(prospect.publicFact, 360);
  const sourceUrl = clean(prospect.sourceUrl, 500);
  const offerRu = clean(campaign?.offer?.ru, 280) || 'интерактивную театральную практику для команды';
  const offerEn = clean(campaign?.offer?.en, 280) || 'an interactive theatre-based practice for teams';

  const factLineRu = publicFact && sourceUrl
    ? `Увидел публичную информацию о ${company}: ${publicFact}. Источник: ${sourceUrl}`
    : `Пишу без попытки изображать личное знакомство: мне интересен ${company} как возможный партнёр по формату.`;
  const factLineEn = publicFact && sourceUrl
    ? `I saw this public information about ${company}: ${publicFact}. Source: ${sourceUrl}`
    : `I’m reaching out without pretending we already know each other: ${company} looks like a possible fit for this format.`;

  if (lang === 'en') {
    const subject = clean(campaign?.subject?.en || `Interactive theatre workshop for ${company}`, 120);
    const body = [
      recipientRole ? `Hi — reaching out to the ${recipientRole} at ${company}.` : `Hi ${company} team,`,
      '',
      factLineEn,
      '',
      `I’m Mikhail Paykin. In Tbilisi I run theatre-based formats where people rehearse real scenarios through action, observation and improvisation rather than lectures or diagnoses.`,
      '',
      `A possible fit for your team: ${offerEn}.`,
      '',
      `If useful, I can send a one-page outline with the goal, format, duration and what participants actually do. No commitment needed.`,
      '',
      'Best,',
      'Mikhail Paykin'
    ].join('\n');
    return { subject, body, language: lang, evidenceUsed: Boolean(publicFact && sourceUrl), humanReviewRequired: true, autoSendAllowed: false };
  }

  const subject = clean(campaign?.subject?.ru || `Интерактивный театральный формат для ${company}`, 120);
  const body = [
    recipientRole ? `Здравствуйте! Пишу человеку, который отвечает за ${recipientRole} в ${company}.` : `Здравствуйте, команда ${company}!`,
    '',
    factLineRu,
    '',
    'Я Михаил Пайкин. В Тбилиси я делаю театральные форматы, где люди не слушают лекцию, а репетируют реальные ситуации через действие, наблюдение и импровизацию — без диагнозов и обещаний лечения.',
    '',
    `Возможный формат для вас: ${offerRu}.`,
    '',
    'Если это актуально, пришлю одностраничное описание: задача, формат, длительность и что именно делают участники. Без обязательств.',
    '',
    'Михаил Пайкин'
  ].join('\n');
  return { subject, body, language: lang, evidenceUsed: Boolean(publicFact && sourceUrl), humanReviewRequired: true, autoSendAllowed: false };
}

export function buildAgentZeroBrief({ site, competitors = [], prospects = [], language = 'ru' } = {}) {
  const lang = normalizeLanguage(language);
  const safeCompetitors = list(competitors, 20);
  const safeProspects = list(prospects, 30);
  const target = clean(site?.url, 300);
  if (lang === 'en') {
    return `Independent promotion research task. Audit ${target}. Find only public, verifiable evidence. Compare these competitor inputs if supplied: ${safeCompetitors.join(', ') || 'none'}. Research prospect organizations if supplied: ${safeProspects.join(', ') || 'none'}. For every claim return source_url + observed_fact + observed_date. Separate facts from inference. Do not guess private emails, personal data, budgets, employee counts, clients, or relationships. Output JSON with site_findings, competitor_findings, prospect_findings, campaign_opportunities, risks.`;
  }
  return `Задача независимого исследования продвижения. Проверь ${target}. Используй только публичные проверяемые факты. Если заданы конкуренты — сравни: ${safeCompetitors.join(', ') || 'нет'}. Если заданы организации — исследуй: ${safeProspects.join(', ') || 'нет'}. Для каждого утверждения верни source_url + observed_fact + observed_date. Отделяй факты от предположений. Не угадывай личные email, персональные данные, бюджеты, численность, клиентов или отношения. Выход: JSON с site_findings, competitor_findings, prospect_findings, campaign_opportunities, risks.`;
}

export function importEvidence(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return { ok: false, error: 'invalid_json', items: [] }; }
  }
  const groups = ['site_findings', 'competitor_findings', 'prospect_findings'];
  const items = [];
  for (const group of groups) {
    const rows = Array.isArray(parsed?.[group]) ? parsed[group] : [];
    for (const row of rows.slice(0, 100)) {
      const fact = clean(row?.observed_fact, 600);
      const url = clean(row?.source_url, 500);
      if (!fact || !/^https:\/\//i.test(url)) continue;
      items.push({ group, fact, sourceUrl: url, observedDate: clean(row?.observed_date, 40), inference: clean(row?.inference, 400) });
    }
  }
  return { ok: true, items, ignoredUncited: groups.reduce((n, key) => n + (Array.isArray(parsed?.[key]) ? parsed[key].length : 0), 0) - items.length };
}
